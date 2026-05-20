(function () {
  'use strict';

  var STORAGE_KEY = 'jaces_admin_products_v1';
  var STORAGE_BACKUP_KEY = 'jaces_admin_products_v1_backup';
  var PAGE_TYPE_MAP = {
    'nouveautes.html': 'nouveautes',
    'collection.html': 'collection',
    'collaborations.html': 'collaboration',
    'accessoires.html': 'accessoires'
  };
  var SIZE_OPTIONS = ['34', '36', '38', '40', '42', '44'];
  var NOUVEAUTES_CATEGORIES = ['robes', 'tops', 'jupes', 'pantalons', 'vestes', 'accessoires'];
  var COLLECTION_CATEGORIES = ['robes', 'tops', 'jupes', 'pantalons', 'vestes', 'accessoires'];
  var NOUVEAUTES_LABEL_OPTIONS = [
    { value: 'drop-ete', label: 'Drop été' },
    { value: 'edition-limitee', label: 'Édition limitée' },
    { value: 'pieces-signature', label: 'Pièces signature' }
  ];
  var ACCESSOIRES_CATEGORIES = ['sacs', 'bijoux', 'ceintures', 'foulards'];
  var COLLABORATION_CATEGORIES = ['nike', 'chloe', 'jacquemus', 'dior', 'saint-laurent'];
  var COLOR_OPTIONS = [
    { value: 'noir', label: 'Noir' },
    { value: 'bleu', label: 'Bleu' },
    { value: 'blanc', label: 'Blanc' },
    { value: 'rose', label: 'Rose' },
    { value: 'vert', label: 'Vert' },
    { value: 'jaune', label: 'Jaune' },
    { value: 'orange', label: 'Orange' },
    { value: 'marron', label: 'Marron' },
    { value: 'beige', label: 'Beige' },
    { value: 'gris', label: 'Gris' },
    { value: 'violet', label: 'Violet' },
    { value: 'argent', label: 'Argent' },
    { value: 'or', label: 'Or' },
    { value: 'bronze', label: 'Bronze' }
  ];
  var SECRET_SEQUENCE = 'adminjaces';
  var DEFAULT_ADMIN_REVIEWS = [
    { text: '', rating: 5 }
  ];
  var DEFAULT_IMAGE_CAPTION_SUGGESTIONS = [
    'Julie mesure 1m77 et porte une taille 40.',
    'Le mannequin mesure 1m77 et porte une taille 40.',
    'Coupe ajustee, matiere souple et confortable.',
    'Edition limitee, disponible en petite serie.'
  ];

  var state = {
    typed: '',
    isOpen: false,
    products: [],
    editingProductId: null
  };

  function safeParseProducts() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        raw = localStorage.getItem(STORAGE_BACKUP_KEY);
      }
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function saveProducts(products) {
    var serialized = JSON.stringify(products);
    localStorage.setItem(STORAGE_KEY, serialized);
    localStorage.setItem(STORAGE_BACKUP_KEY, serialized);
    window.dispatchEvent(new CustomEvent('jaces:admin-products-sync'));
  }

  function requestPersistentStorage() {
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') {
      return;
    }

    navigator.storage.persisted()
      .then(function (alreadyPersisted) {
        if (alreadyPersisted) return true;
        return navigator.storage.persist();
      })
      .catch(function () {
        return false;
      });
  }

  function syncStorageCopies(products) {
    try {
      var primary = localStorage.getItem(STORAGE_KEY);
      var backup = localStorage.getItem(STORAGE_BACKUP_KEY);
      if ((!primary || !backup) && Array.isArray(products) && products.length) {
        saveProducts(products);
      }
    } catch (err) {
      return;
    }
  }

  function getCurrentPageType() {
    var path = (window.location.pathname || '').split('/').pop();
    return PAGE_TYPE_MAP[path] || null;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseColorTokens(value) {
    return String(value || '')
      .split(',')
      .map(function (item) { return item.trim(); })
      .filter(Boolean)
      .slice(0, 12);
  }

  function colorToCss(token) {
    var normalized = String(token || '').trim().toLowerCase();
    var aliases = {
      noir: '#151515',
      blanc: '#f5f5f2',
      ivoire: '#e9e2d3',
      creme: '#e7dbc8',
      cremee: '#e7dbc8',
      beige: '#cbb79b',
      sable: '#c7b8a2',
      camel: '#b07a48',
      gris: '#8a8a8a',
      graphite: '#4b4b50',
      marine: '#1f2a44',
      bleu: '#2d5da8',
      jaune: '#d8b74f',
      orange: '#c9783a',
      rouge: '#a9262a',
      bordeaux: '#6e2328',
      vert: '#2f6b52',
      marron: '#6b4a2f',
      marrons: '#6b4a2f',
      violet: '#6d5aa8',
      or: '#b08d57',
      bronze: '#9b6a3a',
      argent: '#bcc1c9',
      fgris: '#8a8a8a',
      rose: '#c78a94'
    };

    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) {
      return normalized;
    }
    return aliases[normalized] || '#d1cbc1';
  }

  function normalizeColorOptionValue(token) {
    var raw = String(token || '').trim();
    if (!raw) return '';
    var normalized = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    var aliases = {
      dore: 'or',
      doré: 'or',
      gold: 'or',
      golden: 'or',
      silver: 'argent',
      fgris: 'gris'
    };

    return aliases[normalized] || normalized;
  }

  function normalizePrice(value) {
    var num = Number(value);
    if (!Number.isFinite(num)) return '';
    return num.toFixed(0) + '€';
  }

  function sanitizeSingleLineText(value, maxLength) {
    var normalized = String(value || '').replace(/\s+/g, ' ').trim();
    var limit = Number(maxLength) || 0;
    if (!limit || normalized.length <= limit) return normalized;
    return normalized.slice(0, limit).trim();
  }

  function normalizeImageUrl(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';

    try {
      var parsed = new URL(raw, window.location.href);
      var host = parsed.hostname.toLowerCase();
      var isDropbox = host === 'dropbox.com' || host === 'www.dropbox.com' || host === 'dl.dropbox.com' || host === 'dl.dropboxusercontent.com';

      if (isDropbox) {
        parsed.hostname = 'dl.dropboxusercontent.com';
        parsed.searchParams.delete('dl');
        parsed.searchParams.set('raw', '1');
      }

      return parsed.toString();
    } catch (err) {
      return raw;
    }
  }

  function getPrimaryCategory(product) {
    if (product.type === 'collection' && product.category) {
      return product.category;
    }
    if (product.type === 'nouveautes' && product.category === 'accessoires' && product.accessorySubcategory) {
      return product.accessorySubcategory;
    }
    if (product.type === 'nouveautes' && product.category) {
      return product.category;
    }
    if (product.type === 'accessoires' && product.category) {
      return product.category;
    }
    return 'all';
  }

  function isAccessoriesContext(type, category) {
    return type === 'accessoires'
      || (type === 'nouveautes' && category === 'accessoires')
      || (type === 'collection' && category === 'accessoires');
  }

  function getTypeLabel(type) {
    var labels = {
      nouveautes: 'Nouveaute',
      collection: 'Collection',
      collaboration: 'Collaboration',
      accessoires: 'Accessoires'
    };
    return labels[type] || type;
  }

  function getCollectionSeasonLabel(season) {
    if (season === 'ss26') return 'Printemps-Ete 2026';
    if (season === 'aw26') return 'Automne-Hiver 2026';
    return 'Toutes saisons';
  }

  function getNouveautesLabelLabel(value) {
    var found = NOUVEAUTES_LABEL_OPTIONS.find(function (option) { return option.value === value; });
    return found ? found.label : value;
  }

  function getTypeCategories(type) {
    if (type === 'nouveautes') return NOUVEAUTES_CATEGORIES.slice();
    if (type === 'collection') return COLLECTION_CATEGORIES.slice();
    if (type === 'accessoires') return ACCESSOIRES_CATEGORIES.slice();
    if (type === 'collaboration') return COLLABORATION_CATEGORIES.slice();
    return [];
  }

  function getCategoryNamePrefix(type, category, accessorySubcategory) {
    var normalizedType = String(type || '').toLowerCase();
    var normalizedCategory = String(category || '').toLowerCase();
    var normalizedSubcategory = String(accessorySubcategory || '').toLowerCase();
    var map = {
      robes: 'Robe',
      tops: 'Top',
      jupes: 'Jupe',
      pantalons: 'Pantalon',
      vestes: 'Veste',
      accessoires: 'Accessoire',
      sacs: 'Sac',
      bijoux: 'Bijou',
      ceintures: 'Ceinture',
      foulards: 'Foulard'
    };

    if (normalizedType === 'collection' || normalizedType === 'nouveautes') return '';
    return map[normalizedCategory] || '';
  }

  function ensureCategoryPrefix(name, type, category, accessorySubcategory) {
    var cleanName = String(name || '').trim();
    var prefix = getCategoryNamePrefix(type, category, accessorySubcategory);
    if (!prefix || !cleanName) return cleanName;

    var lowered = cleanName.toLowerCase();
    var loweredPrefix = prefix.toLowerCase();
    if (lowered === loweredPrefix || lowered.indexOf(loweredPrefix + ' ') === 0) {
      return cleanName;
    }
    return prefix + ' ' + cleanName;
  }

  function makeStars(rating) {
    var rounded = Math.round(Math.max(0, Math.min(5, rating)) * 2) / 2;
    var full = Math.floor(rounded);
    var hasHalf = rounded % 1 !== 0;
    var stars = '';
    var i;

    for (i = 0; i < full; i += 1) stars += '★';
    if (hasHalf) stars += '☆';
    while (stars.length < 5) stars += '✩';

    return stars;
  }

  function productMatchesPage(product, pageType) {
    if (!product) return false;
    if (product.type === pageType) return true;
    return pageType === 'accessoires' && product.type === 'nouveautes' && product.category === 'accessoires';
  }

  function createAdminCard(product) {
    var primaryCategory = getPrimaryCategory(product);
    var categoryTokens = ['all'];
    if (product.type === 'nouveautes' && product.category === 'accessoires') {
      categoryTokens.unshift('accessoires');
      if (primaryCategory && primaryCategory !== 'all' && primaryCategory !== 'accessoires') {
        categoryTokens.unshift(primaryCategory);
      }
    } else if (primaryCategory && primaryCategory !== 'all') {
      categoryTokens.unshift(primaryCategory);
    }
    var dataCategory = Array.from(new Set(categoryTokens)).join(' ');
    var primary = normalizeImageUrl(product.images[0]) || 'https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?q=80&w=1400';
    var secondary = normalizeImageUrl(product.images[1]) || primary;
    var tertiary = normalizeImageUrl(product.images[2]) || secondary;
    var quaternary = normalizeImageUrl(product.images[3]) || tertiary;
    var sizeTokens = (product.sizes && product.sizes.length ? product.sizes : ['34', '36', '38', '40'])
      .map(function (size) { return '<span>' + escapeHtml(size) + '</span>'; })
      .join('');
    var showHoverSizes = product.type !== 'accessoires';
    var hoverSizesMarkup = showHoverSizes ? '<div class="hover-sizes" aria-hidden="true">' + sizeTokens + '</div>' : '';

    var article = document.createElement('article');
    article.className = 'product-card collection-card admin-product-card product-card-linkable';
    article.setAttribute('data-category', dataCategory);
    article.setAttribute('data-collection', product.type === 'collection' ? (product.collectionSeason || 'all') : 'all');
    article.setAttribute('data-nouveaute-tags', Array.isArray(product.nouveauteTags) ? product.nouveauteTags.join(' ') : '');
    article.setAttribute('data-size', Array.isArray(product.sizes) ? product.sizes.join(' ') : '');
    article.setAttribute('data-color', Array.isArray(product.colors) ? product.colors.join(' ') : '');
    if (product.type === 'collaboration') {
      var collaborationView = product.collaborationView;
      if (collaborationView !== 'exclusives' && collaborationView !== 'popup' && collaborationView !== 'events' && collaborationView !== 'all') {
        collaborationView = product.collaborationExclusive ? 'exclusives' : 'all';
      }
      article.setAttribute('data-collab-view', 'all ' + collaborationView);
    }
    article.setAttribute('data-admin-id', product.id);
    article.innerHTML = ''
      + '<div class="product-media">'
      + '  <button class="product-favorite" type="button" aria-label="Ajouter aux favoris">'
      + '    <svg class="heart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>'
      + '  </button>'
      + '  <img class="product-image-primary" loading="lazy" src="' + escapeHtml(primary) + '" alt="' + escapeHtml(product.name) + '">'
      + '  <img class="product-image-secondary" loading="lazy" src="' + escapeHtml(secondary) + '" alt="' + escapeHtml(product.name + ' vue 2') + '">'
      +    hoverSizesMarkup
      + '</div>'
      + '<div class="product-info">'
      + '  <h3>' + escapeHtml(product.name) + '</h3>'
      + '  <p class="product-price">' + escapeHtml(normalizePrice(product.price)) + '</p>'
      + '</div>';

    article.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.target.closest('.product-favorite') || event.target.closest('.admin-color-chip') || event.target.closest('.admin-size-chip')) {
        return;
      }
      var name = product.name || '';
      var price = normalizePrice(product.price);
      var url;
      try {
        var contextKey = getCurrentPageType() || product.type;
        if (window.JacesCatalog && typeof window.JacesCatalog.getProductUrl === 'function') {
          url = window.JacesCatalog.getProductUrl({
            id: product.id,
            name: name,
            price: price,
            subtitle: product.subtitle || '',
            img: primary,
            secondaryImg: secondary,
            tertiaryImg: tertiary,
            quaternaryImg: quaternary,
            imageCaption: product.imageCaption || '',
            colors: Array.isArray(product.colors) ? product.colors : [],
            sizes: Array.isArray(product.sizes) ? product.sizes : [],
            selectedColor: Array.isArray(product.colors) && product.colors.length ? product.colors[0] : '',
            selectedSize: Array.isArray(product.sizes) && product.sizes.length ? product.sizes[0] : '',
            ratingValue: product.ratingValue,
            ratingCount: product.ratingCount
          }, contextKey);
        }
      } catch (err) {
        url = null;
      }

      if (!url) {
        url = 'detail-produit.html?id=' + encodeURIComponent(product.id || name.toLowerCase().replace(/\s+/g, '-'))
          + '&name=' + encodeURIComponent(name)
          + '&price=' + encodeURIComponent(price)
          + '&subtitle=' + encodeURIComponent(product.subtitle || '')
          + '&img=' + encodeURIComponent(primary)
          + '&secondaryImg=' + encodeURIComponent(secondary)
          + '&tertiaryImg=' + encodeURIComponent(tertiary)
          + '&quaternaryImg=' + encodeURIComponent(quaternary)
            + '&imageCaption=' + encodeURIComponent(product.imageCaption || '')
          + '&colors=' + encodeURIComponent((Array.isArray(product.colors) ? product.colors : []).join(','))
          + '&sizes=' + encodeURIComponent((Array.isArray(product.sizes) ? product.sizes : []).join(','))
          + '&selectedColor=' + encodeURIComponent(Array.isArray(product.colors) && product.colors.length ? product.colors[0] : '')
          + '&selectedSize=' + encodeURIComponent(Array.isArray(product.sizes) && product.sizes.length ? product.sizes[0] : '')
          + '&ratingValue=' + encodeURIComponent(String(product.ratingValue || ''))
          + '&ratingCount=' + encodeURIComponent(String(product.ratingCount || ''))
          + '&origin=' + encodeURIComponent(getCurrentPageType() || product.type)
          + '&originLabel=' + encodeURIComponent(getCurrentPageType() || product.type)
          + '&originUrl=' + encodeURIComponent((getCurrentPageType() || product.type) + '.html')
          + '&originNav=' + encodeURIComponent(getCurrentPageType() || product.type);
      }
      window.location.href = url;
    });

    return article;
  }

  function renderAdminProductsForCurrentPage() {
    var pageType = getCurrentPageType();
    var grid = document.getElementById('product-grid');
    if (!pageType || !grid) return;

    Array.from(grid.querySelectorAll('.admin-product-card')).forEach(function (card) {
      card.remove();
    });

    var sorted = state.products
      .filter(function (product) { return productMatchesPage(product, pageType); })
      .sort(function (a, b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); });

    if (!sorted.length) return;

    var fragment = document.createDocumentFragment();
    sorted.forEach(function (product) {
      fragment.appendChild(createAdminCard(product));
    });

    grid.insertBefore(fragment, grid.firstChild);

    var countNode = document.querySelector('.filter-count');
    if (countNode) {
      var cards = Array.from(grid.querySelectorAll('.collection-card'));
      var visibleCount = cards.filter(function (card) {
        return !card.classList.contains('hidden') && !card.classList.contains('nouv-feature-card');
      }).length;
      countNode.textContent = visibleCount + ' produits';
    }
  }

  function injectStyles() {
    if (document.getElementById('admin-panel-style')) return;

    var style = document.createElement('style');
    style.id = 'admin-panel-style';
    style.textContent = ''
      + '.admin-secret-fab { position: fixed; right: 16px; bottom: 18px; z-index: 1600; border: 1px solid #171411; background: #171411; color: #f6f1ea; border-radius: 999px; padding: 9px 14px; font: 600 0.66rem Manrope, sans-serif; letter-spacing: 0.09em; text-transform: uppercase; cursor: pointer; opacity: 0; pointer-events: none; transition: opacity .2s ease; }'
      + '.admin-secret-fab.is-visible { opacity: 1; pointer-events: auto; }'
      + '.admin-overlay { position: fixed; inset: 0; z-index: 1700; background: rgba(13, 12, 10, 0.52); display: none; }'
      + '.admin-overlay.is-open { display: block; }'
      + '.admin-panel { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(860px, calc(100vw - 34px)); max-height: calc(100vh - 40px); overflow: auto; background: #f5f1ea; border: 1px solid #d8cfc2; box-shadow: 0 22px 56px rgba(0, 0, 0, 0.25); padding: 20px; color: #1b1a17; }'
      + '.admin-panel h2 { margin: 0 0 8px; font: 600 1.25rem "Playfair Display", serif; letter-spacing: 0.02em; }'
      + '.admin-panel-subtitle { margin: 0 0 18px; font: 500 0.74rem Manrope, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: #595149; }'
      + '.admin-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; }'
      + '.admin-field { display: flex; flex-direction: column; gap: 6px; }'
      + '.admin-field.admin-field-full { grid-column: 1 / -1; }'
      + '.admin-field label { font: 600 0.7rem Manrope, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; }'
      + '.admin-field input, .admin-field select, .admin-field textarea { border: 1px solid #c8bfb3; background: #fffcf7; color: #15120f; font: 500 0.82rem Manrope, sans-serif; padding: 10px 11px; }'
      + '.admin-field textarea { min-height: 84px; resize: vertical; }'
      + '.admin-field-hint { margin: 0; font: 500 0.66rem Manrope, sans-serif; color: #6f675f; letter-spacing: 0.02em; }'
      + '.admin-char-count { font-weight: 700; color: #3b352f; }'
      + '.admin-sizes { display: flex; flex-wrap: wrap; gap: 8px; }'
      + '.admin-size-pill { position: relative; }'
      + '.admin-size-pill input { position: absolute; opacity: 0; pointer-events: none; }'
      + '.admin-size-pill span { display: inline-flex; align-items: center; justify-content: center; min-width: 42px; height: 34px; padding: 0 12px; border: 1px solid #b8afa3; background: #f8f3eb; cursor: pointer; font: 600 0.8rem Manrope, sans-serif; }'
      + '.admin-size-pill input:checked + span { border-color: #171411; background: #171411; color: #f3ede4; }'
      + '.admin-color-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 10px; }'
      + '.admin-color-option { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font: 600 0.74rem Manrope, sans-serif; color: #221d18; }'
      + '.admin-color-option input { margin: 0; width: 14px; height: 14px; }'
      + '.admin-color-dot { width: 14px; height: 14px; border-radius: 50%; border: 1px solid #b9afa3; background: var(--swatch, #d7d1c8); }'
      + '.admin-color-preview { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }'
      + '.admin-preview-chip { width: 22px; height: 22px; border: 1px solid #bcb1a3; border-radius: 50%; background: var(--swatch, #ddd); cursor: pointer; }'
      + '.admin-preview-chip.is-active { box-shadow: 0 0 0 2px #171411 inset; border-color: #171411; }'
      + '.admin-review-preview { margin-top: 6px; font: 500 0.78rem Manrope, sans-serif; color: #2e2822; }'
      + '.admin-reviews-list { display: grid; gap: 8px; }'
      + '.admin-review-row { display: grid; grid-template-columns: 120px minmax(0, 1fr) auto; gap: 8px; align-items: center; }'
      + '.admin-review-stars-select { border: 1px solid #c8bfb3; background: #fffcf7; color: #15120f; font: 600 0.74rem Manrope, sans-serif; padding: 8px 9px; }'
      + '.admin-review-text-input { border: 1px solid #c8bfb3; background: #fffcf7; color: #15120f; font: 500 0.78rem Manrope, sans-serif; padding: 9px 10px; }'
      + '.admin-review-remove { border: 1px solid #b8aea1; background: #f7f1e8; color: #1d1915; padding: 8px 10px; font: 700 0.62rem Manrope, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }'
      + '.admin-review-hint { margin: 4px 0 0; font: 500 0.68rem Manrope, sans-serif; color: #6c645d; }'
      + '.admin-photo-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }'
      + '.admin-photo-list input { width: 100%; }'
      + '.admin-panel-actions { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 16px; }'
      + '.admin-publish-btn { border: 1px solid #1c1915; background: #1c1915; color: #f8f3ea; padding: 10px 16px; font: 600 0.75rem Manrope, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; }'
      + '.admin-secondary-btn { border: 1px solid #b8aea1; background: #f7f1e8; color: #1d1915; padding: 10px 14px; font: 600 0.72rem Manrope, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }'
      + '.admin-secondary-btn[hidden] { display: none !important; }'
      + '.admin-feedback { min-height: 1.2em; font: 600 0.74rem Manrope, sans-serif; color: #8b2a2a; }'
      + '.admin-feedback.is-success { color: #245a33; }'
      + '.admin-manager { margin-top: 22px; border-top: 1px solid #d9d0c4; padding-top: 16px; }'
      + '.admin-manager-title { margin: 0 0 10px; font: 600 0.95rem Manrope, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }'
      + '.admin-manager-controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }'
      + '.admin-manager-controls select { border: 1px solid #c8bfb3; background: #fffcf7; color: #15120f; font: 500 0.78rem Manrope, sans-serif; padding: 9px 10px; }'
      + '.admin-manager-list { display: grid; gap: 8px; max-height: 260px; overflow: auto; padding-right: 4px; }'
      + '.admin-manager-item { border: 1px solid #d8cfc2; background: #fffaf2; padding: 10px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; }'
      + '.admin-manager-name { margin: 0 0 4px; font: 700 0.82rem Manrope, sans-serif; letter-spacing: 0.04em; }'
      + '.admin-manager-meta { margin: 0; font: 500 0.68rem Manrope, sans-serif; color: #595149; letter-spacing: 0.04em; }'
      + '.admin-manager-actions { display: inline-flex; gap: 6px; align-items: center; }'
      + '.admin-mini-btn { border: 1px solid #b8aea1; background: #f7f1e8; color: #1d1915; padding: 6px 8px; font: 700 0.62rem Manrope, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }'
      + '.admin-mini-btn.admin-mini-delete { border-color: #8f3a3a; color: #8f3a3a; background: #fff6f6; }'
      + '.admin-manager-empty { margin: 0; font: 500 0.72rem Manrope, sans-serif; color: #6a625b; }'
      + '.admin-product-card .product-info { align-items: flex-start !important; }'
      + '.admin-subtitle { margin: 2px 0 7px; font: 500 0.71rem Manrope, sans-serif; letter-spacing: 0.05em; text-transform: uppercase; color: #6d655e; }'
      + '.admin-review { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; }'
      + '.admin-review-stars { font-size: 0.75rem; color: #171411; letter-spacing: 0.06em; }'
      + '.admin-review-text { font: 600 0.68rem Manrope, sans-serif; letter-spacing: 0.04em; color: #3f3932; }'
      + '.admin-color-row { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 8px; }'
      + '.admin-color-chip { width: 18px; height: 18px; border: 1px solid #b8afa4; border-radius: 50%; background: var(--swatch, #ddd); cursor: pointer; }'
      + '.admin-color-chip.is-active { box-shadow: 0 0 0 2px #111 inset; border-color: #111; }'
      + '.admin-size-row { display: flex; gap: 6px; flex-wrap: wrap; }'
      + '.admin-size-chip { border: 1px solid #bbb1a5; background: #f6f1e8; color: #201c18; min-width: 36px; padding: 4px 8px; font: 600 0.66rem Manrope, sans-serif; cursor: pointer; }'
      + '.admin-size-chip.is-active { background: #1b1916; color: #f3eee6; border-color: #1b1916; }'
      + '@media (max-width: 860px) {'
      + '  .admin-grid { grid-template-columns: 1fr; }'
      + '  .admin-photo-list { grid-template-columns: 1fr; }'
      + '  .admin-manager-controls { grid-template-columns: 1fr; }'
      + '}';
    document.head.appendChild(style);
  }

  function buildPanel() {
    if (document.getElementById('admin-secret-overlay')) return;

    var overlay = document.createElement('div');
    overlay.className = 'admin-overlay';
    overlay.id = 'admin-secret-overlay';

    var panel = document.createElement('section');
    panel.className = 'admin-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Menu admin secret');
    var colorOptionsMarkup = COLOR_OPTIONS.map(function (color) {
      return '<label class="admin-color-option"><input type="checkbox" value="' + color.value + '"><span class="admin-color-dot" style="--swatch:' + colorToCss(color.value) + '"></span><span>' + color.label + '</span></label>';
    }).join('');
    var sizeOptionsMarkup = SIZE_OPTIONS.map(function (size) {
      return '<label class="admin-size-pill"><input type="checkbox" value="' + size + '"><span>' + size + '</span></label>';
    }).join('');
    var nouveautesLabelOptionsMarkup = NOUVEAUTES_LABEL_OPTIONS.map(function (item) {
      return '<label class="admin-color-option"><input type="checkbox" value="' + item.value + '"><span>' + item.label + '</span></label>';
    }).join('');
    panel.innerHTML = ''
      + '<h2>Menu secret admin</h2>'
      + '<p class="admin-panel-subtitle">Ajout rapide de produit sans modifier le code</p>'
      + '<form id="admin-product-form">'
      + '  <div class="admin-grid">'
      + '    <div class="admin-field">'
      + '      <label for="admin-type">Type</label>'
      + '      <select id="admin-type" required>'
      + '        <option value="">Choisir</option>'
      + '        <option value="nouveautes">Nouveauté</option>'
      + '        <option value="collection">Collection</option>'
      + '        <option value="collaboration">Collaboration</option>'
      + '        <option value="accessoires">Accessoires</option>'
      + '      </select>'
      + '    </div>'
      + '    <div class="admin-field" id="admin-category-field" style="display:none">'
      + '      <label for="admin-category" id="admin-category-label">Catégorie</label>'
      + '      <select id="admin-category"></select>'
      + '    </div>'
      + '    <div class="admin-field" id="admin-accessory-subcategory-field" style="display:none">'
      + '      <label for="admin-accessory-subcategory">Sous-catégorie accessoires</label>'
      + '      <select id="admin-accessory-subcategory">'
      + '        <option value="sacs">Sacs</option>'
      + '        <option value="bijoux">Bijoux</option>'
      + '        <option value="ceintures">Ceintures</option>'
      + '        <option value="foulards">Foulards</option>'
      + '      </select>'
      + '    </div>'
      + '    <div class="admin-field" id="admin-collection-season-field" style="display:none">'
      + '      <label for="admin-collection-season">Saison collection</label>'
      + '      <select id="admin-collection-season">'
      + '        <option value="ss26">Printemps-Été 2026</option>'
      + '        <option value="aw26">Automne-Hiver 2026</option>'
      + '      </select>'
      + '    </div>'
      + '    <div class="admin-field" id="admin-collaboration-exclusive-field" style="display:none">'
      + '      <label for="admin-collaboration-exclusive">Vue collaboration</label>'
      + '      <select id="admin-collaboration-exclusive">'
      + '        <option value="exclusives">Créations exclusives</option>'
      + '        <option value="popup">Pop-up stores</option>'
      + '        <option value="events">Événements</option>'
      + '        <option value="all">Toutes les collaborations</option>'
      + '      </select>'
      + '    </div>'
      + '    <div class="admin-field admin-field-full" id="admin-nouveautes-labels-field" style="display:none">'
      + '      <label>Labels nouveautés</label>'
      + '      <div class="admin-color-options" id="admin-nouveautes-labels">' + nouveautesLabelOptionsMarkup + '</div>'
      + '      <p class="admin-field-hint">Optionnel: aucun, un ou plusieurs labels.</p>'
      + '    </div>'
      + '    <div class="admin-field">'
      + '      <label for="admin-name">Nom produit</label>'
      + '      <input id="admin-name" type="text" required maxlength="120">'
      + '      <p class="admin-field-hint">Maximum 120 caractères · <span id="admin-name-count" class="admin-char-count">0/120</span></p>'
      + '    </div>'
      + '    <div class="admin-field">'
      + '      <label for="admin-price">Prix (€)</label>'
      + '      <input id="admin-price" type="number" min="1" step="1" required>'
      + '    </div>'
      + '    <div class="admin-field admin-field-full">'
      + '      <label for="admin-subtitle">Sous-titre</label>'
      + '      <input id="admin-subtitle" type="text" required maxlength="70">'
      + '      <p class="admin-field-hint">Une seule ligne · maximum 70 caractères · <span id="admin-subtitle-count" class="admin-char-count">0/70</span></p>'
      + '    </div>'
      + '    <div class="admin-field admin-field-full">'
      + '      <label for="admin-image-caption">Texte sur image (1 phrase, optionnel)</label>'
      + '      <input id="admin-image-caption" type="text" maxlength="180" list="admin-image-caption-suggestions" placeholder="Ex: Julie mesure 1m77 et porte une taille 40.">'
      + '      <datalist id="admin-image-caption-suggestions"></datalist>'
      + '      <p class="admin-field-hint">Laisser vide = aucun texte affiche sur l\'image.</p>'
      + '    </div>'
      + '    <div class="admin-field admin-field-full">'
      + '      <label>Couleurs</label>'
      + '      <div class="admin-color-options" id="admin-color-picker">' + colorOptionsMarkup + '</div>'
      + '      <input id="admin-color-hex" type="text" placeholder="Ajout HEX optionnel: #B76E79, #2A5D9F">'
      + '      <div class="admin-color-preview" id="admin-color-preview"></div>'
      + '    </div>'
      + '    <div class="admin-field admin-field-full" id="admin-sizes-field">'
      + '      <label>Tailles disponibles (34 à 44)</label>'
      + '      <div class="admin-sizes" id="admin-sizes">' + sizeOptionsMarkup + '</div>'
      + '    </div>'
      + '    <div class="admin-field">'
      + '      <label for="admin-rating-value">Note / 5</label>'
      + '      <input id="admin-rating-value" type="number" min="0" max="5" step="0.1" value="4.6" required>'
      + '    </div>'
      + '    <div class="admin-field">'
      + '      <label for="admin-rating-count">Nombre d\'avis</label>'
      + '      <input id="admin-rating-count" type="number" min="0" step="1" value="173" required>'
      + '    </div>'
      + '    <div class="admin-field admin-field-full">'
      + '      <div class="admin-review-preview" id="admin-review-preview"></div>'
      + '    </div>'
      + '    <div class="admin-field admin-field-full">'
      + '      <label>Avis clients (texte + étoiles)</label>'
      + '      <div class="admin-reviews-list" id="admin-review-list"></div>'
      + '      <button type="button" class="admin-secondary-btn" id="admin-add-review">Ajouter un avis</button>'
      + '      <p class="admin-review-hint">La note et le nombre d\'avis sont recalculés automatiquement à partir de ces avis.</p>'
      + '    </div>'
      + '    <div class="admin-field admin-field-full">'
      + '      <label>Photos (4 minimum, URLs)</label>'
      + '      <div class="admin-photo-list" id="admin-photo-list"></div>'
      + '      <button type="button" class="admin-secondary-btn" id="admin-add-photo">Ajouter une photo</button>'
      + '    </div>'
      + '  </div>'
      + '  <div class="admin-panel-actions">'
      + '    <button type="button" class="admin-secondary-btn" id="admin-close">Fermer</button>'
      + '    <button type="button" class="admin-secondary-btn" id="admin-cancel-edit" hidden>Annuler modification</button>'
      + '    <button type="submit" class="admin-publish-btn" id="admin-submit-btn">Publier le produit</button>'
      + '  </div>'
      + '  <p class="admin-feedback" id="admin-feedback"></p>'
      + '</form>'
      + '<section class="admin-manager" aria-label="Gestion des produits admin">'
      + '  <h3 class="admin-manager-title">Gestion Produits Admin</h3>'
      + '  <div class="admin-manager-controls">'
      + '    <select id="admin-manager-type">'
      + '      <option value="all">Tous les types</option>'
      + '      <option value="nouveautes">Nouveaute</option>'
      + '      <option value="collection">Collection</option>'
      + '      <option value="collaboration">Collaboration</option>'
      + '      <option value="accessoires">Accessoires</option>'
      + '    </select>'
      + '    <select id="admin-manager-category">'
      + '      <option value="all">Toutes categories</option>'
      + '    </select>'
      + '    <select id="admin-manager-sort">'
      + '      <option value="recent">Plus recents</option>'
      + '      <option value="old">Plus anciens</option>'
      + '      <option value="name">Nom A-Z</option>'
      + '      <option value="price-desc">Prix decroissant</option>'
      + '      <option value="price-asc">Prix croissant</option>'
      + '    </select>'
      + '  </div>'
      + '  <div class="admin-manager-list" id="admin-manager-list"></div>'
      + '</section>';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    var fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'admin-secret-fab';
    fab.id = 'admin-secret-fab';
    fab.textContent = 'Admin';
    document.body.appendChild(fab);

    function getEl(id) {
      return document.getElementById(id);
    }

    function addPhotoInput(value) {
      var photoList = getEl('admin-photo-list');
      if (!photoList) return;
      var input = document.createElement('input');
      input.type = 'url';
      input.placeholder = 'https://...';
      input.value = value || '';
      input.required = false;
      photoList.appendChild(input);
    }

    function addReviewInput(review) {
      var reviewList = getEl('admin-review-list');
      if (!reviewList) return;

      var row = document.createElement('div');
      row.className = 'admin-review-row';
      var starsValue = Number(review && review.rating);
      if (!Number.isFinite(starsValue)) starsValue = 5;
      starsValue = Math.max(1, Math.min(5, Math.round(starsValue)));
      var textValue = String(review && review.text ? review.text : '');

      row.innerHTML = ''
        + '<select class="admin-review-stars-select" aria-label="Nombre d\'étoiles">'
        + '  <option value="5"' + (starsValue === 5 ? ' selected' : '') + '>★★★★★ (5)</option>'
        + '  <option value="4"' + (starsValue === 4 ? ' selected' : '') + '>★★★★☆ (4)</option>'
        + '  <option value="3"' + (starsValue === 3 ? ' selected' : '') + '>★★★☆☆ (3)</option>'
        + '  <option value="2"' + (starsValue === 2 ? ' selected' : '') + '>★★☆☆☆ (2)</option>'
        + '  <option value="1"' + (starsValue === 1 ? ' selected' : '') + '>★☆☆☆☆ (1)</option>'
        + '</select>'
        + '<input class="admin-review-text-input" type="text" maxlength="220" placeholder="Texte de l\'avis" value="' + escapeHtml(textValue) + '">'
        + '<button type="button" class="admin-review-remove">Suppr.</button>';
      reviewList.appendChild(row);
    }

    function getReviewEntries() {
      return Array.from(document.querySelectorAll('#admin-review-list .admin-review-row')).map(function (row) {
        var stars = Number((row.querySelector('.admin-review-stars-select') || {}).value || 0);
        var text = String((row.querySelector('.admin-review-text-input') || {}).value || '').trim();
        return {
          rating: Math.max(1, Math.min(5, Math.round(stars))),
          text: text
        };
      }).filter(function (entry) {
        return !!entry.text;
      });
    }

    function syncRatingFromReviews() {
      var reviews = getReviewEntries();
      if (!reviews.length) {
        updateReviewPreview();
        return;
      }

      var totalStars = reviews.reduce(function (sum, review) { return sum + review.rating; }, 0);
      var average = totalStars / reviews.length;
      var rounded = Math.round(average * 10) / 10;
      getEl('admin-rating-value').value = String(rounded);
      getEl('admin-rating-count').value = String(reviews.length);
      updateReviewPreview();
    }

    function updateReviewPreview() {
      var ratingValue = Number(getEl('admin-rating-value').value || 0);
      var ratingCount = Number(getEl('admin-rating-count').value || 0);
      getEl('admin-review-preview').textContent = makeStars(ratingValue) + ' ' + String(ratingValue).replace('.', ',') + '/5 · ' + ratingCount + ' avis · Avis vérifiés';
    }

    function updateNameSubtitleCounters() {
      var nameInput = getEl('admin-name');
      var subtitleInput = getEl('admin-subtitle');
      var nameCount = getEl('admin-name-count');
      var subtitleCount = getEl('admin-subtitle-count');
      if (nameInput && nameCount) {
        nameCount.textContent = String(nameInput.value.length) + '/120';
      }
      if (subtitleInput && subtitleCount) {
        subtitleCount.textContent = String(subtitleInput.value.length) + '/70';
      }
    }

    function getImageCaptionSuggestions() {
      var defaults = DEFAULT_IMAGE_CAPTION_SUGGESTIONS.slice();
      var existing = state.products
        .map(function (product) { return sanitizeSingleLineText(product.imageCaption || '', 180); })
        .filter(Boolean);
      return Array.from(new Set(defaults.concat(existing))).slice(0, 30);
    }

    function renderImageCaptionSuggestions() {
      var list = getEl('admin-image-caption-suggestions');
      if (!list) return;
      var suggestions = getImageCaptionSuggestions();
      list.innerHTML = suggestions.map(function (text) {
        return '<option value="' + escapeHtml(text) + '"></option>';
      }).join('');
    }

    function updateColorPreview() {
      var checkedColors = Array.from(document.querySelectorAll('#admin-color-picker input:checked')).map(function (input) {
        return input.value;
      });
      var hexColors = parseColorTokens(getEl('admin-color-hex').value);
      var tokens = Array.from(new Set(checkedColors.concat(hexColors)));
      var node = getEl('admin-color-preview');
      node.innerHTML = tokens.map(function (token) {
        return '<button type="button" class="admin-preview-chip" title="' + escapeHtml(token) + '" aria-label="Couleur ' + escapeHtml(token) + '" style="--swatch:' + escapeHtml(colorToCss(token)) + '"></button>';
      }).join('');
    }

    function syncAccessoryVisibility() {
      var type = getEl('admin-type').value;
      var category = getEl('admin-category').value;
      var accessoryMode = isAccessoriesContext(type, category);
      getEl('admin-sizes-field').style.display = accessoryMode ? 'none' : '';
    }

    function applyCategoryPrefixToNameInput() {
      var nameInput = getEl('admin-name');
      if (!nameInput) return;

      var type = getEl('admin-type').value;
      var category = getEl('admin-category').value;
      var accessorySubcategory = getEl('admin-accessory-subcategory').value;
      var nextValue = ensureCategoryPrefix(nameInput.value, type, category, accessorySubcategory);
      nextValue = sanitizeSingleLineText(nextValue, 120);
      if (nextValue && nextValue !== nameInput.value.trim()) {
        nameInput.value = nextValue;
      }
      updateNameSubtitleCounters();
    }

    function syncAccessorySubcategoryVisibility() {
      var type = getEl('admin-type').value;
      var category = getEl('admin-category').value;
      var show = type === 'nouveautes' && category === 'accessoires';
      var field = getEl('admin-accessory-subcategory-field');
      if (!field) return;
      field.style.display = show ? '' : 'none';
    }

    function setCategoryOptions(options, label) {
      var select = getEl('admin-category');
      var labelNode = getEl('admin-category-label');
      if (!select || !labelNode) return;
      labelNode.textContent = label;
      select.innerHTML = options.map(function (value) {
        var text = value.charAt(0).toUpperCase() + value.slice(1);
        return '<option value="' + value + '">' + text + '</option>';
      }).join('');
    }

    function toggleTypeFields() {
      var type = getEl('admin-type').value;
      var isNouveautes = type === 'nouveautes';
      var isAccessoires = type === 'accessoires';
      var isCollaboration = type === 'collaboration';
      var isCollection = type === 'collection';
      var isNouveautesLabels = type === 'nouveautes';
      var showCategory = isNouveautes || isAccessoires || isCollaboration || isCollection;
      getEl('admin-category-field').style.display = showCategory ? '' : 'none';
      getEl('admin-collection-season-field').style.display = isCollection ? '' : 'none';
      getEl('admin-collaboration-exclusive-field').style.display = isCollaboration ? '' : 'none';
      getEl('admin-nouveautes-labels-field').style.display = isNouveautesLabels ? '' : 'none';
      if (isNouveautes) {
        setCategoryOptions(NOUVEAUTES_CATEGORIES, 'Catégorie (Nouveauté)');
      }
      if (isCollection) {
        setCategoryOptions(COLLECTION_CATEGORIES, 'Catégorie (Collection)');
      }
      if (isAccessoires) {
        setCategoryOptions(ACCESSOIRES_CATEGORIES, 'Catégorie (Accessoires)');
      }
      if (isCollaboration) {
        setCategoryOptions(COLLABORATION_CATEGORIES, 'Catégorie (Collaboration)');
      }
      if (isCollection) {
        getEl('admin-collection-season').value = getEl('admin-collection-season').value || 'ss26';
      }
      if (isCollaboration) {
        getEl('admin-collaboration-exclusive').value = getEl('admin-collaboration-exclusive').value || 'all';
      }
      syncAccessoryVisibility();
      syncAccessorySubcategoryVisibility();
      applyCategoryPrefixToNameInput();
    }

    function setFeedback(message, isSuccess) {
      var node = getEl('admin-feedback');
      if (!node) return;
      node.textContent = message || '';
      node.classList.toggle('is-success', !!isSuccess);
    }

    function setSubmitMode(isEditing) {
      var submitButton = getEl('admin-submit-btn');
      var cancelEditButton = getEl('admin-cancel-edit');
      if (submitButton) submitButton.textContent = isEditing ? 'Enregistrer la modification' : 'Publier le produit';
      if (cancelEditButton) cancelEditButton.hidden = !isEditing;
    }

    function resetForm(keepFeedback) {
      var form = getEl('admin-product-form');
      if (!form) return;
      form.reset();
      var reviewList = getEl('admin-review-list');
      if (reviewList) reviewList.innerHTML = '';
      DEFAULT_ADMIN_REVIEWS.forEach(function (review) { addReviewInput(review); });
      var photoList = getEl('admin-photo-list');
      if (photoList) photoList.innerHTML = '';
      addPhotoInput('');
      addPhotoInput('');
      addPhotoInput('');
      addPhotoInput('');
      state.editingProductId = null;
      setSubmitMode(false);
      toggleTypeFields();
      updateColorPreview();
      syncRatingFromReviews();
      updateReviewPreview();
      updateNameSubtitleCounters();
      if (!keepFeedback) setFeedback('', false);
    }

    function focusManagerOnProduct(product) {
      var typeSelect = getEl('admin-manager-type');
      var categorySelect = getEl('admin-manager-category');
      var sortSelect = getEl('admin-manager-sort');
      if (!product || !typeSelect || !categorySelect || !sortSelect) return;

      typeSelect.value = product.type || 'all';
      renderManagerCategoryOptions();
      if (product.category && categorySelect.querySelector('option[value="' + product.category + '"]')) {
        categorySelect.value = product.category;
      } else {
        categorySelect.value = 'all';
      }
      sortSelect.value = 'recent';
      renderManagerList();

      var row = document.querySelector('.admin-manager-item[data-id="' + product.id + '"]');
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function renderManagerCategoryOptions() {
      var type = getEl('admin-manager-type').value;
      var categorySelect = getEl('admin-manager-category');
      if (!categorySelect) return;

      var categories = state.products
        .filter(function (product) { return type === 'all' || product.type === type; })
        .map(function (product) { return product.category || 'all'; })
        .filter(function (category) { return category && category !== 'all'; });

      var uniqueCategories = Array.from(new Set(categories)).sort();
      var current = categorySelect.value;
      categorySelect.innerHTML = '<option value="all">Toutes categories</option>' + uniqueCategories.map(function (category) {
        var label = category.charAt(0).toUpperCase() + category.slice(1);
        return '<option value="' + escapeHtml(category) + '">' + escapeHtml(label) + '</option>';
      }).join('');

      if (current && uniqueCategories.indexOf(current) !== -1) {
        categorySelect.value = current;
      }
    }

    function getManagedProducts() {
      var type = getEl('admin-manager-type').value;
      var category = getEl('admin-manager-category').value;
      var sort = getEl('admin-manager-sort').value;

      var products = state.products.filter(function (product) {
        var typeMatch = type === 'all' || product.type === type;
        var categoryMatch = category === 'all' || (product.category || 'all') === category;
        return typeMatch && categoryMatch;
      });

      if (sort === 'recent') products.sort(function (a, b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); });
      if (sort === 'old') products.sort(function (a, b) { return Number(a.createdAt || 0) - Number(b.createdAt || 0); });
      if (sort === 'name') products.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'fr'); });
      if (sort === 'price-desc') products.sort(function (a, b) { return Number(b.price || 0) - Number(a.price || 0); });
      if (sort === 'price-asc') products.sort(function (a, b) { return Number(a.price || 0) - Number(b.price || 0); });

      return products;
    }

    function renderManagerList() {
      var list = getEl('admin-manager-list');
      if (!list) return;

      var products = getManagedProducts();
      if (!products.length) {
        list.innerHTML = '<p class="admin-manager-empty">Aucun produit admin correspondant.</p>';
        return;
      }

      list.innerHTML = products.map(function (product) {
        var typeLabel = getTypeLabel(product.type);
        var categoryLabel = product.category && product.category !== 'all' ? product.category : 'general';
        var seasonLabel = product.type === 'collection' ? getCollectionSeasonLabel(product.collectionSeason) : '';
        var collaborationLabel = '';
        if (product.type === 'collaboration') {
          var collaborationViewLabel = product.collaborationView;
          if (collaborationViewLabel !== 'exclusives' && collaborationViewLabel !== 'popup' && collaborationViewLabel !== 'events' && collaborationViewLabel !== 'all') {
            collaborationViewLabel = product.collaborationExclusive ? 'exclusives' : 'all';
          }
          if (collaborationViewLabel === 'exclusives') collaborationLabel = 'Créations exclusives';
          if (collaborationViewLabel === 'popup') collaborationLabel = 'Pop-up stores';
          if (collaborationViewLabel === 'events') collaborationLabel = 'Événements';
          if (collaborationViewLabel === 'all') collaborationLabel = 'Toutes les collaborations';
        }
        var nouveautesLabels = Array.isArray(product.nouveauteTags)
          ? product.nouveauteTags.map(getNouveautesLabelLabel).join(', ')
          : '';
        var dateLabel = product.createdAt ? new Date(product.createdAt).toLocaleDateString('fr-FR') : '-';
        return ''
          + '<article class="admin-manager-item" data-id="' + escapeHtml(product.id) + '">'
          + '  <div>'
          + '    <p class="admin-manager-name">' + escapeHtml(product.name || 'Produit') + '</p>'
          + '    <p class="admin-manager-meta">' + escapeHtml(typeLabel) + ' · ' + escapeHtml(categoryLabel) + (seasonLabel ? (' · ' + escapeHtml(seasonLabel)) : '') + (collaborationLabel ? (' · ' + escapeHtml(collaborationLabel)) : '') + (nouveautesLabels ? (' · ' + escapeHtml(nouveautesLabels)) : '') + ' · ' + escapeHtml(normalizePrice(product.price)) + ' · ' + escapeHtml(dateLabel) + '</p>'
          + '  </div>'
          + '  <div class="admin-manager-actions">'
          + '    <button type="button" class="admin-mini-btn" data-edit-id="' + escapeHtml(product.id) + '">Modifier</button>'
          + '    <button type="button" class="admin-mini-btn admin-mini-delete" data-delete-id="' + escapeHtml(product.id) + '">Supprimer</button>'
          + '  </div>'
          + '</article>';
      }).join('');
    }

    function loadProductForEditing(productId) {
      var product = state.products.find(function (item) { return item.id === productId; });
      if (!product) return;

      resetForm();
      state.editingProductId = product.id;
      setSubmitMode(true);

      getEl('admin-type').value = product.type;
      toggleTypeFields();
      if (product.category && getEl('admin-category').querySelector('option[value="' + product.category + '"]')) {
        getEl('admin-category').value = product.category;
      }
      syncAccessoryVisibility();
      syncAccessorySubcategoryVisibility();
      getEl('admin-accessory-subcategory').value = product.accessorySubcategory || 'sacs';
      getEl('admin-collection-season').value = product.collectionSeason || 'ss26';
      var loadedCollaborationView = product.collaborationView;
      if (loadedCollaborationView !== 'exclusives' && loadedCollaborationView !== 'popup' && loadedCollaborationView !== 'events' && loadedCollaborationView !== 'all') {
        loadedCollaborationView = product.collaborationExclusive ? 'exclusives' : 'all';
      }
      getEl('admin-collaboration-exclusive').value = loadedCollaborationView;
      Array.from(document.querySelectorAll('#admin-nouveautes-labels input')).forEach(function (input) {
        input.checked = Array.isArray(product.nouveauteTags) && product.nouveauteTags.indexOf(input.value) !== -1;
      });

      getEl('admin-name').value = product.name || '';
      getEl('admin-price').value = String(product.price || '');
      getEl('admin-subtitle').value = product.subtitle || '';
      getEl('admin-image-caption').value = product.imageCaption || '';
      getEl('admin-rating-value').value = String(product.ratingValue || 0);
      getEl('admin-rating-count').value = String(product.ratingCount || 0);

      var reviewList = getEl('admin-review-list');
      if (reviewList) reviewList.innerHTML = '';
      var storedReviews = Array.isArray(product.reviews) ? product.reviews : [];
      if (storedReviews.length) {
        storedReviews.forEach(function (review) {
          addReviewInput({ text: review.text || '', rating: review.rating || 5 });
        });
      } else {
        addReviewInput({ text: '', rating: Number(product.ratingValue) || 5 });
      }

      Array.from(document.querySelectorAll('#admin-color-picker input')).forEach(function (input) {
        input.checked = false;
      });
      var optionValues = COLOR_OPTIONS.map(function (opt) { return opt.value; });
      var hexValues = [];
      (product.colors || []).forEach(function (color) {
        var normalized = normalizeColorOptionValue(color);
        if (optionValues.indexOf(normalized) !== -1) {
          var input = document.querySelector('#admin-color-picker input[value="' + normalized + '"]');
          if (input) input.checked = true;
        } else {
          hexValues.push(color);
        }
      });
      getEl('admin-color-hex').value = hexValues.join(', ');

      Array.from(document.querySelectorAll('#admin-sizes input')).forEach(function (input) {
        input.checked = (product.sizes || []).indexOf(input.value) !== -1;
      });

      var photoList = getEl('admin-photo-list');
      photoList.innerHTML = '';
      var images = Array.isArray(product.images) ? product.images.slice() : [];
      while (images.length < 4) images.push('');
      images.forEach(function (url) { addPhotoInput(url); });

      updateColorPreview();
      syncRatingFromReviews();
      updateReviewPreview();
      updateNameSubtitleCounters();
      setFeedback('Mode modification actif.', true);
    }

    function deleteManagedProduct(productId) {
      var initialLength = state.products.length;
      state.products = state.products.filter(function (item) { return item.id !== productId; });
      if (state.products.length === initialLength) return;

      if (state.editingProductId === productId) {
        resetForm();
      }

      saveProducts(state.products);
      renderAdminProductsForCurrentPage();
      renderImageCaptionSuggestions();
      renderManagerCategoryOptions();
      renderManagerList();
      setFeedback('Produit supprime.', true);
    }

    function collectFormProduct() {
      var type = getEl('admin-type').value;
      var category = getEl('admin-category').value;
      var accessorySubcategory = getEl('admin-accessory-subcategory').value;
      var collectionSeason = getEl('admin-collection-season').value;
      var collaborationView = getEl('admin-collaboration-exclusive').value;
      if (collaborationView !== 'exclusives' && collaborationView !== 'popup' && collaborationView !== 'events' && collaborationView !== 'all') {
        collaborationView = 'all';
      }
      var collaborationExclusive = collaborationView === 'exclusives';
      var nouveauteTags = Array.from(document.querySelectorAll('#admin-nouveautes-labels input:checked')).map(function (input) {
        return input.value;
      });
      var name = sanitizeSingleLineText(getEl('admin-name').value, 120);
      var price = Number(getEl('admin-price').value);
      var subtitle = sanitizeSingleLineText(getEl('admin-subtitle').value, 70);
      var imageCaption = sanitizeSingleLineText(getEl('admin-image-caption').value, 180);
      var checkedColors = Array.from(document.querySelectorAll('#admin-color-picker input:checked')).map(function (input) { return input.value; });
      var colors = Array.from(new Set(checkedColors.concat(parseColorTokens(getEl('admin-color-hex').value))));
      var sizes = Array.from(document.querySelectorAll('#admin-sizes input:checked')).map(function (input) { return input.value; });
      var accessoryMode = isAccessoriesContext(type, category);
      var ratingValue = Number(getEl('admin-rating-value').value);
      var ratingCount = Number(getEl('admin-rating-count').value);
      var reviews = getReviewEntries();
      var rawPhotos = Array.from(document.querySelectorAll('#admin-photo-list input')).map(function (input) {
        return String(input.value || '').trim();
      }).filter(Boolean);
      var photos = rawPhotos.map(function (value) { return normalizeImageUrl(value); });
      var hasIncompleteDropboxLink = rawPhotos.some(function (value) {
        var lowered = value.toLowerCase();
        return lowered.indexOf('dropbox.com/scl/fi/') !== -1 && lowered.indexOf('rlkey=') === -1;
      });

      if (!type) return { error: 'Choisissez un type de produit.' };
      if (type === 'nouveautes' && !category) return { error: 'Choisissez une catégorie pour la nouveauté.' };
      if (type === 'collection' && !category) return { error: 'Choisissez une catégorie pour la collection.' };
      if (type === 'accessoires' && !category) return { error: 'Choisissez une catégorie accessoires.' };
      if (type === 'collaboration' && !category) return { error: 'Choisissez une collaboration.' };
      if (type === 'collection' && collectionSeason !== 'ss26' && collectionSeason !== 'aw26') {
        return { error: 'Choisissez une saison pour la collection.' };
      }
      if (type === 'nouveautes' && category === 'accessoires' && !accessorySubcategory) {
        return { error: 'Choisissez une sous-catégorie accessoires.' };
      }
      name = ensureCategoryPrefix(name, type, category, accessorySubcategory);
      name = sanitizeSingleLineText(name, 120);
      if (!name) return { error: 'Le nom du produit est obligatoire.' };
      if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(price)) return { error: 'Le prix doit être un nombre entier supérieur à 0.' };
      if (!subtitle) return { error: 'Le sous-titre est obligatoire.' };
      if (!colors.length) return { error: 'Ajoutez au moins une couleur.' };
      if (!accessoryMode && !sizes.length) return { error: 'Sélectionnez au moins une taille entre 34 et 44.' };
      if (!Number.isFinite(ratingValue) || ratingValue < 0 || ratingValue > 5) return { error: 'La note doit être comprise entre 0 et 5.' };
      if (!Number.isInteger(ratingCount) || ratingCount < 0) return { error: 'Le nombre d\'avis doit être un entier positif.' };
      if (photos.length < 4) return { error: 'Ajoutez au moins 4 photos avant publication.' };
      if (hasIncompleteDropboxLink) return { error: 'Lien Dropbox incomplet détecté. Ouvrez le fichier dans Dropbox, copiez un lien de partage complet (avec rlkey) puis recollez-le.' };

      if (reviews.length) {
        var starsTotal = reviews.reduce(function (sum, review) { return sum + review.rating; }, 0);
        ratingCount = reviews.length;
        ratingValue = Math.round((starsTotal / Math.max(1, reviews.length)) * 10) / 10;
      }

      return {
        product: {
          id: 'admin-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
          type: type,
          category: (type === 'nouveautes' || type === 'collection' || type === 'accessoires' || type === 'collaboration') ? category : 'all',
          collectionSeason: type === 'collection' ? collectionSeason : 'all',
          collaborationView: type === 'collaboration' ? collaborationView : 'all',
          collaborationExclusive: type === 'collaboration' ? collaborationExclusive : false,
          nouveauteTags: type === 'nouveautes' ? nouveauteTags : [],
          accessorySubcategory: (type === 'nouveautes' && category === 'accessoires') ? accessorySubcategory : '',
          name: name,
          price: price,
          subtitle: subtitle,
          imageCaption: imageCaption,
          colors: colors,
          sizes: accessoryMode ? [] : sizes,
          ratingValue: Math.round(ratingValue * 10) / 10,
          ratingCount: ratingCount,
          reviews: reviews,
          images: photos,
          createdAt: Date.now()
        }
      };
    }

    function openPanel() {
      state.isOpen = true;
      overlay.classList.add('is-open');
      fab.classList.add('is-visible');
      document.body.style.overflow = 'hidden';
      setTimeout(function () {
        var first = getEl('admin-type');
        if (first) first.focus();
      }, 0);
    }

    function closePanel() {
      state.isOpen = false;
      overlay.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closePanel();
    });

    getEl('admin-close').addEventListener('click', closePanel);
    getEl('admin-add-photo').addEventListener('click', function () { addPhotoInput(''); });
    getEl('admin-add-review').addEventListener('click', function () {
      addReviewInput({ text: '', rating: 5 });
      syncRatingFromReviews();
    });
    getEl('admin-type').addEventListener('change', toggleTypeFields);
    getEl('admin-category').addEventListener('change', function () {
      syncAccessoryVisibility();
      syncAccessorySubcategoryVisibility();
      applyCategoryPrefixToNameInput();
    });
    getEl('admin-accessory-subcategory').addEventListener('change', applyCategoryPrefixToNameInput);
    getEl('admin-color-picker').addEventListener('change', updateColorPreview);
    getEl('admin-color-hex').addEventListener('input', updateColorPreview);
    getEl('admin-rating-value').addEventListener('input', updateReviewPreview);
    getEl('admin-rating-count').addEventListener('input', updateReviewPreview);
    getEl('admin-name').addEventListener('input', function () {
      var nameInput = getEl('admin-name');
      var sanitized = sanitizeSingleLineText(nameInput.value, 120);
      if (nameInput.value !== sanitized) {
        nameInput.value = sanitized;
      }
      updateNameSubtitleCounters();
    });
    getEl('admin-subtitle').addEventListener('input', function () {
      var subtitleInput = getEl('admin-subtitle');
      var sanitized = sanitizeSingleLineText(subtitleInput.value, 70);
      if (subtitleInput.value !== sanitized) {
        subtitleInput.value = sanitized;
      }
      updateNameSubtitleCounters();
    });
    getEl('admin-image-caption').addEventListener('input', function () {
      var captionInput = getEl('admin-image-caption');
      var sanitized = sanitizeSingleLineText(captionInput.value, 180);
      if (captionInput.value !== sanitized) {
        captionInput.value = sanitized;
      }
    });
    getEl('admin-color-preview').addEventListener('click', function (event) {
      var chip = event.target.closest('.admin-preview-chip');
      if (chip) chip.classList.toggle('is-active');
    });

    panel.addEventListener('click', function (event) {
      var colorChip = event.target.closest('.admin-color-chip');
      if (colorChip) colorChip.classList.toggle('is-active');
      var sizeChip = event.target.closest('.admin-size-chip');
      if (sizeChip) sizeChip.classList.toggle('is-active');

      var removeReviewButton = event.target.closest('.admin-review-remove');
      if (removeReviewButton) {
        var row = removeReviewButton.closest('.admin-review-row');
        if (row) row.remove();
        if (!document.querySelector('#admin-review-list .admin-review-row')) {
          addReviewInput({ text: '', rating: 5 });
        }
        syncRatingFromReviews();
      }
    });

    panel.addEventListener('input', function (event) {
      if (event.target.closest('#admin-review-list')) {
        syncRatingFromReviews();
      }
    });

    panel.addEventListener('change', function (event) {
      if (event.target.closest('#admin-review-list')) {
        syncRatingFromReviews();
      }
    });

    getEl('admin-product-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var result = collectFormProduct();
      var savedProduct = null;
      if (result.error) {
        setFeedback(result.error, false);
        return;
      }

      if (state.editingProductId) {
        var index = state.products.findIndex(function (item) { return item.id === state.editingProductId; });
        if (index !== -1) {
          var previous = state.products[index];
          state.products[index] = Object.assign({}, previous, result.product, {
            id: previous.id,
            createdAt: previous.createdAt,
            updatedAt: Date.now()
          });
          savedProduct = state.products[index];
          setFeedback('Produit modifie avec succes.', true);
        } else {
          state.products.push(result.product);
          savedProduct = result.product;
          setFeedback('Produit publie. Il est maintenant visible sur le site.', true);
        }
      } else {
        state.products.push(result.product);
        savedProduct = result.product;
        setFeedback('Produit publie. Il est maintenant visible sur le site.', true);
      }

      saveProducts(state.products);
      renderAdminProductsForCurrentPage();
      renderImageCaptionSuggestions();
      if (savedProduct) {
        focusManagerOnProduct(savedProduct);
      } else {
        renderManagerCategoryOptions();
        renderManagerList();
      }
      resetForm(true);
    });

    getEl('admin-cancel-edit').addEventListener('click', function () {
      resetForm();
      setFeedback('Modification annulee.', false);
    });

    getEl('admin-manager-type').addEventListener('change', function () {
      renderManagerCategoryOptions();
      renderManagerList();
    });
    getEl('admin-manager-category').addEventListener('change', renderManagerList);
    getEl('admin-manager-sort').addEventListener('change', renderManagerList);

    getEl('admin-manager-list').addEventListener('click', function (event) {
      var editButton = event.target.closest('[data-edit-id]');
      if (editButton) {
        loadProductForEditing(editButton.getAttribute('data-edit-id'));
        return;
      }

      var deleteButton = event.target.closest('[data-delete-id]');
      if (deleteButton) {
        deleteManagedProduct(deleteButton.getAttribute('data-delete-id'));
      }
    });

    fab.addEventListener('click', function () {
      if (state.isOpen) {
        closePanel();
      } else {
        openPanel();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.isOpen) {
        closePanel();
        return;
      }

      var isShortcut = event.ctrlKey && event.shiftKey && (event.key === 'A' || event.key === 'a');
      if (isShortcut) {
        event.preventDefault();
        fab.classList.add('is-visible');
        openPanel();
        return;
      }

      if (event.key && event.key.length === 1) {
        state.typed = (state.typed + event.key.toLowerCase()).slice(-SECRET_SEQUENCE.length);
        if (state.typed === SECRET_SEQUENCE) {
          fab.classList.add('is-visible');
          openPanel();
        }
      }
    });

    renderImageCaptionSuggestions();
    resetForm();
    updateNameSubtitleCounters();
    renderManagerCategoryOptions();
    renderManagerList();
  }/*  */

  function boot() {
    requestPersistentStorage();
    state.products = safeParseProducts();
    syncStorageCopies(state.products);
    injectStyles();
    renderAdminProductsForCurrentPage();
    buildPanel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
