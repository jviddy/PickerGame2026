/**
 * PickerGame 2026 — Announcement email script
 *
 * HOW TO USE:
 * 1. Go to https://script.google.com and create a new project
 * 2. Paste this entire file into the editor
 * 3. Update the RECIPIENTS array below
 * 4. Click Run → createAnnouncementDraft
 * 5. Open Gmail — the draft will be in your Drafts folder
 * 6. Review and send
 */

// ── Paste recipient emails here ────────────────────────────────────────────
var RECIPIENTS = [
  // 'example@email.com',
];
// ──────────────────────────────────────────────────────────────────────────

var ENTRY_URL = 'https://pickergame.vidamour.com/entry.html';

function createAnnouncementDraft() {
  if (RECIPIENTS.length === 0) {
    Logger.log('No recipients — paste the email list into the RECIPIENTS array first.');
    return;
  }

  var subject = 'PickerGame is back. Please don\'t panic.';
  var html = buildAnnouncementHtml(ENTRY_URL);
  var text = buildAnnouncementText(ENTRY_URL);
  var bcc = RECIPIENTS.join(',');

  GmailApp.createDraft('', subject, text, {
    bcc: bcc,
    htmlBody: html,
    name: 'PickerGame 2026',
  });

  Logger.log('Draft created with ' + RECIPIENTS.length + ' BCC recipients. Check your Gmail Drafts.');
}

function buildAnnouncementHtml(entryUrl) {
  var btnBg   = '#1a3352';
  var btnText = '#ffffff';

  // ── Reusable button (VML for Outlook, <a> for everyone else) ──────────
  function button(label, url) {
    return (
      '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:28px auto 0;">' +
        '<tr>' +
          '<td align="center" bgcolor="' + btnBg + '" style="border-radius:6px;">' +
            '<!--[if mso]>' +
            '<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"' +
            ' href="' + url + '" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="8%" stroke="f" fillcolor="' + btnBg + '">' +
              '<w:anchorlock/>' +
              '<center style="color:' + btnText + ';font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">' + label + '</center>' +
            '</v:roundrect>' +
            '<![endif]-->' +
            '<!--[if !mso]><!-->' +
            '<a href="' + url + '" style="background:' + btnBg + ';border-radius:6px;color:' + btnText + ';display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;line-height:48px;text-align:center;text-decoration:none;padding:0 32px;-webkit-text-size-adjust:none;">' + label + '</a>' +
            '<!--<![endif]-->' +
          '</td>' +
        '</tr>' +
      '</table>'
    );
  }

  // ── Bullet list helper ─────────────────────────────────────────────────
  function bullets(items) {
    return (
      '<ul style="margin:12px 0 12px 0;padding-left:22px;color:#555;line-height:1.7;">' +
        items.map(function(item) {
          return '<li style="padding:2px 0;">' + item + '</li>';
        }).join('') +
      '</ul>'
    );
  }

  // ── Body paragraph helper ──────────────────────────────────────────────
  function p(content, extraStyle) {
    return '<p style="color:#555;line-height:1.7;margin:0 0 16px;' + (extraStyle || '') + '">' + content + '</p>';
  }

  function h2(text) {
    return '<h2 style="color:#1a3352;font-size:17px;font-weight:800;margin:28px 0 10px;">' + text + '</h2>';
  }

  // ── Mobile responsive styles (honoured by Apple Mail, Gmail app, etc.) ─
  var headStyles =
    '<style type="text/css">' +
      'body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}' +
      'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}' +
      'img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}' +
      '.wrapper{width:100%!important;max-width:600px!important;}' +
      '@media only screen and (max-width:620px){' +
        '.wrapper{width:100%!important;}' +
        '.body-cell{padding:24px 20px!important;}' +
        '.header-cell{padding:24px 20px!important;}' +
        '.footer-cell{padding:18px 20px!important;}' +
        '.logo-size{font-size:24px!important;}' +
        '.sub-size{font-size:12px!important;}' +
      '}' +
    '</style>';

  var body =
    // What is PickerGame
    p('As requested by at least seven of you, PickerGame is back for 2026, and somehow it\'s bigger than ever.') +
    bullets([
      'More minnows',
      'More meaningless group games',
      'More staying up until 3am wondering why you decided to care about a match between two countries you\'d struggle to find on a map',
      'And, of course, more opportunities to complain about FIFA and how they\'re ruining the beautiful game',
    ]) +
    p('For those of you new to PickerGame, it\'s a simplified fantasy football-style competition built around the 2026 FIFA World Cup.') +

    h2('How it works') +
    p('The concept is simple. You pick eight teams competing in this summer\'s tournament and hope you\'ve backed the right horses.') +
    p('There\'s no choosing individual players, tinkering with formations, or panic-making transfers every few days because your captain picked up a hamstring injury in training. Once you\'ve made your picks, you can sit back, enjoy the football, and pretend you knew all along that Uzbekistan were going to make the quarter-finals.') +
    p('For returning players, the core game remains exactly the same, although the budgets and scoring have had a slight refresh. In honour of the tournament hosts, the game currency has also officially switched to Mexican Pesos.') +

    h2('Entering') +
    p('You\'ll have a budget of <strong style="color:#1a3352;">MX$135bn</strong> to select your eight countries. You can choose teams from any groups you like, including multiple teams from the same group, but choose carefully because points will be earned (or lost) throughout the tournament based on:') +
    bullets([
      'Goals scored and conceded',
      'Match results',
      'Progression through the knockout rounds',
      'Yellow and red cards',
    ]) +
    button('Enter PickerGame →', entryUrl) +

    h2('Prizes') +
    p('At the end of the tournament, the points are totalled up and the best pickers will walk away with cash prizes and, more importantly, the right to be unbearably smug for the next four years.', 'margin-top:28px;') +
    p('<strong style="color:#1a3352;">Entry remains £10.</strong>') +
    p('As always, a portion of every entry fee will be donated to the Canaccord International Charitable Trust. Thanks to everyone who entered the last tournament, we were able to donate £400.') +
    p('The remaining entry fees will go into the prize pot. One of the things I\'ve always liked about PickerGame is that you can still win something even if your tournament goes completely off the rails after the first week. So once again, I\'ll be spreading prizes throughout the leaderboard rather than concentrating everything at the top.') +
    p('In 2024, first prize was £150, but there were also prizes for 2nd, 3rd, 4th, and every 10th place all the way down to 80th.') +

    h2('New for 2026 — The Last Goal prize') +
    p('Simply predict the time of the final goal scored in the tournament and whoever gets closest will win their £10 entry fee back.') +
    p('So even if your carefully researched selection crashes out in spectacular fashion, you\'ll still have something to cling to during the final.') +

    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;">' +

    p('Anyway, that\'s enough from me.') +
    p('Click the link. Pick your teams. Convince yourself you\'ve found incredible value in an overpriced dark horse. Spend the next month emotionally invested in countries you previously knew absolutely nothing about.') +
    p('And always remember:') +
    p('<em>It\'s coming home.</em>') +
    '<p style="color:#1a3352;line-height:1.7;margin:16px 0 0;font-weight:800;">Jamie<br><span style="font-weight:400;font-size:0.92em;color:#555;">PickerGame League President</span></p>';

  var footer =
    '<p style="margin:0 0 8px;font-size:11px;color:#999;line-height:1.6;">' +
      'PickerGame is not associated with FIFA or any official football organisation. It is a fan-created game designed for entertainment purposes only.' +
    '</p>' +
    '<p style="margin:0 0 8px;font-size:11px;color:#999;line-height:1.6;">' +
      'PickerGame is not associated with the Canaccord International Charitable Trust or Canaccord Wealth. Views and opinions expressed in PickerGame are for the purposes of humour and entertainment and do not reflect the views of any official football organisation or charitable trust.' +
    '</p>' +
    '<p style="margin:0;font-size:11px;color:#999;line-height:1.6;">' +
      'Please play responsibly and remember that it is just a game.' +
    '</p>';

  return (
    '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
      '<meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta http-equiv="X-UA-Compatible" content="IE=edge">' +
      '<title>PickerGame 2026</title>' +
      '<!--[if mso]>' +
        '<noscript><xml><o:OfficeDocumentSettings>' +
          '<o:PixelsPerInch>96</o:PixelsPerInch>' +
        '</o:OfficeDocumentSettings></xml></noscript>' +
      '<![endif]-->' +
      headStyles +
    '</head>' +
    '<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">' +

    // Preheader text (hidden, feeds email preview)
    '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#f4f4f4;">' +
      'PickerGame 2026 is open. Pick your eight teams and try not to have a crisis when they all exit in the group stage.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;' +
    '</div>' +

    // Outer wrapper
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;padding:30px 0;">' +
      '<tr><td align="center">' +

        // Container
        '<table class="wrapper" role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">' +

          // ── Header ──────────────────────────────────────────────────
          '<tr>' +
            '<td class="header-cell" style="padding:28px 40px;text-align:center;' +
              'background:#1a3352;' + // fallback for Outlook
              'mso-padding-alt:28px 40px;">' +
              '<!--[if !mso]><!-->' +
              '<div style="background:linear-gradient(135deg,#1a3352 0%,#1e4070 100%);margin:-28px -40px;padding:28px 40px;">' +
              '<!--<![endif]-->' +
              '<h1 style="margin:0;font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;font-family:Arial,sans-serif;">' +
                'Picker<span style="color:#e86f2c;">Game</span> ' +
                '<span style="font-weight:400;color:rgba(255,255,255,0.6);font-size:22px;">2026</span>' +
              '</h1>' +
              '<p style="margin:8px 0 0;color:rgba(255,255,255,0.7);font-size:13px;letter-spacing:0.03em;font-family:Arial,sans-serif;">' +
                'World Cup 2026 Edition' +
              '</p>' +
              '<!--[if !mso]><!-->' +
              '</div>' +
              '<!--<![endif]-->' +
            '</td>' +
          '</tr>' +

          // ── Body ────────────────────────────────────────────────────
          '<tr>' +
            '<td class="body-cell" style="padding:32px 40px;font-family:Arial,sans-serif;">' +
              body +
            '</td>' +
          '</tr>' +

          // ── Footer ──────────────────────────────────────────────────
          '<tr>' +
            '<td class="footer-cell" style="background:#f5f5f5;padding:20px 40px;border-top:1px solid #e0e0e0;font-family:Arial,sans-serif;">' +
              footer +
            '</td>' +
          '</tr>' +

        '</table>' + // end container

      '</td></tr>' +
    '</table>' + // end outer wrapper

    '</body></html>'
  );
}

function buildAnnouncementText(entryUrl) {
  return [
    'PICKERGAME 2026 — WORLD CUP EDITION',
    '====================================',
    '',
    'As requested by at least seven of you, PickerGame is back for 2026, and somehow it\'s bigger than ever.',
    '',
    '  • More minnows',
    '  • More meaningless group games',
    '  • More staying up until 3am wondering why you decided to care about a match between two',
    '    countries you\'d struggle to find on a map',
    '  • And, of course, more opportunities to complain about FIFA and how they\'re ruining',
    '    the beautiful game',
    '',
    'For those of you new to PickerGame, it\'s a simplified fantasy football-style competition',
    'built around the 2026 FIFA World Cup.',
    '',
    '',
    'HOW IT WORKS',
    '------------',
    '',
    'The concept is simple. You pick eight teams competing in this summer\'s tournament and',
    'hope you\'ve backed the right horses.',
    '',
    'There\'s no choosing individual players, tinkering with formations, or panic-making',
    'transfers every few days because your captain picked up a hamstring injury in training.',
    'Once you\'ve made your picks, you can sit back, enjoy the football, and pretend you knew',
    'all along that Uzbekistan were going to make the quarter-finals.',
    '',
    'For returning players, the core game remains exactly the same, although the budgets and',
    'scoring have had a slight refresh. In honour of the tournament hosts, the game currency',
    'has also officially switched to Mexican Pesos.',
    '',
    '',
    'ENTERING',
    '--------',
    '',
    'You\'ll have a budget of MX$135bn to select your eight countries. You can choose teams',
    'from any groups you like, including multiple teams from the same group, but choose',
    'carefully because points will be earned (or lost) throughout the tournament based on:',
    '',
    '  • Goals scored and conceded',
    '  • Match results',
    '  • Progression through the knockout rounds',
    '  • Yellow and red cards',
    '',
    '  ENTER HERE: ' + entryUrl,
    '',
    '',
    'PRIZES',
    '------',
    '',
    'At the end of the tournament, the points are totalled up and the best pickers will walk',
    'away with cash prizes and, more importantly, the right to be unbearably smug for the',
    'next four years.',
    '',
    'Entry remains £10.',
    '',
    'As always, a portion of every entry fee will be donated to the Canaccord International',
    'Charitable Trust. Thanks to everyone who entered the last tournament, we were able to',
    'donate £400.',
    '',
    'The remaining entry fees will go into the prize pot. One of the things I\'ve always liked',
    'about PickerGame is that you can still win something even if your tournament goes',
    'completely off the rails after the first week. So once again, I\'ll be spreading prizes',
    'throughout the leaderboard rather than concentrating everything at the top.',
    '',
    'In 2024, first prize was £150, but there were also prizes for 2nd, 3rd, 4th, and every',
    '10th place all the way down to 80th.',
    '',
    '',
    'NEW FOR 2026 — THE LAST GOAL PRIZE',
    '-----------------------------------',
    '',
    'Simply predict the time of the final goal scored in the tournament and whoever gets',
    'closest will win their £10 entry fee back.',
    '',
    'So even if your carefully researched selection crashes out in spectacular fashion,',
    'you\'ll still have something to cling to during the final.',
    '',
    '---',
    '',
    'Anyway, that\'s enough from me.',
    '',
    'Click the link. Pick your teams. Convince yourself you\'ve found incredible value in an',
    'overpriced dark horse. Spend the next month emotionally invested in countries you',
    'previously knew absolutely nothing about.',
    '',
    'And always remember:',
    '',
    'It\'s coming home.',
    '',
    'Jamie',
    'PickerGame League President',
    '',
    '',
    '---',
    '',
    'PickerGame is not associated with FIFA or any official football organisation.',
    'It is a fan-created game designed for entertainment purposes only.',
    '',
    'PickerGame is not associated with the Canaccord International Charitable Trust or',
    'Canaccord Wealth. Views and opinions expressed in PickerGame are for the purposes of',
    'humour and entertainment and do not reflect the views of any official football',
    'organisation or charitable trust.',
    '',
    'Please play responsibly and remember that it is just a game.',
  ].join('\n');
}
