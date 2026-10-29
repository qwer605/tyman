'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
// These imports are internal to the exactly pinned release-please version.
const {parseConventionalCommits} = require('release-please/build/src/commit.js');
const {DefaultVersioningStrategy} = require('release-please/build/src/versioning-strategies/default.js');
const {Version} = require('release-please/build/src/version.js');

const VERSION = '(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)';
const STABLE_RE = new RegExp(`^v${VERSION}$`);
const BRANCH_RE = new RegExp(`^release/${VERSION}$`);
const RC_RE = new RegExp(`^v${VERSION}-rc\\.([1-9][0-9]*)$`);
const SHA_RE = /^[a-f0-9]{40}$/;
const OWNERS = new Set(['qwer605', 'alx1115']);
const PAYLOADS = ['tyman-linux-x86_64.zip', 'tyman-source.zip', 'tyman-windows-x86_64.zip'];
const ASSETS = [...PAYLOADS, 'release-manifest.json', 'SHA256SUMS'];

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function compareVersions(left, right) {
  const a = left.replace(/^v/, '').split('.').map(Number);
  const b = right.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

function parseBranch(branch) {
  invariant(BRANCH_RE.test(branch), 'Expected a release/X.Y.Z branch.');
  return branch.slice('release/'.length);
}

function parseCandidate(candidate) {
  const match = RC_RE.exec(candidate);
  invariant(match, 'Expected an exact candidate tag, e.g. v0.1.0-rc.1.');
  return {version: `${match[1]}.${match[2]}.${match[3]}`, number: Number(match[4])};
}

function nextVersion(previous, commits) {
  const parsed = parseConventionalCommits(commits, {debug() {}, warn() {}});
  invariant(!parsed.some(commit => commit.notes.some(note => note.title === 'RELEASE AS')),
    'Release-As overrides are disabled; use Conventional Commits.');
  invariant(parsed.some(commit => commit.breaking || ['fix', 'feat', 'feature', 'perf'].includes(commit.type)),
    'No releasable changes: add a fix:, feat:, perf: or breaking change.');
  const strategy = new DefaultVersioningStrategy();
  const version = strategy.bump(Version.parse(previous), parsed).toString();
  invariant(STABLE_RE.test(`v${version}`) && compareVersions(version, previous) > 0,
    'The calculated version must increase.');
  return version;
}

function git(...args) {
  return execFileSync('git', args, {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}).trim();
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function checksums(manifest) {
  return PAYLOADS.map(name => `${manifest.files[name]}  ${name}\n`).join('');
}

function validateManifest(directory, expected) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'release-manifest.json'), 'utf8'));
  invariant(manifest.schema === 1 && manifest.repository === expected.repository &&
    manifest.sha === expected.sha && SHA_RE.test(manifest.sha) &&
    manifest.candidate === expected.candidate && manifest.version === expected.version,
  'Candidate manifest does not match the selected commit, repository or version.');
  invariant(JSON.stringify(Object.keys(manifest.files).sort()) === JSON.stringify(PAYLOADS),
    'Unexpected release payload names.');
  for (const name of PAYLOADS) {
    invariant(/^[a-f0-9]{64}$/.test(manifest.files[name]) &&
      sha256(fs.readFileSync(path.join(directory, name))) === manifest.files[name],
    `Checksum mismatch: ${name}`);
  }
  invariant(fs.readFileSync(path.join(directory, 'SHA256SUMS'), 'utf8') === checksums(manifest),
    'SHA256SUMS does not match the manifest.');
  return manifest;
}

class GitHub {
  constructor(repository, token) {
    invariant(/^[\w.-]+\/[\w.-]+$/.test(repository), 'Invalid repository.');
    invariant(token, 'GH_TOKEN is required.');
    this.repository = repository;
    this.token = token;
  }

  async request(method, endpoint, body, {binary = false, optional = false} = {}) {
    const isUpload = endpoint.startsWith('https://uploads.github.com/');
    const url = isUpload ? endpoint : `https://api.github.com/repos/${this.repository}${endpoint}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tyman-release',
        ...(body ? {'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json'} : {}),
      },
      body: body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(120000),
    });
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub ${method} ${endpoint}: ${response.status} ${await response.text()}`);
    if (response.status === 204) return null;
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  }

  async all(endpoint) {
    const results = [];
    for (let page = 1; ; page++) {
      const data = await this.request('GET', `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      invariant(Array.isArray(data), 'Expected a paginated list.');
      results.push(...data);
      if (data.length < 100) return results;
    }
  }
}

class ReleaseManager {
  constructor(api, runGit = git) {
    this.api = api;
    this.git = runGit;
  }

  async ref(ref) {
    const result = await this.api.request('GET', `/git/ref/${ref}`, undefined, {optional: true});
    return result?.object.sha ?? null;
  }

  tags() {
    return this.git('tag', '--list').split('\n').filter(Boolean);
  }

  baseline() {
    return this.tags().filter(tag => STABLE_RE.test(tag)).sort(compareVersions).at(-1) ?? '';
  }

  ancestor(older, newer) {
    try { this.git('merge-base', '--is-ancestor', older, newer); return true; }
    catch { return false; }
  }

  commits(baseline, sha) {
    const range = baseline ? `${baseline}..${sha}` : sha;
    return this.git('log', '--format=%H%x00%B%x00%x00', range).split('\0\0').map(record => record.trim()).filter(Boolean).map(record => {
      const separator = record.indexOf('\0');
      invariant(separator > 0, 'Cannot read commit history.');
      return {sha: record.slice(0, separator).trim(), message: record.slice(separator + 1).trim()};
    });
  }

  async plan(event, context) {
    let branch;
    let sha;
    let version;
    const baseline = this.baseline();
    if (event.action === 'prepare') {
      invariant(context.ref === 'refs/heads/main' && OWNERS.has(context.actor),
        'Prepare release must be run from main by qwer605 or alx1115.');
      sha = await this.ref('heads/main');
      invariant(SHA_RE.test(sha), 'Cannot find main.');
      if (baseline) invariant(this.ancestor(baseline, sha),
        'Merge the last stable release branch back into main before preparing the next release.');
      version = nextVersion(baseline ? baseline.slice(1) : '0.0.0', this.commits(baseline, sha));
      branch = `release/${version}`;
      const branches = await this.api.all('/branches');
      const active = branches.filter(item => BRANCH_RE.test(item.name) && !this.tags().includes(`v${parseBranch(item.name)}`));
      invariant(active.length === 0 || (active.length === 1 && active[0].name === branch &&
        await this.ref(`heads/${branch}`) === sha),
      'An unfinished release already exists; fix it through a PR to its release branch.');
      if (!active.length) await this.api.request('POST', '/git/refs', {ref: `refs/heads/${branch}`, sha});
    } else {
      invariant(event.action === 'push' && !event.deleted, 'Unsupported release event.');
      branch = context.ref.replace(/^refs\/heads\//, '');
      version = parseBranch(branch);
      sha = event.after;
      invariant(SHA_RE.test(sha) && await this.ref(`heads/${branch}`) === sha,
        'The release branch moved; use the newest workflow run.');
      invariant(!await this.ref(`tags/v${version}`), 'This version is already stable. Start a new release.');
      if (baseline) invariant(compareVersions(version, baseline.slice(1)) > 0 && this.ancestor(baseline, sha),
        'Release branch must descend from the latest stable version and use a higher version.');
      // After the first RC, allow only fixes to the frozen release scope.
      const existing = this.tags().filter(tag => RC_RE.test(tag) && parseCandidate(tag).version === version)
        .sort((a, b) => parseCandidate(a).number - parseCandidate(b).number);
      if (existing.length) {
        const last = existing.at(-1);
        invariant(this.ancestor(last, sha), 'Release history must include the previous candidate.');
        const changes = parseConventionalCommits(this.commits(last, sha), {debug() {}, warn() {}});
        invariant(!changes.some(commit => commit.breaking || ['feat', 'feature'].includes(commit.type)),
          'New features or breaking changes must go to main, not a frozen release branch.');
      } else {
        invariant(this.ancestor(sha, 'origin/main'),
          'The initial candidate must use a reviewed commit already on main.');
        invariant(nextVersion(baseline ? baseline.slice(1) : '0.0.0', this.commits(baseline, sha)) === version,
          'The initial release branch version must match Conventional Commits.');
      }
    }
    const numbers = this.tags().filter(tag => RC_RE.test(tag) && parseCandidate(tag).version === version)
      .map(tag => parseCandidate(tag).number);
    const lastNumber = Math.max(0, ...numbers);
    const lastCandidate = `v${version}-rc.${lastNumber}`;
    const sameCommit = lastNumber > 0 && this.git('rev-parse', `${lastCandidate}^{commit}`) === sha;
    const candidate = sameCommit ? lastCandidate : `v${version}-rc.${lastNumber + 1}`;
    return {repository: this.api.repository, branch, sha, version, candidate, baseline};
  }

  notes(plan) {
    const range = plan.baseline ? `${plan.baseline}..${plan.sha}` : plan.sha;
    const history = this.git('log', '--format=- %s (%h)', '--no-merges', range);
    return `Commit: ${plan.sha}\n\n${history}\n\n` +
      'Download the Windows or Linux ZIP and keep the executable beside its PCK file.\n' +
      'Verify SHA256SUMS before testing. Stable promotion copies these exact assets without rebuilding.\n';
  }

  async ensureTag(tag, sha) {
    const existing = await this.ref(`tags/${tag}`);
    if (existing) invariant(existing === sha, 'An immutable release tag already points to another commit.');
    else await this.api.request('POST', '/git/refs', {ref: `refs/tags/${tag}`, sha});
  }

  async publish(plan, directory, {stable = false, notes = this.notes(plan)} = {}) {
    validateManifest(directory, plan);
    invariant(await this.ref(`heads/${plan.branch}`) === plan.sha,
      'The release branch changed since this candidate was built.');
    const tag = stable ? `v${plan.version}` : plan.candidate;
    invariant(stable || !await this.ref(`tags/v${plan.version}`), 'This version is already stable.');
    await this.ensureTag(tag, plan.sha);
    // A partial run stays a draft. Retry it to finish uploading without moving tags.
    let release = (await this.api.all('/releases')).find(item => item.tag_name === tag);
    if (!release) release = await this.api.request('POST', '/releases', {
      tag_name: tag, target_commitish: plan.sha, name: tag, body: notes,
      draft: true, prerelease: !stable,
    });
    invariant(release.prerelease === !stable, 'Unexpected existing release type.');
    const assets = await this.api.all(`/releases/${release.id}/assets`);
    invariant(assets.every(asset => ASSETS.includes(asset.name)), 'Unexpected existing release assets.');
    for (const name of ASSETS) {
      const data = fs.readFileSync(path.join(directory, name));
      const existing = assets.find(asset => asset.name === name);
      if (existing) {
        const downloaded = await this.api.request('GET', `/releases/assets/${existing.id}`, undefined, {binary: true});
        invariant(sha256(downloaded) === sha256(data), `Existing asset differs: ${name}`);
      } else {
        invariant(release.draft, 'A published release is missing an asset; it will not be modified.');
        const url = `https://uploads.github.com/repos/${this.api.repository}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`;
        await this.api.request('POST', url, data);
      }
    }
    if (release.draft) release = await this.api.request('PATCH', `/releases/${release.id}`, {
      draft: false, prerelease: !stable, make_latest: stable ? 'true' : 'false',
    });
    return release;
  }

  async promote(candidate, confirmed, context, directory) {
    invariant(context.ref === 'refs/heads/main' && OWNERS.has(context.actor),
      'Publish stable must be run from main by qwer605 or alx1115.');
    invariant(confirmed === true, 'Confirm that you tested this exact candidate before publishing stable.');
    const {version} = parseCandidate(candidate);
    const baseline = this.baseline();
    invariant(!baseline || compareVersions(version, baseline.slice(1)) >= 0,
      'Cannot publish an older version over a newer stable release.');
    const branch = `release/${version}`;
    const sha = await this.ref(`tags/${candidate}`);
    invariant(SHA_RE.test(sha), 'Candidate tag does not exist.');
    invariant(await this.ref(`heads/${branch}`) === sha,
      'The release branch has newer changes. Test and promote its latest candidate.');
    const releases = await this.api.all('/releases');
    const candidateRelease = releases.find(item => item.tag_name === candidate && !item.draft && item.prerelease);
    invariant(candidateRelease, 'Candidate has not been completely published.');
    const newer = releases.some(item => !item.draft && RC_RE.test(item.tag_name) &&
      parseCandidate(item.tag_name).version === version &&
      parseCandidate(item.tag_name).number > parseCandidate(candidate).number);
    invariant(!newer, 'Select the newest candidate, not an older RC.');
    const plan = {repository: this.api.repository, version, branch, sha, candidate, baseline: ''};
    const assets = await this.api.all(`/releases/${candidateRelease.id}/assets`);
    invariant(assets.length === ASSETS.length && assets.every(asset => ASSETS.includes(asset.name)),
      'Candidate is missing release assets.');
    fs.mkdirSync(directory, {recursive: true});
    for (const asset of assets) {
      const data = await this.api.request('GET', `/releases/assets/${asset.id}`, undefined, {binary: true});
      fs.writeFileSync(path.join(directory, asset.name), data);
    }
    validateManifest(directory, plan);
    const release = await this.publish(plan, directory, {stable: true,
      notes: `Promoted from tested candidate ${candidate}.\n\n${candidateRelease.body ?? ''}`});
    // Do not enable GitHub's combined create/approve-PR bot permission.
    // A human opens the backport PR from this comparison link.
    const head = await this.ref('heads/main');
    if (!this.ancestor(sha, head)) {
      release.backport_url = `https://github.com/${this.api.repository}/compare/main...${branch}?expand=1`;
    }
    return release;
  }
}

function writeManifest(directory, plan) {
  const files = Object.fromEntries(PAYLOADS.map(name => [name, sha256(fs.readFileSync(path.join(directory, name)))]));
  const manifest = {schema: 1, repository: plan.repository, version: plan.version,
    candidate: plan.candidate, sha: plan.sha, files};
  fs.writeFileSync(path.join(directory, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'SHA256SUMS'), checksums(manifest));
  validateManifest(directory, plan);
}

async function main() {
  const command = process.argv[2];
  const directory = process.env.DIST_DIR ?? 'dist';
  if (command === 'manifest') {
    writeManifest(directory, JSON.parse(process.env.PLAN_JSON));
    return;
  }
  const api = new GitHub(process.env.GITHUB_REPOSITORY, process.env.GH_TOKEN);
  const manager = new ReleaseManager(api);
  const context = {ref: process.env.GITHUB_REF, actor: process.env.GITHUB_ACTOR};
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (command === 'plan') {
    const plan = await manager.plan({action: process.env.GITHUB_EVENT_NAME === 'push' ? 'push' : event.inputs?.action,
      after: event.after, deleted: event.deleted}, context);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `plan=${JSON.stringify(plan)}\nsha=${plan.sha}\n`);
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ${plan.candidate}\n\nBranch: ${plan.branch}\n\nCommit: ${plan.sha}\n`);
  } else if (command === 'publish-rc') {
    const release = await manager.publish(JSON.parse(process.env.PLAN_JSON), directory);
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Candidate ready for testing: ${release.html_url}\n`);
  } else if (command === 'publish-stable') {
    const release = await manager.promote(event.inputs?.candidate, event.inputs?.confirm_tested === 'true', context, directory);
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Stable published: ${release.html_url}\n`);
    if (release.backport_url) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `\n[Open PR to merge release fixes back into main](${release.backport_url}). Use a merge commit, not squash.\n`);
  } else throw new Error('Unknown release command.');
}

module.exports = {nextVersion, compareVersions, parseBranch, parseCandidate, sha256,
  validateManifest, writeManifest, GitHub, ReleaseManager, PAYLOADS, ASSETS};
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
