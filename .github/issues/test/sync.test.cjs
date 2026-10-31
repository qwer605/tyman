'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { issueKey, issueTitle, syncIssue, listIssueNumbers } = require('../sync.cjs');

function fixture(options = {}) {
  const repository = {
    id: 'repository',
    defaultBranchRef: { name: 'main', target: { oid: 'main-commit' } },
    ref: options.existingBranch ? { name: 'TMN-7' } : null,
    issue: {
      id: 'issue', number: 7,
      title: options.title || 'Сформувати контекст',
      state: options.closed ? 'CLOSED' : 'OPEN',
      linkedBranches: { nodes: options.linked ? [{ ref: { name: 'TMN-7' } }] : [] },
      closedByPullRequestsReferences: { nodes: options.pullRequests || [] },
    },
  };
  const mutations = [];
  const requests = [];
  const client = {
    async graphql(query, variables) {
      if (query.includes('createLinkedBranch')) {
        mutations.push(variables.input);
        if (options.failCreation) throw new Error('Permission denied');
        repository.ref = { name: variables.input.name };
        repository.issue.linkedBranches.nodes.push({ ref: { name: variables.input.name } });
        if (options.race) throw new Error('Response lost after branch creation');
        return { createLinkedBranch: { linkedBranch: { ref: { name: variables.input.name } } } };
      }
      assert.deepEqual(variables, { owner: 'owner', repo: 'repo', number: 7, branch: 'refs/heads/TMN-7' });
      return { repository: structuredClone(repository) };
    },
    async request(method, path, body) {
      requests.push({ method, path, body });
      repository.issue.title = body.title;
    },
  };
  return { client, repository, mutations, requests };
}

test('adds the issue number while preserving the Ukrainian title', () => {
  assert.equal(issueTitle('Сформувати контекст', 7), 'TMN-7: Сформувати контекст');
  assert.equal(issueKey(7), 'TMN-7');
});

test('normalizes old, repeated and incorrectly numbered keys', () => {
  for (const title of ['[TMN-3] Назва', 'tmn-3: Назва', 'TMN-7: TMN-3 — Назва', 'TMN-7: Назва']) {
    assert.equal(issueTitle(title, 7), 'TMN-7: Назва');
  }
  assert.equal(issueTitle('TMN-7', 7), 'TMN-7');
});

test('rejects invalid numbers instead of creating an invalid branch', () => {
  for (const number of [0, -1, 1.5, NaN, '7']) assert.throws(() => issueKey(number));
});

test('creates a linked branch from main and repeated runs are harmless', async () => {
  const state = fixture();
  await syncIssue(state.client, 'owner', 'repo', 7);
  await syncIssue(state.client, 'owner', 'repo', 7);
  assert.deepEqual(state.mutations, [{
    issueId: 'issue', repositoryId: 'repository', oid: 'main-commit', name: 'TMN-7',
  }]);
  assert.deepEqual(state.requests, [{
    method: 'PATCH', path: '/repos/owner/repo/issues/7', body: { title: 'TMN-7: Сформувати контекст' },
  }]);
});

test('treats shell syntax in an issue title as plain text', async () => {
  const title = 'Назва $(echo secret) `command` "quoted" ${{ secrets.TEST }}';
  const state = fixture({ title });
  await syncIssue(state.client, 'owner', 'repo', 7);
  assert.equal(state.requests[0].body.title, 'TMN-7: ' + title);
  assert.equal(state.mutations[0].name, 'TMN-7');
});

test('normalizes closed issues without creating branches for completed work', async () => {
  const state = fixture({ closed: true });
  await syncIssue(state.client, 'owner', 'repo', 7);
  assert.equal(state.requests.length, 1);
  assert.equal(state.mutations.length, 0);
});

test('preserves an existing linked branch', async () => {
  const state = fixture({ existingBranch: true, linked: true });
  await syncIssue(state.client, 'owner', 'repo', 7);
  assert.equal(state.mutations.length, 0);
});

test('preserves a branch after GitHub replaces its link with a linked PR', async () => {
  const state = fixture({
    existingBranch: true,
    pullRequests: [{ headRefName: 'TMN-7', headRepository: { id: 'repository' } }],
  });
  await syncIssue(state.client, 'owner', 'repo', 7);
  assert.equal(state.mutations.length, 0);
});

test('does not overwrite an existing branch that belongs to other work', async () => {
  const state = fixture({ existingBranch: true });
  await assert.rejects(syncIssue(state.client, 'owner', 'repo', 7), /commits were left unchanged/);
  assert.equal(state.mutations.length, 0);
});

test('recovers when a concurrent run creates the same linked branch', async () => {
  const state = fixture({ race: true });
  await syncIssue(state.client, 'owner', 'repo', 7);
  assert.equal(state.mutations.length, 1);
});

test('reports a failed branch mutation rather than claiming success', async () => {
  const state = fixture({ failCreation: true });
  await assert.rejects(syncIssue(state.client, 'owner', 'repo', 7), /Permission denied/);
});

test('backfill paginates through issues and excludes pull requests', async () => {
  const paths = [];
  const client = {
    async request(method, path) {
      assert.equal(method, 'GET');
      paths.push(path);
      return paths.length === 1
        ? Array.from({ length: 100 }, (_, index) => index === 0
          ? { number: 1, pull_request: {} } : { number: index + 1 })
        : [{ number: 101 }];
    },
  };
  const numbers = await listIssueNumbers(client, 'owner', 'repo');
  assert.equal(numbers.length, 100);
  assert.equal(numbers[0], 2);
  assert.equal(numbers.at(-1), 101);
  assert.ok(paths[1].endsWith('page=2'));
});
