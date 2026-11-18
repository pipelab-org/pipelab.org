(function () {
  "use strict";

  const root = document.querySelector("[data-hub-search-index]");
  if (!root) return;

  const input = root.querySelector("[data-hub-search-input]");
  const status = root.querySelector("[data-hub-search-status]");
  const startHere = root.querySelector("[data-hub-start]");
  const empty = root.querySelector("[data-hub-search-empty]");
  const total = status.textContent.trim();
  const cards = [...root.querySelectorAll("[data-hub-component]")];
  const keys = ["badge", "id", "summary", "title", "type", "url"];
  const indexURL = new URL(root.dataset.hubSearchIndex, location.href);
  const siteBase = new URL("../", indexURL);

  function bindIndex(index) {
    if (index?.format !== 1 || !Array.isArray(index.items) || index.items.length !== cards.length) {
      throw new Error("unexpected Hub search index");
    }
    const byId = new Map(cards.map(card => [card.dataset.hubComponent, card]));
    return index.items.map(item => {
      if (!item || Object.keys(item).sort().join(",") !== keys.join(",") ||
          keys.some(key => typeof item[key] !== "string")) {
        throw new Error("invalid Hub search record");
      }
      const card = byId.get(item.id);
      const link = card?.querySelector("a");
      if (!link || !item.url.startsWith("/hub/") || link.href !== new URL(item.url.slice(1), siteBase).href) {
        throw new Error("search record does not match a Hub listing");
      }
      byId.delete(item.id);
      return { card, terms: [item.id, item.title, item.type, item.summary, item.badge].join(" ").toLowerCase() };
    });
  }

  async function start() {
    const response = await fetch(indexURL, { mode: "same-origin", redirect: "error" });
    if (!response.ok) throw new Error("Hub search index could not be loaded");
    const entries = bindIndex(await response.json());
    input.disabled = false;
    function filter() {
      const terms = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      let matches = 0;
      for (const entry of entries) {
        entry.card.hidden = !terms.every(term => entry.terms.includes(term));
        if (!entry.card.hidden) matches++;
      }
      startHere.hidden = terms.length > 0;
      if (empty) empty.hidden = !terms.length || matches > 0;
      status.textContent = terms.length
        ? (matches === 0 ? "No matching components." : matches + (matches === 1 ? " matching component." : " matching components."))
        : total;
    }
    input.addEventListener("input", filter);
    filter();
  }

  start().catch(() => {
    status.textContent = "Search is unavailable. Browse the components below.";
  });
}());
