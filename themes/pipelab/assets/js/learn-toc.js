(function() {
  var fill = document.querySelector('.reading-progress-fill');
  var article = document.querySelector('.learn-article-body');
  var tocLinks = document.querySelectorAll('.learn-article-toc a[href^="#"]');
  var disclosure = document.querySelector('.learn-toc-disclosure');
  if (!disclosure) return;

  var desktopMql = window.matchMedia('(min-width: 901px)');
  var mobileOpen = false;
  var syncedOpen;
  function syncDisclosure() {
    syncedOpen = desktopMql.matches || mobileOpen;
    disclosure.open = syncedOpen;
  }
  disclosure.addEventListener('toggle', function() {
    if (!desktopMql.matches && disclosure.open !== syncedOpen) {
      mobileOpen = disclosure.open;
      syncedOpen = disclosure.open;
    }
  });
  syncDisclosure();
  desktopMql.addEventListener
    ? desktopMql.addEventListener('change', syncDisclosure)
    : desktopMql.addListener(syncDisclosure);

  if (!fill || !article || !tocLinks.length) return;

  function update() {
    var rect = article.getBoundingClientRect();
    var total = Math.max(1, article.offsetHeight - window.innerHeight);
    var scrolled = Math.max(0, -rect.top);
    var pct = Math.max(0, Math.min(1, scrolled / total));
    fill.style.transform = 'scaleX(' + pct + ')';

    // Section highlighting belongs to the shared module (the mininav token on
    // the table of contents). Doing it here as well meant two thresholds
    // fighting over the same class.
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
})();
