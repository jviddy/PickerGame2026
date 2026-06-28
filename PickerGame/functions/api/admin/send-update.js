import { jsonResponse, onRequestOptions, requireAdmin } from './_shared.js';

export { onRequestOptions };

const FROM        = 'PickerGame <pickergame@vidamour.com>';
const RESEND_BASE = 'https://api.resend.com';

// unsubscribeUrl: Resend placeholder for broadcasts, or null for test sends
function buildHtml(heading, body, leaderboardUrl, unsubscribeUrl) {
  const BLOCK_RE = /^\s*<(table|thead|tbody|tr|ul|ol|li|div|h[1-6]|blockquote|pre|hr)/i;
  const bodyHtml = body
    .split(/\n{2,}/)
    .map(para => {
      const t = para.trim();
      if (BLOCK_RE.test(t)) return t;
      return `<p style="color:#555;line-height:1.6;margin:0 0 8px;">${t.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  const unsubHtml = unsubscribeUrl
    ? `<p style="margin:8px 0 0;font-size:11px;color:#bbb;">
         <a href="${unsubscribeUrl}" style="color:#bbb;">Unsubscribe</a>
       </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

        <tr>
          <td style="background:linear-gradient(135deg,#1a3352 0%,#1e4070 100%);padding:28px 40px;text-align:center;">
            <h1 style="margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;">
              <span style="color:#e86f2c;">Picker</span><span style="color:#e86f2c;">Game</span>
              <span style="font-weight:400;color:#999999;font-size:22px;">2026</span>
            </h1>
            <p style="margin:8px 0 0;color:#999999;font-size:13px;letter-spacing:0.03em;">World Cup 2026 Edition</p>
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
            ${unsubHtml}
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

  const { RESEND_API_KEY, RESEND_AUDIENCE_ALL_ID, RESEND_AUDIENCE_UNPAID_ID, RESEND_AUDIENCE_TEST } = context.env;

  if (!RESEND_API_KEY) return jsonResponse({ ok: false, errors: ['RESEND_API_KEY is not configured.'] }, 500);

  let subject, heading, body, leaderboardUrl, audience, testOnly;
  try {
    ({ subject, heading, body, leaderboardUrl, audience, testOnly } = await context.request.json());
    if (!subject?.trim()) throw new Error('subject is required.');
    if (!heading?.trim()) throw new Error('heading is required.');
    if (!body?.trim())    throw new Error('body is required.');
  } catch (err) {
    return jsonResponse({ ok: false, errors: [err.message || 'Invalid request body.'] }, 400);
  }

  // Test sends use the broadcast API against the test segment
  if (testOnly) {
    if (!RESEND_AUDIENCE_TEST) return jsonResponse({ ok: false, errors: ['RESEND_AUDIENCE_TEST is not configured.'] }, 500);
    const html = buildHtml(heading.trim(), body.trim(), leaderboardUrl?.trim() || '', '{{{ RESEND_UNSUBSCRIBE_URL }}}');
    const createRes = await fetch(`${RESEND_BASE}/broadcasts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:       `[TEST] ${subject.trim()}`,
        segment_id: RESEND_AUDIENCE_TEST,
        from:       FROM,
        subject:    `[TEST] ${subject.trim()}`,
        html,
      }),
    });
    if (!createRes.ok) {
      const detail = await createRes.text();
      return jsonResponse({ ok: false, errors: [`Failed to create test broadcast: ${detail}`] }, 502);
    }
    const { id: broadcastId } = await createRes.json();
    const sendRes = await fetch(`${RESEND_BASE}/broadcasts/${broadcastId}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!sendRes.ok) {
      const detail = await sendRes.text();
      return jsonResponse({ ok: false, errors: [`Test broadcast created (${broadcastId}) but send failed: ${detail}`] }, 502);
    }
    return jsonResponse({ ok: true, broadcastId, test: true });
  }

  // Broadcast send
  if (!RESEND_AUDIENCE_ALL_ID)    return jsonResponse({ ok: false, errors: ['RESEND_AUDIENCE_ALL_ID is not configured.'] }, 500);
  if (!RESEND_AUDIENCE_UNPAID_ID) return jsonResponse({ ok: false, errors: ['RESEND_AUDIENCE_UNPAID_ID is not configured.'] }, 500);

  const audienceId = audience === 'unpaid' ? RESEND_AUDIENCE_UNPAID_ID : RESEND_AUDIENCE_ALL_ID;
  const html = buildHtml(
    heading.trim(),
    body.trim(),
    leaderboardUrl?.trim() || '',
    '{{{ RESEND_UNSUBSCRIBE_URL }}}',
  );

  // 1. Create the broadcast
  const createRes = await fetch(`${RESEND_BASE}/broadcasts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name:       subject.trim(),
      segment_id: audienceId,
      from:       FROM,
      subject:    subject.trim(),
      html,
    }),
  });

  if (!createRes.ok) {
    const detail = await createRes.text();
    return jsonResponse({ ok: false, errors: [`Failed to create broadcast: ${detail}`] }, 502);
  }

  const { id: broadcastId } = await createRes.json();

  // 2. Send the broadcast immediately
  const sendRes = await fetch(`${RESEND_BASE}/broadcasts/${broadcastId}/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!sendRes.ok) {
    const detail = await sendRes.text();
    return jsonResponse({
      ok: false,
      errors: [`Broadcast created (${broadcastId}) but send failed: ${detail}`],
    }, 502);
  }

  return jsonResponse({ ok: true, broadcastId });
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
