(function () {
  'use strict';

  var MAX_RESULTS = 10;
  var SIZE_VALUES = ['34', '36', '38', '40', '42', '44'];
  var NUMERIC_SIZE_ORDER = SIZE_VALUES;


  // Same labels as the product card badges (index.html/products-page.js) -
  // lets a query like "collections" or "printemps" surface the actual
  // products that belong to it, tagged with which one matched instead of
  // just a generic price, so it's clear why that product showed up.
  var SEASON_SLUG_TO_TOKEN = {
    'printemps-ete-2026': 'ss26',
    'automne-hiver-2026': 'aw26',
    'capsules-limitees': 'capsules'
  };
  var SEASON_LABELS = {
    ss26: 'Printemps–Été 2026',
    aw26: 'Automne–Hiver 2026',
    capsules: 'Capsules limitées'
  };
  var NOUVEAUTE_LABELS = {
    drop: 'New',
    'pieces-signature': 'Pièces signature',
    exclusivites: 'Exclusivités',
    'editions-limitees': 'Éditions limitées'
  };
  var COLLAB_SLUG_TO_TOKEN = {
    'jaces-x-maureen-di-carlo': 'maureen-di-carlo',
    'jaces-x-from-future': 'from-future',
    'jaces-x-hoka': 'hoka',
    'jaces-x-mamy-grand': 'mamy-grand'
  };
  var COLLAB_LABELS = {
    'maureen-di-carlo': 'JACES × Maureen Di Carlo',
    'from-future': 'JACES × From Future',
    hoka: 'JACES × Hoka',
    'mamy-grand': 'JACES × Mamy Grand'
  };

  function getProductLabels(product) {
    var labels = [];
    var tags = Array.isArray(product.nouveauteTags) ? product.nouveauteTags : [];
    tags.forEach(function (tag) { if (NOUVEAUTE_LABELS[tag]) labels.push(NOUVEAUTE_LABELS[tag]); });

    var filterTokens = Array.isArray(product.filter_tokens) ? product.filter_tokens : [];
    var seasonToken = filterTokens.map(function (t) { return SEASON_SLUG_TO_TOKEN[t]; }).filter(Boolean)[0];
    if (seasonToken && SEASON_LABELS[seasonToken]) labels.push(SEASON_LABELS[seasonToken]);

    var collabSlugs = (product.filter_menus && Array.isArray(product.filter_menus.collaborations))
      ? product.filter_menus.collaborations.map(function (f) { return f && f.slug; }).filter(Boolean)
      : [];
    var collabToken = collabSlugs.map(function (s) { return COLLAB_SLUG_TO_TOKEN[s]; }).filter(Boolean)[0];
    if (collabToken && COLLAB_LABELS[collabToken]) labels.push(COLLAB_LABELS[collabToken]);

    return labels;
  }

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

    // Same card markup/classes as the homepage's "EN CE MOMENT" carousel
    // (buildHomeSliderCard in index.html) - reuses all its existing CSS
    // (hover image swap, size chips on hover) and the product badge
    // (New/season/collab) for free, instead of the plain list row.
    function productCardHtml(product, matchedLabel) {
      var images = Array.isArray(product.images) ? product.images : [];
      var primarySrc = (images[0] && images[0].url) || product.image_url || product.img || '';
      var secondarySrc = (images[1] && images[1].url) || product.hover_image_url || primarySrc;
      var badgeLabel = matchedLabel || getProductLabels(product)[0] || '';
      var sizes = (Array.isArray(product.sizes) ? product.sizes : []).map(function (s) { return String(s || '').trim(); }).filter(Boolean);
      var isNumericSizeSubset = sizes.length > 0 && sizes.every(function (s) { return NUMERIC_SIZE_ORDER.indexOf(s) !== -1; });
      var displaySizes = isNumericSizeSubset ? NUMERIC_SIZE_ORDER : sizes;
      var quickBuyMarkup = displaySizes.length
        ? '<div class="quick-buy-grid">' + displaySizes.map(function (size) {
          var isAvailable = sizes.indexOf(size) !== -1;
          return '<button type="button" class="' + (isAvailable ? '' : 'is-disabled') + '">' + escapeHtml(size) + '</button>';
        }).join('') + '</div>'
        : '';

      return '<article class="home-slider-card search-product-card">'
        + '<a class="home-slider-media" href="detail-produit.html?id=' + encodeURIComponent(product.id || '') + '" aria-label="Voir ' + escapeHtml(product.name || 'ce produit') + '">'
        + (badgeLabel ? '<span class="product-card-badge">' + escapeHtml(badgeLabel) + '</span>' : '')
        + (primarySrc ? '<img class="home-slider-image-primary" src="' + escapeHtml(primarySrc) + '" alt="' + escapeHtml(product.name || 'Produit JACES') + '" loading="lazy">' : '')
        + (secondarySrc ? '<img class="home-slider-image-secondary" src="' + escapeHtml(secondarySrc) + '" alt="" loading="lazy">' : '')
        + (quickBuyMarkup ? '<div class="hover-sizes" aria-hidden="true">' + quickBuyMarkup + '</div>' : '')
        + '</a>'
        + '<div class="home-slider-meta"><h3>' + escapeHtml(product.name || 'Produit JACES') + '</h3><p>' + formatPrice(product.price) + '</p></div>'
        + '</article>';
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

    // Zero results is a demand signal worth capturing rather than a dead
    // end: lets a signed-in customer ask to be alerted if this ever
    // becomes a real product, which shows up in admin so there's a
    // reason to actually make it. Requires an account (not just an
    // email) so the "qui le voulait" question has a real answer.
    function submitSearchAlert(query, session) {
      var auth = window.JacesAuth;
      var getUserId = (auth && auth.supabase && auth.supabase.auth && auth.supabase.auth.getUser)
        ? auth.supabase.auth.getUser().then(function (r) { return r.data && r.data.user ? r.data.user.id : ''; }).catch(function () { return ''; })
        : Promise.resolve('');

      return getUserId.then(function (userId) {
        return fetch('/api/search-alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: query,
            email: session.email || '',
            firstName: session.firstName || '',
            userId: userId
          })
        });
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }

    function renderNoResults(query) {
      resultsBox.innerHTML = '<div class="search-results-empty">'
        + '<p class="search-results-empty-text">Aucun résultat pour « ' + escapeHtml(query) + ' ».</p>'
        + '<button type="button" class="search-alert-btn" data-query="' + escapeHtml(query) + '">S\'inscrire à l\'alerte</button>'
        + '</div>';

      var btn = resultsBox.querySelector('.search-alert-btn');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var q = btn.dataset.query;
        var auth = window.JacesAuth;
        if (!auth || typeof auth.requireAuth !== 'function') return;

        auth.requireAuth({
          button: btn,
          onAuthenticated: function (session) {
            btn.disabled = true;
            btn.textContent = 'Un instant…';
            submitSearchAlert(q, session || {}).then(function (ok) {
              if (ok) {
                resultsBox.querySelector('.search-results-empty').innerHTML =
                  '<p class="search-results-empty-text">C\'est noté ! On vous préviendra si « ' + escapeHtml(q) + ' » arrive chez JACES.</p>';
              } else {
                btn.disabled = false;
                btn.textContent = 'Réessayer';
              }
            });
          }
        });
      });
    }

    function renderResults(query) {
      var rawQuery = String(query || '').trim();
      var q = normalize(rawQuery);
      if (!q) {
        resultsBox.hidden = true;
        resultsBox.innerHTML = '';
        return;
      }

      var allProductMatches = products
        .map(function (product) {
          var nameScore = matchScore(product.name, q);
          var bestLabel = null;
          var labelScore = Infinity;
          getProductLabels(product).forEach(function (label) {
            var s = matchScore(label, q);
            if (s < labelScore) { labelScore = s; bestLabel = label; }
          });
          // Name match wins if it's at least as good - the label is only
          // shown (and only what makes the product show up at all) when
          // it matched better than (or instead of) the name.
          var matchedLabel = labelScore < nameScore ? bestLabel : null;
          return { product: product, score: Math.min(nameScore, labelScore), matchedLabel: matchedLabel };
        })
        .filter(function (m) { return m.score !== Infinity; })
        .sort(function (a, b) { return a.score - b.score; });

      var productCount = allProductMatches.length;

      if (!productCount) {
        renderNoResults(rawQuery);
        resultsBox.hidden = false;
        return;
      }

      var shown = allProductMatches.slice(0, MAX_RESULTS);
      var cardsHtml = shown.map(function (m) { return productCardHtml(m.product, m.matchedLabel); }).join('');
      // Only a real "see the rest" link once there are more matches than
      // fit in the row - otherwise every product shown is already all
      // of them, so a trailing card would be redundant.
      var viewAllHtml = productCount > shown.length
        ? '<a class="search-product-card search-product-viewall" href="produits.html"><span>Tout voir<br><strong>(' + productCount + ')</strong></span></a>'
        : '';

      resultsBox.innerHTML = '<div class="search-products-header"><span>Produits (' + productCount + ')</span></div>'
        + '<div class="search-products-track">' + cardsHtml + viewAllHtml + '</div>';
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
