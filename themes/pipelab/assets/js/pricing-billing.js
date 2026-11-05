(function () {
  'use strict';

  // Monthly/Annual toggle. Updates price + period text on the Founding card
  // (the only paid tier whose annual presentation differs). Uses aria-pressed
  // for the segmented control semantics, not role="tablist".
  var btns = document.querySelectorAll('[data-billing-toggle] [data-bill]');
  var amount = document.querySelector('[data-price-amount]');
  var period = document.querySelector('[data-price-period]');
  var strike = document.querySelector('[data-strike-monthly]');
  var detail = document.querySelector('[data-tier-period-detail]');
  if (!btns.length) return;

  function setBilling(mode) {
    var isAnnual = mode === 'annual';
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].dataset.bill === mode;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (amount) amount.textContent = isAnnual ? '490' : '49';
    if (period) period.textContent = isAnnual ? '/yr' : '/mo';
    if (strike) strike.textContent = isAnnual ? strike.dataset.strikeAnnual : strike.dataset.strikeMonthly;
    if (detail) detail.textContent = isAnnual ? detail.dataset.periodAnnual : detail.dataset.periodMonthly;
  }

  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function (e) {
      setBilling(e.currentTarget.dataset.bill);
    });
  }
})();
