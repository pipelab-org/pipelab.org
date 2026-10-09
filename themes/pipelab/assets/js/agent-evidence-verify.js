// In-browser receipt-chain verification for the agent-evidence page.
// Loads the shipped Pipelock verifier as WebAssembly and calls the
// pipelockVerifyChain entrypoint it exports. Nothing is uploaded.
(function () {
  "use strict";
  var MAX_CAPTURE_BYTES = 25 * 1024 * 1024;
  var MAX_KEY_BYTES = 32 * 1024;
  var MAX_WASM_BYTES = 20 * 1024 * 1024;
  var MAX_CHAIN_RECORDS = 10000;

  var box = document.querySelector(".ev-console");
  if (!box) return;
  var out = box.querySelector(".ev-console-out");
  var code = out.querySelector("code");
  var btn = box.querySelector(".ev-verify-run");
  var liveDot = box.querySelector(".ev-dot");
  var wasmReady = null;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function render(state, html) {
    out.dataset.state = state;
    code.innerHTML = html;
  }

  function loadScript(src, integrity) {
    return new Promise(function (resolve, reject) {
      if (!integrity) { reject(new Error(src + " is missing its expected integrity digest")); return; }
      var s = document.createElement("script");
      s.src = src;
      s.integrity = integrity;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("could not load " + src)); };
      document.head.appendChild(s);
    });
  }

  // Reject an over-sized response before and after buffering, so a
  // misconfigured or replaced endpoint cannot balloon page memory.
  async function bytesWithLimit(resp, max, label) {
    if (!resp.ok) throw new Error(label + " " + resp.status);
    var declared = Number(resp.headers.get("content-length") || 0);
    if (declared && declared > max) throw new Error(label + " exceeds the size limit");
    var bytes = await resp.arrayBuffer();
    if (bytes.byteLength > max) throw new Error(label + " exceeds the size limit");
    return bytes;
  }
  // Fail closed: when a build-time digest is expected, refuse to proceed
  // unless the fetched bytes can be verified against it. That means a
  // non-HTTPS context (no crypto.subtle) refuses rather than skipping.
  async function checkDigest(bytes, integrity, label) {
    if (!integrity) throw new Error(label + " is missing its expected integrity digest");
    var parts = integrity.split("-");
    if (parts[0] !== "sha256" || !parts[1]) throw new Error(label + " has an unsupported integrity format");
    if (!window.crypto || !window.crypto.subtle) throw new Error("a secure (HTTPS) context is required to verify " + label + " integrity");
    var digest = await window.crypto.subtle.digest("SHA-256", bytes);
    var b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(digest)));
    if (b64 !== parts[1]) throw new Error(label + " failed its integrity check");
  }

  function ensureVerifier() {
    if (wasmReady) return wasmReady;
    wasmReady = (async function () {
      // Always instantiate our own digest-verified module; a preexisting
      // global of the same name is not trusted to be the shipped verifier.
      await loadScript(box.dataset.wasmExec, box.dataset.wasmExecIntegrity);
      var go = new window.Go();
      var resp = await fetch(box.dataset.wasm, { cache: "force-cache", redirect: "error" });
      var bytes = await bytesWithLimit(resp, MAX_WASM_BYTES, "verifier wasm");
      await checkDigest(bytes, box.dataset.wasmIntegrity, "verifier wasm");
      var result = await WebAssembly.instantiate(bytes, go.importObject);
      go.run(result.instance); // main() registers the entrypoints then blocks
      var waited = 0;
      while (typeof window.pipelockVerifyChain !== "function" && waited < 5000) {
        await new Promise(function (r) { setTimeout(r, 25); });
        waited += 25;
      }
      if (typeof window.pipelockVerifyChain !== "function") throw new Error("verifier did not register");
    })();
    wasmReady.catch(function () { wasmReady = null; });
    return wasmReady;
  }

  btn.addEventListener("click", function () {
    btn.disabled = true;
    if (liveDot) liveDot.classList.add("is-live");
    render("idle", "Loading the verifier into your browser…");
    Promise.all([
      fetch(box.dataset.capture, { cache: "no-cache", redirect: "error" }).then(async function (r) {
        var bytes = await bytesWithLimit(r, MAX_CAPTURE_BYTES, "capture");
        await checkDigest(bytes, box.dataset.captureIntegrity, "capture");
        return new TextDecoder().decode(bytes);
      }),
      fetch(box.dataset.key, { cache: "no-cache", redirect: "error" }).then(async function (r) {
        var bytes = await bytesWithLimit(r, MAX_KEY_BYTES, "key");
        await checkDigest(bytes, box.dataset.keyIntegrity, "key");
        return new TextDecoder().decode(bytes);
      }),
      ensureVerifier()
    ]).then(function (parts) {
      var chain = parts[0];
      var key = parts[1].trim();
      var records = chain.split("\n").filter(function (l) { return l.trim(); }).length;
      if (records > MAX_CHAIN_RECORDS) throw new Error("capture exceeds the 10,000-record local limit");
      var res = window.pipelockVerifyChain(chain, [key]);
      if (res && res.valid) {
        var lines = ["<span class='ev-ok'>CHAIN VALID</span>"];
        if (res.receipts != null) lines.push("receipts verified: " + esc(res.receipts));
        if (res.root_hash) lines.push("root: " + esc(String(res.root_hash).slice(0, 16)) + "…");
        lines.push("");
        lines.push("The verifier reports its own limits: it proves the supplied records were signed and unaltered, not that the set is complete or the operator honest.");
        render("valid", lines.join("\n"));
      } else {
        render("fail", "<span class='ev-bad'>VERIFICATION FAILED</span>\n" + esc((res && res.error) || "chain did not verify"));
      }
      btn.disabled = false;
    }).catch(function (e) {
      render("fail", "Could not run the check: " + esc(e.message) + "\n\nRun it in a terminal instead:\n  pipelock verify-receipt --key <public-key> evidence-proxy-0.jsonl");
      btn.disabled = false;
      if (liveDot) liveDot.classList.remove("is-live");
    });
  });
})();
