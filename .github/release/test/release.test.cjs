'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {nextVersion, parseBranch, parseCandidate, ReleaseManager,
  writeManifest, validateManifest, PAYLOADS, ASSETS} = require('../release.cjs');

const context = {actor: 'qwer605', ref: 'refs/heads/main'};
const commit = message => ({sha: 'a'.repeat(40), message});

class FakeAPI {
  constructor(runGit) {
    this.repository = 'qwer605/tyman';
    this.git = runGit;
    this.refs = new Map([['heads/main', runGit('rev-parse', 'HEAD')]]);
    this.releases = [];
    this.assets = new Map();
    this.prs = [];
    this.writes = [];
  }

  async all(endpoint) {
    if (endpoint === '/branches') return [...this.refs.keys()].filter(ref => ref.startsWith('heads/'))
      .map(ref => ({name: ref.slice(6)}));
    if (endpoint === '/releases') return this.releases;
    if (endpoint.startsWith('/pulls?')) return this.prs;
    const match = /^\/releases\/(\d+)\/assets$/.exec(endpoint);
    if (match) return this.releases.find(item => item.id === Number(match[1])).assets;
    throw new Error(`Unexpected list: ${endpoint}`);
  }

  async request(method, endpoint, body) {
    if (method !== 'GET') this.writes.push({method, endpoint, body});
    if (method === 'GET' && endpoint.startsWith('/git/ref/')) {
      const sha = this.refs.get(endpoint.slice('/git/ref/'.length));
      return sha ? {object: {sha}} : null;
    }
    if (method === 'POST' && endpoint === '/git/refs') {
      const ref = body.ref.slice('refs/'.length);
      assert(!this.refs.has(ref), 'Ref must not be overwritten');
      this.refs.set(ref, body.sha);
      if (ref.startsWith('tags/')) this.git('tag', ref.slice(5), body.sha);
      return {object: {sha: body.sha}};
    }
    if (method === 'POST' && endpoint === '/releases') {
      const release = {id: this.releases.length + 1, ...body, assets: [], html_url: 'https://example.test/release'};
      this.releases.push(release);
      return release;
    }
    if (method === 'PATCH' && /^\/releases\/\d+$/.test(endpoint)) {
      const release = this.releases.find(item => item.id === Number(endpoint.split('/').at(-1)));
      Object.assign(release, body);
      return release;
    }
    if (method === 'POST' && endpoint.startsWith('https://uploads.github.com/')) {
      const url = new URL(endpoint);
      const release = this.releases.find(item => item.id === Number(url.pathname.split('/').at(-2)));
      const asset = {id: this.assets.size + 1, name: url.searchParams.get('name')};
      this.assets.set(asset.id, body);
      release.assets.push(asset);
      return asset;
    }
    if (method === 'GET' && endpoint.startsWith('/releases/assets/')) {
      return this.assets.get(Number(endpoint.split('/').at(-1)));
    }
    if (method === 'POST' && endpoint === '/pulls') { this.prs.push(body); return body; }
    throw new Error(`Unexpected request: ${method} ${endpoint}`);
  }
}

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tyman-release-test-'));
  t.after(() => {
    const resolved = path.resolve(directory);
    assert(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert(path.basename(resolved).startsWith('tyman-release-test-'));
    fs.rmSync(resolved, {recursive: true, force: true});
  });
  const g = (...args) => execFileSync('git', args, {cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  g('init', '--initial-branch=main');
  g('config', 'user.name', 'Test');
  g('config', 'user.email', 'test@example.test');
  const add = message => {
    g('commit', '--allow-empty', '-m', message);
    return g('rev-parse', 'HEAD');
  };
  add('chore: initialize');
  g('tag', 'v1.2.3');
  add('feat: registration');
  add('fix: validation');
  g('update-ref', 'refs/remotes/origin/main', g('rev-parse', 'HEAD'));
  const api = new FakeAPI(g);
  const manager = new ReleaseManager(api, g);
  const payload = plan => {
    const output = fs.mkdtempSync(path.join(directory, 'assets-'));
    for (const name of PAYLOADS) fs.writeFileSync(path.join(output, name), `immutable bytes for ${name}`);
    writeManifest(output, plan);
    return output;
  };
  return {directory, g, add, api, manager, payload};
}

test('mixed changes produce one increment, using the largest change', () => {
  assert.equal(nextVersion('1.2.3', [commit('fix: one'), commit('fix: two')]), '1.2.4');
  assert.equal(nextVersion('1.2.3', [commit('feat: one'), commit('feat: two'), commit('fix: three')]), '1.3.0');
  assert.equal(nextVersion('1.2.3', [commit('feat!: new API'), commit('fix: bug')]), '2.0.0');
  assert.equal(nextVersion('1.2.3', [commit('refactor: API\n\nBREAKING CHANGE: response format changed')]), '2.0.0');
  assert.equal(nextVersion('0.0.0', [commit('feat: initial game')]), '0.1.0');
});

test('multiple Conventional Commits in one message are understood', () => {
  assert.equal(nextVersion('1.2.3', [commit('fix: validation\n\nfeat: registration')]), '1.3.0');
});

test('non-release work and version overrides cannot silently publish', () => {
  assert.throws(() => nextVersion('1.2.3', [commit('chore: housekeeping')]), /No releasable/);
  assert.throws(() => nextVersion('1.2.3', [commit('fix: bug\n\nRelease-As: 0.0.1')]), /overrides/);
});

test('branch and candidate names are strict, including leading zeros', () => {
  assert.equal(parseBranch('release/1.3.0'), '1.3.0');
  assert.deepEqual(parseCandidate('v1.3.0-rc.2'), {version: '1.3.0', number: 2});
  for (const name of ['main', 'release/01.2.3', 'release/1.2.3/extra', 'release/1.2.3;ls']) {
    assert.throws(() => parseBranch(name));
  }
  for (const name of ['v1.3.0', 'v1.3.0-rc.0', 'v1.3.0-rc.01', 'v1.3.0-rc.1\nmalicious']) {
    assert.throws(() => parseCandidate(name));
  }
});

test('prepare freezes reviewed main and uses its complete real git history', async t => {
  const f = fixture(t);
  const plan = await f.manager.plan({action: 'prepare'}, context);
  assert.equal(plan.version, '1.3.0');
  assert.equal(plan.candidate, 'v1.3.0-rc.1');
  assert.equal(plan.sha, f.api.refs.get('heads/main'));
  assert.equal(f.api.refs.get('heads/release/1.3.0'), plan.sha);
  assert.equal(f.manager.commits('v1.2.3', plan.sha).length, 2);
  assert.deepEqual(await f.manager.plan({action: 'prepare'}, context), plan);
});

test('only trusted users on main can prepare a release', async t => {
  const f = fixture(t);
  await assert.rejects(f.manager.plan({action: 'prepare'}, {...context, actor: 'stranger'}), /must be run/);
  await assert.rejects(f.manager.plan({action: 'prepare'}, {...context, ref: 'refs/heads/feature'}), /must be run/);
  assert.equal(f.api.writes.length, 0);
});

test('an unfinished release prevents accidentally creating another scope', async t => {
  const f = fixture(t);
  await f.manager.plan({action: 'prepare'}, context);
  const sha = f.add('feat: another feature');
  f.api.refs.set('heads/main', sha);
  await assert.rejects(f.manager.plan({action: 'prepare'}, context), /unfinished release/);
});

test('candidate assets are verified before tags or releases are created', async t => {
  const f = fixture(t);
  const plan = await f.manager.plan({action: 'prepare'}, context);
  const output = f.payload(plan);
  fs.appendFileSync(path.join(output, PAYLOADS[0]), 'tampered');
  const before = f.api.writes.length;
  await assert.rejects(f.manager.publish(plan, output), /Checksum mismatch/);
  assert.equal(f.api.writes.length, before);
});

test('candidate publishing is immutable and retry-safe', async t => {
  const f = fixture(t);
  const plan = await f.manager.plan({action: 'prepare'}, context);
  const output = f.payload(plan);
  const release = await f.manager.publish(plan, output);
  assert.equal(release.draft, false);
  assert.equal(release.prerelease, true);
  assert.equal(release.assets.length, ASSETS.length);
  await f.manager.publish(plan, output);
  assert.equal(f.api.releases.length, 1);
  assert.equal(f.api.assets.size, ASSETS.length);
  assert.deepEqual(await f.manager.plan({action: 'prepare'}, context), plan);
});

test('new fixes produce rc.2 while features are rejected from frozen scope', async t => {
  const f = fixture(t);
  const plan = await f.manager.plan({action: 'prepare'}, context);
  await f.manager.publish(plan, f.payload(plan));
  const sha = f.add('fix: registration regression');
  f.api.refs.set('heads/release/1.3.0', sha);
  const pushContext = {ref: 'refs/heads/release/1.3.0', actor: 'alx1115'};
  const second = await f.manager.plan({action: 'push', after: sha}, pushContext);
  assert.equal(second.candidate, 'v1.3.0-rc.2');
  await f.manager.publish(second, f.payload(second));
  const featureSha = f.add('feat: should be in main');
  f.api.refs.set('heads/release/1.3.0', featureSha);
  await assert.rejects(f.manager.plan({action: 'push', after: featureSha}, pushContext), /New features/);
});

test('stale candidate builds cannot publish after the branch moves', async t => {
  const f = fixture(t);
  const plan = await f.manager.plan({action: 'prepare'}, context);
  f.api.refs.set('heads/release/1.3.0', f.add('fix: newer change'));
  await assert.rejects(f.manager.publish(plan, f.payload(plan)), /branch changed/);
});

test('promotion requires a trusted user and explicit testing confirmation', async t => {
  const f = fixture(t);
  await assert.rejects(f.manager.promote('v1.3.0-rc.1', false, context, f.directory), /Confirm/);
  await assert.rejects(f.manager.promote('v1.3.0-rc.1', true, {...context, actor: 'stranger'}, f.directory), /must be run/);
  assert.equal(f.api.writes.length, 0);
});

test('stable promotion copies byte-identical assets and the exact tested SHA', async t => {
  const f = fixture(t);
  const plan = await f.manager.plan({action: 'prepare'}, context);
  const candidate = await f.manager.publish(plan, f.payload(plan));
  const stable = await f.manager.promote(plan.candidate, true, context, path.join(f.directory, 'promote'));
  assert.equal(stable.tag_name, 'v1.3.0');
  assert.equal(stable.prerelease, false);
  assert.equal(f.api.refs.get('tags/v1.3.0'), plan.sha);
  for (const asset of stable.assets) {
    const original = candidate.assets.find(item => item.name === asset.name);
    assert.deepEqual(f.api.assets.get(asset.id), f.api.assets.get(original.id));
  }
  assert.equal(f.api.prs.length, 0);
});

test('a candidate with newer branch changes cannot be promoted', async t => {
  const f = fixture(t);
  const plan = await f.manager.plan({action: 'prepare'}, context);
  await f.manager.publish(plan, f.payload(plan));
  f.api.refs.set('heads/release/1.3.0', f.add('fix: not tested yet'));
  await assert.rejects(f.manager.promote(plan.candidate, true, context, f.directory), /newer changes/);
});

test('release fixes produce a backport link and block the next release until merged', async t => {
  const f = fixture(t);
  const plan = await f.manager.plan({action: 'prepare'}, context);
  await f.manager.publish(plan, f.payload(plan));
  const sha = f.add('fix: release-only regression');
  f.api.refs.set('heads/release/1.3.0', sha);
  const second = await f.manager.plan({action: 'push', after: sha}, {ref: 'refs/heads/release/1.3.0'});
  await f.manager.publish(second, f.payload(second));
  const stable = await f.manager.promote(second.candidate, true, context, path.join(f.directory, 'stable'));
  assert.equal(stable.backport_url, 'https://github.com/qwer605/tyman/compare/main...release/1.3.0?expand=1');
  assert.equal(f.api.prs.length, 0);
  await assert.rejects(f.manager.plan({action: 'prepare'}, context), /back into main/);
});

test('manifest rejects a mismatching commit or unsafe extra asset names', t => {
  const f = fixture(t);
  const plan = {repository: 'qwer605/tyman', version: '1.3.0', candidate: 'v1.3.0-rc.1', sha: 'a'.repeat(40)};
  const output = f.payload(plan);
  assert.throws(() => validateManifest(output, {...plan, sha: 'b'.repeat(40)}), /does not match/);
  const filename = path.join(output, 'release-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(filename));
  manifest.files['../outside'] = 'a'.repeat(64);
  fs.writeFileSync(filename, JSON.stringify(manifest));
  assert.throws(() => validateManifest(output, plan), /Unexpected release payload/);
});
