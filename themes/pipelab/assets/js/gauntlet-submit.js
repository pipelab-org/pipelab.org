(function() {
  var btn = document.getElementById('submit-btn');
  var status = document.getElementById('submit-status');
  var input = document.getElementById('json-input');

  btn.addEventListener('click', function() {
    status.textContent = '';
    var text = input.value.trim();
    if (!text) { status.textContent = 'Please paste JSON first.'; return; }

    var payload;
    try { payload = JSON.parse(text); } catch(e) {
      status.textContent = 'Invalid JSON: ' + e.message;
      return;
    }

    var tokenInput = document.querySelector('input[name="cf-turnstile-response"]');
    var token = tokenInput ? tokenInput.value : '';
    if (!token) {
      status.textContent = 'Please complete the bot check first.';
      return;
    }

    btn.disabled = true;
    status.textContent = 'Submitting...';

    fetch('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: payload,
        public: document.getElementById('public-check').checked,
        'cf-turnstile-response': token
      })
    })
    .then(function(res) {
      if (!res.ok) return res.json().then(function(d) { throw new Error(d.error || 'Request failed'); });
      return res.json();
    })
    .then(function(data) {
      window.location.href = data.url;
    })
    .catch(function(err) {
      status.textContent = 'Error: ' + err.message;
      if (window.turnstile) { try { window.turnstile.reset(); } catch (_) {} }
      btn.disabled = false;
    });
  });
})();
