(function () {
  // ── Live GitHub stars fetch ────────────────────────────────
  function afterIdle(fn) {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(fn, { timeout: 3000 });
      return;
    }
    window.addEventListener('load', function () {
      setTimeout(fn, 0);
    }, { once: true });
  }

  // ── Terminal copy buttons ──────────────────────────────────
  function bindCopy(btn) {
    if (!btn) return;
    var sel = btn.getAttribute('data-copy-target');
    if (!sel) return;
    btn.addEventListener('click', function () {
      var target = document.querySelector(sel);
      if (!target || !navigator.clipboard) return;
      navigator.clipboard.writeText(target.textContent.trim()).then(function () {
        btn.classList.add('is-copied');
        var prev = btn.textContent;
        btn.textContent = 'copied';
        setTimeout(function () {
          btn.classList.remove('is-copied');
          btn.textContent = prev;
        }, 1400);
      }).catch(function () {});
    });
  }
  bindCopy(document.getElementById('hp-ide-copy'));

  // ── IDE tabs (vanilla, no React) ───────────────────────────
  var ideRoot = document.getElementById('hp-ide');
  if (ideRoot) {
    var tabs = ideRoot.querySelectorAll('.hp-ide-tab');
    var titleEl = document.getElementById('hp-ide-title');
    var cmdEl = document.getElementById('hp-ide-cmd');
    var guideEl = document.getElementById('hp-ide-guide');
    var guideName = document.getElementById('hp-ide-name-guide');
    var commentName = document.getElementById('hp-ide-name-comment');
    function activate(tab) {
      for (var i = 0; i < tabs.length; i++) {
        var t = tabs[i];
        var isMe = t === tab;
        t.classList.toggle('is-active', isMe);
        t.setAttribute('aria-selected', isMe ? 'true' : 'false');
      }
      var name = tab.getAttribute('data-ide-name') || '';
      var slug = tab.getAttribute('data-ide-slug') || '';
      var cmd = tab.getAttribute('data-ide-cmd') || '';
      var href = tab.getAttribute('data-ide-href') || '';
      if (titleEl) titleEl.textContent = slug;
      if (cmdEl) cmdEl.textContent = cmd;
      if (guideEl) {
        guideEl.setAttribute('href', href);
        // Keep funnel-analytics value in sync with the active IDE so
        // ide_guide_click events report the IDE the reader actually
        // followed, not the default tab on page load.
        guideEl.setAttribute('data-event-value', slug);
      }
      if (guideName) guideName.textContent = name;
      if (commentName) commentName.textContent = name;
    }
    for (var i = 0; i < tabs.length; i++) {
      (function (tab) {
        tab.addEventListener('click', function () { activate(tab); });
      })(tabs[i]);
    }
  }

})();
