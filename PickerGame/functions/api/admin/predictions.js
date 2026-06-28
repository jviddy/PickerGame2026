import { jsonResponse, onRequestOptions, requireAdmin } from './_shared.js';

const PREDICTION_PATHS = ['Data/predictions.json', 'PickerGame/Data/predictions.json'];
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
  return { sha: file.sha, data: JSON.parse(decodeBase64(file.content)) };
}

async function writeGithubJson(repository, branch, filePath, sha, data, message, token) {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const endpoint = `https://api.github.com/repos/${repository}/contents/${encodedPath}`;
  return githubRequest(endpoint, token, {
    method: 'PUT',
    body: JSON.stringify({
      branch, message,
      content: encodeBase64(`${JSON.stringify(data, null, 2)}\n`),
      sha,
    }),
  });
}

async function dispatchPublish(repository, branch, workflowId, token) {
  const endpoint = `https://api.github.com/repos/${repository}/actions/workflows/${workflowId}/dispatches`;
  await githubRequest(endpoint, token, {
    method: 'POST',
    body: JSON.stringify({ ref: branch, inputs: { triggeredBy: 'predictions-admin' } }),
  });
}

export async function onRequestPost(context) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  const githubToken = context.env.GITHUB_DISPATCH_TOKEN;
  if (!githubToken) {
    return jsonResponse({ ok: false, errors: ['GitHub token is not configured.'] }, 500);
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, errors: ['Invalid JSON payload.'] }, 400);
  }

  const { matchId, prediction } = payload;
  if (!matchId) return jsonResponse({ ok: false, errors: ['matchId is required.'] }, 400);

  const repository = context.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const workflowId = context.env.GITHUB_WORKFLOW_ID || DEFAULT_WORKFLOW_ID;
  const branch = context.env.GITHUB_BRANCH || DEFAULT_BRANCH;

  try {
    const rootFile = await readGithubJson(repository, branch, PREDICTION_PATHS[0], githubToken);
    const predictions = rootFile.data;

    if (prediction) {
      predictions[matchId] = prediction;
    } else {
      delete predictions[matchId];
    }

    const message = prediction
      ? `Update prediction for ${matchId}: ${prediction}`
      : `Remove prediction for ${matchId}`;

    await writeGithubJson(repository, branch, PREDICTION_PATHS[0], rootFile.sha, predictions, message, githubToken);

    for (const p of PREDICTION_PATHS.slice(1)) {
      const file = await readGithubJson(repository, branch, p, githubToken);
      await writeGithubJson(repository, branch, p, file.sha, predictions, message, githubToken);
    }

    await dispatchPublish(repository, branch, workflowId, githubToken);

    return jsonResponse({ ok: true, matchId, prediction, message: 'Prediction saved and publish started.' });
  } catch (error) {
    console.error(error);
    const safeDetail = String(error.message || '').replace(githubToken, '[redacted]').slice(0, 500);
    return jsonResponse({ ok: false, errors: ['Could not save prediction.', safeDetail] }, 500);
  }
}

export async function onRequest() {
  return jsonResponse({ ok: false, errors: ['Method not allowed.'] }, 405);
}
