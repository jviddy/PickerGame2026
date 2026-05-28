// Confirmation email sent to every new entrant.
// Edit the content here — subject, body copy, bank details, styling.
// The function receives all entry data and returns { subject, html, text }.

const BANK_DETAILS = `Amount:         £10
Account Name:   Jamie Vidamour
Sort Code:      04-00-75
Account Number: 78265568
Reference:      Your name`;

export function buildConfirmationEmail({
  entrantName,
  teamName,
  selectedTeams,
  tieBreakerAnswers,
  tieBreakerQuestions,
  totalCost,
  leaderboardUrl,
}) {
  const subject = 'Welcome to PickerGame — World Cup 2026 Edition!';

  const teamListHtml = selectedTeams
    .map(t => `<li style="padding: 3px 0;">${t}</li>`)
    .join('\n');

  const teamListText = selectedTeams
    .map((t, i) => `  ${String(i + 1).padStart(2, ' ')}. ${t}`)
    .join('\n');

  const tiebreakersHtml = tieBreakerAnswers
    .map((ans, i) => {
      const q = tieBreakerQuestions[i] || `Tiebreaker ${i + 1}`;
      return `<li style="padding: 6px 0;"><strong>${q}</strong><br>Your answer: <strong>${ans}</strong></li>`;
    })
    .join('\n');

  const tiebreakersText = tieBreakerAnswers
    .map((ans, i) => {
      const q = tieBreakerQuestions[i] || `Tiebreaker ${i + 1}`;
      return `  Q: ${q}\n  A: ${ans}`;
    })
    .join('\n\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a3352 0%,#1e4070 100%);padding:28px 40px;text-align:center;">
            <h1 style="margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">Picker<span style="color:#e86f2c;">Game</span> <span style="font-weight:400;color:rgba(255,255,255,0.6);font-size:22px;">2026</span></h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:13px;letter-spacing:0.03em;">World Cup 2026 Edition</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:30px 40px;">
            <p style="font-size:16px;color:#333;">Hi <strong>${entrantName}</strong>,</p>
            <p style="color:#555;">Your entry is confirmed — welcome to PickerGame! Here's a summary of what you submitted.</p>

            <!-- Entry summary -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:6px;padding:16px;margin:20px 0;">
              <tr>
                <td style="padding:5px 0;color:#666;width:140px;">Team name</td>
                <td style="padding:5px 0;color:#333;font-weight:bold;">${teamName}</td>
              </tr>
              <tr>
                <td style="padding:5px 0;color:#666;">Registered as</td>
                <td style="padding:5px 0;color:#333;">${entrantName}</td>
              </tr>
              <tr>
                <td style="padding:5px 0;color:#666;">Total cost</td>
                <td style="padding:5px 0;color:#333;">MX$${totalCost}bn</td>
              </tr>
            </table>

            <!-- Picks -->
            <h2 style="color:#1a472a;font-size:18px;margin:24px 0 10px;">Your Picks</h2>
            <ul style="margin:0;padding-left:20px;color:#333;">
              ${teamListHtml}
            </ul>

            <!-- Tiebreakers -->
            <h2 style="color:#1a472a;font-size:18px;margin:24px 0 10px;">Tiebreakers</h2>
            <ul style="margin:0;padding-left:20px;color:#333;">
              ${tiebreakersHtml}
            </ul>

            <!-- Payment -->
            <h2 style="color:#1a472a;font-size:18px;margin:24px 0 10px;">How to Pay</h2>
            <p style="color:#555;">To appear on the leaderboard your entry fee must be paid. Please transfer using the details below — use your name as a reference, but remember that there may be 7 Dave's entering.</p>
            <pre style="background:#f5f5f5;border:1px solid #e0e0e0;border-radius:6px;padding:16px;font-size:13px;color:#333;line-height:1.6;white-space:pre-wrap;">${BANK_DETAILS}</pre>

            <!-- Leaderboard -->
            <h2 style="color:#1a472a;font-size:18px;margin:24px 0 10px;">Follow the Action</h2>
            <p style="color:#555;">Track your progress and see how you rank during the tournament:</p>
            <p style="text-align:center;margin:20px 0;">
              <a href="${leaderboardUrl}" style="background:#1a472a;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">View Leaderboard</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:20px 40px;text-align:center;border-top:1px solid #e0e0e0;">
            <p style="margin:0;font-size:12px;color:#999;">Questions? Reply to this email or contact <a href="mailto:pickergame@vidamour.com" style="color:#1a472a;">pickergame@vidamour.com</a></p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `PickerGame — World Cup 2026 Edition
====================================

Hi ${entrantName},

Your entry is confirmed — welcome to PickerGame!

YOUR ENTRY
----------
Team name:    ${teamName}
Registered as: ${entrantName}
Total cost:   MX$${totalCost}bn

YOUR PICKS
----------
${teamListText}

TIEBREAKERS
-----------
${tiebreakersText}

HOW TO PAY
----------
To appear on the leaderboard your entry fee must be paid.
Please transfer using the details below — use your name as the reference, but remember that there may be 7 Dave's entering.

${BANK_DETAILS}

FOLLOW THE ACTION
-----------------
Leaderboard: ${leaderboardUrl}

Questions? Reply to this email or contact pickergame@vidamour.com`;

  return { subject, html, text };
}
