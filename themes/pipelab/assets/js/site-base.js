(() => {
  'use strict';

  // Former baseof.html inline scripts: analytics bootstrap, nav, live GitHub
  // star count, clipboard helpers, and conversion-event dispatch. Config keys
  // come from the JSON island in the document, not from this file.

  var readConfig = function () {
    var el = document.getElementById('pl-site-config');
    if (!el) return {};
    try {
      var parsed = JSON.parse(el.textContent || '{}');
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  };
  var config = readConfig();
  var gaId = config.googleAnalytics || '';
  var posthogKey = config.posthog || '';

  if (posthogKey) {
    // PostHog snippet stub. The stub itself does NOT expose capture/identify
    // until posthog.init(...) runs — at that point it patches the methods
    // onto window.posthog so calls queue into the array and drain when
    // array.js loads. Inline scripts that try to call window.posthog.capture
    // before init() will throw TypeError; use window.posthogReady(fn) below.
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init Dr qr Ci Br Zr Pr capture calculateEventProperties Ur register register_once register_for_session unregister unregister_for_session Xr getFeatureFlag getFeatureFlagPayload getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync Jr identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset setIdentity clearIdentity get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException captureLog startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty Gr Hr createPersonProfile setInternalOrTestUser Wr Fr tn opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing $r debug ki Yr getPageViewId captureTraceFeedback captureTraceMetric Rr".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  }

  // Lazy-load 3rd-party analytics (gtag.js, posthog array.js, ahrefs) on
  // first user interaction or after a 6s fallback. Lighthouse measures TBT
  // for ~5s after FCP and never simulates interaction, so analytics stay
  // out of the critical path during PSI runs while still firing for real
  // users on first scroll / tap / keypress.
  //
  // Tradeoff acknowledged: visits that close the tab in under 6s without
  // any interaction are not counted by GA / PostHog / Ahrefs. Short
  // bounce traffic will undercount versus the previous eager loader.
  //
  // window.posthogReady(fn) is the safe entry point for inline scripts
  // that need posthog.capture (e.g. 404 page hits): fn runs as soon as
  // posthog.init() completes — either now if loaded, or queued for later.
  var loaded = false;
  var posthogQueue = [];
  window.posthogReady = function (fn) {
    if (typeof fn !== 'function') return;
    if (loaded && window.posthog && typeof window.posthog.capture === 'function') {
      try { fn(window.posthog); } catch (e) {}
    } else {
      posthogQueue.push(fn);
    }
  };

  // Trigger events: explicit interactions only. mousemove is omitted so
  // a cursor that happens to be over the viewport during a headless
  // Lighthouse run can't accidentally fire the loader before TBT closes.
  var triggers = ['pointerdown','touchstart','keydown','scroll'];
  function loadAnalytics() {
    if (loaded) return;
    loaded = true;
    triggers.forEach(function (e) {
      window.removeEventListener(e, loadAnalytics, opts);
    });

    if (gaId) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', gaId);
      var ga = document.createElement('script');
      ga.async = true;
      ga.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gaId);
      document.head.appendChild(ga);
    }

    if (posthogKey && window.posthog && typeof window.posthog.init === 'function') {
      // Privacy posture must match content/privacy.md: masked session replay
      // and heatmaps. All form inputs are masked, so typed content (emails,
      // messages) is never recorded. Personal query parameters are masked,
      // and replay network-request capture is disabled. Autocapture stays
      // off: we emit explicit events plus replay and heatmap data only.
      window.posthog.init(posthogKey, {
        api_host: 'https://us.i.posthog.com',
        defaults: '2026-01-30',
        person_profiles: 'identified_only',
        disable_session_recording: false,
        mask_personal_data_properties: true,
        custom_personal_data_properties: ['email','token','key','license','secret'],
        session_recording: {
          maskAllInputs: true,
          maskCapturedNetworkRequestFn: function () {
            return null;
          }
        },
        capture_heatmaps: true,
        autocapture: false
      });
      // Drain queued posthogReady() callbacks now that capture() exists.
      for (var i = 0; i < posthogQueue.length; i++) {
        try { posthogQueue[i](window.posthog); } catch (e) {}
      }
      posthogQueue.length = 0;
    }

    var ah = document.createElement('script');
    ah.async = true;
    ah.src = 'https://analytics.ahrefs.com/analytics.js';
    ah.setAttribute('data-key', '2n3rv9wcjMX0JaDV9kdyzA');
    document.head.appendChild(ah);
  }
  var opts = { once: true, passive: true, capture: true };
  triggers.forEach(function (e) {
    window.addEventListener(e, loadAnalytics, opts);
  });
  setTimeout(loadAnalytics, 6000);

  if (posthogKey) {
    document.addEventListener('click', function (event) {
      var source = event.target;
      if (!source || !source.closest) {
        return;
      }

      var link = source.closest('a[href]');
      if (!link) {
        return;
      }
      if (link.hasAttribute('data-analytics-private')) {
        return;
      }
      if (link.hasAttribute('data-event')) {
        return;
      }

      var href = link.getAttribute('href');
      if (!href || href.charAt(0) === '#' || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0 || href.indexOf('javascript:') === 0) {
        return;
      }

      try {
        var target = new URL(href, window.location.href);
        if (!/^https?:$/.test(target.protocol)) {
          return;
        }

        var captureEvent = function (eventName, properties) {
          if (typeof window.posthogReady !== 'function') return;
          window.posthogReady(function (posthog) {
            if (posthog && typeof posthog.capture === 'function') {
              posthog.capture(eventName, properties);
            }
          });
          if (typeof window.gtag === 'function') {
            window.gtag('event', eventName, properties);
          }
        };
        var isButton = link.classList && (link.classList.contains('btn') || link.classList.contains('button'));
        var ctaAncestor = link.closest && link.closest('.article-cta, .section-cta, .hero-buttons, .pricing-cta, .cta, [data-cta]');
        if (target.origin === window.location.origin) {
          if (isButton || ctaAncestor) {
            captureEvent('site_cta_click', {
              source_path: window.location.pathname,
              source_title: document.title,
              target_path: target.pathname,
              target_hash: target.hash,
              link_text: (link.textContent || '').trim().slice(0, 200)
            });
          }
          return;
        }

        captureEvent('site_outbound_click', {
          source_path: window.location.pathname,
          source_title: document.title,
          target_url: target.href,
          target_host: target.hostname,
          target_path: target.pathname,
          link_text: (link.textContent || '').trim().slice(0, 200)
        });
      } catch (error) {
        // Ignore malformed URLs in analytics instrumentation.
      }
    }, true);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var navToggle = document.querySelector('.nav-toggle');
    if (navToggle) {
      var nav = navToggle.closest('.nav-container');
      var navLinks = nav && nav.querySelector('.nav-links');
      var setNavOpen = function (open) {
        if (!nav) return;
        nav.classList.toggle('open', open);
        navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!open) {
          Array.prototype.forEach.call(nav.querySelectorAll('.nav-menu-btn'), function (button) {
            button.setAttribute('aria-expanded', 'false');
          });
        }
      };
      navToggle.addEventListener('click', function () {
        setNavOpen(!nav.classList.contains('open'));
      });
      navLinks.addEventListener('click', function (event) {
        if (event.target.closest('a')) setNavOpen(false);
      });
      document.addEventListener('click', function (event) {
        if (nav.classList.contains('open') && !nav.contains(event.target)) setNavOpen(false);
      });
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || !nav.classList.contains('open')) return;
        setNavOpen(false);
        navToggle.focus();
      });
      var mobileBreakpoint = window.getComputedStyle(document.documentElement).getPropertyValue('--bp-mobile').trim() || '768px';
      var desktopNavMin = (parseFloat(mobileBreakpoint) || 768) + 1;
      var desktopNavQuery = window.matchMedia('(min-width: ' + desktopNavMin + 'px)');
      var resetDesktopNav = function (event) {
        if (event.matches) setNavOpen(false);
      };
      if (desktopNavQuery.addEventListener) desktopNavQuery.addEventListener('change', resetDesktopNav);
      else if (desktopNavQuery.addListener) desktopNavQuery.addListener(resetDesktopNav);
    }

    // Live GitHub star count for the nav chip (and homepage stat when
    // present). The templated number is the no-JS fallback. Show any
    // session cache immediately, then always revalidate against GitHub
    // so a tab left open does not freeze on yesterday's count.
    var applyStars = function (count) {
      var n = count.toLocaleString();
      document.querySelectorAll('[data-nav-star-count]').forEach(function (el) { el.textContent = n; });
      document.querySelectorAll('[data-nav-star-link]').forEach(function (el) { el.setAttribute('aria-label', 'Pipelock on GitHub, ' + n + ' stars'); });
      var statEl = document.getElementById('hp-star-stat');
      if (statEl) statEl.textContent = n;
      var btnEl = document.getElementById('hp-star-count');
      if (btnEl) btnEl.textContent = '\u2605 ' + n;
    };
    var cachedStars = null;
    try { cachedStars = window.sessionStorage.getItem('pl-stars'); } catch (e) {}
    if (cachedStars && parseInt(cachedStars, 10) > 0) {
      applyStars(parseInt(cachedStars, 10));
    }
    window.setTimeout(function () {
      fetch('https://api.github.com/repos/luckyPipewrench/pipelock')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.stargazers_count) return;
          try { window.sessionStorage.setItem('pl-stars', String(d.stargazers_count)); } catch (e) {}
          applyStars(d.stargazers_count);
        })
        .catch(function () {});
    }, 1200);

    // Grouped menus. Hover reveal is pure CSS on desktop; this
    // handles click and touch, Escape, and click-outside on every size.
    var menuButtons = Array.prototype.slice.call(document.querySelectorAll('.nav-menu-btn'));
    if (menuButtons.length) {
      var closeMenus = function (except) {
        menuButtons.forEach(function (button) {
          if (button !== except) button.setAttribute('aria-expanded', 'false');
        });
      };
      menuButtons.forEach(function (button) {
        button.addEventListener('click', function (event) {
          event.stopPropagation();
          var open = button.getAttribute('aria-expanded') === 'true';
          closeMenus(button);
          button.setAttribute('aria-expanded', open ? 'false' : 'true');
        });
      });
      document.addEventListener('click', function (event) {
        if (!event.target.closest('.nav-item-menu')) closeMenus(null);
      });
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        var openButton = menuButtons.filter(function (b) { return b.getAttribute('aria-expanded') === 'true'; })[0];
        if (!openButton) return;
        closeMenus(null);
        openButton.focus();
      });
    }

    // Clipboard write that also works on plain-HTTP origins (LAN and
    // tailnet previews), where navigator.clipboard does not exist.
    var writeClipboard = function (text) {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      }
      return new Promise(function (resolve, reject) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        if (ok) resolve(); else reject(new Error('copy failed'));
      });
    };

    // Shell fences are commands, so make every rendered bash, shell, and
    // console block copyable without hand-building controls in each guide.
    // Explicit command transcripts carry trusted command text separately from
    // their rendered output. Never infer commands from terminal-looking text.
    document.querySelectorAll('pre > code.language-bash, pre > code.language-sh, pre > code.language-shell, pre[data-command] > code, pre[data-command-lines] > code').forEach(function (code) {
      var pre = code.parentElement;
      if (!pre || pre.querySelector('[data-code-copy]')) return;
      pre.classList.add('copyable-command-block');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-copy-button';
      button.setAttribute('data-code-copy', '');
      button.setAttribute('aria-label', 'Copy command');
      pre.appendChild(button);
    });

    var commandTextFrom = function (pre, code) {
      if (!pre.hasAttribute('data-command-lines')) {
        return code.textContent.trim();
      }
      return (pre.getAttribute('data-command-text') || '').trim();
    };

    // Click-to-copy commands: any [data-cmd-copy] element copies its
    // command text (minus the prompt) on click and flashes "copied".
    document.addEventListener('click', function (event) {
      var row = event.target.closest('[data-cmd-copy]');
      if (!row) return;
      var textEl = row.querySelector('.cmd-text');
      var text = (textEl ? textEl.textContent : row.textContent).replace(/^\$\s*/, '').trim();
      writeClipboard(text).then(function () {
        row.classList.add('cmd-copied');
        window.setTimeout(function () { row.classList.remove('cmd-copied'); }, 1400);
      }).catch(function () {});
    });

    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-code-copy]');
      if (!button) return;
      var code = button.parentElement && button.parentElement.querySelector('code');
      if (!code) return;
      var text = commandTextFrom(button.parentElement, code);
      if (!text) return;
      writeClipboard(text).then(function () {
        button.classList.add('cmd-copied');
        button.setAttribute('aria-label', 'Copied');
        window.setTimeout(function () {
          button.classList.remove('cmd-copied');
          button.setAttribute('aria-label', 'Copy command');
        }, 1400);
      }).catch(function () {});
    });

    document.addEventListener('click', function (event) {
      var copyButton = event.target.closest('[data-copy-target]');
      if (!copyButton) return;

      var target = document.querySelector(copyButton.getAttribute('data-copy-target'));
      if (!target) return;

      var originalLabel = copyButton.getAttribute('data-copy-label') || copyButton.textContent;
      var copiedLabel = copyButton.getAttribute('data-copied-label') || 'copied';

      writeClipboard((target.textContent || '').trim())
        .then(function () {
          copyButton.textContent = copiedLabel;
          window.setTimeout(function () {
            copyButton.textContent = originalLabel;
          }, 1400);
        })
        .catch(function () {});
    });

    document.addEventListener('submit', function (event) {
      var form = event.target;
      if (!form || !form.matches || !form.matches('.newsletter-form[data-popup-url]')) {
        return;
      }

      window.open(form.getAttribute('data-popup-url'), form.getAttribute('target') || 'popupwindow');
    });
  });

  // Shared conversion-event dispatcher. Fires a named event to GA4 (gtag)
  // and PostHog when a user clicks anything with data-event="name".
  //
  // Usage:
  //   <a data-event="github_click" ...>GitHub</a>
  //   <button data-event="newsletter_signup" data-event-placement="footer">...</button>
  //
  // The dispatcher also auto-infers a github_click for outbound links to
  // github.com without requiring manual data-event tags.
  document.addEventListener('click', function (event) {
    var source = event.target;
    if (!source || !source.closest) return;

    var el = source.closest('[data-event]');
    var eventName = null;
    var params = { source_path: window.location.pathname };

    if (el) {
      eventName = el.getAttribute('data-event');
      var placement = el.getAttribute('data-event-placement');
      if (placement) params.placement = placement;
      var value = el.getAttribute('data-event-value');
      if (value) params.value = value;
      var href = el.getAttribute('href');
      if (href) {
        params.link_url = href;
      }
    } else {
      var link = source.closest('a[href]');
      if (link) {
        var inferredHref = link.getAttribute('href') || '';
        if (/^https?:\/\/([^\/]+\.)?github\.com\//i.test(inferredHref)) {
          eventName = 'github_click';
          params.link_url = inferredHref;
        }
      }
    }

    if (!eventName) return;

    if (typeof window.posthogReady === 'function') {
      window.posthogReady(function (posthog) {
        if (posthog && typeof posthog.capture === 'function') {
          posthog.capture(eventName, params);
        }
      });
    }

    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, params);
    }
  }, true);
})();
