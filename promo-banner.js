(function () {
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-promo-info]');
    const tooltip = document.getElementById('promo-banner-tooltip');
    if (trigger) {
      event.preventDefault();
      if (tooltip) tooltip.hidden = !tooltip.hidden;
      return;
    }
    if (tooltip && !tooltip.hidden && !tooltip.contains(event.target)) {
      tooltip.hidden = true;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const tooltip = document.getElementById('promo-banner-tooltip');
    if (tooltip) tooltip.hidden = true;
  });
})();
