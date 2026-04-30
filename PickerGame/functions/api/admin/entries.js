import { jsonResponse, onRequestOptions, requireAdmin } from './_shared.js';

function parseJsonField(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapEntry(row) {
  return {
    id: row.id,
    teamName: row.team_name,
    entrantName: row.entrant_name,
    email: row.email,
    selectedTeams: parseJsonField(row.selected_teams_json, []),
    selectedTeamIds: parseJsonField(row.selected_team_ids_json, []),
    tieBreakerAnswers: parseJsonField(row.tie_breaker_answers_json, []),
    totalCost: row.total_cost,
    submittedAt: row.created_at,
  };
}

export { onRequestOptions };

export async function onRequestGet(context) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  if (!context.env.ENTRIES_DB) {
    return jsonResponse({
      ok: false,
      errors: ['Entry database is not configured.'],
    }, 500);
  }

  try {
    const result = await context.env.ENTRIES_DB
      .prepare(`
        SELECT
          id,
          team_name,
          entrant_name,
          email,
          selected_teams_json,
          selected_team_ids_json,
          tie_breaker_answers_json,
          total_cost,
          created_at
        FROM entries
        ORDER BY created_at DESC
      `)
      .all();

    return jsonResponse({
      ok: true,
      entries: (result.results || []).map(mapEntry),
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({
      ok: false,
      errors: ['Could not load entries.'],
    }, 500);
  }
}

export async function onRequest() {
  return jsonResponse({
    ok: false,
    errors: ['Method not allowed.'],
  }, 405);
}
