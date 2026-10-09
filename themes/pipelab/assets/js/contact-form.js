(() => {
  'use strict';

  const form = document.getElementById('contact-form');
  if (!form) return;

  const panel = document.getElementById('contact-form-status-panel');
  const panelMessage = document.getElementById('contact-form-status-msg');
  const inlineError = document.getElementById('contact-form-inline-error');
  const submit = document.getElementById('contact-form-submit');
  const submitLabel = submit ? submit.querySelector('.contact-form-submit-label') : null;
  const originalLabel = submitLabel ? submitLabel.textContent : 'Send message';
  const messageInput = document.getElementById('contact-message');
  const counter = document.getElementById('contact-form-charcount');
  const maxMessageLength = 4000;

  if (messageInput && counter) {
    messageInput.addEventListener('input', () => {
      const length = messageInput.value.length;
      counter.textContent = `${length.toLocaleString()} / ${maxMessageLength.toLocaleString()}`;
      counter.classList.toggle('contact-form-charcount-over', length > maxMessageLength);
    });
  }

  const setFieldError = (input, enabled) => {
    const field = input.closest('.contact-form-field');
    if (field) field.classList.toggle('contact-form-field-has-error', Boolean(enabled));
  };

  const setInlineError = (message) => {
    if (!inlineError) return;
    inlineError.textContent = message || '';
    inlineError.classList.toggle('contact-form-inline-error-visible', Boolean(message));
  };

  const setSubmitting = (submitting) => {
    if (submit) submit.disabled = submitting;
    if (submitLabel) submitLabel.textContent = submitting ? 'Sending...' : originalLabel;
  };

  const resetTurnstile = () => {
    if (!window.turnstile) return;
    try {
      window.turnstile.reset();
    } catch (_) {}
  };

  ['contact-name', 'contact-email', 'contact-reason', 'contact-message'].forEach((id) => {
    const field = document.getElementById(id);
    if (!field) return;
    const clearError = () => setFieldError(field, false);
    field.addEventListener('input', clearError);
    field.addEventListener('change', clearError);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setInlineError('');

    const name = document.getElementById('contact-name');
    const email = document.getElementById('contact-email');
    const reason = document.getElementById('contact-reason');
    const message = document.getElementById('contact-message');
    let valid = true;

    if (!name.value.trim()) {
      setFieldError(name, true);
      valid = false;
    }
    if (!email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      setFieldError(email, true);
      valid = false;
    }
    if (!reason.value) {
      setFieldError(reason, true);
      valid = false;
    }
    if (!message.value.trim() || message.value.length > maxMessageLength) {
      setFieldError(message, true);
      valid = false;
    }
    if (!valid) return;

    const tokenInput = form.querySelector('input[name="cf-turnstile-response"]');
    const token = tokenInput ? tokenInput.value : '';
    if (!token) {
      setInlineError('Please complete the bot check first.');
      return;
    }

    const payload = {
      name: name.value,
      email: email.value,
      reason: reason.value,
      message: message.value,
      website: (form.elements.website && form.elements.website.value) || '',
      'cf-turnstile-response': token,
    };

    setSubmitting(true);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        panelMessage.textContent = "Message received. We'll be in touch.";
        form.hidden = true;
        panel.hidden = false;
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      resetTurnstile();
      let responseBody = null;
      try {
        responseBody = await response.json();
      } catch (_) {}
      const responseError = responseBody && typeof responseBody === 'object' && typeof responseBody.error === 'string'
        ? responseBody.error
        : 'Something went wrong. Email luckypipe@pipelab.org instead.';
      setInlineError(responseError);
    } catch (_) {
      setInlineError('Network error. Email luckypipe@pipelab.org instead.');
    } finally {
      setSubmitting(false);
    }
  });
})();
