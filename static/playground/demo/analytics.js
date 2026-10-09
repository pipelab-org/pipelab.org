// Counts-only playground events stay on this origin. The broker applies the
// authoritative closed schema, creates the anonymous session identifier, and
// forwards accepted events without browser metadata or person profiles.
(function () {
  "use strict";

  var allowed = new Set([
    "playground_demo_viewed",
    "playground_mode_selected",
    "playground_live_unavailable",
    "playground_live_session_failed",
    "playground_live_session_started",
    "playground_message_sent",
    "playground_message_failed",
    "playground_attack_blocked",
    "playground_verify_clicked",
    "playground_verify_result",
    "playground_kit_downloaded"
  ]);
  var tail = fetch("/api/live/health", {
    credentials: "same-origin",
    headers: { "Accept": "application/json" }
  }).then(function (response) {
    return response.ok;
  }).catch(function () {
    return false;
  });

  window.pgTrack = function (event, properties) {
    if (!allowed.has(event)) return;
    var body;
    try {
      body = JSON.stringify({ event: event, properties: properties || {} });
    } catch (_) {
      return;
    }
    // Serialize first-page events so the broker's first Set-Cookie response is
    // stored before the next event. That keeps one anonymous visit in one funnel.
    tail = tail.then(function (enabled) {
      if (!enabled) return false;
      return fetch("/api/live/analytics", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: body
      }).then(function () {
        return true;
      }).catch(function () {
        return true;
      });
    });
  };
})();
