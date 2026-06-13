#!/usr/bin/env node
/**
 * Syncs all active entries from entries.json to two Resend segments.
 * Run with: npm run sync:contacts
 *
 * Required env vars (set in your shell or .env):
 *   RESEND_API_KEY
 *   RESEND_AUDIENCE_ALL_ID
 *   RESEND_AUDIENCE_UNPAID_ID
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.resolve(__dirname, '../../Data');

const RESEND_API_KEY          = process.env.RESEND_API_KEY;
const RESEND_AUDIENCE_ALL_ID  = process.env.RESEND_AUDIENCE_ALL_ID;
const RESEND_AUDIENCE_UNPAID_ID = process.env.RESEND_AUDIENCE_UNPAID_ID;

if (!RESEND_API_KEY || !RESEND_AUDIENCE_ALL_ID || !RESEND_AUDIENCE_UNPAID_ID) {
  console.error('Missing required env vars: RESEND_API_KEY, RESEND_AUDIENCE_ALL_ID, RESEND_AUDIENCE_UNPAID_ID');
  process.exit(1);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function upsertContact({ email, firstName, lastName, segments }) {
  const res = await fetch('https://api.resend.com/contacts', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, first_name: firstName, last_name: lastName, segments }),
  });
  if (res.ok) return { ok: true };
  const text = await res.text();
  return { ok: false, error: `${res.status}: ${text}` };
}

async function main() {
  const raw     = await fs.readFile(path.join(DATA_DIR, 'entries.json'), 'utf8');
  const entries = JSON.parse(raw);

  // Deduplicate by email (case-insensitive), skip removed entries
  const seen = new Set();
  const contacts = [];
  for (const e of entries) {
    if (e.removed) continue;
    if (!e.email?.trim()) continue;
    const key = e.email.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    contacts.push(e);
  }

  console.log(`Syncing ${contacts.length} contacts to Resend…`);

  let synced = 0;
  let unpaidSynced = 0;
  const errors = [];

  for (let i = 0; i < contacts.length; i++) {
    const e      = contacts[i];
    const parts  = (e.entrantName || '').trim().split(/\s+/);
    const segments = [{ id: RESEND_AUDIENCE_ALL_ID }];
    if (!e.paid) segments.push({ id: RESEND_AUDIENCE_UNPAID_ID });

    const result = await upsertContact({
      email:     e.email.trim(),
      firstName: parts[0] || '',
      lastName:  parts.slice(1).join(' ') || '',
      segments,
    });

    if (result.ok) {
      synced++;
      if (!e.paid) unpaidSynced++;
    } else {
      errors.push(`${e.email}: ${result.error}`);
      console.error(`  ✗ ${e.email}: ${result.error}`);
    }

    process.stdout.write(`\r  ${i + 1}/${contacts.length} processed…`);

    // 4 requests/sec to stay under Resend's 5/sec rate limit
    if (i < contacts.length - 1) await sleep(250);
  }

  console.log(`\n\nDone!`);
  console.log(`  ✓ ${synced} synced to Everyone`);
  console.log(`  ✓ ${unpaidSynced} synced to Unpaid`);
  if (errors.length) {
    console.log(`  ✗ ${errors.length} errors:`);
    errors.forEach(e => console.log(`      ${e}`));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
