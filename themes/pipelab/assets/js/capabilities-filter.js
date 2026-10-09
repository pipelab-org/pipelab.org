(() => {
  'use strict';
  const directory = document.querySelector('[data-capability-directory]');
  const controls = document.querySelector('[data-capability-controls]');
  const search = document.querySelector('[data-capability-search]');
  const filters = Array.from(document.querySelectorAll('[data-capability-tier]'));
  if (!directory || !controls || !search || !filters.length) return;
  controls.hidden = false;

  const cards = Array.from(directory.querySelectorAll('[data-capability-card]'));
  const groups = Array.from(directory.querySelectorAll('[data-capability-group]'));
  const count = document.querySelector('[data-capability-count]');
  const resultLabel = document.querySelector('[data-capability-result-label]');
  const empty = directory.querySelector('[data-capability-empty]');
  let activeTier = 'all';

  const tierNames = {
    all: 'the full inventory',
    free: 'Community',
    pro: 'Pro',
    enterprise: 'Enterprise',
    assess: 'Assess',
  };

  const apply = () => {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const tiers = (card.dataset.tier || '').split(/\s+/);
      const tierMatch = activeTier === 'all' || tiers.includes(activeTier);
      const searchMatch = !query || (card.dataset.search || '').includes(query);
      const show = tierMatch && searchMatch;
      card.hidden = !show;
      if (show) visible += 1;
    });
    groups.forEach((group) => {
      group.hidden = !group.querySelector('[data-capability-card]:not([hidden])');
    });
    if (count) count.textContent = String(visible);
    if (resultLabel) {
      const capabilityWord = visible === 1 ? 'capability' : 'capabilities';
      if (query) resultLabel.textContent = `${capabilityWord} matching this search in ${tierNames[activeTier]}`;
      else if (activeTier === 'all') resultLabel.textContent = `${capabilityWord} in the full inventory`;
      else if (activeTier === 'enterprise') resultLabel.textContent = `${capabilityWord} included with Enterprise · Assess is separate`;
      else if (activeTier === 'assess') resultLabel.textContent = `${capabilityWord} in Assess`;
      else resultLabel.textContent = `${capabilityWord} included with ${tierNames[activeTier]}`;
    }
    if (empty) empty.hidden = visible !== 0;
  };

  filters.forEach((filter) => {
    filter.addEventListener('click', () => {
      activeTier = filter.dataset.capabilityTier || 'all';
      filters.forEach((candidate) => {
        const active = candidate === filter;
        candidate.classList.toggle('is-active', active);
        candidate.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      apply();
    });
  });
  search.addEventListener('input', apply);
})();
