(function () {
  'use strict';

  // PostHog init is lazy-loaded (see site-base.js), so window.posthog.capture
  // is undefined at page-load time. Use the posthogReady() callback queue to
  // fire the 404 event as soon as analytics initialize. If the visitor closes
  // the tab before any interaction or the 6s fallback, the event is not
  // captured, the same undercount tradeoff as every other event.
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof window.posthogReady !== 'function') return;
    window.posthogReady(function (posthog) {
      posthog.capture('site_404', {
        path: window.location.pathname,
        referrer: document.referrer || null
      });
    });
  });
})();
