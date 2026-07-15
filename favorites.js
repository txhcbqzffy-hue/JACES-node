(function () {
  const STORAGE_KEY = 'jaces-favorites';
  const HISTORY_STORAGE_KEY = 'jaces-favorites-history';
  const SELECTIONS_STORAGE_KEY = 'jaces-favorites-selections';
  const ADVISOR_PROFILE_STORAGE_KEY = 'jaces-size-advisor-profile';
  const MAX_HISTORY_ITEMS = 5;
  const ACCOUNT_SESSION_KEY = 'jaces-account-session';
  const FAVORITES_SYNC_EVENT = 'jaces:favorites-sync';
  const FAVORITE_SELECTION_SYNC_EVENT = 'jaces:favorite-selection-sync';

  const colorLabels = {
    black: 'Noir',
    beige: 'Beige',
    ivory: 'Ivoire',
    white: 'Blanc',
    camel: 'Camel',
    brown: 'Marron',
    gold: 'Dore',
    silver: 'Argent',
    blush: 'Rose poudre',
    taupe: 'Taupe',
    navy: 'Marine',
    grey: 'Gris',
    gray: 'Gris',
    sand: 'Sable',
    bordeaux: 'Bordeaux'
  };

  function normalizeId(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getAccountEmail() {
    let session = null;
    if (window.JacesAuth && typeof window.JacesAuth.getSession === 'function') {
      session = window.JacesAuth.getSession();
    } else {
      try {
        session = JSON.parse(window.localStorage.getItem('jaces-account-session') || 'null');
      } catch (error) {
        session = null;
      }
    }
    return String(session?.email || '').trim().toLowerCase();
  }

  function isAuthenticated() {
    return !!getAccountEmail();
  }

  function getScopedStorageKey(baseKey) {
    const email = getAccountEmail();
    return email ? `${baseKey}:${email}` : '';
  }

  function requireAccount(options) {
    if (window.JacesAuth && typeof window.JacesAuth.requireAuth === 'function') {
      return window.JacesAuth.requireAuth(options);
    }
    return true;
  }

  function getFavorites() {
    const storageKey = getScopedStorageKey(STORAGE_KEY);
    if (!storageKey) return [];
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); }
    catch { return []; }
  }

  function emitSyncEvent(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  function getHistory() {
    const storageKey = getScopedStorageKey(HISTORY_STORAGE_KEY);
    if (!storageKey) return [];
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); }
    catch { return []; }
  }

  function saveFavorites(favs) {
    const storageKey = getScopedStorageKey(STORAGE_KEY);
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(favs)); } catch {}
    emitSyncEvent(FAVORITES_SYNC_EVENT, { ids: favs.map((item) => item.id) });
  }

  function saveHistory(items) {
    const storageKey = getScopedStorageKey(HISTORY_STORAGE_KEY);
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify((items || []).slice(0, MAX_HISTORY_ITEMS))); } catch {}
    emitSyncEvent(FAVORITES_SYNC_EVENT, {});
  }

  function getSelections() {
    const storageKey = getScopedStorageKey(SELECTIONS_STORAGE_KEY);
    if (!storageKey) return {};
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); }
    catch { return {}; }
  }

  function saveSelections(selections) {
    const storageKey = getScopedStorageKey(SELECTIONS_STORAGE_KEY);
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(selections)); } catch {}
  }

  function getSizeAdvisorProfile() {
    const storageKey = getScopedStorageKey(ADVISOR_PROFILE_STORAGE_KEY);
    if (!storageKey) return null;
    try {
      return JSON.parse(localStorage.getItem(storageKey) || 'null');
    } catch {
      return null;
    }
  }

  function saveSizeAdvisorProfile(profile, fitMode) {
    if (!profile) return;

    const nextProfile = {
      height: profile.height || '',
      weight: profile.weight || '',
      age: profile.age || '',
      belly: profile.belly || '',
      hips: profile.hips || '',
      chestBand: profile.chestBand || '',
      cup: profile.cup || '',
      fitMode: fitMode || profile.fitMode || 'ideal'
    };

    const storageKey = getScopedStorageKey(ADVISOR_PROFILE_STORAGE_KEY);
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(nextProfile)); } catch {}

    emitSyncEvent(FAVORITE_SELECTION_SYNC_EVENT, {
      advisorProfile: nextProfile
    });
  }

  function hasUniqueSize(product) {
    return Array.isArray(product?.sizes)
      && product.sizes.length === 1
      && String(product.sizes[0]).toLowerCase() === 'unique';
  }

  function getGarmentRecommendationProfile(product) {
    const name = String(product?.name || '').toLowerCase();

    if (/jupe|pantalon|short|jean/.test(name)) {
      return { baseShift: 0.1, hipsWeight: 1.2, bellyWeight: 1.1, chestWeight: 0.2, easeShift: 0.1 };
    }

    if (/veste/.test(name)) {
      return { baseShift: -0.2, hipsWeight: 0.5, bellyWeight: 0.6, chestWeight: 1.0, easeShift: 0.5 };
    }

    if (/top/.test(name)) {
      return { baseShift: -0.1, hipsWeight: 0.35, bellyWeight: 0.5, chestWeight: 1.15, easeShift: 0.35 };
    }

    if (/robe/.test(name)) {
      return { baseShift: 0, hipsWeight: 0.85, bellyWeight: 0.75, chestWeight: 0.8, easeShift: 0.35 };
    }

    return { baseShift: 0, hipsWeight: 0.7, bellyWeight: 0.7, chestWeight: 0.6, easeShift: 0.3 };
  }

  function getRecommendedSize(product, profile, fitMode) {
    const availableSizes = Array.isArray(product?.sizes) ? product.sizes : [];
    if (!availableSizes.length) return '';
    if (hasUniqueSize(product)) return availableSizes[0];
    if (!profile) return '';

    const height = Number(profile.height) || 168;
    const weight = Number(profile.weight) || 60;
    const age = Number(profile.age) || 30;
    const bmi = weight / Math.pow(height / 100, 2);
    const chestBand = Number(profile.chestBand) || 90;
    const cup = String(profile.cup || 'C');
    const garmentProfile = getGarmentRecommendationProfile(product);

    let score = garmentProfile.baseShift;
    if (bmi < 18.5) score -= 1;
    if (bmi >= 22.5) score += 1;
    if (bmi >= 25) score += 1;
    if (height >= 174) score += 1;
    if (height <= 160) score -= 1;
    if (age >= 45) score += 0.2;
    if (profile.belly === 'rond') score += 0.7 * garmentProfile.bellyWeight;
    if (profile.belly === 'plat') score -= 0.2 * garmentProfile.bellyWeight;
    if (profile.hips === 'large') score += 0.7 * garmentProfile.hipsWeight;
    if (profile.hips === 'etroit') score -= 0.2 * garmentProfile.hipsWeight;
    if (chestBand >= 100) score += 0.5 * garmentProfile.chestWeight;
    if ('EFGHIJK'.includes(cup)) score += 0.5 * garmentProfile.chestWeight;
    if ('AAB'.includes(cup)) score -= 0.2 * garmentProfile.chestWeight;
    const baseSizeIndex = clamp(Math.round(score + 1), 0, availableSizes.length - 1);
    const sizeIndex = fitMode === 'ample'
      ? clamp(baseSizeIndex + 1, 0, availableSizes.length - 1)
      : baseSizeIndex;

    return availableSizes[sizeIndex];
  }

  function getSuggestedSizesForProduct(product, advisorProfile) {
    const builtProduct = buildProduct(product || {});
    if (hasUniqueSize(builtProduct)) {
      return { suggestedSize: '', alternateSuggestedSize: '' };
    }

    const profile = advisorProfile || getSizeAdvisorProfile();
    if (!profile) {
      return { suggestedSize: '', alternateSuggestedSize: '' };
    }

    const fitMode = profile.fitMode || 'ideal';
    const suggestedSize = getRecommendedSize(builtProduct, profile, fitMode);
    const alternateFitMode = fitMode === 'ideal' ? 'ample' : 'ideal';
    const alternateSuggestedSize = getRecommendedSize(builtProduct, profile, alternateFitMode);

    return {
      suggestedSize,
      alternateSuggestedSize: alternateSuggestedSize && alternateSuggestedSize !== suggestedSize ? alternateSuggestedSize : ''
    };
  }

  function getSavedSelection(id, product) {
    const storedSelection = getSelections()[id] || { color: '', size: '', suggestedSize: '', alternateSuggestedSize: '' };
    if (!product) return storedSelection;
    if (hasUniqueSize(product)) {
      return Object.assign({}, storedSelection, {
        suggestedSize: '',
        alternateSuggestedSize: ''
      });
    }

    const computedSuggestion = getSuggestedSizesForProduct(product);
    const resolvedSuggestedSize = storedSelection.suggestedSize || computedSuggestion.suggestedSize || '';
    const resolvedSize = storedSelection.size || resolvedSuggestedSize || '';

    return Object.assign({}, storedSelection, {
      size: resolvedSize,
      suggestedSize: resolvedSuggestedSize,
      alternateSuggestedSize: storedSelection.alternateSuggestedSize || computedSuggestion.alternateSuggestedSize || ''
    });
  }

  function saveProductSelection(id, field, value) {
    if (!id || !field || !isAuthenticated()) return;
    const selections = getSelections();
    const current = selections[id] || { color: '', size: '', suggestedSize: '', alternateSuggestedSize: '' };
    selections[id] = Object.assign({}, current, { [field]: value || '' });
    saveSelections(selections);
    emitSyncEvent(FAVORITE_SELECTION_SYNC_EVENT, {
      productId: id,
      selection: selections[id]
    });
  }

  function normalizeColorLabel(value) {
    const slug = normalizeId(value).replace(/-/g, '');
    return colorLabels[slug] || String(value || '').trim() || 'Noir';
  }

  function getColorsFromCard(card) {
    const datasetColors = [card.dataset.colors, card.dataset.color]
      .filter(Boolean)
      .flatMap((value) => String(value).split(/[\s,]+/))
      .map((value) => normalizeColorLabel(value))
      .filter(Boolean);

    const swatchColors = Array.from(card.querySelectorAll('.option-row')).flatMap((row) => {
      const label = row.querySelector('span')?.textContent?.trim()?.toLowerCase() || '';
      if (!label.includes('couleur')) return [];
      return Array.from(row.querySelectorAll('.color-swatch')).map((swatch) => {
        const className = Array.from(swatch.classList).find((name) => name !== 'color-swatch');
        return normalizeColorLabel(className);
      });
    });

    const colors = [...datasetColors, ...swatchColors].filter(Boolean);
    return Array.from(new Set(colors));
  }

  function createFavoriteButtonMarkup() {
    return '<button class="product-favorite" type="button" aria-label="Ajouter aux favoris"><svg class="heart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>';
  }

  function installCategoryScrollBridge() {
    const path = String(window.location.pathname || '').split('/').pop() || '';

    window.scrollToCollectionResults = function () {
if (path === 'collection.html' || path === 'nouveautes.html' || path === 'accessoires.html') {
        const filterBarTarget = document.getElementById('collection-filter-bar');
        if (!filterBarTarget) return;

        requestAnimationFrame(() => {
          const header = document.querySelector('.header');
          const headerBottom = header ? header.getBoundingClientRect().bottom : 120;
          const filterTop = filterBarTarget.getBoundingClientRect().top + window.scrollY;
          const offset = filterTop - headerBottom + 10;
          window.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
        });
      }
    };
  }

  function ensureFavoriteButtons(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.product-card:not(.lookbook-card), .home-slider-card').forEach((card) => {
      if (card.querySelector('.product-favorite')) return;

      const media = card.querySelector('.product-media');
      if (media) {
        media.insertAdjacentHTML('afterbegin', createFavoriteButtonMarkup());
        return;
      }

      // N'injecter le coeur que si la carte a un conteneur média positionné
      // (les cartes home-slider sans .product-media n'ont pas de positionnement)
      const hasMedia = card.querySelector('.product-detail-alternatives-media');
      if (hasMedia) {
        hasMedia.insertAdjacentHTML('afterbegin', createFavoriteButtonMarkup());
      }
    });
  }

  function syncCardState(id, isFavorite) {
    document.querySelectorAll('.product-card').forEach(card => {
      const product = getProductFromCard(card);
      if (product.id === id) {
        card.querySelector('.product-favorite')?.classList.toggle('active', isFavorite);
      }
    });
  }

  function pushToHistory(product, reason) {
    if (!product || !product.id) return;
    const builtProduct = buildProduct(product);
    const history = getHistory().filter(item => item.id !== builtProduct.id);
    history.unshift(Object.assign({}, builtProduct, {
      archivedAt: new Date().toISOString(),
      archivedReason: reason || 'removed'
    }));
    saveHistory(history);
  }

  function removeFromHistory(id) {
    saveHistory(getHistory().filter(item => item.id !== id));
  }

  function toggleFavorite(product) {
    if (!isAuthenticated()) return null;
    const favs = getFavorites();
    const idx = favs.findIndex(f => f.id === product.id);
    if (idx >= 0) {
      favs.splice(idx, 1);
      saveFavorites(favs);
      pushToHistory(product, 'removed');
      return false;
    }
    saveFavorites([product, ...favs.filter(f => f.id !== product.id)]);
    removeFromHistory(product.id);
    return true;
  }

  function buildProduct(product) {
    if (window.JacesCatalog && typeof window.JacesCatalog.buildProduct === 'function') {
      return window.JacesCatalog.buildProduct(product);
    }

    const id = normalizeId(product.id || product.name);
    return Object.assign({
      id,
      name: product.name || 'Produit JACES',
      price: product.price || '',
      img: product.img || '',
      sizes: ['XS', 'S', 'M', 'L'],
      colors: ['Noir'],
      url: 'detail-produit.html?id=' + encodeURIComponent(id)
    }, product, { id });
  }

  function getNavigationContext() {
    if (!window.JacesCatalog) return null;

    if (document.body?.classList.contains('product-detail-page')
      && typeof window.JacesCatalog.getOriginContextFromSearch === 'function') {
      return window.JacesCatalog.getOriginContextFromSearch(window.location.search);
    }

    if (typeof window.JacesCatalog.getPageContext === 'function') {
      return window.JacesCatalog.getPageContext();
    }

    return null;
  }

  function getProductUrl(product, context) {
    const builtProduct = buildProduct(product);
    const resolvedContext = context || getNavigationContext();
    if (window.JacesCatalog && typeof window.JacesCatalog.getProductUrl === 'function') {
      return window.JacesCatalog.getProductUrl(builtProduct, resolvedContext);
    }
    return builtProduct.url || ('detail-produit.html?id=' + encodeURIComponent(builtProduct.id));
  }

  function getProductFromCard(card) {
    const name = card.querySelector('h3')?.textContent?.trim() || '';
    const price = card.querySelector('.product-price')?.textContent?.trim()
      || card.querySelector('.home-slider-meta p')?.textContent?.trim()
      || card.querySelector('.product-info p')?.textContent?.trim()
      || card.querySelector('p')?.textContent?.trim()
      || '';
    const imgEl = card.querySelector('.product-image-primary') || card.querySelector('img');
    const imgSrc = imgEl?.getAttribute('src') || '';
    const img = card.dataset.primaryImg || imgSrc || '';
    const secondaryImgEl = card.querySelector('.product-image-secondary');
    const secondaryImgSrc = secondaryImgEl?.getAttribute('src') || '';
    const secondaryImg = card.dataset.secondaryImg || secondaryImgSrc || '';
    const tertiaryImg = card.dataset.tertiaryImg || '';
    const quaternaryImg = card.dataset.quaternaryImg || '';
    const id = card.dataset.productId || card.id || normalizeId(name);
    const sizes = (card.dataset.sizes || '').split(',').map(value => value.trim()).filter(Boolean);
    const colors = getColorsFromCard(card);
    return {
      id,
      name,
      price,
      img,
      secondaryImg,
      tertiaryImg,
      quaternaryImg,
      sizes,
      colors,
      url: card.dataset.productUrl || getProductUrl({ id, name, price, img, secondaryImg, tertiaryImg, quaternaryImg, sizes, colors })
    };
  }

  function updateHeaderCount() {
    const count = getFavorites().length;
    document.querySelectorAll('.fav-count').forEach(badge => {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    });
  }

  function removeFromPanel(id) {
    const product = buildProduct(getFavorites().find(f => f.id === id) || { id });
    const favs = getFavorites().filter(f => f.id !== id);
    saveFavorites(favs);
    pushToHistory(product, 'removed');
    syncCardState(id, false);
    updateHeaderCount();
    renderPanel();
  }

  function restoreFromHistory(id) {
    const historyProduct = getHistory().find(item => item.id === id);
    if (!historyProduct) return;
    const favs = getFavorites();
    saveFavorites([buildProduct(historyProduct), ...favs.filter(item => item.id !== id)]);
    removeFromHistory(id);
    syncCardState(id, true);
    updateHeaderCount();
    renderPanel();
  }

  function buildSelectMarkup(values, className, label, selectedValue, allowEmptyOption) {
    const options = Array.isArray(values) && values.length ? values : [label === 'Couleur' ? 'Noir' : 'Unique'];
    const placeholder = label === 'Couleur' ? 'Couleur' : 'Taille';
    const emptyOption = allowEmptyOption === false ? '' : `<option value="">${placeholder}</option>`;
    return `<select class="${className}-select" aria-label="Choisir ${label.toLowerCase()}">${emptyOption}${options.map(value => `<option value="${value}"${value === selectedValue ? ' selected' : ''}>${value}</option>`).join('')}</select>`;
  }

  function buildCartButtonMarkup(className, id) {
    return `
      <button class="${className}" data-fav-id="${id}" type="button" aria-label="Ajouter au panier">
        <svg class="fav-cart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
          <path d="M9 2L6.12 9H1l2.5 7.5v5h15v-5l2.5-7.5H17.88L15 2" />
        </svg>
      </button>
    `;
  }

  function getSelectedControlValue(scope, baseClass) {
    return scope?.querySelector('.' + baseClass + '-select')?.value
      || '';
  }

  function hasOptionalUniqueSize(product) {
    return hasUniqueSize(product);
  }

  function attachCartAction(button, products, options) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const card = button.closest(options.cardSelector);
      const product = products.find(item => item.id === button.dataset.favId);
      const message = card?.querySelector(options.messageSelector);
      const selectedSize = getSelectedControlValue(card, options.sizeClass) || (hasOptionalUniqueSize(product) ? 'Unique' : '');
      const selectedColor = getSelectedControlValue(card, options.colorClass);

      if (!product || !selectedSize) {
        if (message) message.textContent = 'Choisissez une taille.';
        return;
      }

      if (!selectedColor) {
        if (message) message.textContent = 'Choisissez une couleur.';
        return;
      }

      if (window.JacesCart && typeof window.JacesCart.addItem === 'function') {
        const added = window.JacesCart.addItem(product, selectedSize, 1, selectedColor);
        if (!added) return;
      }

      if (window.JacesCart && typeof window.JacesCart.openCartPanel === 'function') {
        window.JacesCart.openCartPanel();
      }

      if (message) message.textContent = '';
    });
  }

  function attachSelectionPersistence(root, selector, field) {
    root.querySelectorAll(selector).forEach((select) => {
      select.addEventListener('change', () => {
        const id = select.dataset.favId;
        saveProductSelection(id, field, select.value);
      });
    });
  }

  function ensurePanelAction() {
    const panel = document.getElementById('fav-panel');
    const header = panel?.querySelector('.fav-panel-header');
    const list = document.getElementById('fav-panel-list');
    if (!panel || !header || !list) return null;

    let action = document.getElementById('fav-panel-action');
    if (!action) {
      action = document.createElement('div');
      action.className = 'fav-panel-action';
      action.id = 'fav-panel-action';
      panel.insertBefore(action, list);
    }

    return action;
  }

  function renderPanel() {
    const favs = getFavorites().map(buildProduct);
    const history = getHistory().map(buildProduct);
    const list = document.getElementById('fav-panel-list');
    if (!list) return;
    const action = ensurePanelAction();
    const title = document.getElementById('fav-panel-title');
    if (title) title.textContent = 'Mes Favoris (' + favs.length + ')';
    if (action) {
      action.innerHTML = '';
    }

    if (!isAuthenticated()) {
      list.innerHTML = [
        '<p class="fav-panel-empty">Connectez-vous pour enregistrer vos coups de coeur.</p>',
        '<div class="fav-panel-footer">',
        '  <button class="fav-panel-link" id="fav-panel-login" type="button">Se connecter</button>',
        '</div>'
      ].join('');
      list.querySelector('#fav-panel-login')?.addEventListener('click', () => requireAccount());
      return;
    }

    if (favs.length === 0 && history.length === 0) {
      list.innerHTML = [
        '<p class="fav-panel-empty">Aucun favori pour l\'instant.</p>',
        '<div class="fav-panel-footer">',
        '  <a class="fav-panel-link" href="collection.html">Découvrir la collection</a>',
        '</div>'
      ].join('');
      return;
    }

    const favoriteMarkup = favs.length ? favs.map(f => {
      return `
      <div class="fav-panel-item">
        <a class="fav-panel-entry" href="${getProductUrl(f)}">
          ${f.img
            ? `<img src="${f.img}" alt="${f.name}" class="fav-panel-img">`
            : `<div class="fav-panel-img fav-panel-img-placeholder"></div>`
          }
        </a>
        <div class="fav-panel-controls">
          <a class="fav-panel-title-link" href="${getProductUrl(f)}">${f.name}</a>
          <p class="fav-panel-price">${f.price}</p>
          <a class="fav-panel-link fav-panel-item-link" href="${getProductUrl(f)}">Choisir et ajouter</a>
        </div>
        <button class="fav-panel-remove" data-fav-id="${f.id}" aria-label="Retirer des favoris" type="button">×</button>
      </div>
    `;
    }).join('') : '<p class="fav-panel-empty">Aucun favori actif pour le moment.</p>';

    const historyMarkup = history.length ? [
      '<section class="fav-history-section">',
      '  <div class="fav-history-header">Historique des coups de coeur</div>',
         history.map(item => {
           return `
        <div class="fav-history-item">
          <a class="fav-history-title" href="${getProductUrl(item)}">${item.name}</a>
          <div class="fav-history-body">
            <a class="fav-history-entry" href="${getProductUrl(item)}">
              ${item.img
                ? `<img src="${item.img}" alt="${item.name}" class="fav-panel-img">`
                : `<div class="fav-panel-img fav-panel-img-placeholder"></div>`
              }
            </a>
            <div class="fav-history-controls">
              <p class="fav-history-price">${item.price}</p>
                <a class="fav-panel-link fav-history-link" href="${getProductUrl(item)}">Choisir et ajouter</a>
              <button class="fav-history-restore" data-fav-id="${item.id}" type="button">Remettre en favoris</button>
              </div>
            </div>
          </div>
        </div>`;
         }).join(''),
      '</section>'
    ].join('') : '';

    list.innerHTML = favoriteMarkup + historyMarkup;

    list.querySelectorAll('.fav-panel-remove').forEach(btn => {
      btn.addEventListener('click', () => removeFromPanel(btn.dataset.favId));
    });

    list.querySelectorAll('.fav-history-restore').forEach((button) => {
      button.addEventListener('click', () => restoreFromHistory(button.dataset.favId));
    });
  }

  function openPanel() {
    if (!isAuthenticated()) {
      requireAccount();
      return;
    }
    document.getElementById('fav-panel')?.classList.add('open');
    document.getElementById('fav-overlay')?.classList.add('open');
    renderPanel();
  }

  function closePanel() {
    document.getElementById('fav-panel')?.classList.remove('open');
    document.getElementById('fav-overlay')?.classList.remove('open');
  }

  function restoreHeartStates() {
    ensureFavoriteButtons();
    const favs = getFavorites();
    document.querySelectorAll('.product-card, .home-slider-card').forEach(card => {
      const p = getProductFromCard(card);
      const btn = card.querySelector('.product-favorite');
      if (btn) btn.classList.toggle('active', favs.some(f => f.id === p.id));
    });
  }

  function applyRecommendedSizeHighlights(scope) {
    const root = scope && typeof scope.querySelectorAll === 'function' ? scope : document;
    normalizeQuickBuyPanels(root);
    const detailSuggestionText = String(document.getElementById('detail-size-suggestion')?.textContent || '').trim();
    const detailSizeValue = String(document.getElementById('detail-size')?.value || '').trim();
    const detailSelectedChip = String(document.querySelector('.product-detail-size-chip.is-selected')?.dataset.size || '').trim();
    const detailFirstChip = String(document.querySelector('.product-detail-size-chip')?.dataset.size || '').trim();
    const fallbackSuggestedSize = detailSuggestionText || detailSizeValue || detailSelectedChip || detailFirstChip || '';
    root.querySelectorAll('.product-card, .home-slider-card').forEach((card) => {
      const quickBuyButtons = card.querySelectorAll('.quick-buy-grid button');
      if (!quickBuyButtons.length) return;

      const product = getProductFromCard(card);
      if (!product || !product.id) return;

      const suggestedSize = getSavedSelection(product.id, product).suggestedSize || fallbackSuggestedSize;
      quickBuyButtons.forEach((button) => {
        const size = String(button.textContent || '').trim();
        button.classList.toggle('is-recommended', !!suggestedSize && size === suggestedSize);
      });
    });
  }

  function isAccessoryLikeCard() {
    // Only trust the page context (a real, non-guessed signal) — matching
    // on the product's category label or name caused false positives, e.g.
    // an apparel item cross-tagged with the "Accessoires" category filter
    // had its quick-buy sizes wiped even though it has real sizes.
    return !!document.body?.classList.contains('accessoires-page');
  }

  function buildQuickBuyTitleMarkup(suggestedSize) {
    return '<strong>Achat rapide</strong> (Selectionnez votre taille)';
  }

  function normalizeQuickBuyPanels(scope) {
    const root = scope && typeof scope.querySelectorAll === 'function' ? scope : document;
    root.querySelectorAll('.product-card .hover-sizes').forEach((panel) => {
      if (panel.dataset.qbDone) return;
      const card = panel.closest('.product-card');
      if (!card) return;

      const product = getProductFromCard(card);
      if (isAccessoryLikeCard(card, product)) {
        panel.innerHTML = '';
        panel.style.display = 'none';
        return;
      }

      panel.style.display = '';
      const savedPanelSizes = String(panel.dataset.quickSizes || '')
        .split(',')
        .map((size) => String(size || '').trim())
        .filter(Boolean);
      const legacySpanSizes = Array.from(panel.children)
        .filter((node) => node && node.tagName === 'SPAN')
        .map((node) => String(node.textContent || '').trim())
        .filter(Boolean);
      const existingButtonSizes = Array.from(panel.querySelectorAll('.quick-buy-grid button'))
        .map((node) => String(node.textContent || '').trim())
        .filter(Boolean);
      const fallbackSizes = savedPanelSizes.length
        ? savedPanelSizes
        : (legacySpanSizes.length ? legacySpanSizes : existingButtonSizes);
      const sizes = Array.isArray(product?.sizes)
        ? product.sizes.map((size) => String(size || '').trim()).filter((size) => size && size.toLowerCase() !== 'unique')
        : [];
      const quickBuySizes = Array.from(new Set((sizes.length ? sizes : fallbackSizes)));
      if (!quickBuySizes.length) {
        panel.innerHTML = '';
        panel.style.display = 'none';
        return;
      }

      const selection = getSavedSelection(product.id, product);
      const suggestedSize = [selection.suggestedSize, selection.size]
        .map((size) => String(size || '').trim())
        .find((size) => quickBuySizes.includes(size)) || quickBuySizes[0];
      const buttonsHtml = quickBuySizes
        .map((size) => '<button class="' + (suggestedSize === size ? 'is-recommended' : '') + '" type="button">' + size + '</button>')
        .join('');
      panel.dataset.quickSizes = quickBuySizes.join(',');
      panel.innerHTML = '<p class="quick-buy-title">' + buildQuickBuyTitleMarkup(suggestedSize) + '</p><div class="quick-buy-grid">' + buttonsHtml + '</div>';
      panel.dataset.qbDone = '1';
    });
  }

  function init() {
    installCategoryScrollBridge();
    ensureFavoriteButtons();
    restoreHeartStates();
    normalizeQuickBuyPanels();
    applyRecommendedSizeHighlights();
    updateHeaderCount();

    document.querySelectorAll('.product-card, .home-slider-card').forEach((card) => {
      card.classList.add('product-card-linkable');
    });

    // Event delegation: heart clicks on any product card
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('.product-favorite');
      if (!btn) return;
      const card = btn.closest('.product-card, .home-slider-card');
      if (!card) return;
      e.stopPropagation();
      if (!isAuthenticated()) {
        requireAccount({ button: document.querySelector('.icon-button[aria-label="Compte"]') });
        return;
      }
      const product = getProductFromCard(card);
      const added = toggleFavorite(product);
      if (added === null) return;
      btn.classList.toggle('active', added);
      updateHeaderCount();
      renderPanel();
    }, true);

    document.addEventListener('click', function (e) {
      const quickBuyButton = e.target.closest('.quick-buy-grid button');
      if (quickBuyButton) {
        const card = quickBuyButton.closest('.product-card, .home-slider-card');
        if (!card) return;

        e.preventDefault();
        e.stopPropagation();

        const product = getProductFromCard(card);
        if (!product || !product.id) return;

        const selectedSize = String(quickBuyButton.textContent || '').trim();
        if (selectedSize) {
          saveProductSelection(product.id, 'size', selectedSize);
        }

        const detailUrl = new URL(getProductUrl(product), window.location.href);
        if (selectedSize) {
          detailUrl.searchParams.set('selectedSize', selectedSize);
        }
        window.location.href = detailUrl.href;
        return;
      }

      const card = e.target.closest('.product-card, .home-slider-card');
      if (!card) return;
      if (e.target.closest('a, button, select, input, label, .hover-sizes, .quick-buy-grid, .product-options')) return;

      const product = getProductFromCard(card);
      if (!product || !product.id) return;
      window.location.href = getProductUrl(product);
    });

    // Header trigger
    document.getElementById('fav-trigger')?.addEventListener('click', () => {
      document.getElementById('fav-panel')?.classList.contains('open') ? closePanel() : openPanel();
    });

    document.getElementById('fav-overlay')?.addEventListener('click', closePanel);
    document.getElementById('fav-panel-close')?.addEventListener('click', closePanel);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

    window.addEventListener('storage', (event) => {
      const relevantKeys = [
        getScopedStorageKey(STORAGE_KEY),
        getScopedStorageKey(HISTORY_STORAGE_KEY),
        getScopedStorageKey(SELECTIONS_STORAGE_KEY),
        getScopedStorageKey(ADVISOR_PROFILE_STORAGE_KEY),
        ACCOUNT_SESSION_KEY
      ].filter(Boolean);
      if (!relevantKeys.includes(event.key)) return;

      if (event.key === getScopedStorageKey(STORAGE_KEY) || event.key === getScopedStorageKey(HISTORY_STORAGE_KEY) || event.key === ACCOUNT_SESSION_KEY) {
        restoreHeartStates();
        updateHeaderCount();
        renderPanel();
        emitSyncEvent(FAVORITES_SYNC_EVENT, {});
        return;
      }

      emitSyncEvent(FAVORITE_SELECTION_SYNC_EVENT, {});
    });

    window.addEventListener(FAVORITE_SELECTION_SYNC_EVENT, () => {
      applyRecommendedSizeHighlights();
    });

    window.addEventListener(FAVORITES_SYNC_EVENT, () => {
      applyRecommendedSizeHighlights();
    });

    // Re-apply card UI when cards or quick-buy blocks are injected dynamically
    const dynamicCardRoots = ['.product-grid', '.home-slider-track']
      .map((selector) => document.querySelector(selector))
      .filter(Boolean);

    dynamicCardRoots.forEach((root) => {
      let observerBusy = false;
      new MutationObserver(() => {
        if (observerBusy) return;
        observerBusy = true;
        Promise.resolve().then(() => {
          ensureFavoriteButtons(root);
          normalizeQuickBuyPanels(root);
          restoreHeartStates();
          applyRecommendedSizeHighlights(root);
          observerBusy = false;
        });
      }).observe(root, { childList: true, subtree: true });
    });

    window.addEventListener('jaces:account-sync', () => {
      closePanel();
      restoreHeartStates();
      updateHeaderCount();
      renderPanel();
    });
  }

  window.JacesFavorites = {
    getFavorites,
    saveFavorites,
    toggleFavorite,
    updateHeaderCount,
    getProductFromCard,
    removeFromPanel,
    getHistory,
    saveHistory,
    archiveFavorite: pushToHistory,
    restoreFromHistory,
    renderPanel,
    getProductUrl,
    buildProduct,
    getSavedSelection,
    saveProductSelection,
    getSizeAdvisorProfile,
    saveSizeAdvisorProfile,
    getSuggestedSizesForProduct
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
