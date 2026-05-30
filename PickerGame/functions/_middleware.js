// Phase dates in UTC (BST = UTC+1)
// Entry opens:  2026-05-29 09:00 BST = 08:00 UTC
// Entry closes: 2026-06-11 20:00 BST = 19:00 UTC
const ENTRY_OPEN  = new Date('2026-05-29T08:00:00Z').getTime();
const ENTRY_CLOSE = new Date('2026-06-11T19:00:00Z').getTime();

const ENTRY_PAGES = new Set(['entry.html', 'entries.html', 'schedule.html', 'blog.html']);
const POST_PAGES  = new Set(['leaderboard.html', 'schedule.html', 'tables.html', 'countries.html', 'blog.html']);

export async function onRequest({ request, next }) {
  const url  = new URL(request.url);
  const page = url.pathname.replace(/^\//, '');

  // Pass through everything except named HTML pages
  if (!page.endsWith('.html')) return next();

  const now = Date.now();

  // Pre-entry: no restrictions (testing / pre-launch)
  if (now < ENTRY_OPEN) return next();

  const allowed  = now < ENTRY_CLOSE ? ENTRY_PAGES : POST_PAGES;
  const fallback = now < ENTRY_CLOSE ? 'entry.html' : 'leaderboard.html';

  if (allowed.has(page)) return next();

  return Response.redirect(new URL(fallback, url).href, 302);
}
