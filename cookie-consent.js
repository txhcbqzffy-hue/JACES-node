(function () {
  const STORAGE_KEY = 'jaces-cookie-consent';
  const GA_MEASUREMENT_ID = 'G-Z2K1QHLX8S';

  let gaLoaded = false;

  function loadGoogleAnalytics() {
    if (gaLoaded) return;
    gaLoaded = true;

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });
  }

  function readConsent() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeConsent(consent) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    } catch (error) {
      // Ignore storage failures - the banner will just reappear next visit.
    }
  }

  const listeners = [];

  function notify(consent) {
    if (consent.analytics) loadGoogleAnalytics();
    listeners.forEach((callback) => {
      try { callback(consent); } catch (error) { /* one bad listener shouldn't break the rest */ }
    });
  }

  window.JacesConsent = {
    get: readConsent,
    onChange(callback) {
      if (typeof callback === 'function') listeners.push(callback);
    },
    openPreferences() {
      openPanel();
    }
  };

  let overlay;
  let banner;
  let panel;

  function buildBanner() {
    banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Gestion des cookies');
    banner.innerHTML = [
      '<div class="cookie-banner-inner">',
      '  <p class="cookie-banner-text">JACES est une toute jeune marque, et ces quelques cookies nous aident à grandir. Vous choisissez, et pouvez changer d’avis quand vous voulez. <a href="politique-confidentialite.html">En savoir plus</a>.</p>',
      '  <div class="cookie-banner-actions">',
      '    <button type="button" class="cookie-btn cookie-btn-ghost" data-cookie-customize>Personnaliser</button>',
      '    <button type="button" class="cookie-btn cookie-btn-outline" data-cookie-reject>Tout refuser</button>',
      '    <button type="button" class="cookie-btn cookie-btn-solid" data-cookie-accept>Tout accepter</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(banner);
  }

  function buildPanel() {
    overlay = document.createElement('div');
    overlay.className = 'cookie-overlay';
    overlay.hidden = true;
    overlay.innerHTML = [
      '<div class="cookie-panel" role="dialog" aria-modal="true" aria-labelledby="cookie-panel-title">',
      '  <button type="button" class="cookie-panel-close" data-cookie-close aria-label="Fermer">×</button>',
      '  <h2 id="cookie-panel-title">Préférences de cookies</h2>',
      '  <p class="cookie-panel-intro">Rien de compliqué : vous choisissez ce qui vous va, et rien de plus. Vous pourrez toujours revenir ici depuis "Gérer les cookies" en bas de page.</p>',
      '  <div class="cookie-category">',
      '    <div class="cookie-category-head">',
      '      <span class="cookie-category-title">Nécessaires</span>',
      '      <label class="cookie-toggle cookie-toggle-locked"><input type="checkbox" checked disabled><span class="cookie-toggle-track"></span></label>',
      '    </div>',
      '    <p class="cookie-category-desc">Ce sont eux qui gardent votre panier rempli d’une page à l’autre, vous laissent connecté(e) à votre compte et protègent le site. Sans eux, JACES ne fonctionne tout simplement pas - donc ceux-là restent toujours actifs.</p>',
      '  </div>',
      '  <div class="cookie-category">',
      '    <div class="cookie-category-head">',
      '      <span class="cookie-category-title">Analyse d’audience</span>',
      '      <label class="cookie-toggle"><input type="checkbox" data-cookie-toggle="analytics"><span class="cookie-toggle-track"></span></label>',
      '    </div>',
      '    <p class="cookie-category-desc">Ils nous montrent quelles pages et quelles pièces vous plaisent vraiment, pour qu’on arrête de deviner et qu’on améliore le site pour de bon.</p>',
      '  </div>',
      '  <div class="cookie-category">',
      '    <div class="cookie-category-head">',
      '      <span class="cookie-category-title">Marketing</span>',
      '      <label class="cookie-toggle"><input type="checkbox" data-cookie-toggle="marketing"><span class="cookie-toggle-track"></span></label>',
      '    </div>',
      '    <p class="cookie-category-desc">Ils nous permettent de vous montrer nos nouveautés et offres qui correspondent vraiment à vos goûts, ici et ailleurs sur le web, au lieu de publicités qui ne vous parlent pas.</p>',
      '  </div>',
      '  <div class="cookie-panel-actions">',
      '    <button type="button" class="cookie-btn cookie-btn-outline" data-cookie-reject>Tout refuser</button>',
      '    <button type="button" class="cookie-btn cookie-btn-solid" data-cookie-save>Enregistrer mes choix</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);
    panel = overlay.querySelector('.cookie-panel');
  }

  function closePanel() {
    overlay.hidden = true;
  }

  function openPanel() {
    const current = readConsent();
    const analyticsInput = overlay.querySelector('[data-cookie-toggle="analytics"]');
    const marketingInput = overlay.querySelector('[data-cookie-toggle="marketing"]');
    analyticsInput.checked = Boolean(current && current.analytics);
    marketingInput.checked = Boolean(current && current.marketing);
    overlay.hidden = false;
    if (banner) banner.hidden = true;
  }

  function applyConsent(consent) {
    const stored = { ...consent, timestamp: Date.now() };
    writeConsent(stored);
    if (banner) banner.hidden = true;
    if (overlay) overlay.hidden = true;
    notify(stored);

    // Anonymous compliance record (no IP, no identifier) that the consent
    // flow was actually presented and what was chosen - best effort, never
    // blocks the UI if it fails.
    fetch('/api/cookie-consent-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analytics: consent.analytics, marketing: consent.marketing })
    }).catch(() => {});
  }

  function init() {
    buildBanner();
    buildPanel();

    const existing = readConsent();
    if (existing) {
      banner.hidden = true;
      notify(existing);
    }

    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-cookie-accept]')) {
        applyConsent({ necessary: true, analytics: true, marketing: true });
        return;
      }
      if (event.target.closest('[data-cookie-reject]')) {
        applyConsent({ necessary: true, analytics: false, marketing: false });
        return;
      }
      if (event.target.closest('[data-cookie-customize]')) {
        openPanel();
        return;
      }
      if (event.target.closest('[data-cookie-save]')) {
        applyConsent({
          necessary: true,
          analytics: overlay.querySelector('[data-cookie-toggle="analytics"]').checked,
          marketing: overlay.querySelector('[data-cookie-toggle="marketing"]').checked
        });
        return;
      }
      if (event.target.closest('[data-cookie-close]')) {
        closePanel();
        if (!readConsent() && banner) banner.hidden = false;
        return;
      }
      if (event.target.closest('[data-open-cookie-preferences]')) {
        event.preventDefault();
        openPanel();
        return;
      }
      if (event.target === overlay) {
        closePanel();
        if (!readConsent() && banner) banner.hidden = false;
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && overlay && !overlay.hidden) {
        closePanel();
        if (!readConsent() && banner) banner.hidden = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
