import { jsonResponse, onRequestOptions, requireAdmin } from './_shared.js';

export { onRequestOptions };

const RESEND_BASE = 'https://api.resend.com';

async function upsertContact(apiKey, { email, firstName, lastName, segments }) {
  const res = await fetch(`${RESEND_BASE}/contacts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      first_name: firstName,
      last_name:  lastName,
      segments,
    }),
  });
  if (res.ok) return { ok: true };
  const text = await res.text();
  return { ok: false, error: `${res.status}: ${text}` };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function rateLimit(tasks, perSecond = 4) {
  const results = [];
  const delay = Math.ceil(1000 / perSecond);
  for (let i = 0; i < tasks.length; i++) {
    results.push(await tasks[i]());
    if (i < tasks.length - 1) await sleep(delay);
  }
  return results;
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

  // One API call per contact — include unpaid segment ID only for unpaid entries
  const tasks = results.map(entry => () => {
    const parts = (entry.entrant_name || '').trim().split(/\s+/);
    const segments = [{ id: RESEND_AUDIENCE_ALL_ID }];
    if (!entry.paid) segments.push({ id: RESEND_AUDIENCE_UNPAID_ID });
    return upsertContact(RESEND_API_KEY, {
      email:     entry.email,
      firstName: parts[0] || '',
      lastName:  parts.slice(1).join(' ') || '',
      segments,
    })
      .then(r => ({ ...r, email: entry.email, unpaid: !entry.paid }))
      .catch(e => ({ ok: false, error: e.message, email: entry.email, unpaid: !entry.paid }));
  });

  // 4 requests/sec to stay under Resend's 5/sec rate limit
  const settled = await rateLimit(tasks, 4);

  let allSynced = 0;
  let unpaidSynced = 0;
  const errors = [];
  for (const r of settled) {
    if (r.ok) { allSynced++; if (r.unpaid) unpaidSynced++; }
    else errors.push(`${r.email} — ${r.error || 'unknown'}`);
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
