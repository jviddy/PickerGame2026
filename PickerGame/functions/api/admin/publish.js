import { jsonResponse, onRequestOptions, requireAdmin } from './_shared.js';

const DEFAULT_REPOSITORY = 'jviddy/PickerGame2026';
const DEFAULT_WORKFLOW_ID = 'publish-entries.yml';
const DEFAULT_BRANCH = 'main';

export { onRequestOptions };

export async function onRequestPost(context) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  const githubToken = context.env.GITHUB_DISPATCH_TOKEN;
  if (!githubToken) {
    return jsonResponse({
      ok: false,
      errors: ['GitHub publish token is not configured.'],
    }, 500);
  }

  const repository = context.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const workflowId = context.env.GITHUB_WORKFLOW_ID || DEFAULT_WORKFLOW_ID;
  const branch = context.env.GITHUB_BRANCH || DEFAULT_BRANCH;
  const endpoint = `https://api.github.com/repos/${repository}/actions/workflows/${workflowId}/dispatches`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PickerGame2026-admin',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        ref: branch,
        inputs: {
          triggeredBy: 'admin-page',
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(detail);
      return jsonResponse({
        ok: false,
        errors: [`GitHub publish request failed with status ${response.status}.`],
      }, 502);
    }

    return jsonResponse({
      ok: true,
      message: 'Publish started.',
      repository,
      workflowId,
      branch,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({
      ok: false,
      errors: ['Could not start publish workflow.'],
    }, 500);
  }
}

export async function onRequest() {
  return jsonResponse({
    ok: false,
    errors: ['Method not allowed.'],
  }, 405);
}
