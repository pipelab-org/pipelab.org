(() => {
  'use strict';

  // The sequence is a one-shot timeline, not a continuous animation, so it is
  // driven by a class rather than a requestAnimationFrame loop. Motion starts
  // when the section is actually on screen; playing it while off screen would
  // mean the visitor arrives after the argument already finished.
  const sections = document.querySelectorAll('[data-proof-sequence]');
  if (!sections.length) return;

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionAllowed = () => !reduceMotion || !reduceMotion.matches;

  sections.forEach((section) => {
    const replay = section.querySelector('[data-proof-sequence-replay]');
    const setReplayVisibility = () => {
      if (replay) replay.hidden = !motionAllowed();
    };

    // Without motion the beats are shown in their final state immediately. The
    // sequence must be readable as a static composition, because the argument
    // lives in the text and the receipt, not in the movement.
    const settle = () => {
      section.classList.add('pseq-settled');
      section.classList.remove('pseq-playing');
    };

    const play = () => {
      if (!motionAllowed()) {
        settle();
        return;
      }
      section.classList.remove('pseq-playing');
      section.classList.remove('pseq-settled');
      // Force a reflow so re-adding the class restarts the CSS timeline.
      void section.offsetWidth;
      section.classList.add('pseq-playing');
    };

    if (replay) {
      replay.addEventListener('click', play);
    }
    setReplayVisibility();

    if (!motionAllowed()) {
      settle();
    } else if ('IntersectionObserver' in window) {
      let hasPlayed = false;
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          section.classList.toggle('pseq-motion-live', entry.isIntersecting);
          if (entry.isIntersecting && !hasPlayed) {
            hasPlayed = true;
            play();
          }
        });
      }, { threshold: 0.35 });
      observer.observe(section);
    } else {
      // Older browsers still get the original movement; modern browsers pause
      // the paint-heavy idle glow while this section is off screen.
      section.classList.add('pseq-motion-live');
      play();
    }

    // A visitor who turns reduced motion on mid-visit gets the static state.
    if (reduceMotion && typeof reduceMotion.addEventListener === 'function') {
      reduceMotion.addEventListener('change', () => {
        setReplayVisibility();
        if (!motionAllowed()) settle();
      });
    }

    // Once the timeline has run, drop back to the default (finished) state so
    // scrolling away and back never shows a half-played sequence. The payload
    // animation is the full 7s clock, so its end is the timeline's end.
    section.addEventListener('animationend', (event) => {
      if (event.animationName === 'pseq-payload') settle();
    });

    // ── The scene deck ────────────────────────────────────────
    // Scene one is server-rendered and complete, so script-off readers get a
    // full page. The rest of the deck ships as build-time JSON straight from
    // the shipped manifests; paging swaps the recorded values and replays.
    const deckEl = section.querySelector('[data-pseq-scenes]');
    const prev = section.querySelector('[data-pseq-prev]');
    const next = section.querySelector('[data-pseq-next]');
    const count = section.querySelector('[data-pseq-count]');
    if (!deckEl || !prev || !next) return;

    let scenes = [];
    try {
      scenes = JSON.parse(deckEl.textContent) || [];
    } catch (err) {
      return; // malformed deck: scene one still stands on its own
    }
    if (scenes.length < 2) return;

    let current = 0;

    const fields = {};
    section.querySelectorAll('[data-pv-field]').forEach((el) => {
      fields[el.getAttribute('data-pv-field')] = el;
    });
    const hrefs = {};
    section.querySelectorAll('[data-pv-href]').forEach((el) => {
      hrefs[el.getAttribute('data-pv-href')] = el;
    });

    const setField = (name, value) => {
      if (fields[name] && value !== undefined) fields[name].textContent = value;
    };

    const applyScene = (i) => {
      const s = scenes[i];
      if (!s) return;
      current = i;
      setField('title', s.title);
      setField('shape', s.shape);
      setField('host', s.host);
      setField('without', s.without);
      setField('with', s.with);
      setField('verdict', s.verdict);
      setField('layer', s.layer);
      setField('step_without', s.without);
      setField('step_with', s.with);
      setField('target', s.target);
      setField('chain_seq', String(s.chain_seq));
      setField('transport', s.transport);
      setField('dd_verdict', s.verdict);
      setField('dd_layer', s.layer);
      setField('action_id', s.action_id);
      setField('policy_short', s.policy_short);
      setField('signer_head', s.signer_head);
      setField('signer_tail', s.signer_tail);
      setField('verifier_command', s.verifier_command);
      setField('sr_title', s.title);
      setField('sr_without', s.without);
      setField('sr_with', s.with);
      setField('sr_verdict', s.verdict);
      setField('sr_layer', s.layer);
      setField('sr_pattern', s.pattern);
      // Scene links are always same-site paths built by the template. Assign
      // only a value that still looks like one, so a bad deck payload cannot
      // turn a link into a javascript: or data: target.
      const sameSite = (u) => typeof u === 'string' && /^\/[^/\\]/.test(u);
      if (hrefs.replay_url && sameSite(s.replay_url)) hrefs.replay_url.href = s.replay_url;
      if (hrefs.manifest_url && sameSite(s.manifest_url)) hrefs.manifest_url.href = s.manifest_url;
      if (count) count.textContent = (i + 1) + ' / ' + scenes.length;
      play();
    };

    prev.hidden = false;
    next.hidden = false;
    if (count) count.hidden = false;
    if (count) count.textContent = '1 / ' + scenes.length;

    prev.addEventListener('click', () => {
      applyScene((current - 1 + scenes.length) % scenes.length);
    });
    next.addEventListener('click', () => {
      applyScene((current + 1) % scenes.length);
    });
  });
})();
