const REPOSITORY = 'jviddy/PickerGame2026';
const BRANCH = 'main';
const RESULTS_PATH = 'Data/results.json';

function decodeBase64(value) {
  const binary = atob(value.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function readGithubJson(path, token) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const endpoint = `https://api.github.com/repos/${REPOSITORY}/contents/${encodedPath}?ref=${encodeURIComponent(BRANCH)}`;

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'PickerGame2026',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(endpoint, { headers });
  if (!response.ok) {
    throw new Error(`GitHub responded with ${response.status}`);
  }
  const file = await response.json();
  return JSON.parse(decodeBase64(file.content));
}

export async function onRequestGet(context) {
  const token = context.env.GITHUB_DISPATCH_TOKEN || null;

  try {
    const results = await readGithubJson(RESULTS_PATH, token);
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: 'Could not load results.' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { Allow: 'GET, OPTIONS' },
  });
}
