  (function () {
    document.addEventListener('DOMContentLoaded', function () {
      var root = document.getElementById('inst-panel-root');
      if (!root) return;
      var tabs = root.querySelectorAll('.inst-tab');
      var cmdRow = document.getElementById('inst-term-cmdrow');
      var cmdEl = document.getElementById('inst-cmd');
      var binaryEl = document.getElementById('inst-term-binary');
      var noteEl = document.getElementById('inst-method-note');
      var titleEl = document.getElementById('inst-term-title');
      var panelEl = document.getElementById('inst-panel');
      var footEl = document.getElementById('inst-term-foot');
      function activate(tab) {
        tabs.forEach(function (t) {
          var isMe = t === tab;
          t.classList.toggle('is-active', isMe);
          t.setAttribute('aria-selected', isMe ? 'true' : 'false');
          t.tabIndex = isMe ? 0 : -1;
        });
        var isBinary = tab.getAttribute('data-inst-id') === 'binary';
        cmdRow.hidden = isBinary;
        binaryEl.hidden = !isBinary;
        if (!isBinary && cmdEl) cmdEl.textContent = tab.getAttribute('data-inst-cmd') || '';
        if (noteEl) {
          var note = tab.getAttribute('data-inst-note') || '';
          noteEl.hidden = isBinary || !note;
          noteEl.querySelector('p').textContent = note;
        }
        // Docker and Helm install no local binary, so `pipelock --version` doesn't apply.
        if (footEl) footEl.hidden = !isBinary && tab.getAttribute('data-inst-local') === 'false';
        if (titleEl) titleEl.textContent = 'install · ' + (tab.getAttribute('data-inst-label') || '').toLowerCase();
        if (panelEl) panelEl.setAttribute('aria-labelledby', tab.id);
      }
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          activate(tab);
        });
        tab.addEventListener('keydown', function (event) {
          var index = Array.prototype.indexOf.call(tabs, tab);
          var nextIndex;
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            nextIndex = (index + 1) % tabs.length;
          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            nextIndex = (index + tabs.length - 1) % tabs.length;
          } else if (event.key === 'Home') {
            nextIndex = 0;
          } else if (event.key === 'End') {
            nextIndex = tabs.length - 1;
          } else {
            return;
          }
          event.preventDefault();
          activate(tabs[nextIndex]);
          tabs[nextIndex].focus();
        });
      });
    });
  })();
