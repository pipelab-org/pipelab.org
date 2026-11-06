(function() {
  var path = window.location.pathname.replace(/\/$/, '');
  var parts = path.split('/');
  var recordParam = new URLSearchParams(window.location.search).get('record');
  var id = recordParam || ((parts.length >= 4 && parts[1] === 'gauntlet' && parts[2] === 'results') ? parts[3] : null);

  var loadingEl  = document.getElementById('results-loading');
  var errorEl    = document.getElementById('results-error');
  var landingEl  = document.getElementById('results-landing');
  var viewEl     = document.getElementById('results-view');
  var titleEl    = document.getElementById('results-title');
  var subtitleEl = document.getElementById('results-subtitle');
  var errorMsg   = document.getElementById('error-message');


  function show(el) {
    [loadingEl, errorEl, landingEl, viewEl].forEach(function(e) { e.style.display = 'none'; });
    el.style.display = '';
  }

  if (!id) {
    subtitleEl.textContent = 'Self-run results published against the public method. Not a ranking.';
    show(landingEl);
    fetchListing();
    return;
  }

  var verifiedId = /^[0-9a-f]{64}$/.test(id || '');
  var detailPromise = verifiedId && window.GauntletContinuous
    ? window.GauntletContinuous.loadLatestVerified(window.fetch.bind(window), window.crypto, null, { includeFailures: true }).then(function(loaded) {
        if (loaded.pointer.candidate_sha256 !== id) throw new Error('not_found');
        return { payload: loaded.record, created_at: loaded.record.generated_at, verified: loaded, summary: loaded.summary };
      })
    : fetch('/api/results/' + encodeURIComponent(id)).then(function(res) {
        if (!res.ok) throw new Error(res.status === 404 ? 'not_found' : 'server_error');
        return res.json();
      });

  detailPromise
    .then(function(data) { render(data); })
    .catch(function(err) {
      subtitleEl.textContent = '';
      errorMsg.textContent = err.message === 'not_found'
        ? 'Result not found. The ID may be incorrect or the result was removed.'
        : 'Failed to load results. Please try again.';
      show(errorEl);
    });

  function render(data) {
    show(viewEl);
    var p = data.payload;
    var createdAt = data.created_at ? new Date(data.created_at).toLocaleString() : null;

    // Full corpus is the primary published view; applicable is diagnostic only.
    // The publisher computes a threshold flag from FULL-corpus containment plus
    // an error-rate gate. That flag is retained as data, not presented as a mark
    // awarded by the benchmark. The public result leads with the measured score.
    var s = p.scores || {};
    var full = s.full || {};
    var app = s.applicable || {};

    // Title
    var recordTool = displayTool(p.tool);
    var recordVersion = p.tool_version ? ' ' + p.tool_version : '';
    var failureCount = data.verified && Array.isArray(data.verified.failures)
      ? data.verified.failures.length
      : null;
    document.querySelector('.gauntlet-hero').classList.add('is-record');
    var eyebrow = document.getElementById('results-eyebrow');
    eyebrow.hidden = false;
    eyebrow.textContent = data.verified ? 'PUBLIC RESULT / DIGEST CHECKED' : 'PUBLIC RESULT / SELF-REPORTED';
    titleEl.textContent = recordTool + ' against Agent Egress Bench';
    subtitleEl.textContent = 'Version' + recordVersion + ' · ' + (p.case_count && p.case_count.total ? p.case_count.total : '?') +
      ' public cases' + (failureCount === null ? '' : ' · ' + failureCount + ' observed failures');

    // The maintainer annotation is a first-party norm about Pipelock's own
    // records. It stays hidden for community-submitted records, where a Pipelock
    // maintainer response has no place.
    var maintainerEl = document.getElementById('gr-maintainer');
    if (maintainerEl) maintainerEl.hidden = recordTool !== 'Pipelock';

    // Meta + actions live in the hero now, hidden until a record loads so the
    // listing view never shows an empty pill row.
    var metaEl = document.getElementById('gr-meta');
    metaEl.innerHTML =
      (createdAt ? '<span>Submitted ' + esc(createdAt) + '</span>' : '') +
      (p.date ? '<span>Run ' + esc(new Date(p.date).toLocaleString()) + '</span>' : '');
    metaEl.hidden = !metaEl.innerHTML;
    document.getElementById('results-actions').hidden = false;

    var fullContainmentCounts = metricCounts(p, 'full', 'containment');
    var fullFalsePositiveCounts = metricCounts(p, 'full', 'false_positive_rate');
    var fullScore = scoreWithFraction(full.containment, fullContainmentCounts, 'malicious cases');
    document.getElementById('gr-record-score').textContent = pct(full.containment);
    document.getElementById('gr-record-heading').textContent = fullContainmentCounts
      ? fullContainmentCounts.numerator + ' of ' + fullContainmentCounts.denominator + ' malicious cases contained'
      : recordTool + ' containment';
    document.getElementById('gr-record-claim').textContent = data.verified ? 'DIGEST CHECKED' : 'SELF-REPORTED';
    renderFailures(data.verified && data.verified.failures, data.verified && data.verified.resultsUrl, p);

    if (data.verified) {
      var actions = document.querySelector('.gr-actions');
      var evidenceLink = document.createElement('a');
      evidenceLink.className = 'btn btn-ghost btn-sm';
      evidenceLink.href = data.verified.recordUrl;
      evidenceLink.textContent = 'Evidence record';
      var sourceLink = document.createElement('a');
      sourceLink.className = 'btn btn-ghost btn-sm';
      sourceLink.href = p.canonical_url;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
      sourceLink.textContent = 'Source run';
      actions.appendChild(evidenceLink);
      actions.appendChild(sourceLink);
    }

    // Verdict
    var verdictEl = document.getElementById('gr-verdict');
    var misses = fullContainmentCounts ? fullContainmentCounts.denominator - fullContainmentCounts.numerator : null;
    var falsePositives = fullFalsePositiveCounts ? fullFalsePositiveCounts.numerator : null;
    verdictEl.textContent = misses !== null && falsePositives !== null
      ? misses + ' missed attacks and ' + falsePositives + ' false positives are named beside this score.'
      : fullScore + ' containment on the full corpus.';

    // Score cards. Full corpus leads because it is the procurement view: a case
    // the tool does not claim still counts against it. The applicable score
    // follows, labelled as diagnostic, because declaring fewer capabilities
    // raises it without containing anything more. A fraction is added to the
    // caption only when it reconstructs the percent above it.
    var cc = p.case_count || {};
    var diagnostic = document.getElementById('gr-record-diagnostic');
    diagnostic.textContent = app.containment === full.containment
      ? 'Applicable containment matches the full-corpus result; shown once because the diagnostic adds no different score.'
      : scoreWithFraction(app.containment, metricCounts(p, 'applicable', 'containment'), 'malicious cases') + ' applicable containment (diagnostic).';
    // These sit beside the headline containment, never repeating it. The false
    // positive rate is shown separately because the corpus has no composite
    // score, and the record state says whether this browser checked the file.
    // Routed and error counts are not repeated here; they live in Coverage.
    document.getElementById('gr-scores').innerHTML =
      scoreCard('False positive rate', pct(full.false_positive_rate), scoreCaption('Full corpus', full.false_positive_rate, metricCounts(p, 'full', 'false_positive_rate'), 'benign cases'), full.false_positive_rate === 0 ? 'c-green' : 'c-red') +
      scoreCard('Record state', data.verified ? 'Digest checked' : 'Self-reported', data.verified ? 'Verified in your browser' : 'Publisher supplied', data.verified ? 'c-green' : 'c-muted');
    var weighting = document.createElement('p');
    weighting.className = 'sc-sub';
    weighting.textContent = window.GauntletContinuous && window.GauntletContinuous.CASE_EQUAL_WEIGHTING
      ? window.GauntletContinuous.CASE_EQUAL_WEIGHTING
      : 'Each rate is case-equal. Corpus composition sets the mix.';
    document.getElementById('gr-scores').appendChild(weighting);

    // Coverage. Describes what reached the tool; it is not another score, so it
    // stays a quiet strip rather than a second headline. Every public case is
    // accounted for, which is why an N/A case can never silently leave the
    // denominator.
    var caseHtml = '<div class="gr-coverage-grid">' +
      covItem(cc.applicable, 'Routed', 'of ' + cc.total + ' public cases', 'is-primary') +
      covItem(cc.not_applicable || 0, 'Not applicable', 'declared outside support', '') +
      covItem(cc.unreachable || 0, 'Unreachable', 'could not reach the tool', '') +
      covItem(cc.errors || 0, 'Errors', 'during execution', (cc.errors || 0) > 0 ? 'is-alert' : '') +
      '</div>';
    if (cc.not_applicable_reasons && Object.keys(cc.not_applicable_reasons).length > 0) {
      var reasons = cc.not_applicable_reasons;
      var parts = [];
      Object.keys(reasons).forEach(function(k) {
        parts.push(k.replace(/_/g, ' ') + ': ' + reasons[k]);
      });
      caseHtml += '<p class="gr-cov-reasons">N/A reasons: ' + esc(parts.join(', ')) + '</p>';
    }
    document.getElementById('gr-cases').innerHTML = caseHtml;

    // Per-category readout, in the same containment-bar grammar the listing
    // uses, so listing and record read as one evidence language rather than a
    // table bolted onto a card page. The digest-checked candidate omits
    // per_category; the hash-bound raw summary carries it. The routed count is
    // shown as cases beside the containment figure, never as the containment
    // denominator (it includes benign controls). Any missing, empty, mixed, or
    // malformed per-category data leaves the whole chapter hidden rather than
    // rendering a fabricated or half-populated grid, so an absence can never
    // read as a clean result.
    var categoryChapter = document.getElementById('gr-categories-chapter');
    try {
      var cats = (data.summary && data.summary.per_category) || p.per_category || {};
      var catKeys = Object.keys(cats).sort(function(a, b) {
        var aLoss = categoryHasLoss(cats[a]);
        var bLoss = categoryHasLoss(cats[b]);
        return aLoss === bLoss ? a.localeCompare(b) : aLoss ? -1 : 1;
      });
      var categoriesEl = document.getElementById('gr-categories');
      var diagnosticFlags = catKeys.map(function(k) { return !!(cats[k] && cats[k].diagnostics); });
      var mixedCategorySchema = diagnosticFlags.some(Boolean) && diagnosticFlags.some(function(flag) { return !flag; });
      if (catKeys.length === 0 || mixedCategorySchema) {
        categoriesEl.innerHTML = '';
        categoryChapter.hidden = true;
      } else {
        var catHtml = '';
        var contained = 0, scored = 0;
        catKeys.forEach(function(k) {
          var c = cats[k] || {};
          var app = Number(c.applicable);
          var cont = c.containment;
          var hasScore = cont !== null && cont !== undefined && isFinite(Number(cont));
          var ratio = hasScore ? Math.max(0, Math.min(1, Number(cont))) : null;
          if (hasScore) { scored++; if (ratio >= 1) contained++; }
          var hasLoss = categoryHasLoss(c);
          catHtml += '<div class="gl-category' + (hasScore ? '' : ' is-control') + (hasLoss ? ' is-loss' : '') +
            '" data-fx="spotlight" style="--fill:' + (hasScore ? (ratio * 100).toFixed(1) : 0) + '%">' +
            '<span class="gl-category-name">' + esc(k.replace(/_/g, ' ')) + '</span>' +
            '<span class="gl-category-score">' + (hasScore ? esc((ratio * 100).toFixed(0) + '%') : 'control') + '</span>' +
            '<span class="gl-category-cases">' + esc(isFinite(app) ? app + ' cases' : '') + '</span>' +
            '<span class="gl-category-bar" aria-hidden="true"><span class="gl-category-bar-fill"></span></span>' +
            '</div>';
        });
        categoriesEl.innerHTML = catHtml;
        document.getElementById('gr-cats-sub').textContent =
          contained + ' of ' + scored + ' scored categories fully contained. Categories with a miss or a false positive are pulled forward.';
        categoryChapter.hidden = false;
        if (window.PipelabFx && typeof window.PipelabFx.refresh === 'function') window.PipelabFx.refresh();
      }
    } catch (_error) {
      document.getElementById('gr-categories').innerHTML = '';
      categoryChapter.hidden = true;
    }

    // Declared support. Part of the record's scope, so it sits above the
    // digests in the same chapter. Hidden entirely when the record declares
    // none, rather than showing an empty label.
    var sup = p.tool_support || {};
    var supHtml = '';
    var hasSupport = false;
    if (sup.claims && sup.claims.length) {
      hasSupport = true;
      supHtml += '<p class="gr-subhead">Claimed capabilities</p>';
      supHtml += '<div class="gr-tags">';
      sup.claims.forEach(function(c) { supHtml += '<span class="gr-tag">' + esc(c) + '</span>'; });
      supHtml += '</div>';
    }
    if ((sup.unsupported_transports && sup.unsupported_transports.length) ||
        (sup.unsupported_requires && sup.unsupported_requires.length)) {
      hasSupport = true;
      supHtml += '<p class="gr-subhead gr-subhead-spaced">Not supported</p>';
      supHtml += '<div class="gr-tags">';
      (sup.unsupported_transports || []).forEach(function(t) { supHtml += '<span class="gr-tag muted">' + esc(t) + '</span>'; });
      (sup.unsupported_requires || []).forEach(function(r) { supHtml += '<span class="gr-tag muted">' + esc(r) + '</span>'; });
      supHtml += '</div>';
    }
    var supportEl = document.getElementById('gr-support');
    supportEl.hidden = !hasSupport;
    supportEl.innerHTML = hasSupport ? supHtml : '';

    // Provenance. The definition grid is the record's own dl in the markup; only
    // the pairs are written here so a table treatment never returns.
    var provHtml = '';
    var fields = [
      ['Tool', displayTool(p.tool)], ['Tool version', p.tool_version],
      ['Runner version', p.runner_version], ['Gauntlet version', p.gauntlet_version],
      ['Scoring version', p.scoring_version], ['Corpus version', p.corpus_version],
      ['Corpus SHA-256', p.corpus_sha256], ['Profile SHA-256', p.tool_profile_sha256]
    ];
    fields.forEach(function(f) {
      if (f[1]) provHtml += '<div class="gr-prov-row"><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>';
    });
    document.getElementById('gr-provenance').innerHTML = provHtml;

    // Raw JSON
    document.getElementById('gr-raw').textContent = JSON.stringify(p, null, 2);
  }

  // Copy link
  document.getElementById('copy-link-btn').addEventListener('click', function() {
    navigator.clipboard.writeText(window.location.href).then(function() {
      var btn = document.getElementById('copy-link-btn');
      btn.textContent = 'Copied!';
      setTimeout(function() { btn.textContent = 'Copy Share Link'; }, 2000);
    });
  });

  function pct(v) { return v === null || v === undefined ? '—' : (v * 100).toFixed(1) + '%'; }
  function metricCounts(record, scope, metric) {
    return window.GauntletContinuous ? window.GauntletContinuous.metricCounts(record, scope, metric) : null;
  }
  function scoreWithFraction(score, counts, caseKind) {
    return window.GauntletContinuous
      ? window.GauntletContinuous.formatScoreWithFraction(score, counts, caseKind)
      : pct(score);
  }
  function scoreCaption(base, score, counts, caseKind) {
    var fraction = window.GauntletContinuous
      ? window.GauntletContinuous.formatScoreFraction(score, counts, caseKind)
      : '';
    return fraction ? esc(fraction) + ' · ' + base : base;
  }
  function categoryHasLoss(category) {
    var c = category || {};
    return (c.containment !== null && c.containment !== undefined && c.containment < 1) ||
      (c.false_positive_rate !== null && c.false_positive_rate !== undefined && c.false_positive_rate > 0);
  }
  function scoreCard(label, value, sub, cls) {
    return '<div class="score-card"><div class="sc-label">' + label + '</div>' +
      '<div class="sc-value ' + cls + '">' + value + '</div>' +
      '<div class="sc-sub">' + sub + '</div></div>';
  }
  function covItem(value, label, sub, cls) {
    return '<div class="gr-cov-item ' + cls + '"><strong>' + esc(value) + '</strong>' +
      '<span>' + label + '</span><small>' + esc(sub) + '</small></div>';
  }
  function renderFailures(failures, resultsUrl, record) {
    var list = document.getElementById('gr-failure-list');
    var countEl = document.getElementById('gr-failure-count');
    var sourceEl = document.getElementById('gr-failure-source');
    var containment = metricCounts(record, 'full', 'containment');
    var falsePositives = metricCounts(record, 'full', 'false_positive_rate');
    var expectedCount = containment && falsePositives
      ? (containment.denominator - containment.numerator) + falsePositives.numerator
      : null;
    list.replaceChildren();
    countEl.textContent = (Array.isArray(failures) ? failures.length : expectedCount === null ? '?' : expectedCount) + ' failed cases';
    sourceEl.hidden = !resultsUrl;
    if (resultsUrl) {
      sourceEl.href = resultsUrl;
      sourceEl.target = '_blank';
      sourceEl.rel = 'noopener noreferrer';
    }

    if (!Array.isArray(failures)) {
      var unavailable = document.createElement('li');
      unavailable.className = 'gr-failure-unavailable';
      unavailable.textContent = 'Failure detail is unavailable. The aggregate score remains visible, but this record cannot present the losses as verified rows.';
      list.appendChild(unavailable);
      return;
    }
    if (failures.length === 0) {
      var clean = document.createElement('li');
      clean.className = 'gr-failure-clean';
      clean.textContent = 'No failed case rows in this measurement.';
      list.appendChild(clean);
      return;
    }
    failures.forEach(function(failure, index) {
      var falsePositive = failure.expected_verdict === 'allow' && failure.actual_verdict === 'block';
      var item = document.createElement('li');
      item.className = falsePositive ? 'is-false-positive' : 'is-missed-attack';
      var indexEl = document.createElement('span');
      indexEl.className = 'gr-failure-index';
      indexEl.textContent = String(index + 1).padStart(2, '0');
      var copy = document.createElement('div');
      var type = document.createElement('span');
      type.className = 'gr-failure-type';
      type.textContent = falsePositive ? 'FALSE POSITIVE' : 'MISSED ATTACK';
      var caseId = document.createElement('span');
      caseId.className = 'gr-failure-id';
      caseId.textContent = failure.case_id;
      var verdict = document.createElement('p');
      verdict.textContent = 'Expected ' + failure.expected_verdict + ' · observed ' + failure.actual_verdict;
      copy.appendChild(type);
      copy.appendChild(caseId);
      copy.appendChild(verdict);
      item.appendChild(indexEl);
      item.appendChild(copy);
      list.appendChild(item);
    });
  }
  function displayTool(name) {
    if (!name) return 'Unknown Tool';
    return String(name).trim().toLowerCase() === 'pipelock' ? 'Pipelock' : String(name);
  }
  function fetchListing() {
    var listLoading = document.getElementById('results-list-loading');
    var listEmpty = document.getElementById('results-list-empty');
    var listEl = document.getElementById('results-list');
    var countEl = document.getElementById('gl-count');

    Promise.all([
      fetch('/api/results').then(function(res) {
        if (!res.ok) throw new Error('listing');
        return res.json();
      }).then(function(data) {
        if (!data || !Array.isArray(data.results)) throw new Error('listing shape');
        return data;
      }).catch(function() { return null; }),
      window.GauntletContinuous
        ? window.GauntletContinuous.loadLatestVerified(window.fetch.bind(window), window.crypto).catch(function() { return null; })
        : Promise.resolve(null)
    ])
      .then(function(values) {
        listLoading.style.display = 'none';
        var verifiedLoaded = values[1] || null;
        if (!values[0] && !verifiedLoaded) throw new Error('listing unavailable');
        var rows = values[0] ? values[0].results : [];
        if (verifiedLoaded) {
          var verifiedRow = window.GauntletContinuous.verifiedListingRow(verifiedLoaded);
          // The digest-checked record does not live behind /api/results. Carry
          // the loaded record with its row so the hero reads it directly
          // instead of asking the API for an id it has never issued.
          verifiedRow.loaded = verifiedLoaded;
          rows.push(verifiedRow);
        }
        var grouped = window.GauntletContinuous
          ? window.GauntletContinuous.groupLatestByTool(rows)
          : rows.map(function(row) { return { latest: row, history: [] }; });
        countEl.textContent = grouped.length;
        renderListingHero(grouped);
        if (rows.length === 0) { listEmpty.style.display = ''; return; }

        // Build cards with textContent/createTextNode so submitted values stay literal.
        var container = document.createElement('div');
        container.className = 'rl-cards';
        grouped.forEach(function(group) {
          var r = group.latest;
          // Full corpus is the published view. Deliberately no fallback to the
          // applicable score: showing that number here unlabelled would present
          // the diagnostic figure as the headline, which is the inversion this
          // leaderboard previously had. A missing full score shows as unknown.
          var containment = parseFloat(r.full_containment);
          var hasContainment = Number.isFinite(containment);
          var cont = hasContainment ? (containment * 100).toFixed(1) + '%' : '\u2014';
          var contCls = hasContainment ? (containment >= 1 ? 'c-green' : containment >= 0.8 ? 'c-amber' : 'c-red') : 'c-muted';
          var date = new Date(r.created_at).toLocaleDateString();

          var card = document.createElement('article');
          card.className = 'rl-card';

          var left = document.createElement('div');
          left.className = 'rl-card-left';

          var score = document.createElement('div');
          score.className = 'rl-card-score ' + contCls;
          score.textContent = cont;

          var info = document.createElement('div');
          info.className = 'rl-card-info';

          var h3 = document.createElement('h3');
          var link = document.createElement('a');
          link.href = r.verified_record
            ? '/gauntlet/results/?record=' + encodeURIComponent(r.id)
            : '/gauntlet/results/' + encodeURIComponent(r.id);
          link.textContent = displayTool(r.tool);
          h3.appendChild(link);

          var meta = document.createElement('div');
          meta.className = 'rl-card-meta';
          var verSpan = document.createElement('span');
          verSpan.textContent = 'v' + (r.tool_version || '?');
          var listingFraction = window.GauntletContinuous
            ? window.GauntletContinuous.formatScoreFraction(
                containment,
                { numerator: r.full_containment_numerator, denominator: r.full_containment_denominator },
                'malicious cases'
              )
            : '';
          var dateSpan = document.createElement('span');
          dateSpan.textContent = date;
          meta.appendChild(verSpan);
          if (listingFraction) {
            var casesSpan = document.createElement('span');
            casesSpan.textContent = listingFraction;
            meta.appendChild(casesSpan);
          }
          meta.appendChild(dateSpan);
          var historyEl;
          if (group.history.length) {
            var historySpan = document.createElement('span');
            historySpan.textContent = group.history.length + ' earlier submission' + (group.history.length === 1 ? '' : 's');
            meta.appendChild(historySpan);

            historyEl = document.createElement('details');
            historyEl.className = 'rl-history';
            var historySummary = document.createElement('summary');
            historySummary.textContent = 'View submission history';
            historyEl.appendChild(historySummary);
            var historyList = document.createElement('ul');
            group.history.forEach(function(previous) {
              var item = document.createElement('li');
              var historyLink = document.createElement('a');
              historyLink.href = '/gauntlet/results/' + encodeURIComponent(previous.id);
              historyLink.textContent = window.GauntletContinuous.communityHistoryLabel(previous);
              item.appendChild(historyLink);
              historyList.appendChild(item);
            });
            historyEl.appendChild(historyList);
          }

          info.appendChild(h3);
          info.appendChild(meta);
          if (historyEl) info.appendChild(historyEl);
          left.appendChild(score);
          left.appendChild(info);

          var right = document.createElement('div');
          right.className = 'rl-card-right';
          var badge = document.createElement('span');
          badge.className = 'rl-badge neutral';
          badge.textContent = 'Measured';
          right.appendChild(badge);
          var unverified = document.createElement('span');
          unverified.className = 'rl-badge neutral';
          unverified.textContent = r.verified_record ? 'Digest checked' : 'Self-reported';
          right.appendChild(unverified);
          var inspectResult = document.createElement('a');
          inspectResult.className = 'btn btn-ghost btn-sm rl-card-inspect';
          inspectResult.href = r.verified_record
            ? '/gauntlet/results/?record=' + encodeURIComponent(r.id)
            : '/gauntlet/results/' + encodeURIComponent(r.id);
          inspectResult.textContent = 'Inspect result';
          right.appendChild(inspectResult);
          card.appendChild(left);
          card.appendChild(right);
          container.appendChild(card);
        });

        listEl.textContent = '';
        listEl.appendChild(container);
        listEl.style.display = '';
      })
      .catch(function() {
        listLoading.style.display = 'none';
        listEmpty.style.display = '';
        listEmpty.querySelector('p').textContent = 'Failed to load results.';
      });
  }

  function renderListingHero(grouped) {
    var hero = document.getElementById('gl-result-hero');
    if (!grouped.length) { return; }
    var r = grouped[0].latest;
    var containment = parseFloat(r.full_containment);
    var score = Number.isFinite(containment) ? (containment * 100).toFixed(1) + '%' : '\u2014';
    var date = new Date(r.created_at).toLocaleDateString();
    document.getElementById('gl-result-hero-score').textContent = score;
    // The result must be unmistakably clickable: the tool name is a real anchor
    // and a buyer-facing action opens the same record. A verified record opens
    // its digest-checked page (?record=), which re-verifies the file in the
    // browser; a self-reported record opens its detail page by id.
    var toolName = displayTool(r.tool);
    var recordUrl = r.id
      ? (r.verified_record
          ? '/gauntlet/results/?record=' + encodeURIComponent(r.id)
          : '/gauntlet/results/' + encodeURIComponent(r.id))
      : null;
    var toolEl = document.getElementById('gl-result-hero-tool');
    toolEl.textContent = '';
    if (recordUrl) {
      var toolLink = document.createElement('a');
      toolLink.href = recordUrl;
      toolLink.textContent = toolName;
      toolEl.appendChild(toolLink);
    } else {
      toolEl.textContent = toolName;
    }
    document.getElementById('gl-result-hero-version').textContent = 'v' + (r.tool_version || '?');
    document.getElementById('gl-result-hero-cases').textContent = (r.applicable || '?') + ' / ' + (r.total || '?') + ' cases';
    document.getElementById('gl-result-hero-date').textContent = date;
    var meter = document.getElementById('gl-result-hero-meter');
    var meterFill = document.getElementById('gl-result-hero-meter-fill');
    var applicable = Number(r.applicable);
    var totalCases = Number(r.total);
    if (meter && meterFill && isFinite(applicable) && isFinite(totalCases) && totalCases > 0 && applicable >= 0) {
      var ratio = Math.max(0, Math.min(1, applicable / totalCases));
      meterFill.style.width = (ratio * 100).toFixed(2) + '%';
      meter.hidden = false;
      meter.setAttribute('role', 'img');
      meter.setAttribute('aria-label', applicable + ' of ' + totalCases + ' cases routed to the tool');
    } else if (meter) {
      meter.hidden = true;
    }
    document.getElementById('gl-result-hero-measured').textContent = 'MEASURED';
    // The second label states what the record IS, not a verdict on the run.
    // "Digest checked" means this browser confirmed the published file against
    // its published fingerprint. A record without one is self-reported: the
    // number is real and the file has not been independently checked.
    document.getElementById('gl-result-hero-claim').textContent = r.verified_record ? 'DIGEST CHECKED' : 'SELF-REPORTED';
    var note = document.getElementById('gl-result-hero-claim-note');
    if (note) {
      note.textContent = r.verified_record
        ? 'This browser checked the published record against its published digest.'
        : 'First-party run. The published record carries no digest for this browser to check, so the figure is reported by the publisher and not independently confirmed here.';
    }
    var link = document.getElementById('gl-result-hero-record-link');
    if (link && r.id) {
      link.href = r.verified_record
        ? '/gauntlet/evidence/results/pipelock/' + encodeURIComponent(r.id) + '/continuous-gauntlet-pipelock.json'
        : '/gauntlet/results/' + encodeURIComponent(r.id);
    }
    var actions = document.getElementById('gl-result-hero-actions');
    var inspect = document.getElementById('gl-result-hero-inspect');
    if (actions && inspect && recordUrl) {
      inspect.href = recordUrl;
      inspect.textContent = 'Inspect ' + toolName + ' result';
      actions.hidden = false;
    } else if (actions) {
      actions.hidden = true;
    }
    hero.style.display = '';
    renderCategories(r);
  }

  // The listing only carries totals. The per-category breakdown lives on the
  // record itself, so fetch that one record and draw the grid from it. Any
  // failure leaves the section hidden: a missing grid is honest, a guessed one
  // is not.
  function renderCategories(r) {
    var section = document.getElementById('gl-categories');
    var grid = document.getElementById('gl-category-grid');
    var sub = document.getElementById('gl-categories-sub');
    if (!section || !grid || !r || !r.id) return;
    // A digest-checked record was already fetched and verified by the
    // continuous loader; it is not served by /api/results at all. Everything
    // else is an API record and is fetched by id.
    var source = r.verified_record && r.loaded && r.loaded.record
      ? Promise.resolve({ payload: r.loaded.record, verified: true, summary: r.loaded.summary })
      : fetch('/api/results/' + encodeURIComponent(r.id))
          .then(function(res) { if (!res.ok) throw new Error('detail'); return res.json(); });
    source
      .then(function(data) {
        var p = data && data.payload;
        renderRecordExhibit(p, data);
        var cats = (data && data.verified && data.summary && data.summary.per_category) || (p && p.per_category);
        // Verified summaries carry the category breakdown separately from the
        // record. Missing data leaves the section hidden.
        if (!cats || typeof cats !== 'object') {
          section.hidden = true;
          return;
        }
        var names = Object.keys(cats);
        if (!names.length) return;
        names.sort(function(a, b) { return (cats[b].applicable || 0) - (cats[a].applicable || 0); });
        var html = '';
        var contained = 0, scored = 0;
        names.forEach(function(name) {
          var c = cats[name] || {};
          var app = Number(c.applicable);
          var cont = c.containment;
          var hasScore = cont !== null && cont !== undefined && isFinite(Number(cont));
          var pct = hasScore ? Math.max(0, Math.min(1, Number(cont))) : null;
          if (hasScore) { scored++; if (pct >= 1) contained++; }
          var label = name.replace(/_/g, ' ');
          html += '<div class="gl-category' + (hasScore ? '' : ' is-control') + '" data-fx="spotlight" style="--fill:' + (hasScore ? (pct * 100).toFixed(1) : 0) + '%">'
            + '<span class="gl-category-name">' + esc(label) + '</span>'
            + '<span class="gl-category-score">' + (hasScore ? esc((pct * 100).toFixed(0) + '%') : 'control') + '</span>'
            + '<span class="gl-category-cases">' + esc(isFinite(app) ? app + ' cases' : '') + '</span>'
            + '<span class="gl-category-bar" aria-hidden="true"><span class="gl-category-bar-fill"></span></span>'
            + '</div>';
        });
        grid.innerHTML = html;
        sub.textContent = contained + ' of ' + scored + ' scored categories fully contained, from the record above.';
        section.hidden = false;
        if (window.PipelabFx && typeof window.PipelabFx.refresh === 'function') window.PipelabFx.refresh();
      })
      .catch(function() { section.hidden = true; });
  }

  // A compact, faithful excerpt of the record: the identifying fields and the
  // headline scores, in the record's own key names. Shown as JSON because that
  // is what the record is; a reader can open the full file from the caption.
  function renderRecordExhibit(p, data) {
    var code = document.getElementById('gl-result-hero-record');
    var label = document.getElementById('gl-result-hero-artifact-label');
    if (!code || !p) return;
    var excerpt = {};
    // Identifying fields first, in the record's own key names. The two record
    // shapes name the run date differently, so both are tried.
    ['tool', 'tool_version', 'pipelock_tag', 'date', 'generated_at', 'corpus_version', 'corpus_git_sha',
     'runner_version', 'scoring_version', 'method_commit', 'measurement_status'].forEach(function(k) {
      if (p[k] !== undefined && p[k] !== null && p[k] !== '') excerpt[k] = p[k];
    });
    if (p.case_count) excerpt.case_count = p.case_count;
    if (p.scores) excerpt.scores = p.scores;
    if (p.corpus_sha256) excerpt.corpus_sha256 = p.corpus_sha256;
    if (p.pipelock_binary_sha256) excerpt.pipelock_binary_sha256 = p.pipelock_binary_sha256;
    code.textContent = JSON.stringify(excerpt, null, 2);
    if (label) {
      label.textContent = (p.tool || 'record') + (p.tool_version ? ' v' + p.tool_version : '')
        + (data && data.verified ? ' \u00b7 digest-checked record' : ' \u00b7 benchmark record');
    }
  }

  function esc(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s)));
    return d.innerHTML;
  }
})();
