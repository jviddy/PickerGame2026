const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function loadSiteJson(env, request, path) {
  const url = new URL(path, request.url);
  const response = await env.ASSETS.fetch(new Request(url));
  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }
  return response.json();
}

function normalisePayload(payload) {
  return {
    teamName: String(payload.teamName || '').trim(),
    entrantName: String(payload.entrantName || payload.playerName || '').trim(),
    email: String(payload.email || '').trim(),
    selectedTeams: Array.isArray(payload.selectedTeams) ? payload.selectedTeams : [],
    selectedTeamIds: Array.isArray(payload.selectedTeamIds)
      ? payload.selectedTeamIds
      : Array.isArray(payload.picks)
        ? payload.picks
        : [],
    tieBreakerAnswers: Array.isArray(payload.tieBreakerAnswers)
      ? payload.tieBreakerAnswers
      : [payload.tiebreaker1, payload.tiebreaker2].filter(value => value !== undefined),
  };
}

function validateEntry(entry, teams, settings) {
  const errors = [];
  const teamsToPick = Number(settings.teamsToPick || 8);
  const budget = Number(settings.budget || 150);
  const teamsByName = new Map(teams.map(team => [team.countryName, team]));
  const teamsById = new Map(teams.map(team => [team.groupId, team]));

  if (!entry.teamName) errors.push('Team name is required.');
  if (!entry.entrantName) errors.push('Your name is required.');
  if (!isValidEmail(entry.email)) errors.push('A valid email address is required.');

  let selectedTeams = [];
  if (entry.selectedTeamIds.length) {
    selectedTeams = entry.selectedTeamIds.map(teamId => teamsById.get(teamId));
  } else {
    selectedTeams = entry.selectedTeams.map(teamName => teamsByName.get(teamName));
  }

  if (selectedTeams.length !== teamsToPick) {
    errors.push(`Select exactly ${teamsToPick} teams.`);
  }
  if (selectedTeams.some(team => !team)) {
    errors.push('One or more selected teams is invalid.');
  }

  const selectedIds = selectedTeams.filter(Boolean).map(team => team.groupId);
  if (new Set(selectedIds).size !== selectedIds.length) {
    errors.push('Duplicate teams are not allowed.');
  }

  const totalCost = selectedTeams
    .filter(Boolean)
    .reduce((sum, team) => sum + Number(team.cost || 0), 0);
  if (totalCost > budget) {
    errors.push(`Team cost exceeds the £${budget}m budget.`);
  }

  const tieBreakerCount = Number(settings.numberOfTieBreakers || 2);
  if (entry.tieBreakerAnswers.length !== tieBreakerCount) {
    errors.push(`Enter ${tieBreakerCount} tiebreaker answers.`);
  }
  entry.tieBreakerAnswers.forEach((answer, index) => {
    const value = Number(answer);
    if (!Number.isInteger(value) || value < 1) {
      errors.push(`Tiebreaker ${index + 1} must be a positive whole number.`);
    }
  });

  return {
    errors,
    selectedTeams: selectedTeams.filter(Boolean),
    totalCost,
  };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...JSON_HEADERS,
      Allow: 'POST, OPTIONS',
    },
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.ENTRIES_DB) {
    return jsonResponse({
      ok: false,
      errors: ['Entry database is not configured.'],
    }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({
      ok: false,
      errors: ['Request body must be valid JSON.'],
    }, 400);
  }

  try {
    const [teams, settings] = await Promise.all([
      loadSiteJson(env, request, '/Data/teams.json'),
      loadSiteJson(env, request, '/Data/settings.json'),
    ]);
    const entry = normalisePayload(payload);
    const emailNormalised = normaliseEmail(entry.email);
    const validation = validateEntry(entry, teams, settings);

    if (validation.errors.length) {
      return jsonResponse({
        ok: false,
        errors: validation.errors,
      }, 400);
    }

    const existing = await env.ENTRIES_DB
      .prepare('SELECT id FROM entries WHERE email_normalized = ? LIMIT 1')
      .bind(emailNormalised)
      .first();

    if (existing) {
      return jsonResponse({
        ok: false,
        errors: ['An entry has already been submitted for this email address.'],
      }, 409);
    }

    const entryId = crypto.randomUUID();
    const now = new Date().toISOString();
    const selectedTeams = validation.selectedTeams.map(team => team.countryName);
    const selectedTeamIds = validation.selectedTeams.map(team => team.groupId);
    const tieBreakerAnswers = entry.tieBreakerAnswers.map(answer => String(answer).trim());

    await env.ENTRIES_DB
      .prepare(`
        INSERT INTO entries (
          id,
          team_name,
          entrant_name,
          email,
          email_normalized,
          selected_teams_json,
          selected_team_ids_json,
          tie_breaker_answers_json,
          total_cost,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        entryId,
        entry.teamName,
        entry.entrantName,
        entry.email,
        emailNormalised,
        JSON.stringify(selectedTeams),
        JSON.stringify(selectedTeamIds),
        JSON.stringify(tieBreakerAnswers),
        validation.totalCost,
        now,
      )
      .run();

    return jsonResponse({
      ok: true,
      entryId,
      createdAt: now,
    }, 201);
  } catch (error) {
    console.error(error);
    return jsonResponse({
      ok: false,
      errors: ['Could not submit entry. Please try again.'],
    }, 500);
  }
}

export async function onRequest() {
  return jsonResponse({
    ok: false,
    errors: ['Method not allowed.'],
  }, 405);
}
