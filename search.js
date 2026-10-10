(function () {
  'use strict';

  var MAX_RESULTS = 8;
  var SIZE_VALUES = ['34', '36', '38', '40', '42', '44'];

  var PAGES = [
    { label: 'Nouveautés', href: 'nouveautes.html' },
    { label: 'Collections', href: 'collection.html' },
    { label: 'Collaborations', href: 'collaborations.html' },
    { label: 'Accessoires', href: 'accessoires.html' },
    { label: 'Défilé', href: 'defile.html' },
    { label: 'Univers', href: 'univers.html' }
  ];

  var CATEGORIES = [
    { label: 'Robes', slug: 'robes' },
    { label: 'Tops', slug: 'tops' },
    { label: 'Jupes', slug: 'jupes' },
    { label: 'Pantalons', slug: 'pantalons' },
    { label: 'Vestes', slug: 'vestes' },
    { label: 'Accessoires', slug: 'accessoires' }
  ];

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

  // Classic edit distance - lets a query with a typo or two still match
  // ("pantalom" -> "pantalons", "robe" -> "robes").
  function levenshtein(a, b) {
    var al = a.length, bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    var matrix = [];
    var i, j;
    for (i = 0; i <= bl; i++) matrix[i] = [i];
    for (j = 0; j <= al; j++) matrix[0][j] = j;
    for (i = 1; i <= bl; i++) {
      for (j = 1; j <= al; j++) {
        matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
    return matrix[bl][al];
  }

  // 0 = exact/substring match (best), 1+ = edit distance of the closest
  // word, Infinity = no match at all. Lower is better, used to rank and
  // cap how many typo'd results are allowed through.
  function matchScore(text, normQuery) {
    var normText = normalize(text);
    if (!normQuery) return Infinity;
    if (normText.indexOf(normQuery) !== -1) return 0;
    var threshold = normQuery.length <= 4 ? 1 : 2;
    var words = normText.split(/\s+/);
    var best = Infinity;
    for (var i = 0; i < words.length; i++) {
      if (Math.abs(words[i].length - normQuery.length) > threshold + 1) continue;
      var d = levenshtein(words[i], normQuery);
      if (d < best) best = d;
    }
    return best <= threshold ? best + 1 : Infinity;
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

    function productResultHtml(product) {
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
    }

    // Pages/categories/sizes render the same way as a product result (icon
    // + name + subtitle) so they're just as directly clickable, with the
    // subtitle explaining what clicking does instead of a price.
    function shortcutResultHtml(href, label, subtitle) {
      return '<a class="search-result-item" href="' + escapeHtml(href) + '">'
        + '<span class="search-result-noimg search-result-shortcut-icon"></span>'
        + '<span class="search-result-meta"><span class="search-result-name">' + escapeHtml(label) + '</span><span class="search-result-price">' + escapeHtml(subtitle) + '</span></span>'
        + '</a>';
    }

    function renderResults(query) {
      var rawQuery = String(query || '').trim();
      var q = normalize(rawQuery);
      if (!q) {
        resultsBox.hidden = true;
        resultsBox.innerHTML = '';
        return;
      }

      var pageMatches = PAGES
        .map(function (page) { return { page: page, score: matchScore(page.label, q) }; })
        .filter(function (m) { return m.score !== Infinity; })
        .sort(function (a, b) { return a.score - b.score; })
        .slice(0, 2)
        .map(function (m) {
          return shortcutResultHtml(m.page.href, m.page.label, 'Voir la page');
        });

      var categoryMatches = CATEGORIES
        .map(function (cat) { return { cat: cat, score: matchScore(cat.label, q) }; })
        .filter(function (m) { return m.score !== Infinity; })
        .sort(function (a, b) { return a.score - b.score; })
        .slice(0, 2)
        .map(function (m) {
          return shortcutResultHtml('collection.html?category=' + encodeURIComponent(m.cat.slug), m.cat.label, 'Voir tous les produits');
        });

      // Bare size ("36") or "taille 36" both work.
      var sizeQueryDigits = q.replace(/^taille\s*/, '');
      var sizeMatches = SIZE_VALUES.indexOf(sizeQueryDigits) !== -1
        ? [shortcutResultHtml('collection.html?taille=' + encodeURIComponent(sizeQueryDigits), 'Taille ' + sizeQueryDigits, 'Voir tous les produits')]
        : [];

      var shortcutCount = pageMatches.length + categoryMatches.length + sizeMatches.length;
      var productSlots = Math.max(1, MAX_RESULTS - shortcutCount);

      var productMatches = products
        .map(function (product) { return { product: product, score: matchScore(product.name, q) }; })
        .filter(function (m) { return m.score !== Infinity; })
        .sort(function (a, b) { return a.score - b.score; })
        .slice(0, productSlots)
        .map(function (m) { return productResultHtml(m.product); });

      var allHtml = pageMatches.concat(categoryMatches, sizeMatches, productMatches);

      if (!allHtml.length) {
        resultsBox.innerHTML = '<p class="search-results-empty">Aucun résultat trouvé.</p>';
        resultsBox.hidden = false;
        return;
      }

      resultsBox.innerHTML = allHtml.join('');
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
