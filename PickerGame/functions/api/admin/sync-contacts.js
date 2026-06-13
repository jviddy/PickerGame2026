import { jsonResponse, onRequestOptions, requireAdmin } from './_shared.js';

export { onRequestOptions };

const RESEND_BASE = 'https://api.resend.com';

async function upsertContact(apiKey, segmentId, { email, firstName, lastName, unsubscribed = false }) {
  const res = await fetch(`${RESEND_BASE}/contacts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      first_name:   firstName,
      last_name:    lastName,
      unsubscribed,
      segments:     [segmentId],
    }),
  });
  return res.ok;
}

export async function onRequestPost(context) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  const { RESEND_API_KEY, RESEND_AUDIENCE_ALL_ID, RESEND_AUDIENCE_UNPAID_ID, ENTRIES_DB } = context.env;

  if (!RESEND_API_KEY)            return jsonResponse({ ok: false, errors: ['RESEND_API_KEY not set.'] }, 500);
  if (!RESEND_AUDIENCE_ALL_ID)    return jsonResponse({ ok: false, errors: ['RESEND_AUDIENCE_ALL_ID not set.'] }, 500);
  if (!RESEND_AUDIENCE_UNPAID_ID) return jsonResponse({ ok: false, errors: ['RESEND_AUDIENCE_UNPAID_ID not set.'] }, 500);
  if (!ENTRIES_DB)                return jsonResponse({ ok: false, errors: ['ENTRIES_DB not set.'] }, 500);

  const { results } = await ENTRIES_DB
    .prepare(
      'SELECT email, entrant_name, paid FROM entries WHERE removed = 0 AND email IS NOT NULL AND email != \'\' GROUP BY LOWER(email)'
    )
    .all();

  let allSynced = 0;
  let unpaidSynced = 0;
  const errors = [];

  for (const entry of results) {
    const parts = (entry.entrant_name || '').trim().split(/\s+/);
    const base = {
      email:     entry.email,
      firstName: parts[0] || '',
      lastName:  parts.slice(1).join(' ') || '',
    };

    // All-entrants audience: everyone active
    const allOk = await upsertContact(RESEND_API_KEY, RESEND_AUDIENCE_ALL_ID, base);
    if (allOk) allSynced++;
    else errors.push(`all: ${entry.email}`);

    // Unpaid audience: active if unpaid, suppressed if paid
    const unpaidOk = await upsertContact(RESEND_API_KEY, RESEND_AUDIENCE_UNPAID_ID, {
      ...base,
      unsubscribed: Boolean(entry.paid),
    });
    if (unpaidOk) unpaidSynced++;
    else errors.push(`unpaid: ${entry.email}`);
  }

  return jsonResponse({
    ok:           true,
    total:        results.length,
    allSynced,
    unpaidSynced,
    errors:       errors.length ? errors : undefined,
  });
}

export async function onRequestGet(context) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  if (!context.env.ENTRIES_DB) return jsonResponse({ ok: false, errors: ['ENTRIES_DB not set.'] }, 500);

  const [allRes, unpaidRes] = await Promise.all([
    context.env.ENTRIES_DB
      .prepare('SELECT COUNT(DISTINCT LOWER(email)) as n FROM entries WHERE removed = 0 AND email IS NOT NULL AND email != \'\'')
      .first(),
    context.env.ENTRIES_DB
      .prepare('SELECT COUNT(DISTINCT LOWER(email)) as n FROM entries WHERE paid = 0 AND removed = 0 AND email IS NOT NULL AND email != \'\'')
      .first(),
  ]);

  return jsonResponse({ ok: true, all: allRes?.n ?? 0, unpaid: unpaidRes?.n ?? 0 });
}

export async function onRequest() {
  return jsonResponse({ ok: false, errors: ['Method not allowed.'] }, 405);
}
