/**
 * PickerGame 2026 — Update email script
 *
 * HOW TO USE:
 * 1. Go to https://script.google.com and create a new project
 * 2. Paste this entire file into the editor
 * 3. Update the RECIPIENTS array below with entrant emails
 *    (use the "Copy emails" button on the admin page to get them)
 * 4. Click Run → createUpdateDraft
 * 5. Open Gmail — the draft will be in your Drafts folder
 * 6. Edit the subject and body, then send
 *
 * You only need to update RECIPIENTS once (unless new entrants join).
 */

// ── Paste entrant emails here ──────────────────────────────────────────────
var RECIPIENTS = [
  // 'example@email.com',
  // 'another@email.com',
];
// ──────────────────────────────────────────────────────────────────────────

function createUpdateDraft() {
  if (RECIPIENTS.length === 0) {
    Logger.log('No recipients — paste the email list into the RECIPIENTS array first.');
    return;
  }

  var subject = 'PickerGame World Cup 2026 — Update';

  // ── Edit the update content below ───────────────────────────────────────
  var updateHeading = 'Mid-tournament update';
  var updateBody = [
    'Hi everyone,',
    '',
    'Here\'s the latest from PickerGame World Cup 2026...',
    '',
    '<!-- Write your update here -->',
    '',
    'Check the leaderboard to see where you stand:',
  ].join('<br>');
  var leaderboardUrl = 'https://pickergame.vidamour.com/leaderboard.html';
  // ────────────────────────────────────────────────────────────────────────

  var html = buildHtml(updateHeading, updateBody, leaderboardUrl);
  var bcc = RECIPIENTS.join(',');

  GmailApp.createDraft('', subject, '', {
    bcc: bcc,
    htmlBody: html,
    name: 'PickerGame 2026',
  });

  Logger.log('Draft created with ' + RECIPIENTS.length + ' BCC recipients. Check your Gmail Drafts.');
}

function buildHtml(heading, body, leaderboardUrl) {
  return '<!DOCTYPE html>' +
    '<html lang="en"><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">' +
    '<tr><td align="center">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">' +

    // Header
    '<tr><td style="background:linear-gradient(135deg,#1a3352 0%,#1e4070 100%);padding:28px 40px;text-align:center;">' +
    '<h1 style="margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">' +
    'Picker<span style="color:#e86f2c;">Game</span> ' +
    '<span style="font-weight:400;color:rgba(255,255,255,0.6);font-size:22px;">2026</span>' +
    '</h1>' +
    '<p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:13px;letter-spacing:0.03em;">World Cup 2026 Edition</p>' +
    '</td></tr>' +

    // Body
    '<tr><td style="padding:30px 40px;">' +
    '<h2 style="color:#1a3352;font-size:20px;margin:0 0 16px;">' + heading + '</h2>' +
    '<p style="color:#555;line-height:1.6;margin:0 0 24px;">' + body + '</p>' +

    // Leaderboard button
    '<h2 style="color:#1a3352;font-size:18px;margin:24px 0 10px;">Check the leaderboard</h2>' +
    '<p style="color:#555;margin:0 0 20px;">See how you\'re ranking and track the tournament live:</p>' +
    '<p style="text-align:center;margin:20px 0;">' +
    '<a href="' + leaderboardUrl + '" style="background:#1a3352;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">View Leaderboard</a>' +
    '</p>' +
    '</td></tr>' +

    // Footer
    '<tr><td style="background:#f9f9f9;padding:20px 40px;text-align:center;border-top:1px solid #e0e0e0;">' +
    '<p style="margin:0;font-size:12px;color:#999;">Questions? Reply to this email or contact ' +
    '<a href="mailto:pickergame@vidamour.com" style="color:#1a3352;">pickergame@vidamour.com</a></p>' +
    '</td></tr>' +

    '</table></td></tr></table></body></html>';
}
