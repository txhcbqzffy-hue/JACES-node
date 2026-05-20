(function () {
  const ACCOUNT_SESSION_KEY = 'jaces-account-session';
  const ACCOUNT_PROFILES_KEY = 'jaces-account-profiles';
  const ACCOUNT_SECTIONS = new Set(['compte', 'commandes', 'adresses']);

  const state = {
    section: 'compte',
    profileEdit: false,
    passwordEdit: false,
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

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatPrice(value) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
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

  function deriveAddresses(profile) {
    const storedAddresses = Array.isArray(profile?.addresses)
      ? profile.addresses.map(normalizeAddress)
      : [];

    if (storedAddresses.length) {
      if (!storedAddresses.some((address) => address.isDefault)) {
        storedAddresses[0].isDefault = true;
      }
      return storedAddresses;
    }

    const latestOrder = Array.isArray(profile?.orders) ? profile.orders[0] : null;
    const shippingAddress = latestOrder?.shippingAddress || null;
    const baseAddress = shippingAddress?.address || profile?.deliveryAddress;
    if (!baseAddress) return [];

    return [normalizeAddress({
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
    }, 0)];
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

  function renderMenu(section) {
    return [
      '<aside class="account-page-sidebar">',
      '  <nav class="account-page-menu" aria-label="Menu du compte">',
      `    <a class="account-page-menu-item${section === 'compte' ? ' is-active' : ''}" href="#compte">Mon compte</a>`,
      `    <a class="account-page-menu-item${section === 'commandes' ? ' is-active' : ''}" href="#commandes">Mes commandes</a>`,
      `    <a class="account-page-menu-item${section === 'adresses' ? ' is-active' : ''}" href="#adresses">Mes adresses</a>`,
      '  </nav>',
      '  <button class="account-page-logout" type="button" data-account-page-logout>Déconnexion</button>',
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
    const newsletterEnabled = Boolean(profile.newsletterProducts || profile.newsletterCollections);
    return [
      '<section class="account-content-card">',
      '  <div class="account-content-card-head">',
      '    <div>',
      '      <p class="account-content-kicker">Mon compte</p>',
      '      <h2>Informations personnelles</h2>',
      '    </div>',
      '    <div class="account-page-actions account-page-actions-inline">',
      `      <button class="account-secondary-button" type="button" data-account-profile-toggle>${state.profileEdit ? 'Annuler' : 'Modifier les informations'}</button>`,
      `      <button class="account-secondary-button" type="button" data-account-password-toggle>${state.passwordEdit ? 'Fermer' : 'Changer le mot de passe'}</button>`,
      `      <button class="account-secondary-button" type="button" data-account-newsletter-toggle>${newsletterEnabled ? 'Désactiver la newsletter' : 'Activer la newsletter'}</button>`,
      '    </div>',
      '  </div>',
      '  <form class="account-form-grid" id="account-profile-form">',
      `    <label class="account-form-field"><span>Nom</span><input type="text" name="lastName" value="${escapeHtml(profile.lastName || '')}" ${state.profileEdit ? '' : 'disabled'} required></label>`,
      `    <label class="account-form-field"><span>Prénom</span><input type="text" name="firstName" value="${escapeHtml(profile.firstName || '')}" ${state.profileEdit ? '' : 'disabled'} required></label>`,
      `    <label class="account-form-field account-form-field-full"><span>Email</span><input type="email" name="email" value="${escapeHtml(profile.email || '')}" ${state.profileEdit ? '' : 'disabled'} required></label>`,
      `    <label class="account-form-field account-form-field-full"><span>Téléphone</span><input type="tel" name="phone" value="${escapeHtml(profile.phone || '')}" ${state.profileEdit ? '' : 'disabled'} placeholder="Votre numéro"></label>`,
      state.profileEdit ? '    <div class="account-page-actions"><button class="account-primary-button" type="submit">Enregistrer</button></div>' : '',
      '  </form>',
      '  <div class="account-info-strips">',
      `    <div class="account-info-strip"><span>Newsletter</span><strong>${newsletterEnabled ? 'Active' : 'Inactive'}</strong></div>`,
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
    const currentAddress = address || {
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
      `    <label class="account-form-field account-form-field-full"><span>Libellé</span><input type="text" name="label" value="${escapeHtml(currentAddress.label || '')}" placeholder="Adresse principale" required></label>`,
      `    <label class="account-form-field"><span>Prénom</span><input type="text" name="firstName" value="${escapeHtml(currentAddress.firstName || '')}" required></label>`,
      `    <label class="account-form-field"><span>Nom</span><input type="text" name="lastName" value="${escapeHtml(currentAddress.lastName || '')}" required></label>`,
      `    <label class="account-form-field account-form-field-full"><span>Adresse</span><input type="text" name="address" value="${escapeHtml(currentAddress.address || '')}" required></label>`,
      `    <label class="account-form-field account-form-field-full"><span>Complément d’adresse</span><input type="text" name="address2" value="${escapeHtml(currentAddress.address2 || '')}" placeholder="Appartement, suite, etc."></label>`,
      `    <label class="account-form-field"><span>Code postal</span><input type="text" name="postalCode" value="${escapeHtml(currentAddress.postalCode || '')}" required></label>`,
      `    <label class="account-form-field"><span>Ville</span><input type="text" name="city" value="${escapeHtml(currentAddress.city || '')}" required></label>`,
      `    <label class="account-form-field"><span>Pays / Région</span><input type="text" name="country" value="${escapeHtml(currentAddress.country || 'France')}" required></label>`,
      `    <label class="account-form-field"><span>Téléphone</span><input type="tel" name="phone" value="${escapeHtml(currentAddress.phone || '')}"></label>`,
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
    const addresses = Array.isArray(profile.addresses) ? profile.addresses : [];
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
      '    <button class="account-primary-button" type="button" data-address-add>Ajouter une adresse</button>',
      '  </div>',
      addresses.length ? '  <div class="account-address-list">' + addresses.map((address) => `
        <article class="account-address-card">
          <div class="account-address-head">
            <strong>${escapeHtml(address.label)}</strong>
            ${address.isDefault ? '<span class="account-address-badge">Par défaut</span>' : ''}
          </div>
          <div class="account-address-copy">
            <p>${escapeHtml(address.firstName)} ${escapeHtml(address.lastName)}</p>
            <p>${escapeHtml(address.address)}</p>
            ${address.address2 ? `<p>${escapeHtml(address.address2)}</p>` : ''}
            <p>${escapeHtml(address.postalCode)} ${escapeHtml(address.city)}</p>
            <p>${escapeHtml(address.country)}</p>
            ${address.phone ? `<p>${escapeHtml(address.phone)}</p>` : ''}
          </div>
          <div class="account-page-actions">
            <button class="account-secondary-button" type="button" data-address-edit="${escapeHtml(address.id)}">Modifier</button>
            <button class="account-secondary-button" type="button" data-address-delete="${escapeHtml(address.id)}">Supprimer</button>
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
      renderMenu(state.section),
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

  function bindShellEvents() {
    const shell = document.getElementById('account-page-shell');
    if (!shell) return;
    if (shell.dataset.bound === 'true') return;
    shell.dataset.bound = 'true';

    shell.addEventListener('click', (event) => {
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
        try {
          window.localStorage.removeItem(ACCOUNT_SESSION_KEY);
        } catch (error) {
          // Ignore storage failures and keep the UI usable.
        }
        window.dispatchEvent(new CustomEvent('jaces:account-sync', { detail: { session: null } }));
        state.feedback = '';
        state.profileEdit = false;
        state.passwordEdit = false;
        state.selectedOrderId = '';
        state.addressEditor = null;
        render();
        return;
      }

      const profileToggle = event.target.closest('[data-account-profile-toggle]');
      if (profileToggle) {
        event.preventDefault();
        state.profileEdit = !state.profileEdit;
        state.feedback = '';
        render();
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

      const newsletterToggle = event.target.closest('[data-account-newsletter-toggle]');
      if (newsletterToggle) {
        event.preventDefault();
        const profile = buildProfile();
        if (!profile) return;
        const newsletterEnabled = !(profile.newsletterProducts || profile.newsletterCollections);
        saveProfile(Object.assign({}, profile, {
          newsletterProducts: newsletterEnabled,
          newsletterCollections: newsletterEnabled
        }));
        state.feedback = newsletterEnabled ? 'La newsletter JACES est activée.' : 'La newsletter JACES est désactivée.';
        render();
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

    shell.addEventListener('submit', (event) => {
      const profileForm = event.target.closest('#account-profile-form');
      if (profileForm) {
        event.preventDefault();
        const profile = buildProfile();
        if (!profile) return;
        const formData = new FormData(profileForm);
        saveProfile(Object.assign({}, profile, {
          firstName: String(formData.get('firstName') || '').trim(),
          lastName: String(formData.get('lastName') || '').trim(),
          email: String(formData.get('email') || '').trim(),
          phone: String(formData.get('phone') || '').trim()
        }));
        state.profileEdit = false;
        state.feedback = 'Vos informations ont été mises à jour.';
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
        if (profile.password && profile.password !== currentPassword) {
          state.feedback = 'Le mot de passe actuel ne correspond pas à votre compte.';
          render();
          return;
        }
        saveProfile(Object.assign({}, profile, { password: nextPassword }));
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
        const addressEntry = normalizeAddress({
          id: addressId || `address-${Date.now()}`,
          label: String(formData.get('label') || '').trim(),
          firstName: String(formData.get('firstName') || '').trim(),
          lastName: String(formData.get('lastName') || '').trim(),
          address: String(formData.get('address') || '').trim(),
          address2: String(formData.get('address2') || '').trim(),
          postalCode: String(formData.get('postalCode') || '').trim(),
          city: String(formData.get('city') || '').trim(),
          country: String(formData.get('country') || 'France').trim(),
          phone: String(formData.get('phone') || '').trim(),
          isDefault: formData.get('isDefault') === 'on'
        }, 0);

        const existingAddresses = Array.isArray(profile.addresses) ? profile.addresses.slice() : [];
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
    state.profileEdit = false;
    state.passwordEdit = false;
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