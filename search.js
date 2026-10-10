(function () {
  'use strict';

  var MAX_RESULTS = 6;

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  function formatPrice(price) {
    var numeric = Number(price);
    if (!isFinite(numeric)) return '';
    try {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(numeric);
    } catch (error) {
      return numeric + ' €';
    }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function init() {
    var panel = document.getElementById('header-search-panel');
    var input = panel ? panel.querySelector('input[type="search"]') : null;
    var resultsBox = document.getElementById('search-results');
    if (!panel || !input || !resultsBox) return;

    var products = [];
    var loaded = false;
    var loadingPromise = null;

    // Pulls the live catalog straight from /api/products (same endpoint
    // every product listing page uses) instead of any hardcoded list, so
    // a product added in admin shows up in search without any extra wiring.
    function loadProducts() {
      if (loadingPromise) return loadingPromise;
      loadingPromise = fetch('/api/products')
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (data) {
          products = Array.isArray(data) ? data : [];
          loaded = true;
        })
        .catch(function () {});
      return loadingPromise;
    }

    function renderResults(query) {
      var q = normalize(query);
      if (!q) {
        resultsBox.hidden = true;
        resultsBox.innerHTML = '';
        return;
      }

      var matches = products.filter(function (product) {
        return normalize(product.name).indexOf(q) !== -1;
      }).slice(0, MAX_RESULTS);

      if (!matches.length) {
        resultsBox.innerHTML = '<p class="search-results-empty">Aucun produit trouvé.</p>';
        resultsBox.hidden = false;
        return;
      }

      resultsBox.innerHTML = matches.map(function (product) {
        var img = product.image_url || product.img || '';
        var price = formatPrice(product.price);
        var name = escapeHtml(product.name || '');
        var imgMarkup = img
          ? '<img src="' + escapeHtml(img) + '" alt="" loading="lazy">'
          : '<span class="search-result-noimg"></span>';
        return '<a class="search-result-item" href="detail-produit.html?id=' + encodeURIComponent(product.id) + '">'
          + imgMarkup
          + '<span class="search-result-meta"><span class="search-result-name">' + name + '</span><span class="search-result-price">' + price + '</span></span>'
          + '</a>';
      }).join('');
      resultsBox.hidden = false;
    }

    // Proactive: starts loading on first focus (before typing), so results
    // for the first keystroke don't have to wait for the fetch to begin.
    input.addEventListener('focus', function () {
      if (!loaded) loadProducts();
    });

    input.addEventListener('input', function () {
      if (!loaded) {
        loadProducts().then(function () { renderResults(input.value); });
        return;
      }
      renderResults(input.value);
    });

    panel.addEventListener('submit', function (event) {
      event.preventDefault();
    });

    // Dims the page behind the full-width search bar while it's open.
    // Watches .search-panel's own class instead of hooking the
    // open/close logic each page already has inline, so this works
    // without touching that per-page script.
    var overlay = document.getElementById('search-overlay');
    var trigger = document.getElementById('search-trigger');
    if (overlay) {
      var syncOverlay = function () {
        overlay.classList.toggle('open', panel.classList.contains('open'));
      };
      new MutationObserver(syncOverlay).observe(panel, { attributes: true, attributeFilter: ['class'] });
      syncOverlay();

      overlay.addEventListener('click', function () {
        panel.classList.remove('open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
