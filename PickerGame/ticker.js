/* site-wide scrolling ticker */
(async function () {
  const TICKER_MODE = document.body.dataset.tickerMode;

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
      padding: 0 18px;
      font-size: 0.78rem;
      font-weight: 600;
      color: rgba(255,255,255,0.82);
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .ticker-item.fixture { color: rgba(255,255,255,0.65); }
    .ticker-item .ticker-badge {
      font-size: 0.62rem;
      font-weight: 800;
      padding: 1px 6px;
      border-radius: 99px;
      letter-spacing: 0.02em;
    }
    .ticker-section-label {
      display: inline-flex;
      align-items: center;
      padding: 0 14px 0 20px;
      font-size: 0.62rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: rgba(255,255,255,0.35);
    }
    .ticker-item.result .ticker-badge { background: #22a861; color: #fff; }
    .ticker-item.fixture .ticker-badge { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.7); }
    .ticker-item.stat .ticker-badge { background: #1e4070; color: rgba(255,255,255,0.7); }
    .ticker-item.update .ticker-badge { background: #e86f2c; color: #fff; }
    .ticker-score { font-weight: 800; color: #fff; }
    .ticker-sep { color: rgba(255,255,255,0.15); padding: 0 2px; font-size: 0.7rem; }
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
      { label: 'Win a knockout match', value: '+10 pts', color: '#22a861' },
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
    track.innerHTML = items + items;
    track.style.animation = `ticker-scroll ${Math.max(27, POINTS_ITEMS.length * 3.6)}s linear infinite`;
    return;
  }

  /* ── helpers ─────────────────────────────────────────────── */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])
    );
  }

  function bstDateStr(date = new Date()) {
    return new Date(date).toLocaleDateString('sv-SE', { timeZone: 'Europe/London' });
  }

  function bstTimeStr(isoString) {
    return new Date(isoString).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
    });
  }

  function section(label) {
    return `<span class="ticker-section-label">${esc(label)}</span><span class="ticker-sep">▸</span>`;
  }

  const ROUND_LABELS = {
    GS1: 'GS1', GS2: 'GS2', GS3: 'GS3',
    R32: 'R32', R16: 'R16', QF: 'QF', SF: 'SF', TPP: 'TPP', F: 'Final',
  };

  /* ── load data ───────────────────────────────────────────── */
  let matches, stats, posts;
  try {
    const [mr, sr, pr] = await Promise.all([
      fetch('./Data/matches.json'),
      fetch('./Data/tournamentStats.json'),
      fetch('./Data/posts.json'),
    ]);
    matches = mr.ok ? await mr.json() : [];
    stats   = sr.ok ? await sr.json() : null;
    posts   = pr.ok ? await pr.json() : [];
  } catch (_) {
    wrap.remove();
    return;
  }

  const todayBST    = bstDateStr();
  const tomorrowBST = bstDateStr(Date.now() + 86400000);
  const dayAfterBST = bstDateStr(Date.now() + 2 * 86400000);
  const upcomingDays = new Set([todayBST, tomorrowBST, dayAfterBST]);

  /* ── last 6 results ──────────────────────────────────────── */
  const recentResults = matches
    .filter(m => m.played && m.result)
    .slice(-6)
    .reverse();

  /* ── upcoming fixtures (today + next 2 days) ─────────────── */
  const upcomingFixtures = matches
    .filter(m => !m.played && m.date && upcomingDays.has(bstDateStr(m.date)))
    .sort((a, b) => a.date.localeCompare(b.date));

  /* ── latest blog post if published within last 24h ───────── */
  const oneDayAgo = Date.now() - 86400000;
  const latestPost = (Array.isArray(posts) ? posts : [])
    .filter(p => p.publishedAt && new Date(p.publishedAt).getTime() > oneDayAgo)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))[0] || null;

  const hasContent = recentResults.length || upcomingFixtures.length ||
                     (stats && stats.gamesPlayed > 0) || latestPost;
  if (!hasContent) { wrap.remove(); return; }

  /* ── build sections ──────────────────────────────────────── */
  const items = [];

  if (recentResults.length) {
    items.push(section('Results'));
    recentResults.forEach(m => {
      const r     = m.result;
      const round = ROUND_LABELS[m.roundCode] || m.roundCode;
      items.push(`
        <span class="ticker-item result">
          <span class="ticker-badge">${esc(round)}</span>
          <span>${esc(m.homeTeam)}</span>
          <span class="ticker-score">${r.homeScore}–${r.awayScore}</span>
          <span>${esc(m.awayTeam)}</span>
        </span>
        <span class="ticker-sep">•</span>
      `);
    });
  }

  if (upcomingFixtures.length) {
    items.push(section('Upcoming'));
    upcomingFixtures.forEach(m => {
      const matchDay = bstDateStr(m.date);
      const kickoff  = bstTimeStr(m.date);
      const dayLabel = matchDay === todayBST ? 'Today'
                     : matchDay === tomorrowBST ? 'Tomorrow' : 'Sun';
      const round    = ROUND_LABELS[m.roundCode] || m.roundCode;
      items.push(`
        <span class="ticker-item fixture">
          <span class="ticker-badge">${esc(round)}</span>
          <span>${esc(m.homeTeam)} vs ${esc(m.awayTeam)}</span>
          <span style="color:rgba(255,255,255,0.45)">${dayLabel} ${kickoff}</span>
        </span>
        <span class="ticker-sep">•</span>
      `);
    });
  }

  if (stats && stats.gamesPlayed > 0) {
    items.push(section('Tournament Stats'));
    items.push(`
      <span class="ticker-item stat">
        <span class="ticker-badge">GAMES</span>
        <span class="ticker-score">${stats.gamesPlayed}</span>
        <span>played</span>
      </span>
      <span class="ticker-sep">•</span>
      <span class="ticker-item stat">
        <span class="ticker-badge">GOALS</span>
        <span class="ticker-score">${stats.totalGoals}</span>
        <span>scored</span>
      </span>
      <span class="ticker-sep">•</span>
      <span class="ticker-item stat">
        <span class="ticker-badge">CARDS</span>
        <span>🟨 ${stats.totalYellowCards}</span>
        <span style="color:rgba(255,255,255,0.2)">·</span>
        <span>🟥 ${stats.totalRedCards}</span>
      </span>
      <span class="ticker-sep">•</span>
    `);
  }

  if (latestPost) {
    items.push(section('Updates'));
    items.push(`
      <span class="ticker-item update">
        <span class="ticker-badge">NEW</span>
        <span>${esc(latestPost.title)}</span>
      </span>
      <span class="ticker-sep">•</span>
    `);
  }

  /* ── duplicate for seamless loop ─────────────────────────── */
  const html = items.join('');
  track.innerHTML = html + html;
  track.style.animation = `ticker-scroll ${Math.max(18, items.length * 4.5)}s linear infinite`;
})();
