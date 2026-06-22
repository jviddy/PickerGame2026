import { jsonResponse, onRequestOptions, requireAdmin } from './_shared.js';

const MATCHES_PATHS = ['Data/matches.json', 'PickerGame/Data/matches.json'];
const DEFAULT_REPOSITORY = 'jviddy/PickerGame2026';
const DEFAULT_WORKFLOW_ID = 'publish-entries.yml';
const DEFAULT_BRANCH = 'main';

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
    throw new Error(`GitHub request failed with status ${response.status}: ${body}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function readGithubJson(repository, branch, filePath, token) {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const endpoint = `https://api.github.com/repos/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const file = await githubRequest(endpoint, token);
  return {
    sha: file.sha,
    data: JSON.parse(decodeBase64(file.content)),
  };
}

async function writeGithubJson(repository, branch, filePath, sha, data, message, token) {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const endpoint = `https://api.github.com/repos/${repository}/contents/${encodedPath}`;
  return githubRequest(endpoint, token, {
    method: 'PUT',
    body: JSON.stringify({
      branch,
      message,
      content: encodeBase64(`${JSON.stringify(data, null, 2)}\n`),
      sha,
    }),
  });
}

async function dispatchPublish(repository, branch, workflowId, token) {
  const endpoint = `https://api.github.com/repos/${repository}/actions/workflows/${workflowId}/dispatches`;
  await githubRequest(endpoint, token, {
    method: 'POST',
    body: JSON.stringify({ ref: branch, inputs: { triggeredBy: 'matches-admin-page' } }),
  });
}

function normalisePayload(payload) {
  if (!payload.matchId) throw new Error('matchId is required.');
  const update = { matchId: String(payload.matchId) };
  if (payload.homeTeam !== undefined) update.homeTeam = String(payload.homeTeam);
  if (payload.awayTeam !== undefined) update.awayTeam = String(payload.awayTeam);
  return update;
}

function applyMatchUpdate(matches, update) {
  const idx = matches.findIndex((m) => m.matchId === update.matchId);
  if (idx === -1) throw new Error(`Match ${update.matchId} not found.`);
  const updated = [...matches];
  updated[idx] = { ...matches[idx] };
  if (update.homeTeam !== undefined) updated[idx].homeTeam = update.homeTeam;
  if (update.awayTeam !== undefined) updated[idx].awayTeam = update.awayTeam;
  return updated;
}

export async function onRequestPost(context) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  const githubToken = context.env.GITHUB_DISPATCH_TOKEN;
  if (!githubToken) {
    return jsonResponse({ ok: false, errors: ['GitHub token is not configured.'] }, 500);
  }

  let update;
  try {
    update = normalisePayload(await context.request.json());
  } catch (error) {
    return jsonResponse({ ok: false, errors: [error.message || 'Invalid payload.'] }, 400);
  }

  const repository = context.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const workflowId = context.env.GITHUB_WORKFLOW_ID || DEFAULT_WORKFLOW_ID;
  const branch = context.env.GITHUB_BRANCH || DEFAULT_BRANCH;
  const message = `Update teams for ${update.matchId}`;

  try {
    const rootFile = await readGithubJson(repository, branch, MATCHES_PATHS[0], githubToken);
    const updatedMatches = applyMatchUpdate(rootFile.data, update);

    await writeGithubJson(repository, branch, MATCHES_PATHS[0], rootFile.sha, updatedMatches, message, githubToken);

    for (const p of MATCHES_PATHS.slice(1)) {
      const file = await readGithubJson(repository, branch, p, githubToken);
      await writeGithubJson(repository, branch, p, file.sha, updatedMatches, message, githubToken);
    }

    await dispatchPublish(repository, branch, workflowId, githubToken);

    return jsonResponse({ ok: true, update, message: 'Match updated and publish started.' });
  } catch (error) {
    console.error(error);
    const safeDetail = String(error.message || '').replace(githubToken, '[redacted]').slice(0, 500);
    return jsonResponse({
      ok: false,
      errors: ['Could not update match.', safeDetail || 'Check GitHub token permissions.'],
    }, 500);
  }
}

export async function onRequest() {
  return jsonResponse({ ok: false, errors: ['Method not allowed.'] }, 405);
}
