'use strict';

const { readFile } = require('node:fs/promises');

function issueKey(number) {
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error('Issue number must be a positive integer');
  }
  return 'TMN-' + number;
}

function issueTitle(title, number) {
  let text = title.trim();
  const prefix = /^(?:\[TMN-\d+\]|TMN-\d+)(?:\s*[:—–-]\s*|\s+|$)/i;
  while (prefix.test(text)) text = text.replace(prefix, '').trim();
  return issueKey(number) + (text ? ': ' + text : '');
}

function createClient(token, apiUrl = 'https://api.github.com') {
  if (!token) throw new Error('GH_TOKEN is required');
  const base = apiUrl.replace(/\/$/, '');
  return {
    async request(method, path, body) {
      const response = await fetch(base + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'tyman-issue-naming',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error('GitHub API ' + response.status + ': ' + data.message);
      return data;
    },
    async graphql(query, variables) {
      const result = await this.request('POST', '/graphql', { query, variables });
      if (result.errors?.length) {
        throw new Error(result.errors.map(error => error.message).join('; '));
      }
      return result.data;
    },
  };
}

const ISSUE_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!, $branch: String!) {
    repository(owner: $owner, name: $repo) {
      id
      defaultBranchRef { name target { oid } }
      ref(qualifiedName: $branch) { name }
      issue(number: $number) {
        id number title state
        linkedBranches(first: 100) { nodes { ref { name } } }
        closedByPullRequestsReferences(first: 100) {
          nodes { headRefName headRepository { id } }
        }
      }
    }
  }
`;

const CREATE_BRANCH = `
  mutation($input: CreateLinkedBranchInput!) {
    createLinkedBranch(input: $input) {
      linkedBranch { ref { name } }
    }
  }
`;

function hasLinkedWork(repository, key) {
  const issue = repository.issue;
  return issue.linkedBranches.nodes.some(link => link.ref?.name === key)
    || issue.closedByPullRequestsReferences.nodes.some(pr =>
      pr.headRefName === key && pr.headRepository?.id === repository.id);
}

async function syncIssue(client, owner, repo, number) {
  const key = issueKey(number);
  const variables = { owner, repo, number, branch: 'refs/heads/' + key };
  let repository = (await client.graphql(ISSUE_QUERY, variables)).repository;
  if (!repository?.issue) throw new Error('Issue #' + number + ' was not found');
  const issue = repository.issue;
  const title = issueTitle(issue.title, number);
  const titleChanged = title !== issue.title;
  if (titleChanged) {
    await client.request('PATCH', '/repos/' + owner + '/' + repo + '/issues/' + number, { title });
  }
  if (issue.state !== 'OPEN') return { key, titleChanged, branch: 'closed issue: skipped' };
  if (hasLinkedWork(repository, key)) return { key, titleChanged, branch: 'already linked' };
  if (repository.ref) {
    throw new Error(key + ' already exists without a link to this issue; its commits were left unchanged');
  }
  const oid = repository.defaultBranchRef?.target?.oid;
  if (!oid) throw new Error('The repository has no default branch commit');
  try {
    const result = await client.graphql(CREATE_BRANCH, {
      input: { issueId: issue.id, repositoryId: repository.id, oid, name: key },
    });
    if (result.createLinkedBranch?.linkedBranch?.ref?.name !== key) {
      throw new Error('GitHub did not return the linked branch ' + key);
    }
  } catch (error) {
    // Another run may have created the same linked branch while this run was waiting.
    repository = (await client.graphql(ISSUE_QUERY, variables)).repository;
    if (!repository?.issue || !hasLinkedWork(repository, key)) throw error;
  }
  return { key, titleChanged, branch: 'linked' };
}

async function listIssueNumbers(client, owner, repo) {
  const numbers = [];
  for (let page = 1; ; page++) {
    const items = await client.request('GET', '/repos/' + owner + '/' + repo
      + '/issues?state=all&per_page=100&page=' + page);
    numbers.push(...items.filter(item => !item.pull_request).map(item => item.number));
    if (items.length < 100) return numbers;
  }
}

async function main() {
  const [owner, repo, extra] = (process.env.GITHUB_REPOSITORY || '').split('/');
  if (!owner || !repo || extra) throw new Error('GITHUB_REPOSITORY must be owner/repo');
  const client = createClient(process.env.GH_TOKEN, process.env.GITHUB_API_URL);
  let numbers;
  if (process.env.ISSUE_NUMBER) {
    if (!/^\d+$/.test(process.env.ISSUE_NUMBER)) throw new Error('Invalid ISSUE_NUMBER');
    numbers = [Number(process.env.ISSUE_NUMBER)];
  } else if (process.argv.includes('--all') || process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    numbers = await listIssueNumbers(client, owner, repo);
  } else {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    if (!event.issue || event.pull_request) throw new Error('An issue event is required');
    numbers = [event.issue.number];
  }
  const failures = [];
  for (const number of numbers) {
    try {
      const result = await syncIssue(client, owner, repo, number);
      console.log(result.key + ': title ' + (result.titleChanged ? 'updated' : 'unchanged')
        + ', branch ' + result.branch);
    } catch (error) {
      failures.push(number);
      console.error('Issue #' + number + ': ' + error.message);
    }
  }
  if (failures.length) throw new Error('Failed issues: ' + failures.join(', '));
}

module.exports = { issueKey, issueTitle, syncIssue, listIssueNumbers };
if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
