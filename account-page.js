(function () {
  const ACCOUNT_SESSION_KEY = 'jaces-account-session';
  const ACCOUNT_PROFILES_KEY = 'jaces-account-profiles';
  const ACCOUNT_SECTIONS = new Set(['compte', 'commandes', 'adresses']);
  const MAX_ADDRESSES = 3;

  const state = {
    section: 'compte',
    passwordEdit: false,
    deleteConfirm: false,
    selectedOrderId: '',
    addressEditor: null,
    feedback: ''
  };

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

  function getSession() {
    if (window.JacesAuth && typeof window.JacesAuth.getSession === 'function') {
      return window.JacesAuth.getSession();
    }
    return readJsonStorage(ACCOUNT_SESSION_KEY, null);
  }

  // [iso2, name, dial code] - covers France plus the countries JACES
  // customers most plausibly ship/call from; sorted with France first so
  // it's the default selection.
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
    // Longest dial code first so "+1" doesn't swallow a "+352" number, etc.
    const sortedByCodeLength = PHONE_COUNTRIES.slice().sort((a, b) => b[2].length - a[2].length);
    const match = sortedByCodeLength.find(([, , dialCode]) => raw.startsWith(dialCode));
    if (match) {
      return { iso: match[0], dialCode: match[2], localNumber: raw.slice(match[2].length).trim() };
    }
    return { iso: 'fr', dialCode: '+33', localNumber: raw };
  }

  // North America uses 3-3-4 grouping ((XXX) XXX-XXXX); most of the rest of
  // this list follows the common European 2-by-2 convention - not every
  // country's real convention, but a reasonable default that's still far
  // more readable than one solid block of digits.
  const PHONE_GROUPING_3_3_4 = new Set(['us', 'ca']);
  // In proper international format the trunk "0" that's dialed locally is
  // dropped once the country code is prefixed (06 66 07 55 33 -> +33 6 66
  // 07 55 33) - true for most of Europe. Italy is a well-known exception:
  // Italian numbers keep their leading 0 even with +39.
  const PHONE_KEEPS_LEADING_ZERO = new Set(['it']);
  // Max digit count typed locally, leading 0 included where applicable
  // (France: "0666075533" = 10, or "666075533" without it = 9 - both fit
  // under this cap). Any country not listed falls back to a generic 12.
  const PHONE_MAX_DIGITS = {
    fr: 10, be: 9, ch: 9, lu: 9, de: 11, es: 9, it: 10, gb: 10, ie: 9, pt: 9, nl: 9, at: 11,
    us: 10, ca: 10,
    ma: 9, dz: 9, tn: 8, sn: 9, ci: 10, cm: 9, mu: 8, re: 9, gp: 9, mq: 9, gf: 9,
    ru: 10, cn: 11, jp: 10, au: 9, br: 11, in: 10
  };

  function formatPhoneForDisplay(rawPhone) {
    const { iso, localNumber } = parsePhoneValue(rawPhone);
    const digits = localNumber.replace(/\D/g, '');
    if (!digits) return '';

    const countryEntry = PHONE_COUNTRIES.find(([code]) => code === iso);
    const countryName = countryEntry ? countryEntry[1] : '';

    let formattedLocal;
    if (PHONE_GROUPING_3_3_4.has(iso) && digits.length === 10) {
      formattedLocal = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else {
      formattedLocal = digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
    }

    return countryName ? `${countryName} ${formattedLocal}` : formattedLocal;
  }

  // Accepts either the full local length (with a leading 0, e.g. France's
  // 10-digit "0666075533") or one digit short (without it, "666075533") -
  // both are legitimate depending on how the person types it.
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
      `    <button type="button" class="jc-select-trigger account-phone-trigger" data-select-trigger aria-haspopup="listbox" aria-expanded="false"><img src="${flagUrl(iso)}" alt="" class="account-phone-flag"><span>${escapeHtml(dialCode)}</span><svg class="jc-select-caret" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`,
      '    <ul class="jc-select-panel account-phone-panel" role="listbox" data-select-panel hidden>',
      PHONE_COUNTRIES.map(([code, name, dial]) => `<li class="jc-select-option account-phone-option${code === iso ? ' is-selected' : ''}" role="option" data-value="${escapeHtml(dial)}" data-iso="${escapeHtml(code)}"><img src="${flagUrl(code)}" alt="" class="account-phone-flag">${escapeHtml(name)} (${escapeHtml(dial)})</li>`).join(''),
      '    </ul>',
      `    <input type="hidden" name="phoneDialCode" data-select-value value="${escapeHtml(dialCode)}">`,
      `    <input type="hidden" name="phoneIso" data-select-iso value="${escapeHtml(iso)}">`,
      '  </div>',
      `  <input type="tel" name="phone" value="${escapeHtml(localNumber)}" placeholder="Votre numéro" class="account-phone-number" autocomplete="tel-national">`,
      '</div>'
    ].join('');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncateText(value, maxLength) {
    const raw = String(value || '');
    return raw.length > maxLength ? `${raw.slice(0, maxLength).trim()}…` : raw;
  }

  function normalizePersonName(value) {
    // Letters (incl. accents: é, è, ç, ü...), spaces, hyphens and apostrophes
    // only - covers real French names ("Jean-Paul", "O'Brien") while still
    // blocking digits, symbols and emoji. Kept in sync with auth.js.
    const cleaned = String(value || '').replace(/[^\p{L}\s'-]/gu, '');
    if (!/\p{L}/u.test(cleaned)) return '';
    return cleaned
      .toLowerCase()
      .replace(/(^|[\s'-])(\p{L})/gu, (match, boundary, letter) => boundary + letter.toUpperCase());
  }

  function formatPrice(value) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
  }

  function getPaymentLabel(paymentMethod) {
    if (paymentMethod === 'card') return 'Carte bancaire';
    if (paymentMethod === 'paypal') return 'PayPal';
    return 'Paiement sécurisé';
  }

  function getShippingLabel(shippingMode) {
    return shippingMode === 'express' ? 'Livraison express' : 'Livraison standard';
  }

  function getStatusClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('livr')) return 'is-delivered';
    if (normalized.includes('annul') || normalized.includes('retard') || normalized.includes('problem')) return 'is-problem';
    return 'is-progress';
  }

  function toAddressId(value) {
    return String(value || '') || `addr-${Date.now()}`;
  }

  function getCurrentEmail() {
    return String(getSession()?.email || '').trim().toLowerCase();
  }

  function getStoredProfile(email) {
    if (!email) return null;
    const profiles = readJsonStorage(ACCOUNT_PROFILES_KEY, {});
    return profiles[email] || null;
  }

  function saveProfile(profile) {
    if (!profile || !profile.email) return;
    const email = String(profile.email).trim().toLowerCase();
    const profiles = readJsonStorage(ACCOUNT_PROFILES_KEY, {});
    profiles[email] = Object.assign({}, profiles[email] || {}, profile, { email });
    writeJsonStorage(ACCOUNT_PROFILES_KEY, profiles);

    const session = getSession();
    if (session && String(session.email || '').trim().toLowerCase() === email) {
      const nextSession = Object.assign({}, session, profiles[email], { email });
      writeJsonStorage(ACCOUNT_SESSION_KEY, nextSession);
      window.dispatchEvent(new CustomEvent('jaces:account-sync', { detail: { session: nextSession } }));
    }
  }

  function normalizeAddress(address, index) {
    return {
      id: toAddressId(address?.id || `address-${index + 1}`),
      label: String(address?.label || (index === 0 ? 'Adresse principale' : `Adresse ${index + 1}`)).trim().slice(0, 25),
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

  function deriveAddresses(profile) {
    // Distinguish "no addresses array ever saved" (synthesize a preview from
    // the latest order below) from "explicitly saved as an empty array" (the
    // user deleted their last address - respect that instead of resurrecting
    // the order-derived preview on every render, which made Supprimer look
    // like a no-op for that entry).
    const hasExplicitAddresses = Array.isArray(profile?.addresses);
    const storedAddresses = hasExplicitAddresses
      ? profile.addresses.map(normalizeAddress)
      : [];

    if (storedAddresses.length) {
      if (!storedAddresses.some((address) => address.isDefault)) {
        storedAddresses[0].isDefault = true;
      }
      return storedAddresses;
    }

    if (hasExplicitAddresses) return [];

    const latestOrder = Array.isArray(profile?.orders) ? profile.orders[0] : null;
    const shippingAddress = latestOrder?.shippingAddress || null;
    const baseAddress = shippingAddress?.address || profile?.deliveryAddress;
    if (!baseAddress) return [];

    // Marked isSynthetic so it's never mistaken for a genuinely saved address
    // when adding a *different* new address (see the account-address-form
    // submit handler) - only explicitly editing/saving this exact card
    // should turn it into a real stored entry.
    return [Object.assign(normalizeAddress({
      id: 'default-address',
      label: 'Adresse principale',
      firstName: shippingAddress?.firstName || profile?.firstName || '',
      lastName: shippingAddress?.lastName || profile?.lastName || '',
      address: shippingAddress?.address || profile?.deliveryAddress || '',
      address2: shippingAddress?.address2 || '',
      postalCode: shippingAddress?.postalCode || profile?.postalCode || '',
      city: shippingAddress?.city || profile?.city || '',
      country: shippingAddress?.country || profile?.country || 'France',
      phone: shippingAddress?.phone || profile?.phone || '',
      isDefault: true
    }, 0), { isSynthetic: true })];
  }

  function buildProfile() {
    const session = getSession();
    if (!session) return null;
    const email = String(session.email || '').trim().toLowerCase();
    const storedProfile = getStoredProfile(email) || {};
    const mergedProfile = Object.assign({}, storedProfile, session, { email });
    mergedProfile.orders = Array.isArray(mergedProfile.orders) ? mergedProfile.orders : [];
    mergedProfile.addresses = deriveAddresses(mergedProfile);
    return mergedProfile;
  }

  function getSectionFromHash() {
    const normalizedHash = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
    return ACCOUNT_SECTIONS.has(normalizedHash) ? normalizedHash : 'compte';
  }

  function setSection(section) {
    const nextSection = ACCOUNT_SECTIONS.has(section) ? section : 'compte';
    if (window.location.hash !== `#${nextSection}`) {
      window.location.hash = nextSection;
      return;
    }
    state.section = nextSection;
    render();
  }

  function getSelectedOrder(profile) {
    const orders = Array.isArray(profile?.orders) ? profile.orders : [];
    if (!orders.length) return null;
    const matchedOrder = orders.find((order) => order.id === state.selectedOrderId);
    return matchedOrder || orders[0];
  }

  function getOrderImage(item) {
    if (item?.img) return item.img;
    if (window.JacesCatalog && typeof window.JacesCatalog.getProductById === 'function') {
      const product = window.JacesCatalog.getProductById(item?.id);
      return product?.img || '';
    }
    return '';
  }

  function buildInvoiceContent(order) {
    const items = Array.isArray(order?.items) ? order.items : [];
    return [
      `Facture ${order.id || ''}`,
      `Date : ${formatDate(order.createdAt)}`,
      `Client : ${order.email || ''}`,
      '',
      'Produits :',
      ...items.map((item) => `- ${item.name} | ${item.size} / ${item.color} | x${item.quantity} | ${item.price}`),
      '',
      `Sous-total : ${formatPrice(order.subtotal)}`,
      `Livraison : ${formatPrice(order.shippingFee)}`,
      `Réduction : ${formatPrice(order.promoDiscount)}`,
      `Taxes : ${formatPrice(order.taxAmount)}`,
      `Total : ${formatPrice(order.total)}`
    ].join('\n');
  }

  function downloadInvoice(order) {
    const blob = new Blob([buildInvoiceContent(order)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${order.id || 'facture-jaces'}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function reorderItems(order) {
    if (!window.JacesCart || typeof window.JacesCart.addItem !== 'function') return false;
    const items = Array.isArray(order?.items) ? order.items : [];
    items.forEach((item) => {
      const product = window.JacesCatalog && typeof window.JacesCatalog.getProductById === 'function'
        ? window.JacesCatalog.getProductById(item.id)
        : item;
      const quantity = Math.max(1, Number(item.quantity) || 1);
      for (let index = 0; index < quantity; index += 1) {
        window.JacesCart.addItem(product || item, item.size, 1, item.color);
      }
    });
    return true;
  }

  function renderMenu(section, profile) {
    const firstName = profile?.firstName || '';
    const initial = escapeHtml((firstName || 'C').charAt(0).toUpperCase());
    const userSummary = profile ? [
      '  <div class="account-user-summary account-page-user-summary">',
      `    <div class="account-user-avatar">${initial}</div>`,
      '    <div class="account-user-copy">',
      `      <strong>Bonjour ${escapeHtml(firstName || 'vous')}</strong>`,
      '    </div>',
      '  </div>'
    ].join('') : '';

    const icons = {
      compte: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      commandes: '<path d="M9 2L6.12 9H1l2.5 7.5v5h15v-5l2.5-7.5H17.88L15 2"/>',
      adresses: '<path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
      logout: '<path d="M12 3v9"/><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>'
    };
    const menuIcon = (key) => `<svg class="account-page-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${icons[key]}</svg>`;
    const chevron = '<svg class="account-page-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

    return [
      '<aside class="account-page-sidebar">',
      userSummary,
      '  <nav class="account-page-menu" aria-label="Menu du compte">',
      `    <a class="account-page-menu-item${section === 'compte' ? ' is-active' : ''}" href="#compte">${menuIcon('compte')}<span>Mon compte</span>${chevron}</a>`,
      `    <a class="account-page-menu-item${section === 'commandes' ? ' is-active' : ''}" href="#commandes">${menuIcon('commandes')}<span>Mes commandes</span>${chevron}</a>`,
      `    <a class="account-page-menu-item${section === 'adresses' ? ' is-active' : ''}" href="#adresses">${menuIcon('adresses')}<span>Mes adresses</span>${chevron}</a>`,
      '  </nav>',
      `  <button class="account-page-logout" type="button" data-account-page-logout>${menuIcon('logout')}<span>Déconnexion</span></button>`,
      '</aside>'
    ].join('');
  }

  function renderAuthGate(section) {
    return [
      '<div class="account-page-layout">',
      renderMenu(section),
      '  <div class="account-page-content">',
      '    <section class="account-content-card account-auth-gate">',
      '      <p class="account-content-kicker">Connexion requise</p>',
      '      <h2>Connectez-vous pour accéder à votre espace JACES.</h2>',
      '      <p>Retrouvez vos commandes, vos adresses et vos informations personnelles dans un espace simple et rapide.</p>',
      '      <div class="account-page-actions">',
      '        <button class="account-primary-button" type="button" data-account-page-login>Se connecter</button>',
      '        <a class="account-secondary-button" href="collection.html">Continuer la sélection</a>',
      '      </div>',
      '    </section>',
      '  </div>',
      '</div>'
    ].join('');
  }

  function renderFeedback() {
    if (!state.feedback) return '';
    return `<p class="account-page-feedback">${escapeHtml(state.feedback)}</p>`;
  }

  function renderAccountSection(profile) {
    return [
      '<section class="account-content-card">',
      '  <div class="account-content-card-head">',
      '    <div>',
      '      <h2>Mon compte</h2>',
      '    </div>',
      '    <div class="account-page-actions account-page-actions-inline">',
      `      <button class="account-secondary-button" type="button" data-account-password-toggle>${state.passwordEdit ? 'Fermer' : 'Changer le mot de passe'}</button>`,
      '    </div>',
      '  </div>',
      '  <form class="account-form-grid" id="account-profile-form">',
      `    <label class="account-form-field"><span>Nom</span><input type="text" name="lastName" value="${escapeHtml(profile.lastName || '')}" required></label>`,
      `    <label class="account-form-field"><span>Prénom</span><input type="text" name="firstName" value="${escapeHtml(profile.firstName || '')}" required></label>`,
      `    <label class="account-form-field account-form-field-full"><span>Téléphone</span>${renderPhoneField(profile.phone)}</label>`,
      `    <label class="account-form-field account-form-field-full"><span>Email</span><input type="email" name="email" value="${escapeHtml(profile.email || '')}" required></label>`,
      '    <div class="account-page-actions"><button class="account-primary-button" type="submit">Enregistrer</button></div>',
      '  </form>',
      '  <div class="account-info-strips">',
      `    <div class="account-info-strip${profile.newsletterProducts ? ' is-active' : ''}">`,
      '      <span>Nouveaux produits</span>',
      `      <strong>${profile.newsletterProducts ? 'Active' : 'Inactive'}</strong>`,
      `      <button class="account-info-strip-toggle" type="button" data-newsletter-toggle="newsletterProducts">${profile.newsletterProducts ? 'Désactiver' : 'Activer'}</button>`,
      '    </div>',
      `    <div class="account-info-strip${profile.newsletterCollections ? ' is-active' : ''}">`,
      '      <span>Actualités JACES</span>',
      `      <strong>${profile.newsletterCollections ? 'Active' : 'Inactive'}</strong>`,
      `      <button class="account-info-strip-toggle" type="button" data-newsletter-toggle="newsletterCollections">${profile.newsletterCollections ? 'Désactiver' : 'Activer'}</button>`,
      '    </div>',
      '  </div>',
      state.passwordEdit ? [
        '  <form class="account-password-panel" id="account-password-form">',
        '    <p class="account-content-kicker">Sécurité</p>',
        '    <div class="account-form-grid">',
        '      <label class="account-form-field"><span>Mot de passe actuel</span><input type="password" name="currentPassword" required></label>',
        '      <label class="account-form-field"><span>Nouveau mot de passe</span><input type="password" name="nextPassword" minlength="8" required></label>',
        '      <label class="account-form-field account-form-field-full"><span>Confirmer le nouveau mot de passe</span><input type="password" name="confirmPassword" minlength="8" required></label>',
        '    </div>',
        '    <div class="account-page-actions"><button class="account-primary-button" type="submit">Mettre à jour</button></div>',
        '  </form>'
      ].join('') : '',
      renderFeedback(),
      '  <div class="account-danger-zone">',
      '    <p class="account-content-kicker">Zone sensible</p>',
      state.deleteConfirm
        ? [
            '    <p>Cette action est irr&eacute;versible : votre compte et vos donn&eacute;es JACES seront supprim&eacute;s d&eacute;finitivement.</p>',
            '    <div class="account-page-actions">',
            '      <button class="account-danger-button" type="button" data-account-delete-confirm>Confirmer la suppression</button>',
            '      <button class="account-secondary-button" type="button" data-account-delete-cancel>Annuler</button>',
            '    </div>'
          ].join('')
        : '    <button class="account-danger-button" type="button" data-account-delete-start>Supprimer mon compte</button>',
      '  </div>',
      '</section>'
    ].join('');
  }

  function renderOrdersSection(profile) {
    const orders = Array.isArray(profile.orders) ? profile.orders : [];
    const latestOrders = orders.slice(0, 3);
    const selectedOrder = getSelectedOrder(profile);

    if (!orders.length) {
      return [
        '<section class="account-content-card">',
        '  <p class="account-content-kicker">Mes commandes</p>',
        '  <h2>Aucune commande pour le moment</h2>',
        '  <p>Vos confirmations, détails et suivis de colis apparaîtront ici après votre prochain achat.</p>',
        renderFeedback(),
        '</section>'
      ].join('');
    }

    return [
      '<section class="account-content-card">',
      '  <div class="account-content-card-head">',
      '    <div>',
      '      <p class="account-content-kicker">Mes commandes</p>',
      '      <h2>Dernières commandes</h2>',
      '    </div>',
      '    <button class="account-secondary-button" type="button" data-scroll-orders>Voir toutes les commandes</button>',
      '  </div>',
      '  <div class="account-order-highlight-grid">',
      latestOrders.map((order) => `
        <article class="account-order-highlight">
          <strong>${escapeHtml(order.id || '')}</strong>
          <p>${escapeHtml(formatDate(order.createdAt) || '')}</p>
          <p>${escapeHtml(formatPrice(order.total))}</p>
          <span class="account-status-badge ${getStatusClass(order.status)}">${escapeHtml(order.status || 'En cours')}</span>
        </article>
      `).join(''),
      '  </div>',
      '</section>',
      '<section class="account-content-card" id="account-orders-list">',
      '  <div class="account-content-card-head">',
      '    <div>',
      '      <p class="account-content-kicker">Historique complet</p>',
      '      <h2>Toutes les commandes</h2>',
      '    </div>',
      '  </div>',
      '  <div class="account-order-table">',
      orders.map((order) => `
        <article class="account-order-row">
          <div>
            <strong>${escapeHtml(order.id || '')}</strong>
            <p>${escapeHtml(formatDate(order.createdAt) || '')}</p>
          </div>
          <div>
            <strong>${escapeHtml(formatPrice(order.total))}</strong>
          </div>
          <div>
            <span class="account-status-badge ${getStatusClass(order.status)}">${escapeHtml(order.status || 'En cours')}</span>
          </div>
          <div>
            <button class="account-secondary-button" type="button" data-order-detail="${escapeHtml(order.id || '')}">Voir détail</button>
          </div>
        </article>
      `).join(''),
      '  </div>',
      '</section>',
      selectedOrder ? [
        '<section class="account-content-card">',
        '  <div class="account-content-card-head">',
        '    <div>',
        '      <p class="account-content-kicker">Détail de commande</p>',
        `      <h2>${escapeHtml(selectedOrder.id || '')}</h2>`,
        '    </div>',
        `    <span class="account-status-badge ${getStatusClass(selectedOrder.status)}">${escapeHtml(selectedOrder.status || 'En cours')}</span>`,
        '  </div>',
        '  <div class="account-order-detail-grid">',
        '    <div class="account-order-products">',
        '      <h3>Produits</h3>',
        (Array.isArray(selectedOrder.items) ? selectedOrder.items : []).map((item) => `
          <article class="account-order-product">
            <div class="account-order-product-media">${getOrderImage(item) ? `<img src="${escapeHtml(getOrderImage(item))}" alt="${escapeHtml(item.name || 'Produit JACES')}">` : '<div class="favorites-card-placeholder"></div>'}</div>
            <div class="account-order-product-copy">
              <strong>${escapeHtml(item.name || 'Produit JACES')}</strong>
              <p>${escapeHtml(item.size || '')} / ${escapeHtml(item.color || '')}</p>
              <p>${escapeHtml(item.price || '')} · Quantité ${escapeHtml(String(item.quantity || 1))}</p>
            </div>
          </article>
        `).join(''),
        '    </div>',
        '    <div class="account-order-infos">',
        '      <div class="account-order-info-card">',
        '        <h3>Adresse de livraison</h3>',
        `        <p>${escapeHtml(selectedOrder.shippingAddress?.firstName || '')} ${escapeHtml(selectedOrder.shippingAddress?.lastName || '')}</p>`,
        `        <p>${escapeHtml(selectedOrder.shippingAddress?.address || '')}</p>`,
        selectedOrder.shippingAddress?.address2 ? `        <p>${escapeHtml(selectedOrder.shippingAddress.address2)}</p>` : '',
        `        <p>${escapeHtml(selectedOrder.shippingAddress?.postalCode || '')} ${escapeHtml(selectedOrder.shippingAddress?.city || '')}</p>`,
        `        <p>${escapeHtml(selectedOrder.shippingAddress?.country || 'France')}</p>`,
        '      </div>',
        '      <div class="account-order-info-card">',
        '        <h3>Livraison</h3>',
        `        <p>${escapeHtml(getShippingLabel(selectedOrder.shippingMode))}</p>`,
        `        <p>${escapeHtml(formatPrice(selectedOrder.shippingFee))}</p>`,
        '      </div>',
        '      <div class="account-order-info-card">',
        '        <h3>Paiement</h3>',
        `        <p>${escapeHtml(getPaymentLabel(selectedOrder.paymentMethod))}</p>`,
        `        <p>Total ${escapeHtml(formatPrice(selectedOrder.total))}</p>`,
        '      </div>',
        '    </div>',
        '  </div>',
        '  <div class="account-page-actions">',
        `    <button class="account-primary-button" type="button" data-order-track="${escapeHtml(selectedOrder.id || '')}">Suivre le colis</button>`,
        `    <button class="account-secondary-button" type="button" data-order-invoice="${escapeHtml(selectedOrder.id || '')}">Télécharger la facture</button>`,
        `    <button class="account-secondary-button" type="button" data-order-reorder="${escapeHtml(selectedOrder.id || '')}">Commander à nouveau</button>`,
        `    <button class="account-secondary-button" type="button" data-order-return="${escapeHtml(selectedOrder.id || '')}">Faire un retour</button>`,
        '  </div>',
        renderFeedback(),
        '</section>'
      ].join('') : ''
    ].join('');
  }

  function renderAddressForm(profile, address) {
    // Browser autofill can (rarely) inject a stray "Please select" string
    // into the city field - never a real commune, so it's cleared here and
    // re-looked-up automatically below rather than shown as-is.
    const isPlaceholderCity = (value) => /^please\s*select$/i.test(String(value || '').trim());

    const currentAddress = address ? Object.assign({}, address, {
      city: isPlaceholderCity(address.city) ? '' : address.city
    }) : {
      id: '',
      label: '',
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      address: '',
      address2: '',
      postalCode: '',
      city: '',
      country: 'France',
      phone: profile.phone || '',
      isDefault: !profile.addresses.length
    };

    return [
      '<form class="account-address-form" id="account-address-form">',
      `  <input type="hidden" name="id" value="${escapeHtml(currentAddress.id || '')}">`,
      '  <div class="account-content-card-head">',
      '    <div>',
      `      <p class="account-content-kicker">${state.addressEditor?.mode === 'edit' ? 'Modifier une adresse' : 'Nouvelle adresse'}</p>`,
      `      <h2>${state.addressEditor?.mode === 'edit' ? 'Modifier l’adresse' : 'Ajouter une adresse'}</h2>`,
      '    </div>',
      '  </div>',
      '  <div class="account-form-grid">',
      `    <label class="account-form-field account-form-field-full"><span>Libellé</span><input type="text" name="label" value="${escapeHtml(currentAddress.label || '')}" placeholder="Adresse principale" autocomplete="off" maxlength="25" required></label>`,
      `    <label class="account-form-field"><span>Prénom</span><input type="text" name="firstName" value="${escapeHtml(currentAddress.firstName || '')}" autocomplete="given-name" required></label>`,
      `    <label class="account-form-field"><span>Nom</span><input type="text" name="lastName" value="${escapeHtml(currentAddress.lastName || '')}" autocomplete="family-name" required></label>`,
      `    <label class="account-form-field account-form-field-full"><span>Adresse</span><input type="text" name="address" value="${escapeHtml(currentAddress.address || '')}" autocomplete="address-line1" required></label>`,
      `    <label class="account-form-field account-form-field-full"><span>Complément d’adresse</span><input type="text" name="address2" value="${escapeHtml(currentAddress.address2 || '')}" placeholder="Appartement, suite, etc." autocomplete="address-line2"></label>`,
      `    <label class="account-form-field"><span>Code postal</span><input type="text" name="postalCode" value="${escapeHtml(currentAddress.postalCode || '')}" autocomplete="postal-code" required></label>`,
      `    <label class="account-form-field"><span>Ville</span><input type="text" name="city" value="${escapeHtml(currentAddress.city || '')}" autocomplete="address-level2" required><div class="account-city-suggestions" id="account-city-suggestions" hidden></div></label>`,
      `    <label class="account-form-field"><span>Pays</span><input type="text" name="country" value="${escapeHtml(currentAddress.country || 'France')}" autocomplete="country-name" required></label>`,
      `    <label class="account-form-field account-form-field-full"><span>Téléphone</span>${renderPhoneField(currentAddress.phone)}</label>`,
      `    <label class="account-check"><input type="checkbox" name="isDefault" ${currentAddress.isDefault ? 'checked' : ''}><span>Définir comme adresse par défaut</span></label>`,
      '  </div>',
      '  <div class="account-page-actions">',
      '    <button class="account-primary-button" type="submit">Enregistrer l’adresse</button>',
      '    <button class="account-secondary-button" type="button" data-address-cancel>Annuler</button>',
      '  </div>',
      '</form>'
    ].join('');
  }

  function renderAddressesSection(profile) {
    const addresses = (Array.isArray(profile.addresses) ? profile.addresses.slice() : [])
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    const editingAddress = state.addressEditor
      ? addresses.find((address) => address.id === state.addressEditor.id) || null
      : null;

    return [
      '<section class="account-content-card">',
      '  <div class="account-content-card-head">',
      '    <div>',
      '      <p class="account-content-kicker">Mes adresses</p>',
      '      <h2>Gérez vos adresses</h2>',
      '    </div>',
      addresses.length >= MAX_ADDRESSES
        ? '    <button class="account-primary-button" type="button" disabled title="Maximum 3 adresses : modifiez ou supprimez-en une pour en ajouter une nouvelle">Ajouter une adresse</button>'
        : '    <button class="account-primary-button" type="button" data-address-add>Ajouter une adresse</button>',
      '  </div>',
      addresses.length ? '  <div class="account-address-list">' + addresses.map((address) => `
        <article class="account-address-card">
          <div class="account-address-head">
            <svg class="account-address-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
            <strong>${escapeHtml(truncateText(address.label, 25))}</strong>
            ${address.isDefault ? '<span class="account-address-badge">Par défaut</span>' : ''}
          </div>
          <div class="account-address-copy">
            <p>${escapeHtml(address.firstName)} ${escapeHtml(address.lastName)}</p>
            <p>${escapeHtml(address.address)}</p>
            ${address.address2 ? `<p>${escapeHtml(address.address2)}</p>` : ''}
            <p>${escapeHtml(address.postalCode)} ${escapeHtml(address.city)}</p>
            <p>${escapeHtml(address.country)}</p>
            ${address.phone ? `<p class="account-address-phone">${escapeHtml(formatPhoneForDisplay(address.phone))}</p>` : ''}
          </div>
          <div class="account-address-actions">
            <button class="account-address-action" type="button" data-address-edit="${escapeHtml(address.id)}">Modifier</button>
            <button class="account-address-action is-danger" type="button" data-address-delete="${escapeHtml(address.id)}">Supprimer</button>
          </div>
        </article>
      `).join('') + '  </div>' : [
        '  <div class="account-address-empty">',
        '    <p>Aucune adresse enregistrée pour le moment.</p>',
        '  </div>'
      ].join(''),
      state.addressEditor ? renderAddressForm(profile, editingAddress) : '',
      renderFeedback(),
      '</section>'
    ].join('');
  }

  function renderContent(profile) {
    if (state.section === 'commandes') return renderOrdersSection(profile);
    if (state.section === 'adresses') return renderAddressesSection(profile);
    return renderAccountSection(profile);
  }

  function render() {
    const shell = document.getElementById('account-page-shell');
    if (!shell) return;

    state.section = getSectionFromHash();
    const profile = buildProfile();
    if (!profile) {
      shell.innerHTML = renderAuthGate(state.section);
      return;
    }

    if (state.section === 'commandes' && !state.selectedOrderId && profile.orders[0]) {
      state.selectedOrderId = profile.orders[0].id;
    }

    shell.innerHTML = [
      '<div class="account-page-layout">',
      renderMenu(state.section, profile),
      '  <div class="account-page-content">',
      renderContent(profile),
      '  </div>',
      '</div>'
    ].join('');
  }

  function persistAddresses(profile, addresses) {
    const normalizedAddresses = addresses.map(normalizeAddress);
    if (normalizedAddresses.length && !normalizedAddresses.some((address) => address.isDefault)) {
      normalizedAddresses[0].isDefault = true;
    }
    const defaultAddress = normalizedAddresses.find((address) => address.isDefault) || normalizedAddresses[0] || null;
    saveProfile(Object.assign({}, profile, {
      addresses: normalizedAddresses,
      deliveryAddress: defaultAddress?.address || profile.deliveryAddress || '',
      phone: defaultAddress?.phone || profile.phone || ''
    }));
  }

  function lookupCityForPostalCode(form, rawPostalCode) {
    const raw = String(rawPostalCode || '').trim();
    if (!/^\d{5}$/.test(raw)) return;
    const cityInput = form?.querySelector('input[name="city"]');
    const citySuggestions = form?.querySelector('#account-city-suggestions');
    if (!cityInput) return;
    fetch(`https://geo.api.gouv.fr/communes?codePostal=${raw}&fields=nom&format=json`)
      .then((res) => (res.ok ? res.json() : []))
      .then((results) => {
        if (!Array.isArray(results) || !results.length) return;
        cityInput.value = results[0].nom;
        // Several communes can share one postal code - rather than showing
        // a second box under the field, the dropdown *replaces* the text
        // input in place so there's only ever one visible "Ville" control.
        // Built with the same .jc-select component used for the signup
        // birth-date pickers, so it's styled in JACES colors rather than
        // the browser's native (unstyleable) <select> popup.
        if (citySuggestions) {
          if (results.length > 1) {
            cityInput.hidden = true;
            citySuggestions.hidden = false;
            citySuggestions.innerHTML = [
              '<div class="jc-select" data-select-name="city">',
              `  <button type="button" class="jc-select-trigger" data-select-trigger aria-haspopup="listbox" aria-expanded="false"><span>${escapeHtml(results[0].nom)}</span><svg class="jc-select-caret" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`,
              '  <ul class="jc-select-panel" role="listbox" data-select-panel hidden>',
              results.map((commune) => `<li class="jc-select-option${commune.nom === results[0].nom ? ' is-selected' : ''}" role="option" data-value="${escapeHtml(commune.nom)}">${escapeHtml(commune.nom)}</li>`).join(''),
              '  </ul>',
              '</div>'
            ].join('');
          } else {
            cityInput.hidden = false;
            citySuggestions.hidden = true;
            citySuggestions.innerHTML = '';
          }
        }
      })
      .catch(() => {
        // Best-effort lookup - the field just stays editable by hand if the
        // geo.api.gouv.fr call fails or the code isn't recognized.
      });
  }

  function bindShellEvents() {
    const shell = document.getElementById('account-page-shell');
    if (!shell) return;
    if (shell.dataset.bound === 'true') return;
    shell.dataset.bound = 'true';

    shell.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;

      if (target.name === 'postalCode') {
        lookupCityForPostalCode(target.closest('form'), target.value);
        return;
      }

      if (target.classList.contains('account-phone-number')) {
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
        return;
      }

      if (target.name === 'label' && target.closest('form')?.id === 'account-address-form') {
        // Once the person edits the label by hand, stop overwriting it from
        // firstName/lastName - only the still-untouched default gets synced.
        delete target.dataset.autofilled;
        return;
      }

      if (target.name !== 'firstName' && target.name !== 'lastName') return;
      const normalizedValue = normalizePersonName(target.value);
      if (normalizedValue !== target.value) {
        target.value = normalizedValue;
      }

      const addressForm = target.closest('#account-address-form');
      if (addressForm) {
        const labelInput = addressForm.querySelector('input[name="label"]');
        if (labelInput && (labelInput.value.trim() === '' || labelInput.dataset.autofilled === 'true')) {
          const firstName = addressForm.querySelector('input[name="firstName"]')?.value.trim() || '';
          const lastName = addressForm.querySelector('input[name="lastName"]')?.value.trim() || '';
          const composed = [firstName, lastName].filter(Boolean).join(' ');
          labelInput.value = composed ? `Adresse de ${composed}` : '';
          labelInput.dataset.autofilled = 'true';
        }
      }
    });

    shell.addEventListener('click', (event) => {
      const jcSelect = event.target.closest('.jc-select');

      const trigger = event.target.closest('[data-select-trigger]');
      if (trigger && jcSelect) {
        event.preventDefault();
        const panel = jcSelect.querySelector('[data-select-panel]');
        const isOpen = panel && !panel.hidden;
        shell.querySelectorAll('.jc-select [data-select-panel]').forEach((otherPanel) => { otherPanel.hidden = true; });
        if (panel) {
          panel.hidden = isOpen;
          trigger.setAttribute('aria-expanded', String(!isOpen));
        }
        return;
      }

      const option = event.target.closest('.jc-select-option');
      if (option && jcSelect) {
        event.preventDefault();
        const value = option.getAttribute('data-value') || '';
        const selectName = jcSelect.getAttribute('data-select-name');
        const form = jcSelect.closest('form');

        if (selectName === 'phoneCountry') {
          const hiddenInput = jcSelect.querySelector('[data-select-value]');
          if (hiddenInput) hiddenInput.value = value;
          const iso = option.getAttribute('data-iso') || '';
          const isoInput = jcSelect.querySelector('[data-select-iso]');
          if (isoInput) isoInput.value = iso;
          const flagImg = jcSelect.querySelector('[data-select-trigger] .account-phone-flag');
          if (flagImg && iso) flagImg.src = `https://flagcdn.com/w40/${iso}.png`;
          // Re-apply the new country's grouping/length cap to whatever
          // digits are already typed, same as if the person had just typed
          // them with this country selected from the start.
          const numberInput = form?.querySelector('.account-phone-number');
          if (numberInput) numberInput.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          const cityInput = form?.querySelector('input[name="city"]');
          if (cityInput) cityInput.value = value;
        }

        const triggerLabel = jcSelect.querySelector('[data-select-trigger] span');
        if (triggerLabel) triggerLabel.textContent = value;
        jcSelect.querySelectorAll('.jc-select-option').forEach((entry) => {
          entry.classList.toggle('is-selected', entry === option);
        });
        const panel = jcSelect.querySelector('[data-select-panel]');
        if (panel) panel.hidden = true;
        return;
      }

      if (!jcSelect) {
        shell.querySelectorAll('.jc-select [data-select-panel]').forEach((panel) => { panel.hidden = true; });
      }
    });

    shell.addEventListener('click', async (event) => {
      const loginButton = event.target.closest('[data-account-page-login]');
      if (loginButton) {
        event.preventDefault();
        if (window.JacesAuth && typeof window.JacesAuth.openAccount === 'function') {
          window.JacesAuth.openAccount(state.section === 'commandes' ? 'orders' : state.section === 'adresses' ? 'addresses' : 'account');
        }
        return;
      }

      const logoutButton = event.target.closest('[data-account-page-logout]');
      if (logoutButton) {
        event.preventDefault();
        const supabaseClient = window.JacesAuth && window.JacesAuth.supabase;
        if (supabaseClient) await supabaseClient.auth.signOut();
        // Straight back to the homepage instead of re-rendering this page's
        // own "connexion requise" gate - that gate is for someone landing
        // here while already logged out, not for the moment right after
        // they chose to log out themselves.
        window.location.href = 'index.html';
        return;
      }

      const passwordToggle = event.target.closest('[data-account-password-toggle]');
      if (passwordToggle) {
        event.preventDefault();
        state.passwordEdit = !state.passwordEdit;
        state.feedback = '';
        render();
        return;
      }

      const deleteStart = event.target.closest('[data-account-delete-start]');
      if (deleteStart) {
        event.preventDefault();
        state.deleteConfirm = true;
        state.feedback = '';
        render();
        return;
      }

      const deleteCancel = event.target.closest('[data-account-delete-cancel]');
      if (deleteCancel) {
        event.preventDefault();
        state.deleteConfirm = false;
        render();
        return;
      }

      const deleteConfirmButton = event.target.closest('[data-account-delete-confirm]');
      if (deleteConfirmButton) {
        event.preventDefault();
        const supabaseClient = window.JacesAuth && window.JacesAuth.supabase;
        if (!supabaseClient) {
          state.feedback = 'Impossible de supprimer le compte pour le moment.';
          render();
          return;
        }

        deleteConfirmButton.disabled = true;
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          state.feedback = 'Votre session a expiré, reconnectez-vous.';
          render();
          return;
        }

        try {
          const response = await fetch('/api/delete-account', {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` }
          });
          if (!response.ok) throw new Error('delete failed');

          await supabaseClient.auth.signOut();
          window.location.href = 'index.html';
        } catch (error) {
          state.deleteConfirm = false;
          state.feedback = 'La suppression du compte a échoué, réessayez plus tard.';
          render();
        }
        return;
      }

      const newsletterToggle = event.target.closest('[data-newsletter-toggle]');
      if (newsletterToggle) {
        event.preventDefault();
        const profile = buildProfile();
        if (!profile) return;
        const field = newsletterToggle.getAttribute('data-newsletter-toggle');
        const nextValue = !profile[field];
        const nextProfile = Object.assign({}, profile, { [field]: nextValue });
        saveProfile(nextProfile);
        const label = field === 'newsletterProducts' ? 'Nouveaux produits' : 'Actualités JACES';
        state.feedback = nextValue ? `Newsletter "${label}" activée.` : `Newsletter "${label}" désactivée.`;
        render();

        // Keeps the admin's "Newsletter" list (a separate table from this
        // local profile) in sync, so a preference changed here shows up
        // there without needing a re-signup.
        fetch('/api/admin-email-subscribers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: nextProfile.email,
            firstName: nextProfile.firstName,
            lastName: nextProfile.lastName,
            wantsProducts: Boolean(nextProfile.newsletterProducts),
            wantsNews: Boolean(nextProfile.newsletterCollections),
            source: 'account-page'
          })
        }).catch(() => {
          // Best-effort sync - the local preference already saved above,
          // so a network hiccup here shouldn't block the user's action.
        });
        return;
      }

      const scrollOrdersButton = event.target.closest('[data-scroll-orders]');
      if (scrollOrdersButton) {
        event.preventDefault();
        document.getElementById('account-orders-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const detailButton = event.target.closest('[data-order-detail]');
      if (detailButton) {
        event.preventDefault();
        state.selectedOrderId = detailButton.getAttribute('data-order-detail') || '';
        state.feedback = '';
        render();
        return;
      }

      const addressAddButton = event.target.closest('[data-address-add]');
      if (addressAddButton) {
        event.preventDefault();
        const profileForAdd = buildProfile();
        if (profileForAdd && (profileForAdd.addresses || []).length >= MAX_ADDRESSES) {
          state.feedback = 'Vous avez atteint le maximum de 3 adresses. Modifiez ou supprimez-en une pour en ajouter une nouvelle.';
          render();
          return;
        }
        state.addressEditor = { mode: 'add', id: '' };
        state.feedback = '';
        render();
        return;
      }

      const addressEditButton = event.target.closest('[data-address-edit]');
      if (addressEditButton) {
        event.preventDefault();
        state.addressEditor = { mode: 'edit', id: addressEditButton.getAttribute('data-address-edit') || '' };
        state.feedback = '';
        render();
        // If the stored city was blanked out (e.g. a stray "Please select"
        // autofill value), re-derive it immediately from the postal code
        // already on file instead of leaving the field empty.
        const addressForm = document.getElementById('account-address-form');
        const cityInput = addressForm?.querySelector('input[name="city"]');
        const postalCodeInput = addressForm?.querySelector('input[name="postalCode"]');
        if (addressForm && cityInput && !cityInput.value.trim() && postalCodeInput?.value.trim()) {
          lookupCityForPostalCode(addressForm, postalCodeInput.value);
        }
        return;
      }

      const addressDeleteButton = event.target.closest('[data-address-delete]');
      if (addressDeleteButton) {
        event.preventDefault();
        const addressId = addressDeleteButton.getAttribute('data-address-delete') || '';
        const profile = buildProfile();
        if (!profile) return;
        const nextAddresses = (profile.addresses || []).filter((address) => address.id !== addressId);
        if (nextAddresses.length && !nextAddresses.some((address) => address.isDefault)) {
          nextAddresses[0].isDefault = true;
        }
        persistAddresses(profile, nextAddresses);
        state.feedback = 'Adresse supprimée.';
        state.addressEditor = null;
        render();
        return;
      }

      const addressCancelButton = event.target.closest('[data-address-cancel]');
      if (addressCancelButton) {
        event.preventDefault();
        state.addressEditor = null;
        state.feedback = '';
        render();
        return;
      }

      const trackButton = event.target.closest('[data-order-track]');
      if (trackButton) {
        event.preventDefault();
        state.feedback = 'Votre colis est en cours d’acheminement. Les prochaines étapes apparaîtront ici.';
        render();
        return;
      }

      const invoiceButton = event.target.closest('[data-order-invoice]');
      if (invoiceButton) {
        event.preventDefault();
        const profile = buildProfile();
        const order = (profile?.orders || []).find((entry) => entry.id === invoiceButton.getAttribute('data-order-invoice'));
        if (!order) return;
        downloadInvoice(order);
        state.feedback = 'La facture a été téléchargée.';
        render();
        return;
      }

      const reorderButton = event.target.closest('[data-order-reorder]');
      if (reorderButton) {
        event.preventDefault();
        const profile = buildProfile();
        const order = (profile?.orders || []).find((entry) => entry.id === reorderButton.getAttribute('data-order-reorder'));
        if (!order) return;
        if (reorderItems(order)) {
          state.feedback = 'Les pièces de cette commande ont été ajoutées de nouveau à votre panier.';
          render();
        }
        return;
      }

      const returnButton = event.target.closest('[data-order-return]');
      if (returnButton) {
        event.preventDefault();
        state.feedback = 'La demande de retour a été préparée. Le service JACES vous contactera par e-mail.';
        render();
      }
    });

    shell.addEventListener('submit', async (event) => {
      const profileForm = event.target.closest('#account-profile-form');
      if (profileForm) {
        event.preventDefault();
        const profile = buildProfile();
        if (!profile) return;
        const formData = new FormData(profileForm);
        const firstName = String(formData.get('firstName') || '').trim();
        const lastName = String(formData.get('lastName') || '').trim();
        const phoneDialCode = String(formData.get('phoneDialCode') || '').trim();
        const phoneIso = String(formData.get('phoneIso') || 'fr').trim();
        const phoneLocalNumber = String(formData.get('phone') || '').trim();
        if (!isValidPhoneNumber(phoneIso, phoneLocalNumber)) {
          state.feedback = 'Le numéro de téléphone ne correspond pas au format attendu pour le pays sélectionné.';
          render();
          return;
        }
        const phone = phoneLocalNumber ? `${phoneDialCode} ${phoneLocalNumber}`.trim() : '';
        const nextEmail = String(formData.get('email') || '').trim();
        let feedback = 'Vos informations ont été mises à jour.';

        const supabaseClient = window.JacesAuth && window.JacesAuth.supabase;
        if (supabaseClient) {
          const { data: { user } } = await supabaseClient.auth.getUser();
          if (user) {
            await supabaseClient.from('profiles').upsert({ id: user.id, first_name: firstName, last_name: lastName });

            if (nextEmail && nextEmail.toLowerCase() !== String(user.email || '').toLowerCase()) {
              const { error: emailError } = await supabaseClient.auth.updateUser({ email: nextEmail });
              feedback = emailError
                ? 'Vos informations ont été mises à jour, mais le changement d’e-mail a échoué.'
                : `Vos informations ont été mises à jour. Confirmez le changement en cliquant sur le lien envoyé à ${nextEmail}.`;
            }
          }
        }

        // Phone isn't stored server-side yet - kept local-only for now like the
        // rest of this page (addresses/orders), pending a dedicated migration.
        saveProfile(Object.assign({}, profile, { firstName, lastName, phone }));

        if (window.JacesAuth && typeof window.JacesAuth.refreshSession === 'function') {
          await window.JacesAuth.refreshSession();
        }

        state.feedback = feedback;
        render();
        return;
      }

      const passwordForm = event.target.closest('#account-password-form');
      if (passwordForm) {
        event.preventDefault();
        const profile = buildProfile();
        if (!profile) return;
        const formData = new FormData(passwordForm);
        const currentPassword = String(formData.get('currentPassword') || '').trim();
        const nextPassword = String(formData.get('nextPassword') || '').trim();
        const confirmPassword = String(formData.get('confirmPassword') || '').trim();
        if (!currentPassword || !nextPassword || nextPassword !== confirmPassword) {
          state.feedback = 'Vérifiez vos mots de passe avant de confirmer la modification.';
          render();
          return;
        }

        const supabaseClient = window.JacesAuth && window.JacesAuth.supabase;
        if (!supabaseClient) {
          state.feedback = "Impossible de modifier le mot de passe pour le moment.";
          render();
          return;
        }

        const { error: verifyError } = await supabaseClient.auth.signInWithPassword({
          email: profile.email,
          password: currentPassword
        });
        if (verifyError) {
          state.feedback = 'Le mot de passe actuel ne correspond pas à votre compte.';
          render();
          return;
        }

        const { error: updateError } = await supabaseClient.auth.updateUser({ password: nextPassword });
        if (updateError) {
          state.feedback = 'Impossible de mettre à jour le mot de passe pour le moment.';
          render();
          return;
        }

        state.passwordEdit = false;
        state.feedback = 'Votre mot de passe a été mis à jour.';
        render();
        return;
      }

      const addressForm = event.target.closest('#account-address-form');
      if (addressForm) {
        event.preventDefault();
        const profile = buildProfile();
        if (!profile) return;
        const formData = new FormData(addressForm);
        const addressId = String(formData.get('id') || '').trim();
        const addressPhoneDialCode = String(formData.get('phoneDialCode') || '').trim();
        const addressPhoneIso = String(formData.get('phoneIso') || 'fr').trim();
        const addressPhoneLocalNumber = String(formData.get('phone') || '').trim();
        if (!isValidPhoneNumber(addressPhoneIso, addressPhoneLocalNumber)) {
          state.feedback = 'Le numéro de téléphone ne correspond pas au format attendu pour le pays sélectionné.';
          render();
          return;
        }
        const addressEntry = normalizeAddress({
          id: addressId || `address-${Date.now()}`,
          label: String(formData.get('label') || '').trim().slice(0, 25),
          firstName: String(formData.get('firstName') || '').trim(),
          lastName: String(formData.get('lastName') || '').trim(),
          address: String(formData.get('address') || '').trim(),
          address2: String(formData.get('address2') || '').trim(),
          postalCode: String(formData.get('postalCode') || '').trim(),
          city: String(formData.get('city') || '').trim(),
          country: String(formData.get('country') || 'France').trim(),
          phone: addressPhoneLocalNumber ? `${addressPhoneDialCode} ${addressPhoneLocalNumber}`.trim() : '',
          isDefault: formData.get('isDefault') === 'on'
        }, 0);

        // Drop the order-derived preview address from the baseline unless
        // it's the very card being saved (isSynthetic, see deriveAddresses) -
        // otherwise saving a brand new address would silently persist that
        // preview as a second, never-explicitly-added real address too.
        const existingAddresses = (Array.isArray(profile.addresses) ? profile.addresses.slice() : [])
          .filter((address) => !address.isSynthetic || address.id === addressEntry.id);
        const isNewAddress = !existingAddresses.some((address) => address.id === addressEntry.id);
        if (isNewAddress && existingAddresses.length >= MAX_ADDRESSES) {
          state.feedback = 'Vous avez atteint le maximum de 3 adresses. Modifiez ou supprimez-en une pour en ajouter une nouvelle.';
          render();
          return;
        }
        const nextAddresses = existingAddresses.filter((address) => address.id !== addressEntry.id);
        if (addressEntry.isDefault) {
          nextAddresses.forEach((address) => {
            address.isDefault = false;
          });
        }
        nextAddresses.push(addressEntry);
        if (!nextAddresses.some((address) => address.isDefault)) {
          nextAddresses[0].isDefault = true;
        }

        persistAddresses(profile, nextAddresses);
        state.addressEditor = null;
        state.feedback = 'Adresse enregistrée.';
        render();
      }
    });
  }

  function init() {
    bindShellEvents();
    if (!window.location.hash) {
      window.location.hash = 'compte';
    }
    render();
  }

  window.addEventListener('hashchange', () => {
    state.feedback = '';
    state.passwordEdit = false;
    state.deleteConfirm = false;
    state.addressEditor = null;
    render();
  });

  window.addEventListener('jaces:account-sync', render);
  window.addEventListener('storage', (event) => {
    if (event.key === ACCOUNT_SESSION_KEY || event.key === ACCOUNT_PROFILES_KEY) {
      render();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();