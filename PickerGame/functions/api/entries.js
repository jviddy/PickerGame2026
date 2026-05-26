import { buildConfirmationEmail } from '../email-confirmation.js';

const ENTRY_OPEN  = new Date('2026-05-01T00:00:00Z').getTime(); // TODO: revert to 2026-05-29T08:00:00Z before launch
const ENTRY_CLOSE = new Date('2026-06-11T19:00:00Z').getTime();

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
    errors.push(`Team cost exceeds the MX$${budget}bn budget.`);
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

async function sendConfirmationEmail(env, data) {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured — skipping confirmation email');
    return;
  }
  try {
    const { subject, html, text } = buildConfirmationEmail(data);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'PickerGame <pickergame@vidamour.com>',
        to: [data.email],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('Resend error', res.status, body);
    }
  } catch (err) {
    console.error('Failed to send confirmation email:', err);
  }
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

  const now = Date.now();
  if (now < ENTRY_OPEN) {
    return jsonResponse({
      ok: false,
      errors: ['Entries are not yet open. They open at 9:00 BST on 29 May 2026.'],
    }, 403);
  }
  if (now >= ENTRY_CLOSE) {
    return jsonResponse({
      ok: false,
      errors: ['Entries are now closed.'],
    }, 403);
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

    const entrantNameNormalised = entry.entrantName.toLowerCase();
    const teamNameNormalised = entry.teamName.toLowerCase();

    const existingCombo = await env.ENTRIES_DB
      .prepare('SELECT id FROM entries WHERE email_normalized = ? AND entrant_name_normalized = ? LIMIT 1')
      .bind(emailNormalised, entrantNameNormalised)
      .first();

    if (existingCombo) {
      return jsonResponse({
        ok: false,
        errors: ['An entry with this name and email address has already been submitted.'],
      }, 409);
    }

    const existingTeamName = await env.ENTRIES_DB
      .prepare('SELECT id FROM entries WHERE team_name_normalized = ? LIMIT 1')
      .bind(teamNameNormalised)
      .first();

    if (existingTeamName) {
      return jsonResponse({
        ok: false,
        errors: ['This team name is already taken. Please choose a different name.'],
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
          team_name_normalized,
          entrant_name,
          entrant_name_normalized,
          email,
          email_normalized,
          selected_teams_json,
          selected_team_ids_json,
          tie_breaker_answers_json,
          total_cost,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        entryId,
        entry.teamName,
        teamNameNormalised,
        entry.entrantName,
        entrantNameNormalised,
        entry.email,
        emailNormalised,
        JSON.stringify(selectedTeams),
        JSON.stringify(selectedTeamIds),
        JSON.stringify(tieBreakerAnswers),
        validation.totalCost,
        now,
      )
      .run();

    const leaderboardUrl = new URL('/leaderboard', request.url).href;
    context.waitUntil(
      sendConfirmationEmail(env, {
        entrantName: entry.entrantName,
        teamName: entry.teamName,
        email: entry.email,
        selectedTeams,
        tieBreakerAnswers,
        tieBreakerQuestions: settings.tieBreakerQuestions || [],
        totalCost: validation.totalCost,
        leaderboardUrl,
      })
    );

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
