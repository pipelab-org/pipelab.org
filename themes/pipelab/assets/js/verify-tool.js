// Browser-local receipt-chain and published-session-bundle verification. Input is never
// uploaded; dynamic output is assigned through textContent only.
(function () {
  "use strict";

  var tool = document.querySelector(".verify-tool");
  if (!tool) return;

  var MAX_INPUT_BYTES = 25 * 1024 * 1024;
  var MAX_KEY_BYTES = 32 * 1024;
  var MAX_WASM_BYTES = 20 * 1024 * 1024;
  // Match Pipelock's bounded recorder-reader ceiling. Raw receipt JSONL can
  // take its compatibility path in the verifier, so bound the number of
  // synchronous signature checks before entering WebAssembly.
  var MAX_CHAIN_RECORDS = 10000;
  var chainFile = tool.querySelector("[data-chain-file]");
  var chainText = tool.querySelector("[data-chain-text]");
  var keyFile = tool.querySelector("[data-key-file]");
  var keyText = tool.querySelector("[data-key-text]");
  var dropzone = tool.querySelector("[data-dropzone]");
  var fileStatus = tool.querySelector("[data-file-status]");
  var output = tool.querySelector("[data-output]");
  var consoleBox = tool.querySelector(".verify-tool-console");
  var runButton = tool.querySelector("[data-run]");
  var sampleButton = tool.querySelector("[data-sample]");
  var trust = tool.querySelector("[data-trust-state]");
  var trustTitle = tool.querySelector("[data-trust-title]");
  var trustCopy = tool.querySelector("[data-trust-copy]");
  var selectedFile = null;
  var verifierReady = null;

  function byteLength(text) {
    return new Blob([text]).size;
  }

  function setOutput(state, lines) {
    consoleBox.dataset.consoleState = state;
    output.textContent = Array.isArray(lines) ? lines.join("\n") : String(lines);
  }

  function setFileStatus(message, state) {
    fileStatus.textContent = message;
    fileStatus.dataset.state = state || "idle";
  }

  function hasPinnedKey() {
    return keyText.value.trim().length > 0;
  }

  function updateTrustState() {
    if (hasPinnedKey()) {
      trust.dataset.trustState = "pinned";
      trustTitle.textContent = "Verified against the supplied key";
      trustCopy.textContent = "The verifier will require each receipt-chain segment to match the public key you supplied.";
      return;
    }
    trust.dataset.trustState = "unpinned";
    trustTitle.textContent = "Internal consistency only";
    trustCopy.textContent = "No key is pinned. The tool can check whether supplied records agree with their embedded signer key, but cannot establish whose key it is.";
  }

  async function bytesWithLimit(response, maxBytes, label) {
    var contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error(label + " is too large");
    var buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error(label + " is too large");
    return new Uint8Array(buffer);
  }

  function loadScript(src, integrity) {
    return new Promise(function (resolve, reject) {
      if (!integrity) { reject(new Error("the Go WASM runtime is missing its expected integrity digest")); return; }
      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.integrity = integrity;
      script.onload = resolve;
      script.onerror = function () { reject(new Error("could not load the Go WASM runtime")); };
      document.head.appendChild(script);
    });
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
    if (verifierReady) return verifierReady;
    verifierReady = (async function () {
      // Always instantiate our own digest-verified module; preexisting
      // globals of the same names are not trusted to be the shipped verifier.
      await loadScript(tool.dataset.wasmExec, tool.dataset.wasmExecIntegrity);
      var response = await fetch(tool.dataset.wasm, { cache: "force-cache", redirect: "error" });
      if (!response.ok) throw new Error("verifier download failed (" + response.status + ")");
      var wasm = await bytesWithLimit(response, MAX_WASM_BYTES, "verifier wasm");
      await checkDigest(wasm, tool.dataset.wasmIntegrity, "verifier wasm");
      var go = new window.Go();
      var result = await WebAssembly.instantiate(wasm, go.importObject);
      var run = go.run(result.instance);
      if (run && typeof run.catch === "function") run.catch(function () {});
      var deadline = Date.now() + 8000;
      while ((typeof window.pipelockVerifyChain !== "function" || typeof window.pipelockVerifyBundle !== "function") && Date.now() < deadline) {
        await new Promise(function (resolve) { setTimeout(resolve, 25); });
      }
      if (typeof window.pipelockVerifyChain !== "function" || typeof window.pipelockVerifyBundle !== "function") {
        throw new Error("verifier did not initialize");
      }
    })();
    verifierReady.catch(function () { verifierReady = null; });
    return verifierReady;
  }

  function isJsonlFile(file) {
    return /\.jsonl$/i.test(file.name) || /jsonl/i.test(file.type || "");
  }

  function setSelectedFile(file) {
    if (!file) return;
    if (file.size > MAX_INPUT_BYTES) {
      selectedFile = null;
      setFileStatus("Rejected: " + file.name + " exceeds the 25 MB local input limit.", "fail");
      setOutput("fail", "INPUT REJECTED\nThe selected file exceeds this tool's 25 MB limit. Nothing was uploaded.");
      return;
    }
    selectedFile = file;
    var kind = isJsonlFile(file) ? "JSONL receipt chain" : "published session bundle";
    setFileStatus(kind + " selected: " + file.name + " (" + Math.ceil(file.size / 1024) + " KB).", "ready");
    if (isJsonlFile(file)) chainText.value = "";
  }

  function extractFirstSignerKey(chain) {
    var lines = chain.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      var entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch (_) {
        continue;
      }
      var key = entry && entry.detail && entry.detail.signer_key;
      if (typeof key === "string" && /^[0-9a-f]{64}$/i.test(key.trim())) return key.trim();
    }
    throw new Error("cannot derive a TOFU key from a receipt's embedded signer key");
  }

  function assertChainRecordLimit(chain) {
    var records = 0;
    var hasContent = false;
    for (var i = 0; i < chain.length; i++) {
      var code = chain.charCodeAt(i);
      if (code === 10) {
        if (hasContent) {
          records++;
          if (records > MAX_CHAIN_RECORDS) throw new Error("chain exceeds the 10,000-record local limit");
          hasContent = false;
        }
      } else if (code > 32) {
        hasContent = true;
      }
    }
    if (hasContent && records + 1 > MAX_CHAIN_RECORDS) throw new Error("chain exceeds the 10,000-record local limit");
  }

  function addChecks(lines, result) {
    if (!result || !Array.isArray(result.checks)) return;
    result.checks.forEach(function (check) {
      lines.push("CHECK " + (check.pass ? "PASS" : "FAIL") + ": " + String(check.name || "unnamed"));
    });
  }

  function chainResultLines(result, pinned, tofuKey) {
    var lines = [result && result.valid ? "CHAIN VALID" : "VERIFICATION FAILED"];
    lines.push(pinned ? "TRUST: verified against the supplied key" : "TRUST: internal consistency only, key not pinned");
    if (!pinned && tofuKey) lines.push("TOFU KEY: " + tofuKey);
    var count = result && (result.receipts != null ? result.receipts : result.receiptCount);
    if (count != null) lines.push("RECEIPTS: " + count);
    var root = result && (result.root_hash || result.rootHash);
    if (root) lines.push("ROOT HASH: " + root);
    if (result && result.finalSeq != null) lines.push("FINAL SEQUENCE: " + result.finalSeq);
    addChecks(lines, result);
    if (!result || !result.valid) lines.push("ERROR: " + ((result && result.error) || "chain did not verify"));
    lines.push("");
    lines.push("LIMITS: This checks the supplied records for signatures, integrity, and order. It cannot prove records are complete, that all actions crossed Pipelock, or that an operator is honest.");
    return lines;
  }

  function bundleResultLines(result) {
    var lines = [result && result.valid ? "BUNDLE VALID" : "VERIFICATION FAILED", "TRUST: verified against the compiled PipeLab published key"];
    if (result && result.receipts != null) lines.push("RECEIPTS: " + result.receipts);
    if (result && (result.root_hash || result.rootHash)) lines.push("ROOT HASH: " + (result.root_hash || result.rootHash));
    addChecks(lines, result);
    if (!result || !result.valid) lines.push("ERROR: " + ((result && result.error) || "bundle did not verify"));
    lines.push("");
    lines.push("LIMITS: A valid bundle does not prove that the supplied records are complete or that its producer was honest.");
    return lines;
  }

  async function verifyChain(chain) {
    if (byteLength(chain) > MAX_INPUT_BYTES) throw new Error("chain text exceeds the 25 MB local input limit");
    assertChainRecordLimit(chain);
    var pinned = hasPinnedKey();
    var tofuKey = pinned ? "" : extractFirstSignerKey(chain);
    // The current WASM wrapper requires at least one key argument. For the
    // unpinned mode we adopt the first embedded signer key locally, which is
    // intentionally reported as TOFU rather than as an operator-pinned result.
    var trustedKey = pinned ? keyText.value.trim() : tofuKey;
    var result = window.pipelockVerifyChain(chain, [trustedKey]);
    setOutput(result && result.valid ? "valid" : "fail", chainResultLines(result, pinned, tofuKey));
  }

  async function verifyBundle(file) {
    var bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_INPUT_BYTES) throw new Error("bundle exceeds the 25 MB local input limit");
    var result = window.pipelockVerifyBundle(bytes);
    setOutput(result && result.valid ? "valid" : "fail", bundleResultLines(result));
  }

  async function runVerification() {
    runButton.disabled = true;
    if (byteLength(keyText.value) > MAX_KEY_BYTES) {
      setOutput("fail", "INPUT REJECTED\nThe pasted public key exceeds the 32 KB limit. An Ed25519 public key is 64 hex characters.");
      runButton.disabled = false;
      return;
    }
    setOutput("running", "Loading the verifier into this browser...");
    try {
      await ensureVerifier();
      if (selectedFile && !isJsonlFile(selectedFile)) {
        setOutput("running", "Checking the published session bundle locally...");
        await verifyBundle(selectedFile);
      } else {
        var chain = selectedFile ? await selectedFile.text() : chainText.value;
        if (!chain.trim()) throw new Error("add a JSONL receipt chain before verifying");
        setOutput("running", "Checking the receipt chain locally...");
        await verifyChain(chain);
      }
    } catch (error) {
      setOutput("fail", ["VERIFICATION FAILED", "ERROR: " + (error && error.message ? error.message : "unknown error"), "", "Nothing was uploaded.", "", "Run locally instead:", "  pipelock verify-receipt --key <key> <file>", "  https://pipelab.org/learn/verify-a-receipt/"]);
    } finally {
      runButton.disabled = false;
    }
  }

  async function loadSample() {
    sampleButton.disabled = true;
    setOutput("running", "Loading the published reference capture into this page...");
    try {
      var responses = await Promise.all([
        fetch(tool.dataset.sampleChain, { cache: "no-cache", redirect: "error" }),
        fetch(tool.dataset.sampleKey, { cache: "no-cache", redirect: "error" })
      ]);
      if (!responses[0].ok || !responses[1].ok) throw new Error("could not load the reference capture");
      var chainBytes = await bytesWithLimit(responses[0], MAX_INPUT_BYTES, "reference chain");
      await checkDigest(chainBytes, tool.dataset.sampleChainIntegrity, "reference chain");
      var keyBytes = await bytesWithLimit(responses[1], MAX_KEY_BYTES, "reference key");
      await checkDigest(keyBytes, tool.dataset.sampleKeyIntegrity, "reference key");
      chainText.value = new TextDecoder().decode(chainBytes);
      keyText.value = new TextDecoder().decode(keyBytes).trim();
      selectedFile = null;
      if (chainFile) chainFile.value = "";
      setFileStatus("Reference JSONL chain loaded for local verification.", "ready");
      updateTrustState();
      setOutput("idle", "Reference chain and its published key are ready. Click Verify locally.");
    } catch (error) {
      setOutput("fail", "Could not load the reference capture: " + (error && error.message ? error.message : "unknown error"));
    } finally {
      sampleButton.disabled = false;
    }
  }

  chainFile.addEventListener("change", function () { setSelectedFile(chainFile.files && chainFile.files[0]); });
  keyFile.addEventListener("change", async function () {
    var file = keyFile.files && keyFile.files[0];
    if (!file) return;
    if (file.size > MAX_KEY_BYTES) {
      setOutput("fail", "KEY REJECTED\nThe public-key file exceeds the 32 KB local limit.");
      return;
    }
    var text = (await file.text()).trim();
    // Apply only if this is still the current selection; a slower earlier
    // read must not overwrite a newer file's key.
    if ((keyFile.files && keyFile.files[0]) !== file) return;
    keyText.value = text;
    updateTrustState();
  });
  keyText.addEventListener("input", updateTrustState);
  // Pasting or editing chain text supersedes an earlier file pick, so the
  // verify button always runs the input the user can currently see.
  chainText.addEventListener("input", function () {
    if (selectedFile && chainText.value.trim()) {
      selectedFile = null;
      chainFile.value = "";
      setFileStatus("File selection cleared. The pasted chain below will be verified.", "");
    }
  });
  sampleButton.addEventListener("click", loadSample);
  runButton.addEventListener("click", runVerification);

  ["dragenter", "dragover"].forEach(function (eventName) {
    dropzone.addEventListener(eventName, function (event) { event.preventDefault(); dropzone.classList.add("is-dragging"); });
  });
  ["dragleave", "drop"].forEach(function (eventName) {
    dropzone.addEventListener(eventName, function (event) { event.preventDefault(); dropzone.classList.remove("is-dragging"); });
  });
  dropzone.addEventListener("drop", function (event) { setSelectedFile(event.dataTransfer.files && event.dataTransfer.files[0]); });
  dropzone.addEventListener("click", function (event) { if (event.target !== chainFile) chainFile.click(); });
  dropzone.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chainFile.click(); }
  });

  updateTrustState();
})();
