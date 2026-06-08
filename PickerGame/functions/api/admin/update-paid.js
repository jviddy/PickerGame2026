import { jsonResponse, onRequestOptions, requireAdmin } from './_shared.js';

const DEFAULT_REPOSITORY = 'jviddy/PickerGame2026';
const DEFAULT_WORKFLOW_ID = 'publish-entries.yml';
const DEFAULT_BRANCH = 'main';

export { onRequestOptions };

export async function onRequestPost(context) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  if (!context.env.ENTRIES_DB) {
    return jsonResponse({ ok: false, errors: ['Entry database is not configured.'] }, 500);
  }

  const githubToken = context.env.GITHUB_DISPATCH_TOKEN;
  if (!githubToken) {
    return jsonResponse({ ok: false, errors: ['GitHub publish token is not configured.'] }, 500);
  }

  // Accept explicit per-entry updates: [{id, paid, removed}]
  let updates;
  try {
    const body = await context.request.json();
    if (!Array.isArray(body.updates)) throw new Error('updates must be an array.');
    updates = body.updates.map(({ id, paid, removed }) => ({
      id: String(id),
      paid: Boolean(paid) ? 1 : 0,
      removed: Boolean(removed) ? 1 : 0,
    }));
  } catch (error) {
    return jsonResponse({ ok: false, errors: [error.message || 'Invalid request body.'] }, 400);
  }

  try {
    // Update in batches of 50 to stay under D1's variable limit
    const CHUNK = 50;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      const stmts = chunk.map(({ id, paid, removed }) =>
        context.env.ENTRIES_DB
          .prepare('UPDATE entries SET paid = ?, removed = ? WHERE id = ?')
          .bind(paid, removed, id),
      );
      await context.env.ENTRIES_DB.batch(stmts);
    }
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, errors: [error.message || 'Could not update statuses.'] }, 500);
  }

  const repository = context.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const workflowId = context.env.GITHUB_WORKFLOW_ID || DEFAULT_WORKFLOW_ID;
  const branch = context.env.GITHUB_BRANCH || DEFAULT_BRANCH;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${githubToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'PickerGame2026-admin',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: branch, inputs: { triggeredBy: 'update-paid' } }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      console.error(detail);
      return jsonResponse({
        ok: false,
        errors: [`Payment statuses saved but publish failed (GitHub status ${response.status}).`],
      }, 502);
    }
  } catch (error) {
    console.error(error);
    return jsonResponse({
      ok: false,
      errors: ['Payment statuses saved but could not start publish workflow.'],
    }, 500);
  }

  return jsonResponse({ ok: true, message: 'Payment statuses saved and publish started.' });
}

export async function onRequest() {
  return jsonResponse({ ok: false, errors: ['Method not allowed.'] }, 405);
}
