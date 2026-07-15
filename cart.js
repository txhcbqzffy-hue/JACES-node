(function () {
  const STORAGE_KEY = 'jaces-cart';
  const CART_SYNC_EVENT = 'jaces:cart-sync';
  const FREE_SHIPPING_THRESHOLD = 79;
  const STANDARD_SHIPPING_FEE = 8;
  const EXPRESS_SHIPPING_FEE = 15;
  const ACCOUNT_SESSION_KEY = 'jaces-account-session';
  const ACCOUNT_PROFILES_KEY = 'jaces-account-profiles';
  const MAX_STORED_ORDERS = 20;

  function getAccountSession() {
    if (window.JacesAuth && typeof window.JacesAuth.getSession === 'function') {
      return window.JacesAuth.getSession();
    }

    try {
      return JSON.parse(window.localStorage.getItem('jaces-account-session') || 'null');
    } catch (error) {
      return null;
    }
  }

  function getAccountEmail() {
    return String(getAccountSession()?.email || '').trim().toLowerCase();
  }

  function readJsonStorage(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Ignore storage failures and keep the UI usable.
    }
  }

  function persistCheckoutProfile(profile) {
    const session = getAccountSession();
    const email = String(profile?.email || session?.email || '').trim();
    if (!email) return;

    const nextSession = Object.assign({}, session || {}, profile, { email });
    writeJsonStorage(ACCOUNT_SESSION_KEY, nextSession);

    const profiles = readJsonStorage(ACCOUNT_PROFILES_KEY, {});
    profiles[email.toLowerCase()] = Object.assign({}, profiles[email.toLowerCase()] || {}, nextSession);
    writeJsonStorage(ACCOUNT_PROFILES_KEY, profiles);

    window.dispatchEvent(new CustomEvent('jaces:account-sync', { detail: { session: nextSession } }));
  }

  function normalizeStoredAddress(address, index) {
    return {
      id: String(address?.id || `address-${index + 1}`),
      label: String(address?.label || (index === 0 ? 'Adresse principale' : `Adresse ${index + 1}`)).trim(),
      firstName: String(address?.firstName || '').trim(),
      lastName: String(address?.lastName || '').trim(),
      address: String(address?.address || '').trim(),
      address2: String(address?.address2 || '').trim(),
      postalCode: String(address?.postalCode || '').trim(),
      city: String(address?.city || '').trim(),
      country: String(address?.country || 'France').trim(),
      phone: String(address?.phone || '').trim(),
      isDefault: Boolean(address?.isDefault)
    };
  }

  function getCheckoutAddresses(session) {
    const email = getAccountEmail();
    const profiles = readJsonStorage(ACCOUNT_PROFILES_KEY, {});
    const storedProfile = email ? profiles[email] || {} : {};
    const mergedProfile = Object.assign({}, storedProfile, session || {});

    let addresses = Array.isArray(mergedProfile.addresses)
      ? mergedProfile.addresses.map(normalizeStoredAddress)
      : [];

    if (!addresses.length) {
      const latestOrder = Array.isArray(mergedProfile.orders) ? mergedProfile.orders[0] : null;
      const shippingAddress = latestOrder?.shippingAddress;
      if (shippingAddress?.address || mergedProfile.deliveryAddress) {
        addresses = [normalizeStoredAddress({
          id: 'default-address',
          label: 'Adresse principale',
          firstName: shippingAddress?.firstName || mergedProfile.firstName || '',
          lastName: shippingAddress?.lastName || mergedProfile.lastName || '',
          address: shippingAddress?.address || mergedProfile.deliveryAddress || '',
          address2: shippingAddress?.address2 || '',
          postalCode: shippingAddress?.postalCode || mergedProfile.postalCode || '',
          city: shippingAddress?.city || mergedProfile.city || '',
          country: shippingAddress?.country || mergedProfile.country || 'France',
          phone: shippingAddress?.phone || mergedProfile.phone || '',
          isDefault: true
        }, 0)];
      }
    }

    if (addresses.length && !addresses.some((address) => address.isDefault)) {
      addresses[0].isDefault = true;
    }

    return addresses;
  }

  function upsertCheckoutAddress(addresses, address, selectedAddressId) {
    const normalizedAddresses = Array.isArray(addresses) ? addresses.map(normalizeStoredAddress) : [];
    const targetId = String(selectedAddressId || address?.id || '').trim();
    const nextAddress = normalizeStoredAddress(Object.assign({}, address, {
      id: targetId || `address-${Date.now()}`,
      isDefault: normalizedAddresses.length ? Boolean(normalizedAddresses.find((entry) => entry.id === targetId)?.isDefault) : true
    }), normalizedAddresses.length);

    const nextAddresses = normalizedAddresses.filter((entry) => entry.id !== nextAddress.id);
    nextAddresses.unshift(nextAddress);

    if (!nextAddresses.some((entry) => entry.isDefault)) {
      nextAddresses[0].isDefault = true;
    }

    return nextAddresses.map((entry, index) => normalizeStoredAddress(Object.assign({}, entry, {
      isDefault: index === 0 ? entry.isDefault || !nextAddresses.some((candidate, candidateIndex) => candidateIndex !== 0 && candidate.isDefault) : entry.isDefault
    }), index));
  }

  function createOrderNumber() {
    const timestamp = Date.now().toString().slice(-8);
    return `JACES-${timestamp}`;
  }

  function persistOrder(order) {
    const session = getAccountSession();
    const email = String(order?.email || session?.email || '').trim().toLowerCase();
    if (!email) return;

    const profiles = readJsonStorage(ACCOUNT_PROFILES_KEY, {});
    const existingProfile = profiles[email] || {};
    const existingOrders = Array.isArray(existingProfile.orders) ? existingProfile.orders : [];
    const nextOrders = [order, ...existingOrders].slice(0, MAX_STORED_ORDERS);
    const nextProfile = Object.assign({}, existingProfile, { email, orders: nextOrders });
    profiles[email] = nextProfile;
    writeJsonStorage(ACCOUNT_PROFILES_KEY, profiles);

    const nextSession = Object.assign({}, session || {}, nextProfile, { email, orders: nextOrders });
    writeJsonStorage(ACCOUNT_SESSION_KEY, nextSession);
    window.dispatchEvent(new CustomEvent('jaces:account-sync', { detail: { session: nextSession } }));
  }

  function scrollPageToTopInstant() {
    const documentElement = document.documentElement;
    const body = document.body;
    const previousDocumentScrollBehavior = documentElement ? documentElement.style.scrollBehavior : '';
    const previousBodyScrollBehavior = body ? body.style.scrollBehavior : '';

    if (documentElement) documentElement.style.scrollBehavior = 'auto';
    if (body) body.style.scrollBehavior = 'auto';

    window.scrollTo(0, 0);

    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      if (documentElement) documentElement.style.scrollBehavior = previousDocumentScrollBehavior;
      if (body) body.style.scrollBehavior = previousBodyScrollBehavior;
    });
  }

  function getScopedStorageKey() {
    const email = getAccountEmail();
    return email ? `${STORAGE_KEY}:${email}` : '';
  }

  function emitCartSync() {
    window.dispatchEvent(new CustomEvent(CART_SYNC_EVENT));
  }

  function normalizeCartItems(items) {
    const uniqueItems = [];
    const keyToIndex = new Map();

    (Array.isArray(items) ? items : []).forEach((item) => {
      const normalizedItem = {
        id: item?.id || '',
        name: item?.name || 'Produit JACES',
        price: item?.price || '',
        img: item?.img || '',
        size: item?.size || '',
        color: item?.color || 'Noir',
        quantity: Math.max(1, Number(item?.quantity) || 1)
      };
      const key = [normalizedItem.id, normalizedItem.size, normalizedItem.color].join('::');
      if (!normalizedItem.id) return;

      if (keyToIndex.has(key)) {
        uniqueItems[keyToIndex.get(key)].quantity += normalizedItem.quantity;
        return;
      }

      keyToIndex.set(key, uniqueItems.length);
      uniqueItems.push(normalizedItem);
    });

    return uniqueItems;
  }

  function getCart() {
    const storageKey = getScopedStorageKey();
    if (!storageKey) return [];
    try {
      return normalizeCartItems(JSON.parse(window.localStorage.getItem(storageKey) || '[]'));
    } catch (error) {
      return [];
    }
  }

  function saveCart(items) {
    const storageKey = getScopedStorageKey();
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(normalizeCartItems(items)));
    } catch (error) {
      // Ignore storage failures and keep the UI usable.
    }
    emitCartSync();
  }

  function updateHeaderCount() {
    const count = getCart().reduce((total, item) => total + (Number(item.quantity) || 0), 0);
    document.querySelectorAll('.cart-count').forEach((badge) => {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'inline-flex';
    });
  }

  function parsePrice(value) {
    const normalized = String(value || '').replace(/[^0-9,.-]/g, '').replace(',', '.');
    const amount = Number.parseFloat(normalized);
    return Number.isFinite(amount) ? amount : 0;
  }

  function formatPrice(value) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value || 0);
  }

  function formatVariantMeta(item) {
    const size = String(item?.size || '').trim();
    const color = String(item?.color || '').trim();
    if (size && color) return size + ' / ' + color;
    if (color) return color;
    return size;
  }

  function getSubtotal(items) {
    return items.reduce((total, item) => total + (parsePrice(item.price) * (Number(item.quantity) || 1)), 0);
  }

  function getShippingFee(subtotal, shippingMode) {
    if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
    return shippingMode === 'express' ? EXPRESS_SHIPPING_FEE : STANDARD_SHIPPING_FEE;
  }

  function getPromoDiscount(subtotal, promoCode) {
    const normalizedCode = String(promoCode || '').trim().toUpperCase();
    if (normalizedCode === 'JACES10') {
      return Math.round(subtotal * 0.1 * 100) / 100;
    }
    return 0;
  }

  function addItem(product, size, quantity, color) {
    if (!getAccountEmail()) {
      if (window.JacesAuth && typeof window.JacesAuth.requireAuth === 'function') {
        window.JacesAuth.requireAuth();
      }
      return false;
    }

    const builtProduct = window.JacesCatalog && typeof window.JacesCatalog.buildProduct === 'function'
      ? window.JacesCatalog.buildProduct(product)
      : product;
    const selectedSize = size || '';
    const selectedColor = color || builtProduct.selectedColor || (Array.isArray(builtProduct.colors) && builtProduct.colors[0]) || 'Noir';
    const items = getCart();
    const existingItemIndex = items.findIndex((item) => item.id === builtProduct.id && item.size === selectedSize && item.color === selectedColor);

    if (existingItemIndex >= 0) {
      const [existingItem] = items.splice(existingItemIndex, 1);
      existingItem.quantity = Math.max(1, Number(existingItem.quantity) || 1) + 1;
      items.unshift(existingItem);
    } else {
      items.unshift({
        id: builtProduct.id,
        name: builtProduct.name,
        price: builtProduct.price,
        img: builtProduct.img,
        size: selectedSize,
        color: selectedColor,
        quantity: 1
      });
    }

    saveCart(items);
    updateHeaderCount();
    return true;
  }

  function updateItemQuantity(id, size, color, quantity) {
    const nextQuantity = Math.max(1, Number(quantity) || 1);
    const items = getCart();
    const item = items.find((entry) => entry.id === id && entry.size === size && entry.color === color);
    if (!item) return;
    item.quantity = nextQuantity;
    saveCart(items);
    updateHeaderCount();
  }

  function archiveRemovedCartItem(item) {
    if (!item || !window.JacesFavorites) return;

    if (typeof window.JacesFavorites.saveProductSelection === 'function') {
      window.JacesFavorites.saveProductSelection(item.id, 'size', item.size || '');
      window.JacesFavorites.saveProductSelection(item.id, 'color', item.color || '');
    }

    if (typeof window.JacesFavorites.archiveFavorite === 'function') {
      window.JacesFavorites.archiveFavorite({
        id: item.id,
        name: item.name,
        price: item.price,
        img: item.img,
        sizes: item.size ? [item.size] : [],
        colors: item.color ? [item.color] : []
      }, 'cart');
    }
  }

  function removeItem(id, size, color) {
    const currentItems = getCart();
    const itemIndex = currentItems.findIndex((entry) => entry.id === id && entry.size === size && entry.color === color);
    if (itemIndex < 0) return;

    const item = currentItems[itemIndex];
    const currentQuantity = Math.max(1, Number(item.quantity) || 1);

    if (currentQuantity > 1) {
      currentItems[itemIndex] = Object.assign({}, item, {
        quantity: currentQuantity - 1
      });
      saveCart(currentItems);
      updateHeaderCount();
      return;
    }

    const items = currentItems.filter((entry) => !(entry.id === id && entry.size === size && entry.color === color));
    archiveRemovedCartItem(item);
    saveCart(items);
    updateHeaderCount();
  }

  function clearCart() {
    saveCart([]);
    updateHeaderCount();
  }

  function ensureCartPanel() {
    if (document.getElementById('cart-panel') && document.getElementById('cart-overlay')) return;

    document.body.insertAdjacentHTML('beforeend', `
      <div class="cart-overlay" id="cart-overlay"></div>
      <aside class="cart-panel" id="cart-panel" role="dialog" aria-label="Mon panier">
        <div class="cart-panel-header">
          <h2 id="cart-panel-title">Mon panier</h2>
          <button class="cart-panel-close-btn" id="cart-panel-close" aria-label="Fermer le panier" type="button">×</button>
        </div>
        <div class="cart-panel-action" id="cart-panel-action"></div>
        <div class="cart-panel-list" id="cart-panel-list"></div>
      </aside>
    `);

    document.getElementById('cart-overlay')?.addEventListener('click', closeCartPanel);
    document.getElementById('cart-panel-close')?.addEventListener('click', closeCartPanel);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeCartPanel();
      }
    });
  }

  function closeFavoritesPanelIfOpen() {
    document.getElementById('fav-panel')?.classList.remove('open');
    document.getElementById('fav-overlay')?.classList.remove('open');
  }

  function openCartPanel() {
    ensureCartPanel();
    closeFavoritesPanelIfOpen();
    document.getElementById('cart-panel')?.classList.add('open');
    document.getElementById('cart-overlay')?.classList.add('open');
    renderCartPanel();
  }

  function closeCartPanel() {
    document.getElementById('cart-panel')?.classList.remove('open');
    document.getElementById('cart-overlay')?.classList.remove('open');
  }

  function navigateToCartPage() {
    window.location.href = 'panier.html';
  }

  function renderCartPanel() {
    ensureCartPanel();

    const title = document.getElementById('cart-panel-title');
    const action = document.getElementById('cart-panel-action');
    const list = document.getElementById('cart-panel-list');
    if (!title || !action || !list) return;

    if (!getAccountEmail()) {
      title.textContent = 'Mon panier';
      action.innerHTML = '<button class="cart-panel-checkout-link" id="cart-panel-login" type="button">Commander</button>';
      list.innerHTML = [
        '<p class="cart-panel-empty">Connectez-vous pour retrouver votre panier JACES.</p>',
        '<div class="cart-panel-footer">',
        '  <button class="cart-panel-secondary-link" id="cart-panel-login-secondary" type="button">Se connecter</button>',
        '</div>'
      ].join('');

      const login = () => {
        if (window.JacesAuth && typeof window.JacesAuth.requireAuth === 'function') {
          window.JacesAuth.requireAuth();
        }
      };

      action.querySelector('#cart-panel-login')?.addEventListener('click', login);
      list.querySelector('#cart-panel-login-secondary')?.addEventListener('click', login);
      return;
    }

    const items = getCart();
    const count = items.reduce((total, item) => total + (Number(item.quantity) || 0), 0);
    const subtotal = getSubtotal(items);

    title.textContent = `Mon panier (${count})`;
    action.innerHTML = '<button class="cart-panel-checkout-link" id="cart-panel-checkout" type="button">Commander</button>';
    action.querySelector('#cart-panel-checkout')?.addEventListener('click', () => {
      closeCartPanel();
      navigateToCartPage();
    });

    if (!items.length) {
      list.innerHTML = [
        '<p class="cart-panel-empty">Aucune pièce dans votre panier pour le moment.</p>',
        '<div class="cart-panel-footer">',
        '  <a class="cart-panel-secondary-link" href="collection.html">Découvrir la collection</a>',
        '</div>'
      ].join('');
      return;
    }

    list.innerHTML = `
      <div class="cart-panel-items">
        ${items.map((item) => {
          const lineTotal = parsePrice(item.price) * (Number(item.quantity) || 1);
          return `
            <article class="cart-panel-item" data-cart-id="${item.id}" data-cart-size="${item.size}" data-cart-color="${item.color}">
              <a class="cart-panel-entry" href="detail-produit.html?id=${encodeURIComponent(item.id)}">
                ${item.img ? `<img src="${item.img}" alt="${item.name}" class="cart-panel-img">` : '<div class="cart-panel-img cart-panel-img-placeholder"></div>'}
                ${Number(item.quantity) > 1 ? `<span class="cart-panel-qty-badge">${item.quantity}</span>` : ''}
              </a>
              <div class="cart-panel-info">
                <div class="cart-panel-head">
                  <a class="cart-panel-title-link" href="detail-produit.html?id=${encodeURIComponent(item.id)}">${item.name}</a>
                  <p class="cart-panel-price">${formatPrice(lineTotal)}</p>
                </div>
                <p class="cart-panel-meta">${formatVariantMeta(item)}</p>
                <div class="cart-panel-row">
                  <button class="cart-panel-remove" type="button" data-remove-item="true">Supprimer</button>
                </div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
      <div class="cart-panel-summary">
        <div class="cart-panel-summary-row"><span>Sous-total</span><strong>${formatPrice(subtotal)}</strong></div>
        <p class="cart-panel-note">Livraison et taxes calculées à l’étape suivante.</p>
      </div>
    `;

    list.querySelectorAll('[data-remove-item="true"]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = button.closest('.cart-panel-item');
        if (!item) return;
        removeItem(item.dataset.cartId || '', item.dataset.cartSize || '', item.dataset.cartColor || '');
      });
    });
  }

  function bindCartButtons() {
    document.querySelectorAll('.icon-button.cart').forEach((button) => {
      if (button.dataset.cartBound === 'true') return;
      button.dataset.cartBound = 'true';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        openCartPanel();
      });
    });
  }

  function bindHorizontalSlider(track, prevBtn, nextBtn) {
    if (!track || !prevBtn || !nextBtn) return;

    const updateButtons = () => {
      const maxScrollLeft = track.scrollWidth - track.clientWidth;
      const atStart = track.scrollLeft <= 4;
      const atEnd = track.scrollLeft >= maxScrollLeft - 4;
      prevBtn.classList.toggle('is-hidden', atStart);
      nextBtn.classList.toggle('is-hidden', atEnd || maxScrollLeft <= 0);
    };

    const getStep = () => {
      const card = track.querySelector('.home-slider-card');
      if (!card) return track.clientWidth * 0.8;
      const styles = window.getComputedStyle(track);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
      return card.getBoundingClientRect().width + gap;
    };

    prevBtn.addEventListener('click', () => {
      track.scrollBy({ left: -getStep(), behavior: 'smooth' });
    });

    nextBtn.addEventListener('click', () => {
      track.scrollBy({ left: getStep(), behavior: 'smooth' });
    });

    track.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons);
    updateButtons();
  }

  function renderFavoritesShelf() {
    const section = document.getElementById('cart-favorites-section');
    const track = document.getElementById('cart-favorites-track');
    const prevBtn = document.querySelector('[data-cart-favorites-prev]');
    const nextBtn = document.querySelector('[data-cart-favorites-next]');
    if (!section || !track) return;

    const favorites = window.JacesFavorites && typeof window.JacesFavorites.getFavorites === 'function'
      ? window.JacesFavorites.getFavorites().map((item) => window.JacesCatalog && typeof window.JacesCatalog.buildProduct === 'function'
        ? window.JacesCatalog.buildProduct(item)
        : item)
      : [];

    if (!favorites.length) {
      section.hidden = true;
      track.innerHTML = '';
      return;
    }

    track.innerHTML = favorites.map((product) => {
      const productUrl = window.JacesFavorites && typeof window.JacesFavorites.getProductUrl === 'function'
        ? window.JacesFavorites.getProductUrl(product)
        : (product.url || ('detail-produit.html?id=' + encodeURIComponent(product.id)));

      return `
        <article class="home-slider-card" data-product-id="${product.id}" data-product-url="${productUrl}" data-sizes="${(product.sizes || []).join(',')}" data-colors="${(product.colors || []).join(',')}">
          <a class="cart-favorites-card-link" href="${productUrl}" aria-label="Voir ${product.name}">
            ${product.img ? `<img src="${product.img}" alt="${product.name}">` : '<div class="favorites-card-placeholder"></div>'}
          </a>
          <div class="home-slider-meta"><h3>${product.name}</h3><p>${product.price || ''}</p></div>
        </article>
      `;
    }).join('');

    section.hidden = false;
    bindHorizontalSlider(track, prevBtn, nextBtn);
  }

  function formatCardNumberValue(value) {
    const digits = String(value || '').replace(/\D+/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  }

  function formatExpiryValue(value) {
    const digits = String(value || '').replace(/\D+/g, '').slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  function formatCvcValue(value) {
    return String(value || '').replace(/\D+/g, '').slice(0, 3);
  }

  function bindCheckoutCardFieldFormatting(shell) {
    const form = shell.querySelector('#cart-checkout-form');
    if (!(form instanceof HTMLFormElement)) return;

    const cardInput = form.querySelector('input[name="card"]');
    const expiryInput = form.querySelector('input[name="expiry"]');
    const cvcInput = form.querySelector('input[name="cvc"]');

    if (cardInput instanceof HTMLInputElement) {
      cardInput.value = formatCardNumberValue(cardInput.value);
      cardInput.addEventListener('input', () => {
        cardInput.value = formatCardNumberValue(cardInput.value);
      });
    }

    if (expiryInput instanceof HTMLInputElement) {
      expiryInput.value = formatExpiryValue(expiryInput.value);
      expiryInput.addEventListener('input', () => {
        expiryInput.value = formatExpiryValue(expiryInput.value);
      });
    }

    if (cvcInput instanceof HTMLInputElement) {
      cvcInput.value = formatCvcValue(cvcInput.value);
      cvcInput.addEventListener('input', () => {
        cvcInput.value = formatCvcValue(cvcInput.value);
      });
    }
  }

  function bindBillingAddressToggle(shell) {
    const form = shell.querySelector('#cart-checkout-form');
    if (!(form instanceof HTMLFormElement)) return;

    const billingSameInput = form.querySelector('input[name="billingSame"]');
    const billingFields = form.querySelector('[data-billing-fields]');
    if (!(billingSameInput instanceof HTMLInputElement) || !(billingFields instanceof HTMLElement)) return;

    const requiredBillingNames = ['billingFirstName', 'billingLastName', 'billingAddress', 'billingPostalCode', 'billingCity'];

    const syncBillingState = () => {
      const isSame = billingSameInput.checked;
      billingFields.classList.toggle('is-active', !isSame);
      billingFields.hidden = isSame;

      requiredBillingNames.forEach((name) => {
        const input = form.querySelector(`[name="${name}"]`);
        if (!(input instanceof HTMLInputElement)) return;
        input.required = !isSame;
        input.disabled = isSame;
      });

      const billingCountry = form.querySelector('[name="billingCountry"]');
      const billingAddress2 = form.querySelector('[name="billingAddress2"]');
      [billingCountry, billingAddress2].forEach((field) => {
        if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLSelectElement)) return;
        field.disabled = isSame;
      });
    };

    billingSameInput.addEventListener('change', syncBillingState);
    syncBillingState();
  }

  function renderCartPage() {
    const shell = document.getElementById('cart-page-shell');
    const totalEl = document.getElementById('cart-page-total');
    if (!shell) return;

    if (!getAccountEmail()) {
      if (totalEl) totalEl.textContent = '0 article';
      shell.innerHTML = [
        '<div class="cart-empty-state">',
        '  <p class="favorites-empty-kicker">Connexion requise</p>',
        '  <h2>Connectez-vous pour retrouver votre panier JACES.</h2>',
        '  <p>Votre sélection, vos quantités et votre récapitulatif d’achat sont désormais associés à votre compte.</p>',
        '  <div class="cart-empty-actions">',
        '    <button class="favorites-empty-link" id="cart-login-button" type="button">Se connecter</button>',
        '    <a class="favorites-hero-link" href="collection.html">Continuer la sélection</a>',
        '  </div>',
        '</div>'
      ].join('');
      shell.querySelector('#cart-login-button')?.addEventListener('click', () => {
        if (window.JacesAuth && typeof window.JacesAuth.requireAuth === 'function') {
          window.JacesAuth.requireAuth();
        }
      });
      return;
    }

    const items = getCart();
    const session = getAccountSession() || {};
    const savedAddresses = getCheckoutAddresses(session);
    const selectedAddressId = shell.dataset.selectedAddressId || (savedAddresses.find((address) => address.isDefault)?.id || savedAddresses[0]?.id || '');
    const selectedAddress = savedAddresses.find((address) => address.id === selectedAddressId) || null;
    const shippingMode = shell.dataset.shippingMode || 'standard';
    const promoCode = shell.dataset.promoCode || '';
    const paymentMethod = shell.dataset.paymentMethod || 'card';
    const subtotal = getSubtotal(items);
    const promoDiscount = getPromoDiscount(subtotal, promoCode);
    const shippingFee = getShippingFee(Math.max(0, subtotal - promoDiscount), shippingMode);
    const total = Math.max(0, subtotal - promoDiscount) + shippingFee;
    const taxAmount = total * 0.2;

    if (totalEl) {
      const count = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      totalEl.textContent = count + (count > 1 ? ' articles' : ' article');
    }

    if (!items.length) {
      shell.innerHTML = [
        '<div class="cart-empty-state">',
        '  <p class="favorites-empty-kicker">Panier vide</p>',
        '  <h2>Votre sélection attend encore ses premières pièces.</h2>',
        '  <p>Ajoutez vos silhouettes favorites pour préparer un panier clair, éditorial et prêt à finaliser.</p>',
        '  <div class="cart-empty-actions">',
        '    <a class="favorites-empty-link" href="collection.html">Découvrir la collection</a>',
        '    <a class="favorites-hero-link" href="index.html">Retour à l’accueil</a>',
        '  </div>',
        '</div>'
      ].join('');
      return;
    }

    shell.innerHTML = `
      <div class="cart-page-layout">
        <aside class="cart-page-recap" aria-label="Récapitulatif de commande">
          <div class="cart-page-recap-card">
            <div class="cart-page-recap-items">
              ${items.map((item) => {
                const lineTotal = parsePrice(item.price) * (Number(item.quantity) || 1);
                return `
                  <article class="cart-page-recap-item" data-cart-id="${item.id}" data-cart-size="${item.size}" data-cart-color="${item.color}">
                    <a class="cart-page-recap-media" href="detail-produit.html?id=${encodeURIComponent(item.id)}" aria-label="Voir ${item.name}">
                      ${item.img ? `<img src="${item.img}" alt="${item.name}">` : '<div class="favorites-card-placeholder"></div>'}
                      ${Number(item.quantity) > 1 ? `<span class="cart-page-recap-qty">${item.quantity}</span>` : ''}
                    </a>
                    <div class="cart-page-recap-copy">
                      <div class="cart-page-recap-head">
                        <div>
                          <a class="cart-page-recap-title" href="detail-produit.html?id=${encodeURIComponent(item.id)}">${item.name}</a>
                          <p class="cart-page-recap-meta">${formatVariantMeta(item)}</p>
                        </div>
                        <p class="cart-page-item-price">${formatPrice(lineTotal)}</p>
                      </div>
                      <div class="cart-page-item-actions">
                        <button class="cart-page-remove" type="button" data-remove-item="true">Retirer</button>
                      </div>
                    </div>
                  </article>
                `;
              }).join('')}
            </div>
            <form class="cart-page-promo" id="cart-promo-form">
              <input type="text" name="promo" value="${promoCode}" placeholder="Carte-cadeau ou code promo" aria-label="Carte-cadeau ou code promo">
              <button type="submit">Valider</button>
            </form>
            <div class="cart-page-totals">
              <div class="cart-page-summary-row"><span>Sous-total</span><strong>${formatPrice(subtotal)}</strong></div>
              <div class="cart-page-summary-row"><span>Livraison</span><strong>${shippingFee === 0 ? 'Gratuite' : formatPrice(shippingFee)}</strong></div>
              ${promoDiscount > 0 ? `<div class="cart-page-summary-row"><span>Réduction</span><strong>− ${formatPrice(promoDiscount)}</strong></div>` : ''}
              <div class="cart-page-summary-row cart-page-summary-row-total"><span>Total</span><strong>${formatPrice(total)}</strong></div>
              <p class="cart-page-tax-note">Taxes (${formatPrice(taxAmount)} incluses)</p>
            </div>
            <div class="cart-page-reassurance-grid">
              <div class="cart-page-reassurance">
                <span class="cart-page-reassurance-icon">✓</span>
                <p>Paiements sécurisés</p>
              </div>
              <div class="cart-page-reassurance">
                <span class="cart-page-reassurance-icon">⌂</span>
                <p>Livraison gratuite en point relais</p>
              </div>
              <div class="cart-page-reassurance">
                <span class="cart-page-reassurance-icon">↺</span>
                <p>Retours & échanges gratuits</p>
              </div>
            </div>
          </div>
        </aside>
        <section class="cart-page-checkout-panel" aria-label="Finaliser l’achat">
          <div class="cart-page-checkout-express">
            <p class="cart-page-express-title">Paiement express</p>
            <div class="cart-page-express-grid">
              <button class="cart-page-express-button cart-page-express-button-paypal" type="button" aria-label="PayPal">
                <span class="cart-page-paypal-wordmark" aria-hidden="true"><span>Pay</span><span>Pal</span></span>
              </button>
              <button class="cart-page-express-button cart-page-express-button-gpay" type="button" aria-label="Google Pay">
                <span class="cart-page-gpay-wordmark" aria-hidden="true"><span class="cart-page-gpay-g"><span>G</span></span><span>Pay</span></span>
              </button>
            </div>
            <p class="cart-page-or">OU</p>
          </div>
          <form class="cart-page-form" id="cart-checkout-form">
            <div class="cart-page-form-section-head">
              <h2>Vos coordonnées</h2>
            </div>
            <label class="cart-page-field cart-page-field-full">
              <input type="email" name="email" value="${session.email || ''}" placeholder="Votre e-mail" required>
            </label>

            <div class="cart-page-form-section-head cart-page-form-section-head-delivery">
              <h2>Détails de livraison</h2>
            </div>
            ${savedAddresses.length ? `
              <div class="cart-page-address-book" aria-label="Mes adresses enregistrées">
                <p class="cart-page-address-book-title">Mes adresses</p>
                <div class="cart-page-address-options">
                  ${savedAddresses.map((address) => `
                    <button class="cart-page-address-option${address.id === selectedAddressId ? ' is-selected' : ''}" type="button" data-checkout-address="${address.id}">
                      <strong>${address.label}</strong>
                      <span>${address.address}</span>
                      <span>${address.postalCode} ${address.city}</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            ` : ''}
            <label class="cart-page-field cart-page-field-full">
              <span>Pays/Région</span>
              <select name="country">
                <option value="France" ${((selectedAddress?.country || session.country || 'France') === 'France') ? 'selected' : ''}>France</option>
                <option value="Belgique" ${((selectedAddress?.country || session.country || 'France') === 'Belgique') ? 'selected' : ''}>Belgique</option>
                <option value="Suisse" ${((selectedAddress?.country || session.country || 'France') === 'Suisse') ? 'selected' : ''}>Suisse</option>
              </select>
            </label>
            <div class="cart-page-field-grid cart-page-field-grid-identity">
              <label class="cart-page-field">
                <input type="text" name="firstName" placeholder="Prénom" value="${selectedAddress?.firstName || session.firstName || ''}" required>
              </label>
              <label class="cart-page-field">
                <input type="text" name="lastName" placeholder="Nom" value="${selectedAddress?.lastName || session.lastName || ''}" required>
              </label>
            </div>
            <label class="cart-page-field cart-page-field-full">
              <input type="text" name="company" placeholder="Société (optionnel)">
            </label>
            <label class="cart-page-field cart-page-field-full">
              <input type="text" name="address" placeholder="Adresse" value="${selectedAddress?.address || session.deliveryAddress || ''}" required>
            </label>
            <label class="cart-page-field cart-page-field-full">
              <input type="text" name="address2" placeholder="Appartement, suite, etc. (optionnel)" value="${selectedAddress?.address2 || ''}">
            </label>
            <div class="cart-page-field-grid cart-page-field-grid-city">
              <label class="cart-page-field">
                <input type="text" name="postalCode" placeholder="Code postal" value="${selectedAddress?.postalCode || session.postalCode || ''}" required>
              </label>
              <label class="cart-page-field">
                <input type="text" name="city" placeholder="Ville" value="${selectedAddress?.city || session.city || ''}" required>
              </label>
            </div>
            <label class="cart-page-field cart-page-field-full">
              <input type="tel" name="phone" placeholder="Téléphone (optionnel)" value="${selectedAddress?.phone || session.phone || ''}">
            </label>

            <div class="cart-page-form-section-head cart-page-form-section-head-method">
              <h2>Méthode de paiement</h2>
            </div>
            <p class="cart-page-payment-note">Toutes les transactions sont sécurisées et chiffrées</p>
            <div class="cart-page-payment-methods">
              <label class="cart-page-payment-option${paymentMethod === 'card' ? ' is-selected' : ''}">
                <input type="radio" name="paymentMethod" value="card" ${paymentMethod === 'card' ? 'checked' : ''}>
                <span>Carte de crédit</span>
              </label>
              <div class="cart-page-payment-fields${paymentMethod === 'card' ? ' is-active' : ''}">
                <label class="cart-page-field cart-page-field-full">
                  <input type="text" name="card" inputmode="numeric" maxlength="19" autocomplete="cc-number" placeholder="Numéro de carte" ${paymentMethod === 'card' ? 'required' : ''}>
                </label>
                <div class="cart-page-field-grid cart-page-field-grid-payment">
                  <label class="cart-page-field">
                    <input type="text" name="expiry" inputmode="numeric" maxlength="5" autocomplete="cc-exp" placeholder="Date d'expiration (MM/AA)" ${paymentMethod === 'card' ? 'required' : ''}>
                  </label>
                  <label class="cart-page-field">
                    <input type="text" name="cvc" inputmode="numeric" maxlength="3" autocomplete="cc-csc" placeholder="Code de sécurité" ${paymentMethod === 'card' ? 'required' : ''}>
                  </label>
                </div>
                <label class="cart-page-field cart-page-field-full">
                  <input type="text" name="cardName" placeholder="Nom sur la carte" ${paymentMethod === 'card' ? 'required' : ''}>
                </label>
                <label class="cart-page-check cart-page-check-highlight">
                  <input type="checkbox" name="billingSame" checked>
                  <span>Utiliser l’adresse d’expédition comme adresse de facturation</span>
                </label>
                <div class="cart-page-billing-fields" data-billing-fields hidden>
                  <p class="cart-page-billing-title">Adresse de facturation</p>
                  <label class="cart-page-field cart-page-field-full">
                    <span>Pays/Région</span>
                    <select name="billingCountry">
                      <option value="France" selected>France</option>
                      <option value="Belgique">Belgique</option>
                      <option value="Suisse">Suisse</option>
                    </select>
                  </label>
                  <div class="cart-page-field-grid cart-page-field-grid-identity">
                    <label class="cart-page-field">
                      <input type="text" name="billingFirstName" placeholder="Prénom">
                    </label>
                    <label class="cart-page-field">
                      <input type="text" name="billingLastName" placeholder="Nom">
                    </label>
                  </div>
                  <label class="cart-page-field cart-page-field-full">
                    <input type="text" name="billingAddress" placeholder="Adresse de facturation">
                  </label>
                  <label class="cart-page-field cart-page-field-full">
                    <input type="text" name="billingAddress2" placeholder="Appartement, suite, etc. (optionnel)">
                  </label>
                  <div class="cart-page-field-grid cart-page-field-grid-city">
                    <label class="cart-page-field">
                      <input type="text" name="billingPostalCode" placeholder="Code postal">
                    </label>
                    <label class="cart-page-field">
                      <input type="text" name="billingCity" placeholder="Ville">
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <button class="cart-page-submit" type="submit">Valider le paiement</button>
            <p class="cart-page-checkout-message" id="cart-checkout-message" aria-live="polite"></p>
            <div class="cart-page-legal-links">
              <a href="#">Politique de remboursement</a>
              <a href="#">Politique de confidentialité</a>
              <a href="#">Conditions d'utilisation</a>
            </div>
          </form>
        </section>
      </div>
    `;

    shell.querySelectorAll('[data-remove-item="true"]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = button.closest('.cart-page-recap-item');
        if (!item) return;
        removeItem(item.dataset.cartId || '', item.dataset.cartSize || '', item.dataset.cartColor || '');
      });
    });

    shell.querySelectorAll('input[name="cart-shipping"]').forEach((input) => {
      input.addEventListener('change', () => {
        shell.dataset.shippingMode = input.value;
        renderCartPage();
      });
    });

    shell.querySelectorAll('input[name="paymentMethod"]').forEach((input) => {
      input.addEventListener('change', () => {
        shell.dataset.paymentMethod = input.value;
        renderCartPage();
      });
    });

    shell.querySelectorAll('[data-checkout-address]').forEach((button) => {
      button.addEventListener('click', () => {
        shell.dataset.selectedAddressId = button.getAttribute('data-checkout-address') || '';
        renderCartPage();
      });
    });

    bindCheckoutCardFieldFormatting(shell);
    bindBillingAddressToggle(shell);

    shell.querySelector('#cart-promo-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const nextCode = String(new FormData(form).get('promo') || '').trim().toUpperCase();
      shell.dataset.promoCode = nextCode;
      renderCartPage();
    });

    shell.querySelector('#cart-checkout-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const message = shell.querySelector('#cart-checkout-message');
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      const email = String(formData.get('email') || '').trim();
      const country = String(formData.get('country') || 'France').trim();
      const address = String(formData.get('address') || '').trim();
      const company = String(formData.get('company') || '').trim();
      const address2 = String(formData.get('address2') || '').trim();
      const postalCode = String(formData.get('postalCode') || '').trim();
      const city = String(formData.get('city') || '').trim();
      const phone = String(formData.get('phone') || '').trim();
      const firstName = String(formData.get('firstName') || '').trim();
      const lastName = String(formData.get('lastName') || '').trim();
      const billingSame = formData.get('billingSame') === 'on';
      const billingFirstName = String(formData.get('billingFirstName') || '').trim();
      const billingLastName = String(formData.get('billingLastName') || '').trim();
      const billingAddress = String(formData.get('billingAddress') || '').trim();
      const billingPostalCode = String(formData.get('billingPostalCode') || '').trim();
      const billingCity = String(formData.get('billingCity') || '').trim();
      const selectedPaymentMethod = String(formData.get('paymentMethod') || paymentMethod || 'card');
      const card = String(formData.get('card') || '').replace(/\s+/g, '');
      const expiry = String(formData.get('expiry') || '').trim();
      const cvc = String(formData.get('cvc') || '').trim();
      const validExpiry = /^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry);

      const missingIdentity = !email || !address || !firstName || !lastName || !postalCode || !city;
      const missingBilling = !billingSame && (!billingFirstName || !billingLastName || !billingAddress || !billingPostalCode || !billingCity);
      const invalidCard = selectedPaymentMethod === 'card' && (!/^\d{16}$/.test(card) || !validExpiry || !/^\d{3}$/.test(cvc));

      if (missingIdentity || missingBilling || invalidCard) {
        if (message) message.textContent = 'Complétez vos informations de livraison et de paiement pour finaliser la commande.';
        return;
      }

      persistCheckoutProfile({
        email,
        firstName,
        lastName,
        deliveryAddress: address,
        country,
        company,
        address2,
        postalCode,
        city,
        phone,
        addresses: upsertCheckoutAddress(savedAddresses, {
          id: selectedAddressId,
          label: selectedAddress?.label || 'Adresse principale',
          firstName,
          lastName,
          address,
          address2,
          postalCode,
          city,
          country,
          phone,
          isDefault: true
        }, selectedAddressId)
      });

      const confirmedOrder = {
        id: createOrderNumber(),
        createdAt: new Date().toISOString(),
        email,
        status: 'Confirmation envoyée',
        shippingMode,
        paymentMethod: selectedPaymentMethod,
        itemCount: items.reduce((totalItems, item) => totalItems + (Number(item.quantity) || 1), 0),
        subtotal,
        shippingFee,
        promoDiscount,
        taxAmount,
        total,
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          img: item.img,
          size: item.size,
          color: item.color,
          quantity: Number(item.quantity) || 1
        })),
        shippingAddress: {
          firstName,
          lastName,
          address,
          address2,
          postalCode,
          city,
          country,
          phone
        },
        billingAddress: billingSame ? null : {
          firstName: billingFirstName,
          lastName: billingLastName,
          address: billingAddress,
          postalCode: billingPostalCode,
          city: billingCity,
          country: String(formData.get('billingCountry') || country).trim(),
          address2: String(formData.get('billingAddress2') || '').trim()
        }
      };

      persistOrder(confirmedOrder);

      clearCart();
      shell.innerHTML = `
        <div class="cart-success-state">
          <p class="favorites-empty-kicker">Commande confirmée</p>
          <h2>Votre commande JACES a bien été enregistrée.</h2>
          <p>Un récapitulatif a été préparé pour ${email}. Un e-mail de confirmation a bien été envoyé à cette adresse.</p>
          <div class="cart-success-summary">
            <div class="cart-success-summary-head">
              <strong>${confirmedOrder.id}</strong>
              <span>${confirmedOrder.itemCount} article${confirmedOrder.itemCount > 1 ? 's' : ''}</span>
            </div>
            <div class="cart-success-summary-lines">
              ${confirmedOrder.items.map((item) => `<p><span>${item.name} · ${formatVariantMeta(item)}</span><strong>x${item.quantity}</strong></p>`).join('')}
            </div>
            <div class="cart-success-summary-total">
              <span>Total réglé</span>
              <strong>${formatPrice(total)}</strong>
            </div>
          </div>
          <p class="cart-success-followup">Pour suivre votre commande, cliquez ci-dessous et retrouvez-la dans <strong>Mes commandes</strong> de votre profil.</p>
          <div class="cart-empty-actions">
            <button class="favorites-hero-link cart-success-track-button" id="cart-track-order" type="button">Suivre votre commande</button>
            <a class="favorites-empty-link" href="collection.html">Continuer la sélection</a>
            <a class="favorites-hero-link" href="index.html">Retour à l’accueil</a>
          </div>
        </div>
      `;
      shell.querySelector('#cart-track-order')?.addEventListener('click', () => {
        if (window.JacesAuth && typeof window.JacesAuth.openAccount === 'function') {
          window.JacesAuth.openAccount('orders');
        }
      });
      scrollPageToTopInstant();
      if (totalEl) totalEl.textContent = '0 article';
    });

    renderFavoritesShelf();
  }

  window.JacesCart = {
    getCart,
    saveCart,
    addItem,
    updateHeaderCount,
    updateItemQuantity,
    removeItem,
    clearCart,
    renderCartPage,
    renderCartPanel,
    openCartPanel,
    closeCartPanel
  };

  function init() {
    ensureCartPanel();
    bindCartButtons();
    updateHeaderCount();
    renderCartPage();
    renderCartPanel();
    renderFavoritesShelf();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('jaces:account-sync', () => {
    updateHeaderCount();
    renderCartPage();
    renderCartPanel();
    renderFavoritesShelf();
  });
  window.addEventListener(CART_SYNC_EVENT, () => {
    updateHeaderCount();
    renderCartPage();
    renderCartPanel();
    renderFavoritesShelf();
  });
  window.addEventListener('storage', (event) => {
    if (event.key && event.key === getScopedStorageKey()) {
      updateHeaderCount();
      renderCartPage();
      renderCartPanel();
      renderFavoritesShelf();
    }
  });
  window.addEventListener('jaces:favorites-sync', renderFavoritesShelf);
})();