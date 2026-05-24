(function () {
  // Phase dates in UTC (BST = UTC+1)
  var ENTRY_OPEN  = new Date('2026-05-29T08:00:00Z').getTime();
  var ENTRY_CLOSE = new Date('2026-06-11T19:00:00Z').getTime();

  var ENTRY_PAGES = ['entry.html', 'entries.html', 'schedule.html'];
  var POST_PAGES  = ['leaderboard.html', 'schedule.html', 'tables.html', 'countries.html', 'blog.html'];

  function getAllowedPages() {
    var now = Date.now();
    if (now < ENTRY_OPEN)  return null; // pre-entry: no restrictions
    if (now < ENTRY_CLOSE) return ENTRY_PAGES;
    return POST_PAGES;
  }

  function updateNav() {
    var allowed = getAllowedPages();
    if (!allowed) return; // pre-entry: show everything

    var allowedSet = {};
    allowed.forEach(function (p) { allowedSet[p] = true; });

    // Remove nav links not in this phase
    document.querySelectorAll('nav a').forEach(function (link) {
      var page = (link.getAttribute('href') || '').split('/').pop();
      if (!allowedSet[page]) link.remove();
    });

    // Remove dropdown options not in this phase
    var select = document.querySelector('.nav-select');
    if (select) {
      Array.from(select.options).forEach(function (option) {
        var page = option.value.split('/').pop();
        if (!allowedSet[page]) option.remove();
      });
      if (select.options.length && !select.value) select.selectedIndex = 0;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateNav);
  } else {
    updateNav();
  }
})();
