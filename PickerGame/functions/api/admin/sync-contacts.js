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
      segments:     [{ id: segmentId }],
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

  const tasks = results.map(entry => {
    const parts = (entry.entrant_name || '').trim().split(/\s+/);
    const base = {
      email:     entry.email,
      firstName: parts[0] || '',
      lastName:  parts.slice(1).join(' ') || '',
    };
    return [
      upsertContact(RESEND_API_KEY, RESEND_AUDIENCE_ALL_ID, base)
        .then(ok => ({ list: 'all',    ok, email: entry.email }))
        .catch(() => ({ list: 'all',   ok: false, email: entry.email })),
      upsertContact(RESEND_API_KEY, RESEND_AUDIENCE_UNPAID_ID, { ...base, unsubscribed: Boolean(entry.paid) })
        .then(ok => ({ list: 'unpaid', ok, email: entry.email }))
        .catch(() => ({ list: 'unpaid', ok: false, email: entry.email })),
    ];
  }).flat();

  const settled = await Promise.all(tasks);

  let allSynced = 0;
  let unpaidSynced = 0;
  const errors = [];
  for (const r of settled) {
    if (r.list === 'all'    && r.ok) allSynced++;
    if (r.list === 'unpaid' && r.ok) unpaidSynced++;
    if (!r.ok) errors.push(`${r.list}: ${r.email}`);
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
