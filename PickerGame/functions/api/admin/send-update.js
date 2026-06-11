import { jsonResponse, onRequestOptions, requireAdmin } from './_shared.js';

export { onRequestOptions };

const FROM = 'PickerGame <pickergame@vidamour.com>';
const BATCH_SIZE = 90; // Resend batch limit is 100; stay under it

function buildHtml(heading, body, leaderboardUrl) {
  const bodyHtml = body
    .split(/\n{2,}/)
    .map(para => `<p style="color:#555;line-height:1.7;margin:0 0 14px;">${para.trim().replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

        <tr>
          <td style="background:linear-gradient(135deg,#1a3352 0%,#1e4070 100%);padding:28px 40px;text-align:center;">
            <h1 style="margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">
              Picker<span style="color:#e86f2c;">Game</span>
              <span style="font-weight:400;color:rgba(255,255,255,0.6);font-size:22px;">2026</span>
            </h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:13px;letter-spacing:0.03em;">World Cup 2026 Edition</p>
          </td>
        </tr>

        <tr>
          <td style="padding:30px 40px;">
            <h2 style="color:#1a3352;font-size:20px;margin:0 0 16px;">${heading}</h2>
            ${bodyHtml}
            ${leaderboardUrl ? `
            <p style="text-align:center;margin:28px 0 0;">
              <a href="${leaderboardUrl}"
                 style="background:#1a3352;color:#ffffff;padding:13px 30px;border-radius:6px;
                        text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">
                View Leaderboard
              </a>
            </p>` : ''}
          </td>
        </tr>

        <tr>
          <td style="background:#f9f9f9;padding:20px 40px;text-align:center;border-top:1px solid #e0e0e0;">
            <p style="margin:0;font-size:12px;color:#999;">
              Questions? Reply to this email or contact
              <a href="mailto:pickergame@vidamour.com" style="color:#1a3352;">pickergame@vidamour.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function onRequestPost(context) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  if (!context.env.ENTRIES_DB) {
    return jsonResponse({ ok: false, errors: ['Entry database is not configured.'] }, 500);
  }
  if (!context.env.RESEND_API_KEY) {
    return jsonResponse({ ok: false, errors: ['RESEND_API_KEY is not configured.'] }, 500);
  }

  let subject, heading, body, leaderboardUrl, audience, testOnly;
  try {
    ({ subject, heading, body, leaderboardUrl, audience, testOnly } = await context.request.json());
    if (!subject?.trim()) throw new Error('subject is required.');
    if (!heading?.trim()) throw new Error('heading is required.');
    if (!body?.trim()) throw new Error('body is required.');
  } catch (err) {
    return jsonResponse({ ok: false, errors: [err.message || 'Invalid request body.'] }, 400);
  }

  // Fetch recipient emails from D1
  const isPaidOnly = audience === 'paid';
  const sql = isPaidOnly
    ? 'SELECT DISTINCT email, entrant_name FROM entries WHERE paid = 1 AND removed = 0 AND email IS NOT NULL AND email != \'\''
    : 'SELECT DISTINCT email, entrant_name FROM entries WHERE removed = 0 AND email IS NOT NULL AND email != \'\'';

  const { results } = await context.env.ENTRIES_DB.prepare(sql).all();

  let recipients = results.map(r => ({ email: r.email, name: r.entrant_name })).filter(r => r.email);

  if (testOnly) {
    recipients = [{ email: 'jamie@vidamour.com', name: 'Jamie (test)' }];
  }

  if (!recipients.length) {
    return jsonResponse({ ok: false, errors: ['No recipients found.'] }, 400);
  }

  const html = buildHtml(
    heading.trim(),
    body.trim(),
    leaderboardUrl?.trim() || '',
  );

  // Send in batches via Resend batch API
  let totalSent = 0;
  const errors = [];

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE).map(r => ({
      from: FROM,
      to: [r.email],
      subject: subject.trim(),
      html,
    }));

    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${context.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        const detail = await res.text();
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed (HTTP ${res.status}): ${detail}`);
      } else {
        totalSent += batch.length;
      }
    } catch (err) {
      errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${err.message}`);
    }
  }

  if (errors.length && totalSent === 0) {
    return jsonResponse({ ok: false, errors }, 502);
  }

  return jsonResponse({
    ok: true,
    sent: totalSent,
    errors: errors.length ? errors : undefined,
  });
}

export async function onRequestGet(context) {
  const authError = requireAdmin(context);
  if (authError) return authError;

  if (!context.env.ENTRIES_DB) {
    return jsonResponse({ ok: false, errors: ['Entry database is not configured.'] }, 500);
  }

  const [allRes, paidRes] = await Promise.all([
    context.env.ENTRIES_DB
      .prepare('SELECT COUNT(DISTINCT email) as n FROM entries WHERE removed = 0 AND email IS NOT NULL AND email != \'\'')
      .first(),
    context.env.ENTRIES_DB
      .prepare('SELECT COUNT(DISTINCT email) as n FROM entries WHERE paid = 1 AND removed = 0 AND email IS NOT NULL AND email != \'\'')
      .first(),
  ]);

  return jsonResponse({ ok: true, all: allRes?.n ?? 0, paid: paidRes?.n ?? 0 });
}

export async function onRequest() {
  return jsonResponse({ ok: false, errors: ['Method not allowed.'] }, 405);
}
