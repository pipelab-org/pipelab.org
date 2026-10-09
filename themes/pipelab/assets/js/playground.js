(function () {
  const root = document.querySelector('[data-playground-scenario]');
  if (!root) return;

  const state = {
    manifest: null,
    packet: null,
    evidence: [],
    active: 0,
  };

  const setText = (selector, value) => {
    const el = root.querySelector(selector);
    if (el) el.textContent = value || '';
  };

  const valueOrDash = (value) => {
    if (value === null || value === undefined || value === '') return 'none';
    return String(value);
  };

  const shortHash = (value) => {
    const text = valueOrDash(value);
    if (text.length <= 18) return text;
    return `${text.slice(0, 12)}...${text.slice(-8)}`;
  };

  const parseEvidence = (text) => text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.type === 'action_receipt');

  const renderStaticFields = () => {
    const m = state.manifest;
    setText('[data-field="without"]', m.without);
    setText('[data-field="with"]', m.with);
    setText('[data-field="redacted-shape"]', m.redacted_shape || '');
    setText('[data-field="verifier-command"]', m.verifier_command);
    setText('[data-field="completeness-note"]', m.completeness_note);

    const binding = root.querySelector('[data-packet-binding]');
    if (!binding) return;
    binding.innerHTML = '';
    [
      ['Packet SHA256', shortHash(m.packet.sha256)],
      ['Receipt root', shortHash(m.packet.root_hash)],
      ['Receipt count', m.packet.receipt_count],
      ['Final sequence', m.packet.final_seq],
      ['Signer key', shortHash(m.signer_key)],
    ].forEach(([label, value]) => {
      const wrap = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = valueOrDash(value);
      wrap.append(dt, dd);
      binding.appendChild(wrap);
    });
  };

  const renderTimeline = () => {
    const timeline = root.querySelector('[data-timeline]');
    if (!timeline) return;
    timeline.innerHTML = '';
    state.manifest.receipts.forEach((receipt, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'playground-timeline-item';
      button.dataset.index = String(index);
      ['span', 'strong', 'em'].forEach((tag, i) => {
        const child = document.createElement(tag);
        child.textContent = [receipt.chain_seq, receipt.verdict, receipt.layer || receipt.action_type][i];
        button.appendChild(child);
      });
      button.addEventListener('click', () => {
        state.active = index;
        renderActiveReceipt();
      });
      timeline.appendChild(button);
    });
  };

  const renderFields = (receipt) => {
    const dl = root.querySelector('[data-receipt-fields]');
    if (!dl) return;
    dl.innerHTML = '';
    const fields = [
      ['Verdict', receipt.verdict],
      ['Layer', receipt.layer],
      ['Pattern', receipt.pattern],
      ['Transport', receipt.transport],
      ['Method', receipt.method],
      ['Target', receipt.target_redacted],
      ['Action ID', receipt.action_id],
      ['Policy hash', state.manifest.policy_hash],
    ];
    fields.forEach(([label, value]) => {
      if (value === undefined || value === null || value === '') return;
      const wrap = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = valueOrDash(value);
      wrap.append(dt, dd);
      dl.appendChild(wrap);
    });
  };

  const renderActiveReceipt = () => {
    const receipts = state.manifest.receipts;
    if (!receipts.length) return;
    if (state.active < 0) state.active = 0;
    if (state.active >= receipts.length) state.active = receipts.length - 1;

    const receipt = receipts[state.active];
    const evidence = state.evidence[state.active] || {};
    setText('[data-step-counter]', `Step ${state.active + 1} of ${receipts.length}`);
    setText('[data-receipt-title]', `${receipt.verdict.toUpperCase()} ${receipt.action_type || 'action'}`);
    renderFields(receipt);

    const json = root.querySelector('[data-receipt-json]');
    if (json) json.textContent = JSON.stringify(evidence.detail || evidence, null, 2);

    root.querySelectorAll('[data-index]').forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.index) === state.active);
    });

    const prev = root.querySelector('[data-step-prev]');
    const next = root.querySelector('[data-step-next]');
    if (prev) prev.disabled = state.active === 0;
    if (next) next.disabled = state.active === receipts.length - 1;
  };

  // overclaimRiskSentence mirrors the verifier's own one-line explanations
  // (cmd/pipelock-verifier/aarp.go) so the rendered text matches the tool. An
  // unmapped code falls back to the bare code, never silently dropped.
  const overclaimRiskSentence = (code) => ({
    signature_valid_is_not_transparency_inclusion:
      'a valid signature is integrity over the assertion bytes, not proof the receipt was witnessed by an external transparency log',
    svid_identity_is_not_deployment_non_bypass:
      'a verified signing-workload identity does not prove the deployment forced the workload\'s traffic through the mediator',
    chain_link_present_is_not_verified_contiguous_chain:
      'a present chain link is a single position, not a verified contiguous stream',
  }[code] || code);

  const fillCodeList = (selector, items) => {
    const ul = root.querySelector(selector);
    if (!ul) return;
    ul.innerHTML = '';
    (items || []).forEach((item) => {
      const li = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = item;
      li.appendChild(code);
      ul.appendChild(li);
    });
  };

  const renderAppraisal = (ap) => {
    const panel = root.querySelector('[data-appraisal-panel]');
    if (!panel || !ap) return;

    const signed = root.querySelector('[data-appraisal-signed]');
    if (signed) {
      signed.textContent = ap.assertion_signed
        ? 'Assertion signature verified against the pinned key.'
        : 'Assertion signature did not verify against any pinned key; producer claims remain unconfirmed.';
      signed.classList.toggle('is-unsigned', !ap.assertion_signed);
      signed.classList.toggle('is-signed', !!ap.assertion_signed);
    }

    fillCodeList('[data-appraisal-dna]', ap.does_not_assert);

    const riskWrap = root.querySelector('[data-appraisal-risk-wrap]');
    const risks = ap.overclaim_risks || [];
    if (riskWrap) riskWrap.hidden = risks.length === 0;
    const riskUl = root.querySelector('[data-appraisal-risks]');
    if (riskUl) {
      riskUl.innerHTML = '';
      risks.forEach((code) => {
        const li = document.createElement('li');
        const codeEl = document.createElement('code');
        codeEl.textContent = code;
        const span = document.createElement('span');
        span.textContent = overclaimRiskSentence(code);
        li.append(codeEl, span);
        riskUl.appendChild(li);
      });
    }

    const unverifiedWrap = root.querySelector('[data-appraisal-unverified-wrap]');
    const unverified = ap.claimed_unverified || [];
    if (unverifiedWrap) unverifiedWrap.hidden = unverified.length === 0;
    fillCodeList('[data-appraisal-unverified]', unverified);

    fillCodeList('[data-appraisal-verified]', ap.verified_claims);

    const sigDl = root.querySelector('[data-appraisal-signatures]');
    if (sigDl) {
      sigDl.innerHTML = '';
      (ap.signatures || []).forEach((sig) => {
        const wrap = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = `${sig.key_id} (${sig.alg}, ${sig.signer_role})`;
        dd.textContent = sig.status;
        dd.className = `playground-sig-${sig.status}`;
        wrap.append(dt, dd);
        sigDl.appendChild(wrap);
      });
    }
  };

  const init = async () => {
    const [manifestRes, packetRes, evidenceRes] = await Promise.all([
      fetch(root.dataset.manifest),
      fetch(root.dataset.packet),
      fetch(root.dataset.evidence),
    ]);
    if (!manifestRes.ok || !packetRes.ok || !evidenceRes.ok) {
      throw new Error('playground replay assets failed to load');
    }
    state.manifest = await manifestRes.json();
    state.packet = await packetRes.json();
    state.evidence = parseEvidence(await evidenceRes.text());

    renderStaticFields();
    renderTimeline();
    renderActiveReceipt();

    if (root.dataset.appraisal) {
      try {
        const appraisalRes = await fetch(root.dataset.appraisal);
        if (appraisalRes.ok) renderAppraisal(await appraisalRes.json());
      } catch (err) {
        /* appraisal panel is progressive enhancement; ignore fetch errors */
      }
    }

    const prev = root.querySelector('[data-step-prev]');
    const next = root.querySelector('[data-step-next]');
    if (prev) prev.addEventListener('click', () => {
      state.active -= 1;
      renderActiveReceipt();
    });
    if (next) next.addEventListener('click', () => {
      state.active += 1;
      renderActiveReceipt();
    });
  };

  init().catch((err) => {
    setText('[data-receipt-title]', 'Replay assets unavailable');
    setText('[data-field="completeness-note"]', err.message);
  });
}());
