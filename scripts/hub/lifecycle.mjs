import { canonical } from "./evidence.mjs";
import { validateText } from "./validate.mjs";

const identity = /^(?:bundle|config|recipe|verifier)--[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const digest = /^[a-f0-9]{64}$/;
const reasonId = /^[a-f0-9]{32}$/;
const reasons = new Set(["retired", "author-request", "policy", "security", "legal", "copyright", "naming"]);
const retainedReasons = new Set(["retired", "author-request"]);

function index(items, label) {
  const byId = new Map();
  for (const item of items) {
    if (!identity.test(item?.id) || byId.has(item.id)) throw new Error("invalid or duplicate " + label);
    byId.set(item.id, item);
  }
  return byId;
}

function checkDate(event, previousDate) {
  const date = new Date(event?.at);
  if (typeof event?.at !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(event.at) ||
      Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== event.at ||
      event.at < previousDate) {
    throw new Error("invalid removal history date");
  }
}

function checkFields(event, allowed) {
  if (Object.keys(event).some(key => !allowed.includes(key))) throw new Error("unknown removal history field");
}

function readHistory(events, listing, acceptedCount) {
  const isBundle = listing.id.startsWith("bundle--");
  const open = new Map();
  const used = new Set();
  let previousDate = "", withdrawal, restoredFrom, retaining = false;
  for (const [position, event] of events.entries()) {
    checkDate(event, previousDate);
    previousDate = event.at;
    const accepted = position < acceptedCount;
    switch (event.type) {
      case "removed": {
        checkFields(event, ["type", "at", "reason_id", "reason_class", "public_reason", "downloads", "bundle_sha256", "replaced_by"]);
        // Accepted single-reason history still replays. New events need an explicit ID.
        const legacy = accepted && event.reason_id === undefined;
        const id = legacy ? "legacy" : event.reason_id;
        if ((legacy ? !!withdrawal : typeof id !== "string" || !reasonId.test(id) || used.has(id)) ||
            !reasons.has(event.reason_class)) {
          throw new Error("invalid or duplicate removal reason");
        }
        validateText(event.public_reason);
        if (isBundle && !digest.test(event.bundle_sha256 ?? "")) throw new Error("removed bundle digest required");
        if (isBundle && ((withdrawal && event.bundle_sha256 !== withdrawal.bundle_sha256) ||
            (!accepted && event.bundle_sha256 !== listing.bundle_sha256))) {
          throw new Error("removal digest differs from accepted bundle");
        }
        if (event.replaced_by && (!identity.test(event.replaced_by) || event.replaced_by === listing.id)) {
          throw new Error("invalid replacement listing");
        }
        const mode = event.downloads;
        if (mode !== undefined && mode !== "removed" && mode !== "retained") throw new Error("invalid download status");
        open.set(id, event);
        used.add(id);
        const eligible = isBundle && [...open.values()].every(reason => retainedReasons.has(reason.reason_class));
        if (mode === "retained" && !eligible) throw new Error("download retention is not permitted");
        if (mode !== undefined) retaining = mode === "retained";
        retaining = retaining && eligible;
        withdrawal ??= event;
        break;
      }
      case "reason-cleared":
        checkFields(event, ["type", "at", "reason_id"]);
        if (!open.delete(event.reason_id)) throw new Error("removal reason is not open");
        if (!open.size) retaining = false;
        break;
      case "restored":
        checkFields(event, ["type", "at", "public_note"]);
        if (!withdrawal) throw new Error("restoration requires a removal");
        if (accepted && open.size === 1 && open.has("legacy")) open.clear();
        if (open.size) throw new Error("restoration requires clearing every removal reason");
        validateText(event.public_note);
        restoredFrom = withdrawal;
        withdrawal = undefined;
        retaining = false;
        break;
      default:
        throw new Error("invalid removal transition");
    }
  }

  if (!withdrawal) return { restoredFrom };
  const visibleReason = [...open.values()].at(-1);
  return {
    visibleReason,
    notice: {
      at: withdrawal.at,
      public_reason: visibleReason?.public_reason ?? "The listing remains unavailable pending restoration.",
      downloads: retaining ? "retained" : "removed",
      bundle_sha256: withdrawal.bundle_sha256,
      replaced_by: visibleReason?.replaced_by,
    },
  };
}

// accepted contains records acquired from the site base. The candidate supplies
// listing identities and append-only logs. Withdrawal never changes a runtime
// trust decision or the bytes previously installed by users.
export function reconcileLifecycle(accepted, current) {
  const prior = index(accepted.listings, "accepted listing");
  const active = index(current.listings, "active listing");
  const history = index(current.history, "tombstone log");
  const oldHistory = index(accepted.history, "accepted tombstone log");
  for (const entry of history.values()) {
    if (!Array.isArray(entry.events) || !entry.events.length) throw new Error("invalid removal history");
  }
  for (const entry of oldHistory.values()) {
    const candidate = history.get(entry.id);
    if (!candidate || canonical(candidate.events.slice(0, entry.events.length)) !== canonical(entry.events)) {
      throw new Error("removal history was deleted or rewritten");
    }
  }
  for (const listing of prior.values()) {
    if (!active.has(listing.id) && !history.has(listing.id)) throw new Error("removal without record");
  }
  for (const listing of active.values()) {
    if (prior.has(listing.id) && prior.get(listing.id).publisher !== listing.publisher) {
      throw new Error("listing belongs to a different publisher");
    }
  }

  const removed = [];
  const retained = new Set();
  for (const log of [...history.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const expected = prior.get(log.id);
    if (!expected || !Array.isArray(log.events) || !log.events.length) throw new Error("removal has no accepted listing");
    const acceptedCount = oldHistory.get(log.id)?.events.length ?? 0;
    const { notice, restoredFrom, visibleReason } = readHistory(log.events, expected, acceptedCount);
    if (!notice) {
      const listing = active.get(log.id);
      if (!listing || listing.publisher !== expected.publisher) throw new Error("restoration publisher differs");
      if (listing.id.startsWith("bundle--")) {
        if (!digest.test(listing.bundle_sha256 ?? "")) throw new Error("restored bundle digest required");
        if (log.events.length > acceptedCount && (listing.bundle_sha256 !== restoredFrom.bundle_sha256 ||
            listing.signature_sha256 !== expected.signature_sha256)) {
          throw new Error("restoration of changed bytes requires verified admission");
        }
      }
      continue;
    }
    if (active.has(log.id)) throw new Error("active listing also has a removal notice");
    const replacement = notice.replaced_by && active.get(notice.replaced_by);
    if (notice.replaced_by && !replacement && log.events.indexOf(visibleReason) >= acceptedCount) {
      throw new Error("replacement listing is not active");
    }
    if (notice.downloads === "retained") {
      if (current.retained !== undefined && current.retained[log.id] !== notice.bundle_sha256) {
        throw new Error("retained download digest differs");
      }
      retained.add(log.id);
    }
    removed.push({ listing: expected, event: notice, replacement });
  }
  if (Object.keys(current.retained ?? {}).some(id => !retained.has(id))) throw new Error("unowned retained download");
  return removed;
}
