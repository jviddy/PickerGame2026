/* site-wide match/results scrolling ticker */
(async function () {
  const TICKER_MODE = document.body.dataset.tickerMode;
  const ROUND_LABELS = {
    GS1: 'GS1', GS2: 'GS2', GS3: 'GS3',
    R32: 'R32', R16: 'R16', QF: 'QF', SF: 'SF', TPP: 'TPP', F: 'Final',
  };

  /* ── inject styles ───────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    #site-ticker {
      background: #0e2340;
      overflow: hidden;
      height: 34px;
      display: flex;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      position: sticky;
      top: 58px;
      z-index: 90;
      user-select: none;
    }
    #site-ticker::before, #site-ticker::after {
      content: '';
      position: absolute;
      top: 0; bottom: 0;
      width: 40px;
      z-index: 1;
      pointer-events: none;
    }
    #site-ticker::before { left: 0; background: linear-gradient(to right, #0e2340, transparent); }
    #site-ticker::after  { right: 0; background: linear-gradient(to left, #0e2340, transparent); }
    #ticker-track {
      display: inline-flex;
      align-items: center;
      gap: 0;
      white-space: nowrap;
      will-change: transform;
    }
    #site-ticker:hover #ticker-track { animation-play-state: paused; }
    .ticker-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 20px;
      font-size: 0.78rem;
      font-weight: 600;
      color: rgba(255,255,255,0.82);
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .ticker-item.fixture { color: rgba(255,255,255,0.65); }
    .ticker-item .ticker-badge {
      font-size: 0.64rem;
      font-weight: 800;
      padding: 1px 6px;
      border-radius: 99px;
      letter-spacing: 0.02em;
    }
    .ticker-item.result .ticker-badge { background: #22a861; color: #fff; }
    .ticker-item.fixture .ticker-badge { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.7); }
    .ticker-score { font-weight: 800; color: #fff; }
    .ticker-sep { color: rgba(255,255,255,0.2); padding: 0 4px; font-size: 0.7rem; }
    @keyframes ticker-scroll {
      from { transform: translateX(0); }
      to   { transform: translateX(-50%); }
    }
  `;
  document.head.appendChild(style);

  /* ── create DOM ──────────────────────────────────────────── */
  const wrap = document.createElement('div');
  wrap.id = 'site-ticker';
  const track = document.createElement('div');
  track.id = 'ticker-track';
  wrap.appendChild(track);

  const header = document.querySelector('header');
  if (!header) return;
  header.insertAdjacentElement('afterend', wrap);

  /* ── points guide mode (entry page) ─────────────────────── */
  if (TICKER_MODE === 'points') {
    const POINTS_ITEMS = [
      { label: 'Win',                  value: '+5 pts',  color: '#22a861' },
      { label: 'Draw',                 value: '+2 pts',  color: '#f0a500' },
      { label: 'Loss',                 value: '0 pts',   color: 'rgba(255,255,255,0.5)' },
      { label: 'Goal scored',          value: '+3 pts',  color: '#22a861' },
      { label: 'Goal conceded',        value: '-2 pts',  color: '#e05555' },
      { label: 'Yellow card',          value: '-1 pt',   color: '#f0a500' },
      { label: 'Red card',             value: '-2 pts',  color: '#e05555' },
      { label: 'Qualify to knockouts', value: '+10 pts', color: '#22a861' },
      { label: 'Win a knockout match',  value: '+10 pts', color: '#22a861' },
      { label: 'Win the final',        value: '+10 pts', color: '#ffd700' },
    ];
    const items = POINTS_ITEMS.map(p => `
      <span class="ticker-item">
        <span class="ticker-badge" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7)">POINTS</span>
        <span>${p.label}</span>
        <span class="ticker-score" style="color:${p.color}">${p.value}</span>
      </span>
      <span class="ticker-sep">•</span>
    `).join('');
    const html = items + items;
    track.innerHTML = html;
    const duration = Math.max(30, POINTS_ITEMS.length * 4);
    track.style.animation = `ticker-scroll ${duration}s linear infinite`;
    return;
  }

  /* ── load data ───────────────────────────────────────────── */
  let teams, matches;
  try {
    const [tr, mr] = await Promise.all([
      fetch('./Data/teams.json'),
      fetch('./Data/matches.json'),
    ]);
    if (!tr.ok || !mr.ok) throw new Error('fetch failed');
    [teams, matches] = await Promise.all([tr.json(), mr.json()]);
  } catch (_) {
    wrap.remove();
    return;
  }

  /* ── build lookup ────────────────────────────────────────── */
  const nameOf = {};
  teams.forEach(t => { nameOf[t.groupId] = t.countryName; });

  const todayUTC = new Date().toISOString().slice(0, 10);

  /* ── today's fixtures (unplayed, kickoff today in UTC) ────── */
  const todayFixtures = matches
    .filter(m => !m.played && m.date && m.date.slice(0, 10) === todayUTC)
    .sort((a, b) => a.date.localeCompare(b.date));

  /* ── last 5 results (played, most recent first) ───────────── */
  const recentResults = matches
    .filter(m => m.played && m.result)
    .slice(-5)
    .reverse();

  if (todayFixtures.length === 0 && recentResults.length === 0) {
    wrap.remove();
    return;
  }

  /* ── build ticker items ───────────────────────────────────── */
  const items = [];

  todayFixtures.forEach(m => {
    const kickoff = new Date(m.date).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
    });
    const home = nameOf[m.homeTeam] || m.homeTeam;
    const away = nameOf[m.awayTeam] || m.awayTeam;
    const round = ROUND_LABELS[m.roundCode] || m.roundCode;
    items.push(`
      <span class="ticker-item fixture">
        <span class="ticker-badge">${esc(round)}</span>
        <span>${esc(home)} vs ${esc(away)}</span>
        <span style="color:rgba(255,255,255,0.45)">${kickoff} BST</span>
      </span>
      <span class="ticker-sep">•</span>
    `);
  });

  recentResults.forEach(m => {
    const home = nameOf[m.homeTeam] || m.homeTeam;
    const away = nameOf[m.awayTeam] || m.awayTeam;
    const r = m.result;
    const round = ROUND_LABELS[m.roundCode] || m.roundCode;
    items.push(`
      <span class="ticker-item result">
        <span class="ticker-badge">${esc(round)}</span>
        <span>${esc(home)}</span>
        <span class="ticker-score">${r.homeScore}–${r.awayScore}</span>
        <span>${esc(away)}</span>
      </span>
      <span class="ticker-sep">•</span>
    `);
  });

  /* ── duplicate for seamless loop ─────────────────────────── */
  const html = items.join('');
  track.innerHTML = html + html;

  /* ── set animation duration based on content ─────────────── */
  const duration = Math.max(18, items.length * 6);
  track.style.animation = `ticker-scroll ${duration}s linear infinite`;

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])
    );
  }
})();
