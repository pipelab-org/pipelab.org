(() => {
  'use strict';

  // Shared showpiece layer for the whole site. A page opts in per element with
  // data-fx tokens; this module knows no page-specific selectors, so adopting
  // an effect on a new page is a markup change and never a change here.
  //
  //   data-fx="reveal"     rise into place when scrolled into view
  //   data-fx="count"      bring a published figure into view without retyping it
  //   data-fx="spotlight"  track the pointer as --mx / --my
  //   data-fx="tilt"       track the pointer as --tx / --ty
  //   data-fx="decrypt"    resolve a heading out of cipher glyphs, once
  //   data-fx="type"       retype text the HTML already contains
  //   data-fx="live"       hold decorative looping motion to while on screen
  //   data-fx="mininav"    highlight the in-page nav link for the current section
  //   data-fx="sky"        a star field behind the section, as on the orbit,
  //                        with a rare shooting star while the host is live
  //   data-fx="scan"       a scan line sweeps the element once as it arrives
  //
  // Tokens combine: data-fx="reveal live". Text-rewriting tokens (count,
  // decrypt, type) are mutually exclusive; a conflict leaves the HTML static.
  // The page is complete with scripting blocked, so pre-effect hidden states
  // are applied here at runtime rather than in the stylesheet, and reduced
  // motion resolves every effect to its finished state instead of animating it.

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionAllowed = () => !reduceMotion || !reduceMotion.matches;
  const hasIO = 'IntersectionObserver' in window;

  const textMutators = new Set(['decrypt', 'type']);
  const tokensFor = (el) => (el.getAttribute('data-fx') || '').split(/\s+/).filter(Boolean);
  const hasTextConflict = (tokens) =>
    tokens.filter((token) => textMutators.has(token)).length > 1;
  const select = (token) =>
    Array.from(document.querySelectorAll('[data-fx]')).filter((el) => {
      const tokens = tokensFor(el);
      return tokens.includes(token) && (!textMutators.has(token) || !hasTextConflict(tokens));
    });

  // Run fn once, the first time el is scrolled into view.
  const onceVisible = (elements, threshold, rootMargin, fn) => {
    if (!elements.length || !hasIO) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        fn(entry.target);
      });
    }, { threshold, rootMargin });
    elements.forEach((el) => io.observe(el));
  };

  // ── Published figures ─────────────────────────
  // These elements carry real, checkable numbers: test counts, coverage, bench
  // cases, DLP patterns. They are evidence, so the effect animates the figure
  // INTO VIEW and never animates the figure ITSELF.
  //
  // This used to count up from zero over 1300ms, which meant that for most of a
  // second the page stated a number that was not true, and always low. A visitor
  // screenshotting the first moment of the enterprise page caught 136 attack
  // cases against a real 176, and the home page read ">71%" coverage against a
  // real ">90%". Decoration that misreports our own evidence costs more than it
  // adds, so the figure is correct in the first painted frame and only its
  // entrance is animated.
  //
  // The entrance needs a painted frame between the hidden and shown state. A
  // figure already on screen at load has its observer fire in the same task the
  // hidden class was added, so without the frame boundary below the browser
  // coalesces both states and the transition never runs: the effect would look
  // removed rather than fixed.
  const figures = select('count');
  if (figures.length && motionAllowed() && hasIO) {
    figures.forEach((el) => el.classList.add('fx-figure-prep'));
    onceVisible(figures, 0.6, '0px', (el) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => el.classList.add('fx-figure-in'));
      });
    });
  }

  // ── Scroll reveal ─────────────────────────────────────────
  // The observer animates an element as it comes into view. A fast scroll can
  // jump an element from below the viewport to above it without an intervening
  // frame, so the observer never sees it and it would sit hidden. The sweep
  // below is the safety net: anything scrolled past is shown regardless. An
  // effect must never be able to leave real content invisible.
  const revealables = select('reveal');
  if (revealables.length && motionAllowed() && hasIO) {
    revealables.forEach((el) => el.classList.add('fx-prep'));
    onceVisible(revealables, 0.15, '0px 0px -40px 0px', (el) => el.classList.add('fx-in'));

    let sweepQueued = false;
    const sweep = () => {
      sweepQueued = false;
      const limit = window.innerHeight;
      let remaining = 0;
      revealables.forEach((el) => {
        if (el.classList.contains('fx-in')) return;
        if (el.getBoundingClientRect().top < limit) el.classList.add('fx-in');
        else remaining++;
      });
      if (!remaining) {
        window.removeEventListener('scroll', scheduleSweep);
        window.removeEventListener('resize', scheduleSweep);
      }
    };
    const scheduleSweep = () => {
      if (sweepQueued) return;
      sweepQueued = true;
      requestAnimationFrame(sweep);
    };
    window.addEventListener('scroll', scheduleSweep, { passive: true });
    window.addEventListener('resize', scheduleSweep, { passive: true });
    // Sweep once at load, before any scroll. The observer only fires at 15%
    // intersection, so an element taller than that share of the viewport can sit
    // on screen and never qualify. On the merged site three article cards on
    // /blog/ and a section head on /assess/ were invisible to a reader who
    // landed and did not scroll.
    scheduleSweep();
  }

  // ── Off-screen motion pause ───────────────────────────────
  // Looping decorative animations cost battery while nobody is looking at them.
  // Sky hosts join this set so the shooting star stops when the section leaves
  // the screen, even if the markup omitted `live`.
  const motionSurfaces = Array.from(new Set(select('live').concat(select('sky'))));
  if (motionSurfaces.length && motionAllowed() && hasIO) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle('fx-live', entry.isIntersecting);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    motionSurfaces.forEach((el) => io.observe(el));
  } else if (motionAllowed()) {
    motionSurfaces.forEach((el) => el.classList.add('fx-live'));
  }

  // ── Pointer tilt ──────────────────────────────────────────
  select('tilt').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      if (!motionAllowed()) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--ty', (px * 3).toFixed(2) + 'deg');
      card.style.setProperty('--tx', (-py * 3).toFixed(2) + 'deg');
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--tx', '0deg');
      card.style.setProperty('--ty', '0deg');
    });
  });

  // ── Decorative layers ─────────────────────────────────────
  // Sky and scan each need an absolutely positioned element. Injecting
  // it keeps the effect off the host's ::before, which a component may already
  // be using, and keeps the markup on the page free of decoration-only elements.
  // The shooting star is nested inside the sky clip box, not a sibling.
  // Geometry is pinned inline, appearance stays in the stylesheet. The shared
  // styles are imported BEFORE the page partials so a page's own rules win on a
  // tie, which is right for components and wrong for these layers: a rule like
  // `.hp-section > * { position: relative }` can flatten a decorative layer.
  // An inline style cannot be outranked, and it only ever touches decoration.
  const LAYER_BOX = {
    'fx-sky': { position: 'absolute', inset: '0', zIndex: '0', pointerEvents: 'none', overflow: 'hidden' },
    'fx-star': { position: 'absolute', top: '12%', left: '-14%', width: '10rem', height: '1px', pointerEvents: 'none' },
    'fx-scan': { position: 'absolute', left: '0', right: '0', zIndex: '2', pointerEvents: 'none' },
    'fx-glow': { position: 'absolute', inset: '0', pointerEvents: 'none' },
  };
  const addLayer = (token, className) => {
    select(token).forEach((host) => {
      if (host.querySelector(':scope > .' + className)) return;
      const layer = document.createElement('span');
      layer.className = className;
      layer.setAttribute('aria-hidden', 'true');
      Object.assign(layer.style, LAYER_BOX[className] || {});
      host.insertBefore(layer, host.firstChild);
    });
  };
  addLayer('sky', 'fx-sky');
  // The star lives inside the sky clip box, not as a sibling, so a 125vw
  // travel cannot widen the page and the field's opacity cannot dim it.
  select('sky').forEach((host) => {
    const sky = host.querySelector(':scope > .fx-sky');
    if (!sky || sky.querySelector(':scope > .fx-star')) return;
    const star = document.createElement('span');
    star.className = 'fx-star';
    star.setAttribute('aria-hidden', 'true');
    Object.assign(star.style, LAYER_BOX['fx-star']);
    sky.appendChild(star);
  });
  addLayer('scan', 'fx-scan');

  // The scan sweeps once when its element arrives. It runs off its own state
  // rather than the reveal class, so an element can carry scan without also
  // having to carry reveal.
  if (motionAllowed()) {
    onceVisible(select('scan'), 0.35, '0px 0px -40px 0px', (el) => {
      let finished = false;
      let fallback;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (fallback) window.clearTimeout(fallback);
        el.classList.remove('fx-scanning');
      };
      el.classList.add('fx-scanning');
      const scan = el.querySelector(':scope > .fx-scan');
      if (!scan) {
        finish();
        return;
      }
      // The CSS animation owns its duration. Cancellation covers a motion
      // preference change after the scan starts; the timer only prevents a
      // broken animation event from leaving real content clipped.
      scan.addEventListener('animationend', finish, { once: true });
      scan.addEventListener('animationcancel', finish, { once: true });
      fallback = window.setTimeout(finish, 3000);
    });
  }


  // ── Cursor spotlight ──────────────────────────────────────
  // The glow rides in its own absolutely positioned layer rather than on
  // ::before, so it cannot collide with a component that already uses its
  // pseudo-elements for something the reader can see.
  const wireSpotlight = () => select('spotlight').forEach((card) => {
    if (card.dataset.fxSpot) return;
    card.dataset.fxSpot = '1';
    if (!card.querySelector(':scope > .fx-glow')) {
      const glow = document.createElement('span');
      glow.className = 'fx-glow';
      glow.setAttribute('aria-hidden', 'true');
      Object.assign(glow.style, LAYER_BOX['fx-glow']);
      card.appendChild(glow);
    }
    card.addEventListener('pointermove', (e) => {
      if (!motionAllowed()) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
  });
  wireSpotlight();

  // ── Headings decrypt into place ───────────────────────────
  // Plaintext emerging out of cipher glyphs. Skipped under reduced motion.
  const GLYPHS = '!<>-_\\/[]{}=+*^?#________';
  const decrypt = (el) => {
    const target = el.querySelector('a') || el;
    if (target.dataset.fxDecrypted) return;

    // Collect the text nodes rather than the whole string: a heading may wrap
    // part of itself in a span for an accent colour, and rewriting textContent
    // would delete that span outright.
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let node = walker.nextNode();
    while (node) {
      if ((node.nodeValue || '').length) nodes.push({ node, text: node.nodeValue });
      node = walker.nextNode();
    }
    const total = nodes.reduce((n, x) => n + x.text.length, 0);
    if (!total) return;
    target.dataset.fxDecrypted = '1';

    const restore = () => nodes.forEach((x) => { x.node.nodeValue = x.text; });
    const dur = 700;
    const t0 = performance.now();
    const step = (now) => {
      if (!motionAllowed()) {
        restore();
        return;
      }
      const p = Math.min(1, (now - t0) / dur);
      let settled = Math.floor(total * p);
      nodes.forEach((x) => {
        const keep = Math.max(0, Math.min(x.text.length, settled));
        settled -= x.text.length;
        let out = x.text.slice(0, keep);
        for (let i = keep; i < x.text.length; i++) {
          out += x.text[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        x.node.nodeValue = out;
      });
      if (p < 1) requestAnimationFrame(step);
      else restore();
    };
    requestAnimationFrame(step);
  };

  if (motionAllowed()) onceVisible(select('decrypt'), 0.7, '0px', decrypt);

  // ── Terminals type themselves ─────────────────────────────
  // The full text ships in the HTML, so script-off and reduced-motion readers
  // always have the complete commands; typing only re-performs them.
  if (motionAllowed()) {
    select('type').forEach((block) => {
      const code = block.querySelector('code') || block;
      const full = code.textContent;
      if (!full || !hasIO) return;
      // Typing rewrites text, which would drop any markup inside the block
      // (syntax highlighting, an annotation span). Restore the original nodes
      // when the effect finishes rather than leaving flattened text behind.
      const originalNodes = Array.from(code.childNodes).map((n) => n.cloneNode(true));
      const restoreMarkup = () => {
        if (!originalNodes.length) return;
        code.replaceChildren(...originalNodes.map((n) => n.cloneNode(true)));
      };
      onceVisible([block], 0.5, '0px', () => {
        // Reserve the finished height first. Emptying the block collapses it,
        // and everything below would jump up and then back down as the text
        // types in. Measured before the block is cleared, released after.
        const reserved = block.getBoundingClientRect().height;
        if (reserved) block.style.minHeight = reserved + 'px';
        block.classList.add('fx-typing');
        code.textContent = '';
        const dur = 2400;
        const t0 = performance.now();
        const step = (now) => {
          if (!motionAllowed()) {
            restoreMarkup();
            block.style.minHeight = '';
            block.classList.remove('fx-typing');
            return;
          }
          const p = Math.min(1, (now - t0) / dur);
          code.textContent = full.slice(0, Math.floor(full.length * p));
          if (p < 1) requestAnimationFrame(step);
          else {
            restoreMarkup();
            block.style.minHeight = '';
            window.setTimeout(() => block.classList.remove('fx-typing'), 2600);
          }
        };
        requestAnimationFrame(step);
      });
    });
  }

  // ── In-page nav highlight ─────────────────────────────────
  // Lives here rather than in an inline script so the page needs no
  // script-src exception for itself.
  select('mininav').forEach((nav) => {
    const rail = nav.querySelector('ul');
    const anchors = Array.from(nav.querySelectorAll('a[href^="#"]'))
      .map((link) => ({ link, el: document.getElementById(link.getAttribute('href').slice(1)) }))
      .filter((pair) => pair.el);
    if (!anchors.length) return;

    let queued = false;
    let activeLink = null;
    const update = () => {
      queued = false;
      const activationY = window.scrollY + 150;
      let current = anchors[0];
      anchors.forEach((pair) => {
        const documentTop = pair.el.getBoundingClientRect().top + window.scrollY;
        if (documentTop <= activationY) current = pair;
      });
      anchors.forEach((pair) => {
        pair.link.classList.toggle('is-current', pair === current);
        if (pair === current) pair.link.setAttribute('aria-current', 'true');
        else pair.link.removeAttribute('aria-current');
      });
      if (rail && activeLink !== current.link && rail.scrollWidth > rail.clientWidth) {
        const targetLeft = current.link.offsetLeft - ((rail.clientWidth - current.link.offsetWidth) / 2);
        rail.scrollTo({ left: Math.max(0, targetLeft), behavior: motionAllowed() ? 'smooth' : 'auto' });
      }
      activeLink = current.link;
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      window.setTimeout(update, 0);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    update();
  });
  window.PipelabFx = {
    refresh: () => { wireSpotlight(); },
  };
})();
