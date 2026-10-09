(() => {
  'use strict';

  if (window.__pipelabReceiptConstellation) return;
  window.__pipelabReceiptConstellation = true;

  const roots = document.querySelectorAll('[data-receipt-constellation]');
  if (!roots.length) return;

  const colors = {
    allow: '#00e5a0',
    warn: '#f59e0b',
    block: '#ff4d4d',
  };

  roots.forEach((root) => {
    const canvas = root.querySelector('[data-constellation-canvas]');
    const context = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    const status = root.querySelector('[data-constellation-status]');
    const statusText = root.querySelector('[data-constellation-status-text]') || status;
    const detail = root.querySelector('[data-constellation-detail]');
    const browser = root.querySelector('[data-constellation-browser]');
    const browserSummary = browser ? browser.querySelector('summary') : null;
    const previousReceipt = root.querySelector('[data-detail-previous]');
    const nextReceipt = root.querySelector('[data-detail-next]');
    const reducedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const mobileBreakpoint = window.getComputedStyle(document.documentElement).getPropertyValue('--bp-mobile').trim() || '768px';
    const mobileFieldQuery = window.matchMedia ? window.matchMedia(`(max-width: ${mobileBreakpoint})`) : null;
    if (!canvas || !context) return;

    let receipts = [];
    let dust = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let pointer = null;
    let hovered = null;
    let running = false;
    let visible = !('IntersectionObserver' in window);
    let initStarted = false;
    let frame = 0;
    let phase = 0;
    let lastAnimatedAt = 0;
    let staticField = reducedMotionQuery ? reducedMotionQuery.matches : false;
    let lowPowerField = mobileFieldQuery ? mobileFieldQuery.matches : false;
    let idleStatus = statusText ? statusText.textContent : 'Loading signed receipt manifests…';
    let selected = null;
    let tapStart = null;
    let suppressClickUntil = 0;

    // Receipt evidence is intentionally never analytics data. These fixed event
    // names measure only which constellation controls were used.
    const receiptAnalyticsEvents = new Set([
      'receipt_constellation_receipt_selected',
      'receipt_constellation_replay_opened',
      'receipt_constellation_raw_manifest_opened',
    ]);
    const trackReceiptConstellation = (eventName) => {
      if (!receiptAnalyticsEvents.has(eventName) || typeof window.posthogReady !== 'function') return;
      window.posthogReady((posthog) => {
        if (!posthog || typeof posthog.capture !== 'function') return;
        try {
          posthog.capture(eventName);
        } catch (_) {
          // Analytics must not affect the receipt viewer when unavailable.
        }
      });
    };

    const field = (selector, value) => {
      const element = root.querySelector(selector);
      if (element) element.textContent = value || '—';
    };

    const syncSheetState = () => {
      const open = !!((detail && !detail.hidden) || (browser && browser.open));
      root.classList.toggle('has-receipt-sheet', open);
    };

    const showDetail = (particle, focusDetail = true) => {
      if (!particle || !detail) return;
      selected = particle;
      trackReceiptConstellation('receipt_constellation_receipt_selected');
      const receipt = particle.receipt;
      const verdict = particle.isControl ? 'control' : (receipt.verdict || 'other');
      detail.hidden = false;
      if (browser) browser.open = false;
      detail.dataset.verdict = verdict;
      field('[data-detail-verdict]', particle.isControl ? 'SESSION OPEN' : verdict.toUpperCase());
      field('[data-detail-title]', particle.scenario.title);
      field('[data-detail-sequence]', `${particle.receiptIndex + 1} of ${particle.manifestReceiptCount}`);
      field('[data-detail-transport]', particle.isControl ? 'receipt chain control' : (receipt.transport || particle.scenario.transport));
      field('[data-detail-layer]', particle.isControl ? 'session anchor' : (receipt.layer || 'clean action'));
      field('[data-detail-pattern]', particle.isControl ? 'Opened the signed receipt chain.' : (receipt.pattern || 'No finding. The mediated action was recorded.'));
      field('[data-detail-target]', receipt.target_redacted);
      field('[data-detail-action]', receipt.action_id);
      field('[data-detail-position]', `${receipts.indexOf(particle) + 1} of ${receipts.length}`);

      const replay = root.querySelector('[data-detail-replay]');
      const manifest = root.querySelector('[data-detail-manifest]');
      if (replay) replay.href = `/playground/replay/${particle.scenario.id}/`;
      if (manifest) manifest.href = `/playground-replay/${particle.scenario.manifest_path}`;
      syncSheetState();
      draw();
      if (focusDetail) detail.focus({ preventScroll: true });
    };

    const closeDetail = () => {
      const wasOpen = !!(detail && !detail.hidden);
      if (detail) detail.hidden = true;
      selected = null;
      syncSheetState();
      draw();
      if (wasOpen && browserSummary) browserSummary.focus({ preventScroll: true });
    };

    const browseDetail = (offset) => {
      if (!receipts.length) return;
      const currentIndex = Math.max(0, receipts.indexOf(selected));
      const nextIndex = (currentIndex + offset + receipts.length) % receipts.length;
      showDetail(receipts[nextIndex], false);
    };

    const newParticle = () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: Math.random() * 3 + 0.7,
    });

    // Keep the original homepage's adaptive 30–90 particle density. Only particles
    // carrying receipt data are interactive; the remainder are faint dust.
    const syncDust = () => {
      const targetCount = Math.max(30, Math.min(90, Math.round((width * height) / 24000)));
      const dustCount = Math.max(0, targetCount - receipts.length);
      while (dust.length < dustCount) dust.push(newParticle());
      if (dust.length > dustCount) dust.length = dustCount;
    };

    const particles = () => dust.concat(receipts);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      syncDust();
      particles().forEach((particle) => {
        if (!Number.isFinite(particle.x)) particle.x = Math.random() * width;
        if (!Number.isFinite(particle.y)) particle.y = Math.random() * height;
        particle.x = Math.min(width, Math.max(0, particle.x));
        particle.y = Math.min(height, Math.max(0, particle.y));
      });
      draw();
    };

    const updateParticle = (particle, step) => {
      if (pointer) {
        const dx = particle.x - pointer.x;
        const dy = particle.y - pointer.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        if (distance < 190) {
          const pull = (1 - distance / 190) * 0.004 * step;
          particle.vx -= (dx / distance) * pull;
          particle.vy -= (dy / distance) * pull;
        }
      }
      const damping = Math.pow(0.985, step);
      particle.vx *= damping;
      particle.vy *= damping;
      const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
      if (speed < 0.08) {
        const jitter = 0.04 * Math.sqrt(step);
        particle.vx += (Math.random() - 0.5) * jitter;
        particle.vy += (Math.random() - 0.5) * jitter;
      }
      if (speed > 0.75) {
        particle.vx = (particle.vx / speed) * 0.75;
        particle.vy = (particle.vy / speed) * 0.75;
      }
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      if (particle.x < 0 || particle.x > width) particle.vx *= -1;
      if (particle.y < 0 || particle.y > height) particle.vy *= -1;
    };

    const drawMesh = (allParticles) => {
      allParticles.forEach((particle, index) => {
        for (let otherIndex = index + 1; otherIndex < allParticles.length; otherIndex += 1) {
          const other = allParticles[otherIndex];
          const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
          if (distance >= 150) continue;
          context.strokeStyle = `rgba(0, 229, 160, ${(1 - distance / 150) * 0.22})`;
          context.lineWidth = 0.5;
          context.beginPath();
          context.moveTo(particle.x, particle.y);
          context.lineTo(other.x, other.y);
          context.stroke();
        }
      });
    };

    const drawPointer = (allParticles) => {
      if (!pointer) return;
      allParticles.forEach((particle) => {
        const distance = Math.hypot(particle.x - pointer.x, particle.y - pointer.y);
        if (distance >= 190) return;
        context.strokeStyle = `rgba(0, 229, 160, ${(1 - distance / 190) * 0.5})`;
        context.lineWidth = 0.7;
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(pointer.x, pointer.y);
        context.stroke();
      });
      context.fillStyle = 'rgba(0, 229, 160, 0.9)';
      context.beginPath();
      context.arc(pointer.x, pointer.y, 2.5, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(0, 229, 160, 0.3)';
      context.lineWidth = 1;
      context.beginPath();
      context.arc(pointer.x, pointer.y, 14, 0, Math.PI * 2);
      context.stroke();
    };

    const drawReceipt = (particle, index) => {
      const verdict = particle.isControl ? 'allow' : (particle.receipt.verdict || 'other');
      const color = colors[verdict] || colors.allow;
      const pulse = verdict === 'block' ? 0.6 + 0.4 * Math.abs(Math.sin(phase + index)) : 1;
      const baseAlpha = verdict === 'allow' ? (lowPowerField ? 0.75 : 0.5) : 0.85;
      const touchRadius = lowPowerField ? Math.max(particle.radius, 2.7) : particle.radius;
      const radius = touchRadius + (verdict === 'block' ? 0.8 : 0);
      context.globalAlpha = 1;
      if (lowPowerField) {
        context.globalAlpha = (verdict === 'allow' ? 0.16 : 0.25) * pulse;
        context.strokeStyle = color;
        context.lineWidth = 1;
        context.beginPath();
        context.arc(particle.x, particle.y, radius + 3.5, 0, Math.PI * 2);
        context.stroke();
      }
      if (particle.isControl) {
        context.strokeStyle = `rgba(255, 213, 74, ${0.55 * pulse})`;
        context.lineWidth = 1;
        context.beginPath();
        context.arc(particle.x, particle.y, radius + 3, 0, Math.PI * 2);
        context.stroke();
      }
      context.fillStyle = color;
      context.globalAlpha = baseAlpha * pulse;
      context.beginPath();
      context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      context.fill();
      if (hovered === particle || selected === particle) {
        context.globalAlpha = selected === particle ? 0.8 : 0.45;
        context.strokeStyle = color;
        context.lineWidth = selected === particle ? 1.5 : 1;
        context.beginPath();
        context.arc(particle.x, particle.y, selected === particle ? 11 : 9, 0, Math.PI * 2);
        context.stroke();
      }
    };

    function draw() {
      const allParticles = particles();
      context.clearRect(0, 0, width, height);
      context.globalAlpha = 1;
      drawMesh(allParticles);
      drawPointer(allParticles);
      dust.forEach((particle) => {
        context.fillStyle = 'rgba(0, 229, 160, 0.5)';
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      });
      receipts.forEach(drawReceipt);
      context.globalAlpha = 1;
    }

    const stopAnimation = () => {
      if (!running) return;
      running = false;
      window.cancelAnimationFrame(frame);
    };

    const animate = (timestamp) => {
      if (!running) return;
      if (!lowPowerField || timestamp - lastAnimatedAt >= 66) {
        const step = lastAnimatedAt ? Math.min(4.5, (timestamp - lastAnimatedAt) / (1000 / 60)) : 1;
        phase += 0.03 * step;
        particles().forEach((particle) => updateParticle(particle, step));
        draw();
        lastAnimatedAt = timestamp;
      }
      frame = window.requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (staticField || !visible || !initStarted || document.hidden || running) return;
      running = true;
      lastAnimatedAt = 0;
      frame = window.requestAnimationFrame(animate);
    };

    const syncMotionMode = () => {
      staticField = reducedMotionQuery ? reducedMotionQuery.matches : false;
      lowPowerField = mobileFieldQuery ? mobileFieldQuery.matches : false;
      if (staticField) stopAnimation();
      else startAnimation();
      draw();
    };

    const localPoint = (event) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const nearest = (point, radius = window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 22 : 14) => {
      let match = null;
      let best = radius;
      receipts.forEach((particle) => {
        const distance = Math.hypot(particle.x - point.x, particle.y - point.y);
        if (distance < best) {
          match = particle;
          best = distance;
        }
      });
      return match;
    };

    const isInteractiveTarget = (target) => target instanceof Element && !!target.closest('a, button, summary, input, textarea, select, details, .hp-artifact, [data-constellation-detail]');

    const selectAt = (event, radius) => {
      const match = nearest(localPoint(event), radius);
      if (match) showDetail(match);
      else closeDetail();
    };

    const clearPointer = () => {
      pointer = null;
      hovered = null;
      canvas.classList.remove('is-over-star');
      root.classList.remove('is-over-star');
      if (status) delete status.dataset.verdict;
      if (statusText) statusText.textContent = idleStatus;
      if (staticField) draw();
    };

    root.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') {
        if (pointer || hovered) clearPointer();
        return;
      }
      if (isInteractiveTarget(event.target)) {
        clearPointer();
        return;
      }
      pointer = localPoint(event);
      hovered = nearest(pointer);
      canvas.classList.toggle('is-over-star', !!hovered);
      root.classList.toggle('is-over-star', !!hovered);
      if (status && hovered) status.dataset.verdict = hovered.isControl ? 'control' : hovered.receipt.verdict;
      else if (status) delete status.dataset.verdict;
      if (statusText && hovered) statusText.textContent = `${hovered.scenario.title}: ${hovered.isControl ? 'session anchor' : hovered.receipt.verdict} at chain record ${hovered.receiptIndex + 1}`;
      else if (statusText) statusText.textContent = idleStatus;
      if (staticField) draw();
    });
    root.addEventListener('pointerleave', clearPointer);
    root.addEventListener('pointerdown', (event) => {
      if (isInteractiveTarget(event.target)) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      tapStart = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        x: event.clientX,
        y: event.clientY,
        at: window.performance.now(),
      };
    });
    root.addEventListener('pointerup', (event) => {
      if (!tapStart || event.pointerId !== tapStart.pointerId) return;
      const candidate = tapStart;
      tapStart = null;
      if (isInteractiveTarget(event.target)) return;
      const distance = Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y);
      const now = window.performance.now();
      const elapsed = now - candidate.at;
      suppressClickUntil = now + 700;
      if (distance > 12 || elapsed > 750) return;
      if (window.getSelection && window.getSelection().toString()) return;
      const radius = candidate.pointerType === 'touch' ? 36 : (candidate.pointerType === 'pen' ? 24 : 18);
      selectAt(event, radius);
    });
    root.addEventListener('pointercancel', () => {
      tapStart = null;
      clearPointer();
    });
    root.addEventListener('click', (event) => {
      if (isInteractiveTarget(event.target)) return;
      if (window.getSelection && window.getSelection().toString()) return;
      if (window.performance.now() < suppressClickUntil) return;
      const radius = window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 36 : 18;
      selectAt(event, radius);
    });
    root.querySelector('[data-constellation-close]')?.addEventListener('click', closeDetail);
    previousReceipt?.addEventListener('click', () => browseDetail(-1));
    nextReceipt?.addEventListener('click', () => browseDetail(1));
    root.querySelector('[data-detail-replay]')?.addEventListener('click', () => {
      trackReceiptConstellation('receipt_constellation_replay_opened');
    });
    root.querySelector('[data-detail-manifest]')?.addEventListener('click', () => {
      trackReceiptConstellation('receipt_constellation_raw_manifest_opened');
    });
    browser?.addEventListener('toggle', () => {
      if (browser.open) closeDetail();
      syncSheetState();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && detail && !detail.hidden) closeDetail();
      if (event.key === 'Escape' && browser && browser.open) browser.open = false;
    });

    const fetchWithTimeout = async (url) => {
      if (!('AbortController' in window)) return fetch(url);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        return await fetch(url, { signal: controller.signal });
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const init = async () => {
      if (initStarted) return;
      initStarted = true;
      resize();
      startAnimation();
      try {
        const galleryResponse = await fetchWithTimeout(root.dataset.gallery);
        if (!galleryResponse.ok) throw new Error('gallery manifest unavailable');
        const gallery = await galleryResponse.json();
        const manifestResults = await Promise.allSettled(gallery.scenarios.map(async (scenario) => {
          const response = await fetchWithTimeout(`/playground-replay/${scenario.manifest_path}`);
          if (!response.ok) throw new Error(`manifest unavailable: ${scenario.id}`);
          const manifest = await response.json();
          if (!Array.isArray(manifest.receipts) || manifest.receipts.length !== scenario.receipt_count) {
            throw new Error(`receipt count mismatch: ${scenario.id}`);
          }
          return { scenario, manifest };
        }));
        const manifests = manifestResults.filter((result) => result.status === 'fulfilled').map((result) => result.value);
        if (!manifests.length) throw new Error('no receipt manifests available');
        const loadedReceipts = manifests.flatMap(({ scenario, manifest }, scenarioIndex) => manifest.receipts.map((receipt, receiptIndex) => ({
          ...newParticle(),
          scenario,
          scenarioIndex,
          receipt,
          receiptIndex,
          manifestReceiptCount: manifest.receipts.length,
          isControl: receipt.transport === 'receipt_session',
        })));
        if (loadedReceipts.length > 90) throw new Error('receipt particle limit exceeded');
        loadedReceipts.forEach((particle, index) => {
          const inherited = dust[dust.length - 1 - index];
          if (!inherited) return;
          particle.x = inherited.x;
          particle.y = inherited.y;
          particle.vx = inherited.vx;
          particle.vy = inherited.vy;
          particle.radius = inherited.radius;
        });
        receipts = loadedReceipts;
        const missing = gallery.scenarios.length - manifests.length;
        idleStatus = missing
          ? `${missing} replay${missing === 1 ? '' : 's'} unavailable.`
          : 'Select a star for details.';
        if (status) {
          delete status.dataset.verdict;
          status.hidden = false;
        }
        if (statusText) statusText.textContent = idleStatus;
        resize();
      } catch (error) {
        if (status) status.hidden = true;
        draw();
      }
    };

    if ('ResizeObserver' in window) {
      new ResizeObserver(resize).observe(canvas);
    } else {
      window.addEventListener('resize', resize);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible) void init();
        if (visible) startAnimation();
        else stopAnimation();
      }).observe(canvas);
    } else {
      void init();
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && running) {
        stopAnimation();
      } else if (!document.hidden) {
        startAnimation();
      }
    });
    [reducedMotionQuery, mobileFieldQuery].forEach((query) => {
      if (!query) return;
      if (query.addEventListener) query.addEventListener('change', syncMotionMode);
      else if (query.addListener) query.addListener(syncMotionMode);
    });
  });
})();
