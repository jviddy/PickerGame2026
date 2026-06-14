import { jsonResponse, onRequestOptions, requireAdmin } from './_shared.js';

const DEFAULT_REPOSITORY = 'jviddy/PickerGame2026';
const DEFAULT_WORKFLOW_ID = 'publish-entries.yml';
const DEFAULT_BRANCH = 'main';
const REPORTS_PATH = 'Data/matchReports.json';

export { onRequestOptions };

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function githubRequest(endpoint, token, options = {}) {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'PickerGame2026-admin',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub ${response.status}: ${body}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function readGithubJson(repository, branch, path, token) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const file = await githubRequest(
    `https://api.github.com/repos/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    token,
  );
  return { sha: file.sha, data: JSON.parse(decodeBase64(file.content)) };
}

async function writeGithubJson(repository, branch, path, sha, data, message, token) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return githubRequest(
    `https://api.github.com/repos/${repository}/contents/${encodedPath}`,
    token,
    {
      method: 'PUT',
      body: JSON.stringify({
        branch,
        message,
        content: encodeBase64(`${JSON.stringify(data, null, 2)}\n`),
        sha,
      }),
    },
  );
}

async function dispatchPublish(repository, branch, workflowId, token) {
  await githubRequest(
    `https://api.github.com/repos/${repository}/actions/workflows/${workflowId}/dispatches`,
    token,
    { method: 'POST', body: JSON.stringify({ ref: branch, inputs: { triggeredBy: 'match-reports-admin' } }) },
  );
}

export async function onRequestGet(context) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  const token = context.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return jsonResponse({ ok: false, errors: ['GitHub token not configured.'] }, 500);

  const repository = context.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const branch = context.env.GITHUB_BRANCH || DEFAULT_BRANCH;

  try {
    const { data } = await readGithubJson(repository, branch, REPORTS_PATH, token);
    return jsonResponse({ ok: true, reports: data });
  } catch (error) {
    return jsonResponse({ ok: false, errors: [error.message] }, 500);
  }
}

export async function onRequestPost(context) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  const token = context.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return jsonResponse({ ok: false, errors: ['GitHub token not configured.'] }, 500);

  let incoming;
  try {
    incoming = await context.request.json();
    if (!incoming.matchId?.trim()) throw new Error('matchId is required.');
    if (!incoming.title?.trim()) throw new Error('Title is required.');
    if (!incoming.body?.trim()) throw new Error('Body is required.');
  } catch (error) {
    return jsonResponse({ ok: false, errors: [error.message || 'Invalid request body.'] }, 400);
  }

  const repository = context.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const workflowId = context.env.GITHUB_WORKFLOW_ID || DEFAULT_WORKFLOW_ID;
  const branch = context.env.GITHUB_BRANCH || DEFAULT_BRANCH;

  try {
    const { sha, data: reports } = await readGithubJson(repository, branch, REPORTS_PATH, token);

    const now = new Date().toISOString();
    const matchId = incoming.matchId.trim();
    const existingIndex = reports.findIndex((r) => r.matchId === matchId);

    let updatedReports;
    if (existingIndex >= 0) {
      // Update existing report
      updatedReports = reports.map((r) =>
        r.matchId === matchId
          ? {
              ...r,
              title: incoming.title.trim(),
              body: incoming.body.trim(),
              footer: incoming.footer?.trim() || '',
              updatedAt: now,
            }
          : r,
      );
    } else {
      // Create new report
      updatedReports = [
        ...reports,
        {
          matchId,
          title: incoming.title.trim(),
          body: incoming.body.trim(),
          footer: incoming.footer?.trim() || '',
          publishedAt: now,
          updatedAt: now,
        },
      ];
    }

    // Sort by matchId (M001, M002, etc.)
    updatedReports.sort((a, b) => a.matchId.localeCompare(b.matchId));

    await writeGithubJson(repository, branch, REPORTS_PATH, sha, updatedReports, `Match report: ${matchId} — ${incoming.title.trim()}`, token);
    await dispatchPublish(repository, branch, workflowId, token);

    return jsonResponse({ ok: true, message: 'Report saved and publish started.' });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, errors: [error.message] }, 500);
  }
}

export async function onRequest() {
  return jsonResponse({ ok: false, errors: ['Method not allowed.'] }, 405);
}
