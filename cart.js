(function () {
  const STORAGE_KEY = 'jaces-cart';
  const MAX_ADDRESSES = 3;
  const CART_SYNC_EVENT = 'jaces:cart-sync';
  const FREE_SHIPPING_THRESHOLD = 79;
  const STANDARD_SHIPPING_FEE = 8;
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

  const GUEST_CART_KEY = `${STORAGE_KEY}:guest`;

  // Adding to / viewing the cart never requires an account - only checkout
  // does. Guests get their own fixed key; once they log in (typically at
  // checkout), whatever they built up as a guest is folded into their
  // account cart so nothing gets lost.
  function getScopedStorageKey() {
    const email = getAccountEmail();
    return email ? `${STORAGE_KEY}:${email}` : GUEST_CART_KEY;
  }

  function mergeGuestCartIntoAccount(email) {
    if (!email) return;
    const guestRaw = window.localStorage.getItem(GUEST_CART_KEY);
    if (!guestRaw) return;
    try {
      const guestItems = normalizeCartItems(JSON.parse(guestRaw));
      if (!guestItems.length) {
        window.localStorage.removeItem(GUEST_CART_KEY);
        return;
      }
      const accountKey = `${STORAGE_KEY}:${email}`;
      const accountItems = normalizeCartItems(readJsonStorage(accountKey, []));
      window.localStorage.setItem(accountKey, JSON.stringify(normalizeCartItems([...guestItems, ...accountItems])));
      window.localStorage.removeItem(GUEST_CART_KEY);
    } catch (error) {
      // Ignore malformed guest cart data.
    }
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

  const PHONE_COUNTRIES = [
    ['fr', 'France', '+33'],
    ['be', 'Belgique', '+32'],
    ['ch', 'Suisse', '+41'],
    ['lu', 'Luxembourg', '+352'],
    ['de', 'Allemagne', '+49'],
    ['es', 'Espagne', '+34'],
    ['it', 'Italie', '+39'],
    ['gb', 'Royaume-Uni', '+44'],
    ['ie', 'Irlande', '+353'],
    ['pt', 'Portugal', '+351'],
    ['nl', 'Pays-Bas', '+31'],
    ['at', 'Autriche', '+43'],
    ['us', 'États-Unis', '+1'],
    ['ca', 'Canada', '+1'],
    ['ma', 'Maroc', '+212'],
    ['dz', 'Algérie', '+213'],
    ['tn', 'Tunisie', '+216'],
    ['sn', 'Sénégal', '+221'],
    ['ci', 'Côte d’Ivoire', '+225'],
    ['cm', 'Cameroun', '+237'],
    ['mu', 'Maurice', '+230'],
    ['re', 'La Réunion', '+262'],
    ['gp', 'Guadeloupe', '+590'],
    ['mq', 'Martinique', '+596'],
    ['gf', 'Guyane', '+594'],
    ['ru', 'Russie', '+7'],
    ['cn', 'Chine', '+86'],
    ['jp', 'Japon', '+81'],
    ['au', 'Australie', '+61'],
    ['br', 'Brésil', '+55'],
    ['in', 'Inde', '+91']
  ];

  function parsePhoneValue(rawPhone) {
    const raw = String(rawPhone || '').trim();
    const sortedByCodeLength = PHONE_COUNTRIES.slice().sort((a, b) => b[2].length - a[2].length);
    const match = sortedByCodeLength.find(([, , dialCode]) => raw.startsWith(dialCode));
    if (match) {
      return { iso: match[0], dialCode: match[2], localNumber: raw.slice(match[2].length).trim() };
    }
    return { iso: 'fr', dialCode: '+33', localNumber: raw };
  }

  const PHONE_MAX_DIGITS = {
    fr: 10, be: 9, ch: 9, lu: 9, de: 11, es: 9, it: 10, gb: 10, ie: 9, pt: 9, nl: 9, at: 11,
    us: 10, ca: 10,
    ma: 9, dz: 9, tn: 8, sn: 9, ci: 10, cm: 9, mu: 8, re: 9, gp: 9, mq: 9, gf: 9,
    ru: 10, cn: 11, jp: 10, au: 9, br: 11, in: 10
  };

  const PHONE_GROUPING_3_3_4 = new Set(['us', 'ca']);

  function isValidPhoneNumber(iso, localNumber) {
    const digits = String(localNumber || '').replace(/\D/g, '');
    if (!digits) return true;
    const max = PHONE_MAX_DIGITS[iso] || 12;
    return digits.length >= max - 1 && digits.length <= max;
  }

  function renderPhoneField(rawPhone) {
    const { iso, dialCode, localNumber } = parsePhoneValue(rawPhone);
    const flagUrl = (code) => `https://flagcdn.com/w40/${code}.png`;
    return [
      '<div class="account-phone-field">',
      '  <div class="jc-select account-phone-country" data-select-name="phoneCountry">',
      `    <button type="button" class="jc-select-trigger account-phone-trigger" data-select-trigger aria-haspopup="listbox" aria-expanded="false"><img src="${flagUrl(iso)}" alt="" class="account-phone-flag"><span>${dialCode}</span><svg class="jc-select-caret" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`,
      '    <ul class="jc-select-panel account-phone-panel" role="listbox" data-select-panel hidden>',
      PHONE_COUNTRIES.map(([code, name, dial]) => `<li class="jc-select-option account-phone-option${code === iso ? ' is-selected' : ''}" role="option" data-value="${dial}" data-iso="${code}"><img src="${flagUrl(code)}" alt="" class="account-phone-flag">${name} (${dial})</li>`).join(''),
      '    </ul>',
      `    <input type="hidden" name="phoneDialCode" data-select-value value="${dialCode}">`,
      `    <input type="hidden" name="phoneIso" data-select-iso value="${iso}">`,
      '  </div>',
      `  <input type="tel" name="phone" value="${localNumber}" placeholder="Téléphone (optionnel)" class="account-phone-number" autocomplete="tel-national">`,
      '</div>'
    ].join('');
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

  function getShippingFee(subtotal) {
    if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
    return STANDARD_SHIPPING_FEE;
  }

  // Partner codes (generated per-influencer in admin) aren't known ahead of
  // time like JACES10, so they're checked against the server once and cached
  // here - getPromoDiscount itself stays synchronous since it runs on every
  // render, not just when the code is first submitted.
  const resolvedPromoCodes = {};

  async function verifyPromoCodeRemotely(code) {
    const normalizedCode = String(code || '').trim().toUpperCase();
    if (!normalizedCode || normalizedCode === 'JACES10' || resolvedPromoCodes[normalizedCode] != null) return;
    try {
      const res = await fetch(`/api/admin-email-subscribers?promoCode=${encodeURIComponent(normalizedCode)}`);
      const data = await res.json().catch(() => ({}));
      if (data.valid) resolvedPromoCodes[normalizedCode] = data.discountPercent;
    } catch (error) {
      // offline/unreachable - the code just won't apply a discount this time
    }
  }

  function getPromoDiscount(subtotal, promoCode) {
    const normalizedCode = String(promoCode || '').trim().toUpperCase();
    if (normalizedCode === 'JACES10') {
      return Math.round(subtotal * 0.1 * 100) / 100;
    }
    if (resolvedPromoCodes[normalizedCode] != null) {
      return Math.round(subtotal * (resolvedPromoCodes[normalizedCode] / 100) * 100) / 100;
    }
    return 0;
  }

  function addItem(product, size, quantity, color) {
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
        <div class="cart-panel-summary" id="cart-panel-summary"></div>
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
    const summary = document.getElementById('cart-panel-summary');
    const action = document.getElementById('cart-panel-action');
    const list = document.getElementById('cart-panel-list');
    if (!title || !summary || !action || !list) return;

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
      summary.innerHTML = '';
      list.innerHTML = [
        '<p class="cart-panel-empty">Aucune pièce dans votre panier pour le moment.</p>',
        '<div class="cart-panel-footer">',
        '  <a class="cart-panel-secondary-link" href="collection.html">Découvrir la collection</a>',
        '</div>'
      ].join('');
      return;
    }

    summary.innerHTML = `
      <div class="cart-panel-summary-row"><span>Sous-total</span><strong>${formatPrice(subtotal)}</strong></div>
      <p class="cart-panel-note">Livraison et taxes calculées à l’étape suivante.</p>
    `;

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

  const STRIPE_PUBLISHABLE_KEY = 'pk_test_51TwhinIrrHc9hAHOzBRaZdUXvQ7WuriSEX95DZDI2rpSNRAtv9VG2Zi67vm4MLYPeLEi00iGylLskRTZqz8myYCd00GWie7saa';
  let stripeInstance = null;
  let stripeCardElement = null;

  function getStripe() {
    if (!window.Stripe) return null;
    if (!stripeInstance) stripeInstance = window.Stripe(STRIPE_PUBLISHABLE_KEY);
    return stripeInstance;
  }

  // Real, PCI-compliant card entry (Stripe's own hosted iframe) replaces the
  // old plain number/expiry/cvc inputs - card digits never touch our own
  // JS/server. Re-mounted every render since renderCartPage() rebuilds the
  // whole form on every payment-method change.
  function initStripeCardElement(shell) {
    stripeCardElement = null;
    const mountPoint = shell.querySelector('#stripe-card-element');
    if (!mountPoint) return;

    const stripe = getStripe();
    if (!stripe) {
      mountPoint.textContent = 'Le paiement par carte est momentanément indisponible.';
      return;
    }

    const elements = stripe.elements();
    stripeCardElement = elements.create('card', {
      style: {
        base: {
          fontFamily: '"Manrope", sans-serif',
          fontSize: '15px',
          color: '#2d1216',
          '::placeholder': { color: '#a89a8c' }
        },
        invalid: { color: '#a5321f' }
      }
    });
    stripeCardElement.mount(mountPoint);
    stripeCardElement.on('change', (event) => {
      const errorsEl = shell.querySelector('#stripe-card-errors');
      if (errorsEl) errorsEl.textContent = event.error ? event.error.message : '';
    });
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

    const items = getCart();
    const session = getAccountSession() || {};
    const savedAddresses = getCheckoutAddresses(session);
    const selectedAddressId = shell.dataset.selectedAddressId || (savedAddresses.find((address) => address.isDefault)?.id || savedAddresses[0]?.id || '');
    const isAddingNewAddress = selectedAddressId === '__new__' || !savedAddresses.length;
    const selectedAddress = isAddingNewAddress ? null : (savedAddresses.find((address) => address.id === selectedAddressId) || null);
    const isEditingAddress = !isAddingNewAddress && !!selectedAddress && shell.dataset.editingAddressId === selectedAddressId;
    const showAddressForm = isAddingNewAddress || isEditingAddress;
    const shippingMode = shell.dataset.shippingMode || 'standard';
    const promoCode = shell.dataset.promoCode || '';
    const paymentMethod = shell.dataset.paymentMethod || 'card';
    const subtotal = getSubtotal(items);
    const promoDiscount = getPromoDiscount(subtotal, promoCode);
    const shippingFee = getShippingFee(Math.max(0, subtotal - promoDiscount));
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
            <div class="cart-page-recap-title-row">
              <svg class="cart-page-recap-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
              <h2>Récapitulatif</h2>
            </div>
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
              <div class="cart-page-summary-row">
                <span>Livraison
                  <button type="button" class="cart-page-shipping-info" data-shipping-info aria-label="Détail des frais de livraison">i</button>
                </span>
                <strong>${shippingFee === 0 ? 'Gratuite' : formatPrice(shippingFee)}</strong>
              </div>
              <div class="cart-page-shipping-tooltip" id="cart-shipping-tooltip" hidden>
                <p>Livraison standard : ${formatPrice(STANDARD_SHIPPING_FEE)}, gratuite dès ${formatPrice(FREE_SHIPPING_THRESHOLD)} d'achat.</p>
              </div>
              ${promoDiscount > 0 ? `<div class="cart-page-summary-row cart-page-summary-row-discount"><span>Réduction</span><strong>− ${formatPrice(promoDiscount)}</strong></div>` : ''}
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
          <form class="cart-page-form" id="cart-checkout-form">
            <div class="cart-page-form-section-head">
              <svg class="cart-page-section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="M4 7l8 6 8-6"/></svg>
              <h2>Vos coordonnées</h2>
            </div>
            ${!showAddressForm ? `
              <label class="cart-page-field cart-page-field-full">
                <input type="email" name="email" value="${session.email || ''}" placeholder="Votre e-mail" required>
              </label>
            ` : ''}

            ${savedAddresses.length ? `
              <div class="cart-page-address-book" aria-label="Mes adresses enregistrées">
                <p class="cart-page-address-book-title">Mes adresses</p>
                <div class="cart-page-address-options">
                  ${savedAddresses.map((address) => `
                    <div class="cart-page-address-card">
                      <button class="cart-page-address-option${address.id === selectedAddressId ? ' is-selected' : ''}" type="button" data-checkout-address="${address.id}">
                        <strong>${address.label}</strong>
                        <span>${address.address}</span>
                        <span>${address.postalCode} ${address.city}</span>
                      </button>
                      <div class="cart-page-address-actions">
                        <button class="cart-page-address-edit" type="button" data-edit-address="${address.id}" aria-label="Modifier cette adresse">Modifier</button>
                        <button class="cart-page-address-edit cart-page-address-edit-delete" type="button" data-delete-address="${address.id}" aria-label="Supprimer cette adresse">Supprimer</button>
                      </div>
                    </div>
                  `).join('')}
                  ${savedAddresses.length < MAX_ADDRESSES ? `
                    <button class="cart-page-address-option cart-page-address-option-new${isAddingNewAddress ? ' is-selected' : ''}" type="button" data-checkout-address="__new__">
                      <strong>+ Nouvelle adresse</strong>
                      <span>Ajouter une autre adresse de livraison</span>
                    </button>
                  ` : ''}
                </div>
              </div>
            ` : ''}
            ${showAddressForm ? `
              <label class="cart-page-field cart-page-field-full">
                <span>Libellé</span>
                <input type="text" name="addressLabel" placeholder="Domicile, Travail…" value="${selectedAddress?.label && selectedAddress.label !== 'Adresse principale' ? selectedAddress.label : ''}" maxlength="25">
              </label>
              <label class="cart-page-field cart-page-field-full">
                <span>E-mail</span>
                <input type="email" name="addressEmail" placeholder="Votre e-mail" value="${session.email || ''}" required>
              </label>
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
                ${renderPhoneField(selectedAddress?.phone || session.phone || '')}
              </label>
              <div class="cart-page-address-form-actions">
                <button type="button" class="cart-page-address-save" data-save-address>Enregistrer l’adresse</button>
                <p class="cart-page-address-message" id="cart-address-message" aria-live="polite"></p>
              </div>
            ` : `
              <input type="hidden" name="country" value="${selectedAddress?.country || 'France'}">
              <input type="hidden" name="firstName" value="${selectedAddress?.firstName || ''}">
              <input type="hidden" name="lastName" value="${selectedAddress?.lastName || ''}">
              <input type="hidden" name="address" value="${selectedAddress?.address || ''}">
              <input type="hidden" name="address2" value="${selectedAddress?.address2 || ''}">
              <input type="hidden" name="postalCode" value="${selectedAddress?.postalCode || ''}">
              <input type="hidden" name="city" value="${selectedAddress?.city || ''}">
              <input type="hidden" name="phoneDialCode" value="${parsePhoneValue(selectedAddress?.phone).dialCode}">
              <input type="hidden" name="phoneIso" value="${parsePhoneValue(selectedAddress?.phone).iso}">
              <input type="hidden" name="phone" value="${parsePhoneValue(selectedAddress?.phone).localNumber}">
            `}

            <div class="cart-page-form-section-head cart-page-form-section-head-method">
              <svg class="cart-page-section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
              <h2>Méthode de paiement</h2>
            </div>
            <p class="cart-page-payment-note">Toutes les transactions sont sécurisées et chiffrées</p>
            <div class="cart-page-payment-methods">
              <label class="cart-page-payment-option${paymentMethod === 'card' ? ' is-selected' : ''}">
                <input type="radio" name="paymentMethod" value="card" ${paymentMethod === 'card' ? 'checked' : ''}>
                <span>Stripe</span>
                <span class="cart-page-card-brands" aria-hidden="true">
                  <span class="cart-page-card-brand cart-page-card-brand-visa">VISA</span>
                  <span class="cart-page-card-brand cart-page-card-brand-mastercard"><i></i><i></i></span>
                </span>
              </label>
              <label class="cart-page-payment-option${paymentMethod === 'alma' ? ' is-selected' : ''}">
                <input type="radio" name="paymentMethod" value="alma" ${paymentMethod === 'alma' ? 'checked' : ''}>
                <span>Alma - Paiement en plusieurs fois</span>
              </label>
              ${paymentMethod === 'alma' ? '<p class="cart-page-method-placeholder">Vous serez redirigé(e) vers Alma pour choisir votre échéancier et finaliser le paiement.</p>' : ''}
              <label class="cart-page-payment-option${paymentMethod === 'klarna' ? ' is-selected' : ''}">
                <input type="radio" name="paymentMethod" value="klarna" ${paymentMethod === 'klarna' ? 'checked' : ''}>
                <span>Klarna</span>
              </label>
              ${paymentMethod === 'klarna' ? '<p class="cart-page-method-placeholder">Vous serez redirigé(e) vers Klarna pour finaliser le paiement.</p>' : ''}
              <div class="cart-page-payment-fields${paymentMethod === 'card' ? ' is-active' : ''}">
                <label class="cart-page-field cart-page-field-full">
                  <input type="text" name="cardName" placeholder="Nom sur la carte" ${paymentMethod === 'card' ? 'required' : ''}>
                </label>
                <div class="cart-page-field cart-page-field-full">
                  <div id="stripe-card-element" class="cart-page-stripe-element"></div>
                  <p class="cart-page-stripe-errors" id="stripe-card-errors" role="alert"></p>
                </div>
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

            <button class="cart-page-submit" type="submit">Valider le paiement (${formatPrice(total)})</button>
            <p class="cart-page-checkout-message" id="cart-checkout-message" aria-live="polite"></p>
            <div class="cart-page-legal-links">
              <a href="retours-gratuits.html">Politique de remboursement</a>
              <a href="politique-confidentialite.html">Politique de confidentialité</a>
              <a href="cgu.html">Conditions d'utilisation</a>
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

    shell.querySelectorAll('input[name="paymentMethod"]').forEach((input) => {
      input.addEventListener('change', () => {
        shell.dataset.paymentMethod = input.value;
        renderCartPage();
      });
    });

    if (!shell.dataset.phoneSelectBound) {
      shell.dataset.phoneSelectBound = 'true';
      shell.addEventListener('input', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !target.classList.contains('account-phone-number')) return;
        const iso = target.closest('.account-phone-field')?.querySelector('[data-select-iso]')?.value || 'fr';
        const maxDigits = PHONE_MAX_DIGITS[iso] || 12;
        const digits = target.value.replace(/\D/g, '').slice(0, maxDigits);
        let formatted;
        if (PHONE_GROUPING_3_3_4.has(iso)) {
          const p1 = digits.slice(0, 3);
          const p2 = digits.slice(3, 6);
          const p3 = digits.slice(6, 10);
          formatted = p1 ? (p2 ? `(${p1}) ${p2}${p3 ? `-${p3}` : ''}` : `(${p1}`) : '';
        } else {
          formatted = digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
        }
        target.value = formatted;
      });

      shell.addEventListener('click', (event) => {
        const selectTrigger = event.target.closest('[data-select-trigger]');
        if (selectTrigger) {
          event.preventDefault();
          const panel = selectTrigger.nextElementSibling;
          const willOpen = panel && panel.hidden;
          shell.querySelectorAll('[data-select-panel]').forEach((otherPanel) => {
            if (otherPanel !== panel) otherPanel.hidden = true;
          });
          if (panel) {
            panel.hidden = !willOpen;
            selectTrigger.setAttribute('aria-expanded', String(willOpen));
          }
          return;
        }

        const selectOption = event.target.closest('.jc-select-option');
        if (selectOption) {
          event.preventDefault();
          const jcSelect = selectOption.closest('.jc-select');
          if (jcSelect) {
            const value = selectOption.getAttribute('data-value') || '';
            const iso = selectOption.getAttribute('data-iso') || '';
            const hiddenInput = jcSelect.querySelector('[data-select-value]');
            const isoInput = jcSelect.querySelector('[data-select-iso]');
            const trigger = jcSelect.querySelector('[data-select-trigger]');
            if (hiddenInput) hiddenInput.value = value;
            if (isoInput) isoInput.value = iso;
            if (trigger) {
              const triggerText = trigger.querySelector('span');
              if (triggerText) triggerText.textContent = value;
              const triggerFlag = trigger.querySelector('img');
              const optionFlag = selectOption.querySelector('img');
              if (triggerFlag && optionFlag) triggerFlag.src = optionFlag.src;
              trigger.setAttribute('aria-expanded', 'false');
            }
            jcSelect.querySelectorAll('.jc-select-option').forEach((option) => {
              option.classList.toggle('is-selected', option === selectOption);
            });
          }
          shell.querySelectorAll('[data-select-panel]').forEach((otherPanel) => { otherPanel.hidden = true; });
          return;
        }

        if (!event.target.closest('.jc-select')) {
          shell.querySelectorAll('[data-select-panel]').forEach((otherPanel) => { otherPanel.hidden = true; });
        }
      });
    }

    shell.querySelectorAll('[data-checkout-address]').forEach((button) => {
      button.addEventListener('click', () => {
        shell.dataset.selectedAddressId = button.getAttribute('data-checkout-address') || '';
        delete shell.dataset.editingAddressId;
        renderCartPage();
      });
    });

    shell.querySelectorAll('[data-edit-address]').forEach((button) => {
      button.addEventListener('click', () => {
        const addressId = button.getAttribute('data-edit-address') || '';
        shell.dataset.selectedAddressId = addressId;
        shell.dataset.editingAddressId = addressId;
        renderCartPage();
      });
    });

    shell.querySelectorAll('[data-delete-address]').forEach((button) => {
      button.addEventListener('click', () => {
        const addressId = button.getAttribute('data-delete-address') || '';
        const email = getAccountEmail();
        if (!email) return;
        const nextAddresses = savedAddresses.filter((address) => address.id !== addressId);
        if (nextAddresses.length && !nextAddresses.some((address) => address.isDefault)) {
          nextAddresses[0].isDefault = true;
        }
        persistCheckoutProfile({ email, addresses: nextAddresses });
        shell.dataset.selectedAddressId = nextAddresses.find((address) => address.isDefault)?.id || nextAddresses[0]?.id || '__new__';
        delete shell.dataset.editingAddressId;
        renderCartPage();
      });
    });

    shell.querySelector('[data-save-address]')?.addEventListener('click', () => {
      const addressForm = shell.querySelector('#cart-checkout-form');
      const addressMessage = shell.querySelector('#cart-address-message');
      if (!(addressForm instanceof HTMLFormElement)) return;

      const formData = new FormData(addressForm);
      const email = String(formData.get('addressEmail') || formData.get('email') || '').trim();
      const newLabel = String(formData.get('addressLabel') || '').trim().slice(0, 25);
      const newFirstName = String(formData.get('firstName') || '').trim();
      const newLastName = String(formData.get('lastName') || '').trim();
      const newAddress = String(formData.get('address') || '').trim();
      const newAddress2 = String(formData.get('address2') || '').trim();
      const newPostalCode = String(formData.get('postalCode') || '').trim();
      const newCity = String(formData.get('city') || '').trim();
      const newCountry = String(formData.get('country') || 'France').trim();
      const newPhoneDialCode = String(formData.get('phoneDialCode') || '+33').trim();
      const newPhoneIso = String(formData.get('phoneIso') || 'fr').trim();
      const newPhoneLocalNumber = String(formData.get('phone') || '').trim();
      const newPhone = newPhoneLocalNumber ? `${newPhoneDialCode} ${newPhoneLocalNumber}`.trim() : '';

      if (!email) {
        if (addressMessage) addressMessage.textContent = 'Renseignez votre e-mail avant d’enregistrer une adresse.';
        return;
      }
      if (!newFirstName || !newLastName || !newAddress || !newPostalCode || !newCity) {
        if (addressMessage) addressMessage.textContent = 'Complétez tous les champs obligatoires de l’adresse.';
        return;
      }
      if (!isValidPhoneNumber(newPhoneIso, newPhoneLocalNumber)) {
        if (addressMessage) addressMessage.textContent = 'Le numéro de téléphone ne correspond pas au format attendu pour le pays sélectionné.';
        return;
      }
      if (isAddingNewAddress && savedAddresses.length >= MAX_ADDRESSES) {
        if (addressMessage) addressMessage.textContent = 'Vous avez atteint le maximum de 3 adresses. Modifiez ou supprimez-en une pour en ajouter une nouvelle.';
        return;
      }

      const targetId = isAddingNewAddress ? '' : selectedAddressId;
      const nextAddresses = upsertCheckoutAddress(savedAddresses, {
        id: targetId,
        label: newLabel || selectedAddress?.label || 'Adresse principale',
        firstName: newFirstName,
        lastName: newLastName,
        address: newAddress,
        address2: newAddress2,
        postalCode: newPostalCode,
        city: newCity,
        country: newCountry,
        phone: newPhone,
        isDefault: selectedAddress ? selectedAddress.isDefault : true
      }, targetId);

      persistCheckoutProfile({ email, addresses: nextAddresses });

      shell.dataset.selectedAddressId = nextAddresses[0]?.id || '';
      delete shell.dataset.editingAddressId;
      renderCartPage();
    });

    if (paymentMethod === 'card') initStripeCardElement(shell);
    bindBillingAddressToggle(shell);

    const shippingInfoButton = shell.querySelector('[data-shipping-info]');
    const shippingTooltip = shell.querySelector('#cart-shipping-tooltip');
    if (shippingInfoButton && shippingTooltip) {
      shippingInfoButton.addEventListener('click', (event) => {
        event.preventDefault();
        shippingTooltip.hidden = !shippingTooltip.hidden;
      });
      document.addEventListener('click', (event) => {
        if (shippingTooltip.hidden) return;
        if (event.target === shippingInfoButton || shippingTooltip.contains(event.target)) return;
        shippingTooltip.hidden = true;
      });
    }

    shell.querySelector('#cart-promo-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;
      const nextCode = String(new FormData(form).get('promo') || '').trim().toUpperCase();
      await verifyPromoCodeRemotely(nextCode);
      shell.dataset.promoCode = nextCode;
      renderCartPage();
    });

    shell.querySelector('#cart-checkout-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const message = shell.querySelector('#cart-checkout-message');
      const submitButton = form.querySelector('.cart-page-submit');
      if (!(form instanceof HTMLFormElement)) return;
      const formData = new FormData(form);
      const email = String(formData.get('addressEmail') || formData.get('email') || '').trim();
      const addressLabel = String(formData.get('addressLabel') || '').trim().slice(0, 25);
      const country = String(formData.get('country') || 'France').trim();
      const address = String(formData.get('address') || '').trim();
      const address2 = String(formData.get('address2') || '').trim();
      const postalCode = String(formData.get('postalCode') || '').trim();
      const city = String(formData.get('city') || '').trim();
      const phoneDialCode = String(formData.get('phoneDialCode') || '+33').trim();
      const phoneIso = String(formData.get('phoneIso') || 'fr').trim();
      const phoneLocalNumber = String(formData.get('phone') || '').trim();
      const phone = phoneLocalNumber ? `${phoneDialCode} ${phoneLocalNumber}`.trim() : '';
      const firstName = String(formData.get('firstName') || '').trim();
      const lastName = String(formData.get('lastName') || '').trim();
      const billingSame = formData.get('billingSame') === 'on';
      const billingFirstName = String(formData.get('billingFirstName') || '').trim();
      const billingLastName = String(formData.get('billingLastName') || '').trim();
      const billingAddress = String(formData.get('billingAddress') || '').trim();
      const billingPostalCode = String(formData.get('billingPostalCode') || '').trim();
      const billingCity = String(formData.get('billingCity') || '').trim();
      const selectedPaymentMethod = String(formData.get('paymentMethod') || paymentMethod || 'card');
      const cardName = String(formData.get('cardName') || '').trim();

      const missingIdentity = !email || !address || !firstName || !lastName || !postalCode || !city;
      const missingBilling = !billingSame && (!billingFirstName || !billingLastName || !billingAddress || !billingPostalCode || !billingCity);
      const missingCardName = selectedPaymentMethod === 'card' && !cardName;

      if (missingIdentity || missingBilling || missingCardName) {
        if (message) message.textContent = 'Complétez vos informations de livraison et de paiement pour finaliser la commande.';
        return;
      }
      if (!isValidPhoneNumber(phoneIso, phoneLocalNumber)) {
        if (message) message.textContent = 'Le numéro de téléphone ne correspond pas au format attendu pour le pays sélectionné.';
        return;
      }

      if (selectedPaymentMethod === 'card') {
        const stripe = getStripe();
        if (!stripe || !stripeCardElement) {
          if (message) message.textContent = 'Le paiement par carte est momentanément indisponible, réessayez dans un instant.';
          return;
        }

        if (submitButton) submitButton.disabled = true;
        if (message) message.textContent = 'Paiement en cours…';

        try {
          const intentRes = await fetch('/api/products?createPaymentIntent=1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: items.map((item) => ({ id: item.id, quantity: item.quantity })),
              promoCode,
              shippingMode
            })
          });
          const intentData = await intentRes.json();
          if (!intentRes.ok) throw new Error(intentData.error || 'Échec de la préparation du paiement');

          const confirmResult = await stripe.confirmCardPayment(intentData.clientSecret, {
            payment_method: {
              card: stripeCardElement,
              billing_details: { name: cardName, email }
            }
          });

          if (confirmResult.error) throw new Error(confirmResult.error.message || 'Paiement refusé');
          if (confirmResult.paymentIntent?.status !== 'succeeded') throw new Error('Paiement non abouti, réessayez.');
        } catch (paymentError) {
          if (submitButton) submitButton.disabled = false;
          if (message) message.textContent = paymentError.message || 'Le paiement a échoué, réessayez.';
          return;
        }
      }

      persistCheckoutProfile({
        email,
        firstName,
        lastName,
        deliveryAddress: address,
        country,
        address2,
        postalCode,
        city,
        phone,
        addresses: upsertCheckoutAddress(savedAddresses, {
          id: isAddingNewAddress ? '' : selectedAddressId,
          label: addressLabel || selectedAddress?.label || 'Adresse principale',
          firstName,
          lastName,
          address,
          address2,
          postalCode,
          city,
          country,
          phone,
          isDefault: true
        }, isAddingNewAddress ? '' : selectedAddressId)
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

  window.addEventListener('jaces:account-sync', (event) => {
    const email = String(event?.detail?.session?.email || '').trim().toLowerCase();
    if (email) mergeGuestCartIntoAccount(email);
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