import { jsonResponse, onRequestOptions, requireAdmin } from './_shared.js';

const DEFAULT_REPOSITORY = 'jviddy/PickerGame2026';
const DEFAULT_WORKFLOW_ID = 'publish-entries.yml';
const DEFAULT_BRANCH = 'main';
const RESULT_PATHS = ['Data/results.json', 'PickerGame/Data/results.json'];

export { onRequestOptions };

function normaliseNumber(value, allowNull = false) {
  if (value === '' || value === null || value === undefined) {
    return allowNull ? null : 0;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error('Scores and cards must be whole numbers.');
  }
  return number;
}

function normaliseResult(payload) {
  if (!payload.matchId) throw new Error('Match ID is required.');

  const result = {
    matchId: String(payload.matchId),
    homeScore: normaliseNumber(payload.homeScore),
    awayScore: normaliseNumber(payload.awayScore),
    homePenalties: normaliseNumber(payload.homePenalties, true),
    awayPenalties: normaliseNumber(payload.awayPenalties, true),
    homeYellow: normaliseNumber(payload.homeYellow),
    awayYellow: normaliseNumber(payload.awayYellow),
    homeRed: normaliseNumber(payload.homeRed),
    awayRed: normaliseNumber(payload.awayRed),
  };

  // Only include qualification if explicitly provided; omitting preserves existing values on merge
  if (payload.homeQualified !== undefined) result.homeQualified = Boolean(payload.homeQualified);
  if (payload.awayQualified !== undefined) result.awayQualified = Boolean(payload.awayQualified);

  // Minute of the last goal in the final (used for tiebreaker 2); only sent for the Final match
  if (payload.lastGoalMinute !== undefined) {
    result.lastGoalMinute = normaliseNumber(payload.lastGoalMinute, true);
  }

  return result;
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
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
  return {
    sha: file.sha,
    data: JSON.parse(decodeBase64(file.content)),
  };
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

function updateResults(results, nextResult) {
  const existingIndex = results.findIndex((result) => result.matchId === nextResult.matchId);
  // Merge with existing so omitted fields (e.g. qualification set by group-qualification endpoint) are preserved
  const existing = existingIndex >= 0 ? results[existingIndex] : {};
  const merged = { ...existing, ...nextResult };

  const updated = existingIndex >= 0
    ? results.map((result, index) => index === existingIndex ? merged : result)
    : [...results, merged];

  return updated.sort((a, b) => {
    const aNumber = Number(String(a.matchId).replace(/\D/g, ''));
    const bNumber = Number(String(b.matchId).replace(/\D/g, ''));
    return aNumber - bNumber;
  });
}

async function dispatchPublish(repository, branch, workflowId, token) {
  const endpoint = `https://api.github.com/repos/${repository}/actions/workflows/${workflowId}/dispatches`;
  await githubRequest(endpoint, token, {
    method: 'POST',
    body: JSON.stringify({
      ref: branch,
      inputs: {
        triggeredBy: 'results-admin-page',
      },
    }),
  });
}

export async function onRequestPost(context) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  const githubToken = context.env.GITHUB_DISPATCH_TOKEN;
  if (!githubToken) {
    return jsonResponse({
      ok: false,
      errors: ['GitHub token is not configured.'],
    }, 500);
  }

  let nextResult;
  try {
    nextResult = normaliseResult(await context.request.json());
  } catch (error) {
    return jsonResponse({
      ok: false,
      errors: [error.message || 'Result payload is invalid.'],
    }, 400);
  }

  const repository = context.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const workflowId = context.env.GITHUB_WORKFLOW_ID || DEFAULT_WORKFLOW_ID;
  const branch = context.env.GITHUB_BRANCH || DEFAULT_BRANCH;
  const message = `Update result for ${nextResult.matchId}`;

  try {
    const rootFile = await readGithubJson(repository, branch, RESULT_PATHS[0], githubToken);
    const updatedResults = updateResults(rootFile.data, nextResult);

    await writeGithubJson(
      repository,
      branch,
      RESULT_PATHS[0],
      rootFile.sha,
      updatedResults,
      message,
      githubToken,
    );

    for (const path of RESULT_PATHS.slice(1)) {
      const file = await readGithubJson(repository, branch, path, githubToken);
      await writeGithubJson(repository, branch, path, file.sha, updatedResults, message, githubToken);
    }

    await dispatchPublish(repository, branch, workflowId, githubToken);

    return jsonResponse({
      ok: true,
      result: nextResult,
      message: 'Result saved and publish started.',
    });
  } catch (error) {
    console.error(error);
    const safeDetail = String(error.message || '')
      .replace(githubToken, '[redacted]')
      .slice(0, 500);
    return jsonResponse({
      ok: false,
      errors: [
        'Could not save result or start publishing.',
        safeDetail || 'Check the GitHub token permissions and workflow setup.',
      ],
    }, 500);
  }
}

export async function onRequest() {
  return jsonResponse({
    ok: false,
    errors: ['Method not allowed.'],
  }, 405);
}
