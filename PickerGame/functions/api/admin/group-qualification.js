import { jsonResponse, onRequestOptions, requireAdmin } from './_shared.js';

const DEFAULT_REPOSITORY = 'jviddy/PickerGame2026';
const DEFAULT_WORKFLOW_ID = 'publish-entries.yml';
const DEFAULT_BRANCH = 'main';
const RESULT_PATHS = ['Data/results.json', 'PickerGame/Data/results.json'];

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

async function readGithubJson(repository, branch, path, token) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const endpoint = `https://api.github.com/repos/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const file = await githubRequest(endpoint, token);
  return { sha: file.sha, data: JSON.parse(decodeBase64(file.content)) };
}

async function writeGithubJson(repository, branch, path, sha, data, message, token) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
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
    body: JSON.stringify({ ref: branch, inputs: { triggeredBy: 'group-qualification-admin' } }),
  });
}

async function loadMatchesJson(env, request) {
  const url = new URL('/Data/matches.json', request.url);
  const response = await env.ASSETS.fetch(new Request(url));
  if (!response.ok) throw new Error('Could not load matches data.');
  return response.json();
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
    return jsonResponse({ ok: false, errors: ['Request body must be valid JSON.'] }, 400);
  }

  const qualifiedTeamIds = Array.isArray(payload.qualifiedTeamIds) ? payload.qualifiedTeamIds : [];
  const qualifiedSet = new Set(qualifiedTeamIds);

  try {
    const matches = await loadMatchesJson(context.env, context.request);
    const gs3Matches = matches.filter(m => m.roundCode === 'GS3');

    const repository = context.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
    const branch = context.env.GITHUB_BRANCH || DEFAULT_BRANCH;
    const workflowId = context.env.GITHUB_WORKFLOW_ID || DEFAULT_WORKFLOW_ID;

    const rootFile = await readGithubJson(repository, branch, RESULT_PATHS[0], githubToken);
    let results = rootFile.data;

    const updatedResults = [];
    for (const match of gs3Matches) {
      const existingIdx = results.findIndex(r => r.matchId === match.matchId);
      const existing = existingIdx >= 0 ? results[existingIdx] : {
        matchId: match.matchId,
        homeScore: null,
        awayScore: null,
        homePenalties: null,
        awayPenalties: null,
        homeYellow: 0,
        awayYellow: 0,
        homeRed: 0,
        awayRed: 0,
      };
      const updated = {
        ...existing,
        homeQualified: qualifiedSet.has(match.homeTeam),
        awayQualified: qualifiedSet.has(match.awayTeam),
      };
      updatedResults.push(updated);
      if (existingIdx >= 0) {
        results[existingIdx] = updated;
      } else {
        results.push(updated);
      }
    }

    results = results.sort((a, b) => {
      const aNum = Number(String(a.matchId).replace(/\D/g, ''));
      const bNum = Number(String(b.matchId).replace(/\D/g, ''));
      return aNum - bNum;
    });

    const message = 'Update group stage qualification';
    await writeGithubJson(repository, branch, RESULT_PATHS[0], rootFile.sha, results, message, githubToken);

    for (const path of RESULT_PATHS.slice(1)) {
      const file = await readGithubJson(repository, branch, path, githubToken);
      await writeGithubJson(repository, branch, path, file.sha, results, message, githubToken);
    }

    await dispatchPublish(repository, branch, workflowId, githubToken);

    return jsonResponse({ ok: true, updatedResults, message: 'Group qualification saved and publish started.' });
  } catch (error) {
    console.error(error);
    const safeDetail = String(error.message || '').replace(githubToken, '[redacted]').slice(0, 500);
    return jsonResponse({
      ok: false,
      errors: ['Could not save group qualification.', safeDetail || 'Check the GitHub token permissions.'],
    }, 500);
  }
}

export async function onRequest() {
  return jsonResponse({ ok: false, errors: ['Method not allowed.'] }, 405);
}
