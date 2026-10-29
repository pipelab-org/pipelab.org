(() => {
  'use strict';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = window.matchMedia && window.matchMedia('(min-width: 901px)');
  const orbits = document.querySelectorAll('.hp-orbit');
  if (!orbits.length) return;
  orbits.forEach((orbit) => {
    const nodes = Array.from(orbit.querySelectorAll('.hp-orbit-node'));
    const threads = Array.from(orbit.querySelectorAll('.hp-orbit-thread'));
    const planets = [];
    let rect;
    let pageTop = 0;
    let frame = null;
    let visible = !('IntersectionObserver' in window);
    let startedAt = performance.now();
    let pausedAt = null;
    let scrollListening = false;
    const focusedNodes = new Set();
    const pointedNodes = new Set();
    // A thread stops this far (CSS px) outside the icon box or label: past the
    // tile's 5px dark ring, and clear of the hover lift (2px up, scale 1.06).
    const THREAD_GAP = 6;
    // Ray entry into a box: the fraction t of the way from (x0,y0) to (x1,y1)
    // where the segment first touches the box, or Infinity when it misses.
    const entryT = (x0, y0, x1, y1, bx, by, hw, hh) => {
      let tMin = 0;
      let tMax = 1;
      const axes = [[x0, x1 - x0, bx - hw, bx + hw], [y0, y1 - y0, by - hh, by + hh]];
      for (const [p, d, lo, hi] of axes) {
        if (Math.abs(d) < 1e-9) {
          if (p < lo || p > hi) return Infinity;
          continue;
        }
        let a = (lo - p) / d;
        let b = (hi - p) / d;
        if (a > b) [a, b] = [b, a];
        tMin = Math.max(tMin, a);
        tMax = Math.min(tMax, b);
        if (tMin > tMax) return Infinity;
      }
      return tMin;
    };
    const motionAllowed = () =>
      (!reduceMotion || !reduceMotion.matches) && (!desktop || desktop.matches);
    const isPaused = () =>
      !visible || !motionAllowed() || focusedNodes.size > 0;
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    const setParallax = () => {
      if (isPaused()) return;
      const travel = Math.max(-34, Math.min(34, (window.scrollY - pageTop) * 0.045));
      orbit.style.setProperty('--orbit-dust-parallax', `${travel}px`);
      orbit.style.setProperty('--orbit-rings-parallax', `${travel * -0.42}px`);
    };
    const updateScrollListener = () => {
      const shouldListen = !isPaused();
      if (shouldListen && !scrollListening) {
        window.addEventListener('scroll', setParallax, { passive: true });
        scrollListening = true;
      } else if (!shouldListen && scrollListening) {
        window.removeEventListener('scroll', setParallax);
        scrollListening = false;
      }
      if (shouldListen) setParallax();
    };
    const start = () => {
      if (frame === null && rect && !isPaused()) frame = requestAnimationFrame(render);
    };
    const syncMotion = () => {
      const now = performance.now();
      const paused = isPaused();
      orbit.classList.toggle('is-paused', paused);
      if (paused) {
        if (pausedAt === null) pausedAt = now;
        stop();
        // Draw the frame it stopped on, not phase zero. A pause happens when a
        // node has keyboard focus or the section leaves the viewport. At first
        // paint nothing has elapsed, so reduced motion still gets the resting
        // arrangement it needs.
        place(pausedAt - startedAt);
        updateScrollListener();
        return;
      }
      if (pausedAt !== null) {
        startedAt += now - pausedAt;
        pausedAt = null;
      }
      updateScrollListener();
      start();
    };
    const resize = () => {
      rect = orbit.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        rect = null;
        planets.length = 0;
        stop();
        return;
      }
      pageTop = rect.top + window.scrollY;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      planets.length = 0;
      nodes.forEach((node, index) => {
        const inner = node.classList.contains('hp-orbit-node-inner');
        const x = rect.width * parseFloat(getComputedStyle(node).getPropertyValue('--x')) / 100;
        const y = rect.height * parseFloat(getComputedStyle(node).getPropertyValue('--y')) / 100;
        const rx = rect.width * (inner ? 0.19 : 0.4);
        const ry = rect.height * (inner ? 120 / 520 : 215 / 520);
        const find = (selector) => (typeof node.querySelector === 'function' ? node.querySelector(selector) : null);
        const mark = find('.hp-orbit-mark');
        const label = find('.hp-orbit-name');
        planets.push({
          node,
          thread: threads[index],
          // Layout sizes, unaffected by the transforms that move the node.
          nodeH: node.offsetHeight || 0,
          markW: mark ? mark.offsetWidth : 0,
          markH: mark ? mark.offsetHeight : 0,
          labelW: label ? label.offsetWidth : 0,
          labelH: label ? label.offsetHeight : 0,
          rx,
          ry,
          phase: Math.atan2((y - cy) / ry, (x - cx) / rx),
          speed: (inner ? 90 : 160) * 1000,
          direction: inner ? 1 : -1,
        });
        node.style.left = '50%';
        node.style.top = '50%';
      });
      syncMotion();
    };
    // Placement is separate from animation on purpose. These transforms are the
    // ONLY thing that puts a planet in its orbit, so a reader who never runs the
    // loop still needs them applied once: with motion reduced, every planet was
    // otherwise left stacked on the sun.
    const place = (elapsed) => {
      if (!rect) return;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      planets.forEach((planet) => {
        const theta = planet.phase + elapsed / planet.speed * Math.PI * 2 * planet.direction;
        const x = cx + Math.cos(theta) * planet.rx;
        const y = cy + Math.sin(theta) * planet.ry;
        const behind = Math.sin(theta) < -0.22 && Math.abs(Math.cos(theta)) < 0.72;
        planet.node.classList.toggle('is-behind', behind);
        planet.node.style.zIndex = behind ? '2' : '3';
        planet.node.style.transform = `translate3d(${x - cx}px, ${y - cy}px, 0) translate(-50%, -50%)`;
        if (planet.thread) {
          // Aim at the icon box, which sits above the node's centre, and stop
          // at whichever of the box or the label the line reaches first.
          const mx = x;
          const my = y - planet.nodeH / 2 + planet.markH / 2;
          const ly = y + planet.nodeH / 2 - planet.labelH / 2;
          const t = Math.min(
            entryT(cx, cy, mx, my, mx, my, planet.markW / 2 + THREAD_GAP, planet.markH / 2 + THREAD_GAP),
            entryT(cx, cy, mx, my, x, ly, planet.labelW / 2 + THREAD_GAP, planet.labelH / 2 + THREAD_GAP),
          );
          const k = Number.isFinite(t) ? t : 1;
          const ex = cx + (mx - cx) * k;
          const ey = cy + (my - cy) * k;
          planet.thread.setAttribute('x2', (ex / rect.width * 1000).toFixed(2));
          planet.thread.setAttribute('y2', (ey / rect.height * 520).toFixed(2));
        }
      });
    };

    const render = (now) => {
      frame = null;
      if (!rect || isPaused()) {
        syncMotion();
        return;
      }
      place(now - startedAt);
      start();
    };
    const syncHighlight = () => {
      const activeNode = nodes.find((node) => focusedNodes.has(node)) ||
        nodes.find((node) => pointedNodes.has(node));
      const activeIndex = activeNode ? nodes.indexOf(activeNode) : -1;
      orbit.classList.toggle('has-active-node', activeIndex >= 0);
      nodes.forEach((node, index) => node.classList.toggle('is-active', index === activeIndex));
      threads.forEach((thread, index) => thread.classList.toggle('is-active', index === activeIndex));
    };
    nodes.forEach((node) => {
      node.addEventListener('pointerenter', () => { pointedNodes.add(node); syncHighlight(); });
      node.addEventListener('pointerleave', () => { pointedNodes.delete(node); syncHighlight(); });
      node.addEventListener('focus', () => { focusedNodes.add(node); syncHighlight(); syncMotion(); });
      node.addEventListener('blur', () => { focusedNodes.delete(node); syncHighlight(); syncMotion(); });
    });
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(orbit);
    else window.addEventListener('resize', resize, { passive: true });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !rect) {
          resize();
          return;
        }
        syncMotion();
      }, { threshold: 0.08 }).observe(orbit);
    }
    [reduceMotion, desktop].forEach((query) => {
      if (!query) return;
      if (query.addEventListener) query.addEventListener('change', syncMotion);
      else if (query.addListener) query.addListener(syncMotion);
    });
    resize();
    syncMotion();
  });
})();
