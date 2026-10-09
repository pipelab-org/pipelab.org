(function () {
  'use strict';

  var roots = document.querySelectorAll('[data-editorial-index]');
  if (!roots.length) return;
  var searches = [];
  var activeSearch = null;

  Array.prototype.forEach.call(roots, function (root) {
    var cards = Array.prototype.slice.call(root.querySelectorAll('[data-directory-card]'));
    var groups = Array.prototype.slice.call(root.querySelectorAll('[data-category-group]'));
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-filter-cat]'));
    var search = root.querySelector('[data-index-search]');
    var searchClear = root.querySelector('[data-search-clear]');
    var resultMeta = root.querySelector('[data-result-meta]');
    var directoryLabel = root.querySelector('[data-directory-label]');
    var directoryHint = root.querySelector('[data-directory-hint]');
    var featuredRow = root.querySelector('[data-featured-row]');
    var emptyState = root.querySelector('[data-empty-state]');
    var emptyReset = root.querySelector('[data-empty-reset]');
    if (!cards.length || !tabs.length || !search) return;
    searches.push(search);

    function selectRootSearch() {
      activeSearch = search;
    }

    root.addEventListener('focusin', selectRootSearch);
    root.addEventListener('pointerdown', selectRootSearch);

    var singular = root.dataset.itemSingular || 'item';
    var plural = root.dataset.itemPlural || 'items';
    var allLabel = root.dataset.allLabel || ('All ' + plural);
    var directoryDefault = root.dataset.directoryDefault || allLabel;
    var activeCat = 'all';
    var activeCatLabel = allLabel;
    var activeQuery = '';

    function itemCount(count) {
      return count + ' ' + (count === 1 ? singular : plural);
    }

    function applyFilter() {
      var query = activeQuery.trim().toLowerCase();
      var filterActive = activeCat !== 'all' || !!query;
      var visible = 0;

      cards.forEach(function (card) {
        var matchesCategory = activeCat === 'all' || card.dataset.cat === activeCat;
        var matchesQuery = !query || (card.dataset.searchblob || '').indexOf(query) !== -1;
        var show = matchesCategory && matchesQuery;
        card.hidden = !show;
        if (show) visible += 1;
      });

      groups.forEach(function (group) {
        var hasVisibleCard = !!group.querySelector('[data-directory-card]:not([hidden])');
        group.hidden = !hasVisibleCard;
      });

      if (resultMeta) resultMeta.textContent = itemCount(visible);
      if (directoryHint) directoryHint.textContent = filterActive ? itemCount(visible) + ' found' : itemCount(cards.length) + ' in the directory';
      if (directoryLabel) {
        if (query) directoryLabel.textContent = 'Matching "' + activeQuery.trim() + '"';
        else directoryLabel.textContent = activeCat === 'all' ? directoryDefault : activeCatLabel;
      }
      if (featuredRow) featuredRow.hidden = filterActive;
      if (emptyState) emptyState.hidden = visible !== 0;
      if (searchClear) searchClear.hidden = !query;
    }

    function setCategory(category) {
      activeCat = category;
      tabs.forEach(function (tab) {
        var selected = tab.dataset.filterCat === category;
        if (selected) activeCatLabel = tab.dataset.filterLabel || allLabel;
        tab.classList.toggle('is-active', selected);
        tab.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      applyFilter();
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        setCategory(tab.dataset.filterCat);
      });
    });

    search.addEventListener('input', function () {
      activeQuery = search.value || '';
      applyFilter();
    });

    if (searchClear) {
      searchClear.addEventListener('click', function () {
        search.value = '';
        activeQuery = '';
        applyFilter();
        search.focus();
      });
    }

    if (emptyReset) {
      emptyReset.addEventListener('click', function () {
        search.value = '';
        activeQuery = '';
        setCategory('all');
      });
    }

    search.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      search.blur();
      if (!activeQuery) return;
      search.value = '';
      activeQuery = '';
      applyFilter();
    });

    applyFilter();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    var target = event.target;
    var tag = target && target.tagName ? target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable)) return;
    var search = activeSearch && activeSearch.isConnected ? activeSearch : searches[0];
    if (!search) return;
    event.preventDefault();
    search.focus();
    search.select();
  });
})();
