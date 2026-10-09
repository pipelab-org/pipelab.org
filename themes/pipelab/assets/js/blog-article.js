(function () {
  'use strict';

  var fill = document.querySelector('.reading-progress-fill');
  var article = document.querySelector('.blog-article-body');
  var disclosure = document.querySelector('.blog-toc-disclosure');

  if (disclosure) {
    var desktopMql = window.matchMedia('(min-width: 901px)');
    function syncDisclosure() {
      if (desktopMql.matches) {
        disclosure.setAttribute('open', '');
      } else if (disclosure.dataset.userToggled !== '1') {
        disclosure.removeAttribute('open');
      }
    }
    disclosure.addEventListener('toggle', function () {
      if (!desktopMql.matches) disclosure.dataset.userToggled = '1';
    });
    syncDisclosure();
    if (desktopMql.addEventListener) {
      desktopMql.addEventListener('change', syncDisclosure);
    } else if (desktopMql.addListener) {
      desktopMql.addListener(syncDisclosure);
    }
  }

  if (article && fill) {
    function update() {
      var rect = article.getBoundingClientRect();
      var total = Math.max(1, article.offsetHeight - window.innerHeight);
      var scrolled = Math.max(0, -rect.top);
      var pct = Math.max(0, Math.min(1, scrolled / total));
      fill.style.transform = 'scaleX(' + pct + ')';
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
  }

  var copyBtn = document.getElementById('blog-share-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var url = window.location.href.split('#')[0];
      var label = copyBtn.querySelector('.blog-share-btn-label');
      var done = function () {
        copyBtn.classList.add('is-copied');
        if (label) label.textContent = 'Copied';
        setTimeout(function () {
          copyBtn.classList.remove('is-copied');
          if (label) label.textContent = 'Copy link';
        }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, done);
      } else {
        done();
      }
    });
  }

  var shareBtns = document.querySelectorAll('button.blog-share-btn[data-share-href]');
  for (var i = 0; i < shareBtns.length; i++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        var href = btn.getAttribute('data-share-href');
        if (!href) return;
        window.open(href, '_blank', 'noopener,noreferrer');
      });
    })(shareBtns[i]);
  }
})();
