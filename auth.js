(function () {
  const allowedDomains = ['gmail.com', 'icloud.com', 'hotmail.fr', 'orange.fr', 'outlook.fr'];
  const nameValidationRegex = /^[A-Za-z]+$/;
  const passwordValidationRegex = /^(?=.*[^A-Za-z0-9]).{8,}$/;
  const accountSessionKey = 'jaces-account-session';
  const accountProfilesKey = 'jaces-account-profiles';
  const scrollPositionsKey = 'jaces-scroll-positions';
  const pendingScrollRestoreKey = 'jaces-pending-scroll-restore';
  const accountSyncEvent = 'jaces:account-sync';

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

  function readSessionJsonStorage(key, fallback) {
    try {
      const value = window.sessionStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeSessionJsonStorage(key, value) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Ignore storage failures and keep the UI usable.
    }
  }

  function getCurrentScrollPageKey() {
    return `${window.location.pathname}${window.location.search}`;
  }

  function getScrollPageKeyFromUrl(url) {
    try {
      const resolvedUrl = new URL(url, window.location.href);
      return `${resolvedUrl.pathname}${resolvedUrl.search}`;
    } catch (error) {
      return '';
    }
  }

  function getStoredScrollPositions() {
    return readSessionJsonStorage(scrollPositionsKey, {});
  }

  function saveCurrentScrollPosition() {
    const positions = getStoredScrollPositions();
    positions[getCurrentScrollPageKey()] = {
      x: window.scrollX || 0,
      y: window.scrollY || 0,
      updatedAt: Date.now()
    };
    writeSessionJsonStorage(scrollPositionsKey, positions);
  }

  function restoreSavedScrollPosition() {
    const positions = getStoredScrollPositions();
    const savedPosition = positions[getCurrentScrollPageKey()];
    if (!savedPosition) return;

    const documentElement = document.documentElement;
    const body = document.body;
    const previousDocumentScrollBehavior = documentElement ? documentElement.style.scrollBehavior : '';
    const previousBodyScrollBehavior = body ? body.style.scrollBehavior : '';

    if (documentElement) documentElement.style.scrollBehavior = 'auto';
    if (body) body.style.scrollBehavior = 'auto';

    const applyScroll = () => {
      window.scrollTo(savedPosition.x || 0, savedPosition.y || 0);
    };

    applyScroll();
    requestAnimationFrame(() => {
      applyScroll();
      requestAnimationFrame(() => {
        applyScroll();
        requestAnimationFrame(() => {
          if (documentElement) documentElement.style.scrollBehavior = previousDocumentScrollBehavior;
          if (body) body.style.scrollBehavior = previousBodyScrollBehavior;
        });
      });
    });
  }

  function markPendingScrollRestore(url) {
    const key = getScrollPageKeyFromUrl(url);
    if (!key) return;

    try {
      window.sessionStorage.setItem(pendingScrollRestoreKey, key);
    } catch (error) {
      // Ignore storage failures and keep the UI usable.
    }
  }

  function consumePendingScrollRestore() {
    try {
      const pendingKey = window.sessionStorage.getItem(pendingScrollRestoreKey);
      if (!pendingKey) return false;
      window.sessionStorage.removeItem(pendingScrollRestoreKey);
      return pendingKey === getCurrentScrollPageKey();
    } catch (error) {
      return false;
    }
  }

  function initGlobalScrollRestoration() {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    let scrollTicking = false;

    const scheduleScrollSave = () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        scrollTicking = false;
        saveCurrentScrollPosition();
      });
    };

    const saveBeforeNavigation = (event) => {
      const link = event.target.closest('a[href]');
      if (!link) return;
      if (link.hasAttribute('download')) return;
      if (link.target && link.target !== '_self') return;

      const rawHref = link.getAttribute('href');
      if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('#')) return;

      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      saveCurrentScrollPosition();
    };

    const restoreIfHistoryNavigation = () => {
      const navigationEntry = window.performance.getEntriesByType('navigation')[0];
      if (navigationEntry && navigationEntry.type === 'back_forward') {
        restoreSavedScrollPosition();
      }
    };

    window.JacesScrollRestoration = {
      markPendingRestore: markPendingScrollRestore,
      saveCurrentPosition: saveCurrentScrollPosition
    };

    window.addEventListener('scroll', scheduleScrollSave, { passive: true });
    window.addEventListener('pagehide', saveCurrentScrollPosition);
    window.addEventListener('beforeunload', saveCurrentScrollPosition);
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        restoreSavedScrollPosition();
        return;
      }

      restoreIfHistoryNavigation();
    });
    document.addEventListener('click', saveBeforeNavigation, true);

    if (consumePendingScrollRestore()) {
      restoreSavedScrollPosition();
    }

    restoreIfHistoryNavigation();
  }

  function initHeaderSubmenuDismissOnClick() {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    const activeLinkClass = 'submenu-link-active';
    const submenuSelectionStorageKey = 'jaces-submenu-selection-v1';

    const normalizeDestination = (href) => {
      try {
        const parsed = new URL(href, window.location.href);
        return `${parsed.pathname}${parsed.search || ''}`;
      } catch (error) {
        return '';
      }
    };

    const getStoredSubmenuSelections = () => readSessionJsonStorage(submenuSelectionStorageKey, {});

    const parseSubmenuLink = (submenuLink) => {
      try {
        const parsed = new URL(submenuLink.getAttribute('href') || '', window.location.href);
        return {
          node: submenuLink,
          pathname: parsed.pathname,
          category: String(parsed.searchParams.get('category') || '').trim().toLowerCase(),
          collabView: String(parsed.searchParams.get('collabView') || '').trim().toLowerCase(),
          nouveauteTag: String(parsed.searchParams.get('nouveauteTag') || '').trim().toLowerCase(),
          collection: String(parsed.searchParams.get('collection') || '').trim().toLowerCase()
        };
      } catch (error) {
        return null;
      }
    };

    const resolveActiveSubmenuLinkFromLocation = () => {
      const currentPath = window.location.pathname;
      const params = new URLSearchParams(window.location.search || '');
      const pageName = (window.location.pathname.split('/').pop() || '').toLowerCase();
      const currentCategory = String(params.get('category') || 'all').trim().toLowerCase();
      const currentCollabView = String(params.get('collabView') || 'all').trim().toLowerCase();
      const currentNouveauteTag = String(params.get('nouveauteTag') || '').trim().toLowerCase();
      const currentCollection = String(params.get('collection') || '').trim().toLowerCase();

      const candidates = Array.from(nav.querySelectorAll('.submenu a'))
        .map(parseSubmenuLink)
        .filter((link) => link && link.pathname === currentPath);

      if (!candidates.length) return null;

      const scored = candidates
        .map((link) => {
          let score = 0;

          if (link.category) {
            if (link.category !== currentCategory) return null;
            score += 20;
          } else if (currentCategory === 'all') {
            score += 4;
          }

          if (pageName === 'collaborations.html') {
            if (link.collabView) {
              if (link.collabView !== currentCollabView) return null;
              score += 12;
            } else if (currentCollabView === 'all') {
              score += 3;
            }
          }

          if (pageName === 'nouveautes.html') {
            if (link.nouveauteTag) {
              if (link.nouveauteTag !== currentNouveauteTag) return null;
              // Outweigh a plain category match (20): when a tag (Drop été,
              // Édition limitée, Pièces signature) is active, it should stay
              // highlighted even after also picking a FEMME category pill.
              score += 25;
            } else if (!currentNouveauteTag) {
              score += 3;
            }
          }

          if (pageName === 'collection.html') {
            if (link.collection) {
              if (link.collection !== currentCollection) return null;
              score += 12;
            } else if (!currentCollection) {
              score += 3;
            }
          }

          return { node: link.node, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

      return scored.length ? scored[0].node : null;
    };

    const setStoredSubmenuSelection = (pageKey, submenuDestination) => {
      if (!pageKey) return;
      const selections = getStoredSubmenuSelections();
      if (submenuDestination) {
        selections[pageKey] = submenuDestination;
      } else {
        delete selections[pageKey];
      }
      writeSessionJsonStorage(submenuSelectionStorageKey, selections);
    };

    const clearActiveSubmenuLinks = (item) => {
      if (!item) return;
      item.querySelectorAll('.submenu a').forEach((submenuLink) => {
        submenuLink.classList.remove(activeLinkClass);
      });
    };

    const setActiveSubmenuLink = (navItem, link) => {
      if (!navItem || !link) return;
      navItem.querySelectorAll('.submenu a').forEach((submenuLink) => {
        submenuLink.classList.toggle(activeLinkClass, submenuLink === link);
      });
    };

    const syncActiveSubmenuLinksFromLocation = () => {
      const currentPageKey = `${window.location.pathname}${window.location.search || ''}`;
      const inferredLink = resolveActiveSubmenuLinkFromLocation();
      const inferredDestination = inferredLink ? normalizeDestination(inferredLink.getAttribute('href')) : '';
      const storedDestination = getStoredSubmenuSelections()[currentPageKey] || '';
      const selectedDestinationForPage = inferredDestination || storedDestination;

      if (inferredDestination && inferredDestination !== storedDestination) {
        setStoredSubmenuSelection(currentPageKey, inferredDestination);
      }

      nav.querySelectorAll('.nav-item').forEach((item) => {
        const submenuLinks = Array.from(item.querySelectorAll('.submenu a'));
        if (!submenuLinks.length) return;

        const selectedLink = submenuLinks.find((submenuLink) => {
          return normalizeDestination(submenuLink.getAttribute('href')) === selectedDestinationForPage;
        });

        submenuLinks.forEach((submenuLink) => {
          submenuLink.classList.toggle(activeLinkClass, submenuLink === selectedLink);
        });
      });
    };

    const syncActiveSubmenuFromVignetteClick = () => {
      document.addEventListener('click', (event) => {
        const vignette = event.target.closest('.cat-nav-item');
        if (!vignette) return;
        window.setTimeout(syncActiveSubmenuLinksFromLocation, 0);
      }, true);
    };

    nav.addEventListener('click', (event) => {
      const clickedLink = event.target.closest('.submenu a, .nav-item > a');
      if (!clickedLink || !nav.contains(clickedLink)) return;

      const item = clickedLink.closest('.nav-item');
      if (!item) return;

      if (clickedLink.matches('.submenu a')) {
        setActiveSubmenuLink(item, clickedLink);
        const destinationKey = normalizeDestination(clickedLink.getAttribute('href'));
        setStoredSubmenuSelection(destinationKey, destinationKey);
      } else {
        const destinationKey = normalizeDestination(clickedLink.getAttribute('href'));
        setStoredSubmenuSelection(destinationKey, '');
        clearActiveSubmenuLinks(item);
      }

      requestAnimationFrame(() => {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
      });
    });

    document.addEventListener('jaces:submenu-links-updated', syncActiveSubmenuLinksFromLocation);
    syncActiveSubmenuFromVignetteClick();
    window.addEventListener('jaces:nav-state-changed', syncActiveSubmenuLinksFromLocation);

    syncActiveSubmenuLinksFromLocation();

    window.addEventListener('popstate', syncActiveSubmenuLinksFromLocation);
  }

  function getStoredProfiles() {
    return readJsonStorage(accountProfilesKey, {});
  }

  function saveStoredProfile(profile) {
    if (!profile || !profile.email) return;
    const profiles = getStoredProfiles();
    profiles[String(profile.email).trim().toLowerCase()] = profile;
    writeJsonStorage(accountProfilesKey, profiles);
  }

  function getStoredProfile(email) {
    if (!email) return null;
    const profiles = getStoredProfiles();
    return profiles[String(email).trim().toLowerCase()] || null;
  }

  function getAccountSession() {
    return readJsonStorage(accountSessionKey, null);
  }

  function setAccountSession(session) {
    writeJsonStorage(accountSessionKey, session);
    window.dispatchEvent(new CustomEvent(accountSyncEvent, { detail: { session } }));
  }

  function clearAccountSession() {
    try {
      window.localStorage.removeItem(accountSessionKey);
    } catch (error) {
      // Ignore storage failures and keep the UI usable.
    }
    window.dispatchEvent(new CustomEvent(accountSyncEvent, { detail: { session: null } }));
  }

  function toDisplayName(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  }

  function deriveFirstNameFromEmail(email) {
    const localPart = String(email || '').trim().split('@')[0] || '';
    const compact = localPart.split(/[._-]+/).find(Boolean) || localPart;
    return toDisplayName(compact || 'Client');
  }

  function normalizePersonName(value) {
    const lettersOnly = String(value || '').replace(/[^A-Za-z]/g, '');
    if (!lettersOnly) return '';
    return lettersOnly.charAt(0).toUpperCase() + lettersOnly.slice(1).toLowerCase();
  }

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  function isValidBirthDate(day, month, year) {
    const parsedDay = Number.parseInt(day, 10);
    const parsedMonth = Number.parseInt(month, 10);
    const parsedYear = Number.parseInt(year, 10);

    if (!Number.isInteger(parsedDay) || !Number.isInteger(parsedMonth) || !Number.isInteger(parsedYear)) {
      return false;
    }

    if (parsedYear < 1940 || parsedYear > 2020) return false;
    if (parsedMonth < 1 || parsedMonth > 12) return false;

    const daysPerMonth = [31, isLeapYear(parsedYear) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const maxDay = daysPerMonth[parsedMonth - 1];

    return parsedDay >= 1 && parsedDay <= maxDay;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatOrderDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(date);
  }

  function formatOrderPrice(value) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
  }

  function isAllowedEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    const parts = normalized.split('@');
    if (parts.length !== 2 || !parts[0]) return false;
    return allowedDomains.includes(parts[1]);
  }

  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'account-modal-overlay';
    overlay.id = 'account-modal-overlay';
    overlay.innerHTML = [
      '<div class="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">',
      '  <div class="account-modal-header">',
      '    <div class="account-modal-title-wrap">',
      '      <h2 id="account-modal-title">Se connecter</h2>',
      '      <p id="account-modal-subtitle">Accédez à vos favoris, commandes et sélections JACES.</p>',
      '    </div>',
      '    <button class="account-modal-close" id="account-modal-close" type="button" aria-label="Fermer">×</button>',
      '  </div>',
      '  <div class="account-modal-body">',
      '    <div class="account-auth-view" id="account-auth-view">',
      '    <form class="account-form" id="account-login-form">',
      '      <div class="account-form-field">',
      '        <label for="account-email">E-mail <span class="signup-required">*</span></label>',
      '        <input id="account-email" name="email" type="email" placeholder="Votre e-mail" autocomplete="email" required>',
      '      </div>',
      '      <div class="account-form-field">',
      '        <label for="account-password">Mot de passe <span class="signup-required">*</span></label>',
      '        <input id="account-password" name="password" type="password" placeholder="Votre mot de passe" autocomplete="current-password" required>',
      '      </div>',
      '      <div class="account-form-row">',
      '        <button class="account-inline-button" type="button" data-forgot-password>Mot de passe oublié ?</button>',
      '        <button class="account-text-button" type="button" data-open-signup>Créer un compte</button>',
      '      </div>',
      '      <p class="account-form-error" id="account-login-error" hidden></p>',
      '      <button class="account-submit" type="submit">Se connecter</button>',
      '      <div class="account-modal-footer">',
      '        <span class="account-modal-note" id="account-modal-note">Espace compte en préparation.</span>',
      '      </div>',
      '    </form>',
      '    </div>',
      '    <div class="account-logged-view" id="account-logged-view" hidden></div>',
      '  </div>',
      '</div>',
      '<div class="signup-flow-modal" id="signup-flow-modal" hidden></div>',
      '<div class="terms-modal" id="terms-modal" hidden></div>'
    ].join('');
    document.body.appendChild(overlay);
    return overlay;
  }

  function initAccountModal() {
    const accountButtons = Array.from(document.querySelectorAll('.icon-button[aria-label="Compte"]'));
    if (!accountButtons.length) return;

    const overlay = document.getElementById('account-modal-overlay') || createOverlay();
    const popover = overlay.querySelector('.account-modal');
    const signupModal = overlay.querySelector('#signup-flow-modal');
    const termsModal = overlay.querySelector('#terms-modal');
    const accountTitle = overlay.querySelector('#account-modal-title');
    const accountSubtitle = overlay.querySelector('#account-modal-subtitle');
    const accountNote = overlay.querySelector('#account-modal-note');
    const authView = overlay.querySelector('#account-auth-view');
    const loggedView = overlay.querySelector('#account-logged-view');
    const closeButton = overlay.querySelector('#account-modal-close');
    const getEmailInput = () => overlay.querySelector('#account-email');
    const getPasswordInput = () => overlay.querySelector('#account-password');
    const getLoginError = () => overlay.querySelector('#account-login-error');
    const getLoginForm = () => overlay.querySelector('#account-login-form');

    const signupState = {
      step: 'create',
      provider: '',
      email: '',
      code: '',
      password: '',
      birthDay: '',
      birthMonth: '',
      birthYear: '',
      firstName: '',
      lastName: '',
      deliveryAddress: '',
      newsletterProducts: false,
      newsletterCollections: false,
      termsAccepted: false,
      error: ''
    };

    let activeButton = null;
    let pendingAuthSuccessAction = null;
    let activeLoggedSection = 'account';

    const resetSignupState = () => {
      signupState.step = 'create';
      signupState.provider = '';
      signupState.email = '';
      signupState.code = '';
      signupState.password = '';
      signupState.birthDay = '';
      signupState.birthMonth = '';
      signupState.birthYear = '';
      signupState.firstName = '';
      signupState.lastName = '';
      signupState.deliveryAddress = '';
      signupState.newsletterProducts = false;
      signupState.newsletterCollections = false;
      signupState.termsAccepted = false;
      signupState.error = '';
    };

    const positionPopover = (button) => {
      if (!button || !popover) return;

      const rect = button.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const popoverWidth = Math.min(320, viewportWidth - 24);
      const margin = 12;
      const top = rect.bottom + 8;
      const buttonCenter = rect.left + (rect.width / 2);
      const preferredLeft = buttonCenter - (popoverWidth / 2);
      const left = Math.min(Math.max(margin, preferredLeft), viewportWidth - popoverWidth - margin);
      const arrowLeft = Math.min(Math.max(18, buttonCenter - left - 9), popoverWidth - 36);

      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
      popover.style.setProperty('--account-arrow-left', `${arrowLeft}px`);
    };

    const buildSessionFromEmail = (email) => {
      const storedProfile = getStoredProfile(email);
      if (storedProfile) {
        return {
          firstName: storedProfile.firstName || deriveFirstNameFromEmail(email),
          lastName: storedProfile.lastName || '',
          email: storedProfile.email,
          deliveryAddress: storedProfile.deliveryAddress || ''
        };
      }

      return {
        firstName: deriveFirstNameFromEmail(email),
        lastName: '',
        email: String(email || '').trim(),
        deliveryAddress: ''
      };
    };

    const getSessionOrders = (session) => {
      return Array.isArray(session?.orders) ? session.orders : [];
    };

    const getLoggedSectionMarkup = (session, section) => {
      const orders = getSessionOrders(session);
      const latestOrder = orders[0] || null;

      if (section === 'orders') {
        if (!orders.length) {
          return [
            '<div class="account-section-empty">',
            '  <p class="account-section-kicker">Mes commandes</p>',
            '  <h3>Aucune commande pour le moment</h3>',
            '  <p>Vos confirmations de commande et leur suivi apparaîtront ici dès votre prochain achat.</p>',
            '</div>'
          ].join('');
        }

        return [
          '<div class="account-orders-shell">',
          '  <p class="account-section-kicker">Mes commandes</p>',
          '  <div class="account-order-list">',
          orders.map((order) => [
            '    <article class="account-order-card">',
            '      <div class="account-order-head">',
            `        <strong>${escapeHtml(order.id || '')}</strong>`,
            `        <span>${escapeHtml(order.status || 'En préparation')}</span>`,
            '      </div>',
            '      <div class="account-order-meta">',
            `        <p><span>Date</span><strong>${escapeHtml(formatOrderDate(order.createdAt) || 'Aujourd’hui')}</strong></p>`,
            `        <p><span>Total</span><strong>${escapeHtml(formatOrderPrice(order.total))}</strong></p>`,
            `        <p><span>Articles</span><strong>${escapeHtml(String(order.itemCount || 0))}</strong></p>`,
            '      </div>',
            '      <div class="account-order-lines">',
            (Array.isArray(order.items) ? order.items : []).map((item) => `        <p><span>${escapeHtml(item.name || 'Produit JACES')} · ${escapeHtml(item.size || '')} / ${escapeHtml(item.color || '')}</span><strong>x${escapeHtml(String(item.quantity || 1))}</strong></p>`).join(''),
            '      </div>',
            '    </article>'
          ].join('')).join(''),
          '  </div>',
          '</div>'
        ].join('');
      }

      if (section === 'addresses') {
        return [
          '<div class="account-section-empty">',
          '  <p class="account-section-kicker">Mes adresses</p>',
          `  <h3>${escapeHtml(session.deliveryAddress ? 'Adresse enregistrée' : 'Aucune adresse enregistrée')}</h3>`,
          `  <p>${escapeHtml(session.deliveryAddress || 'Votre adresse de livraison enregistrée apparaîtra ici après validation d’une commande.')}</p>`,
          '</div>'
        ].join('');
      }

      if (section === 'history') {
        return [
          '<div class="account-section-empty">',
          '  <p class="account-section-kicker">Historique</p>',
          '  <h3>Votre activité JACES</h3>',
          '  <p>Retrouvez ici vos dernières interactions, vos favoris et vos achats récents.</p>',
          '</div>'
        ].join('');
      }

      return [
        '<div class="account-section-empty">',
        '  <p class="account-section-kicker">Mon compte</p>',
        `  <h3>${escapeHtml(session.firstName || 'Client')} ${escapeHtml(session.lastName || '')}</h3>`,
        `  <p>${escapeHtml(session.email || '')}</p>`,
        latestOrder ? `  <p>Dernière commande : <strong>${escapeHtml(latestOrder.id || '')}</strong> · ${escapeHtml(formatOrderDate(latestOrder.createdAt) || '')}</p>` : '  <p>Vos informations de compte et vos commandes seront regroupées ici.</p>',
        '</div>'
      ].join('');
    };

    const getLoggedViewMarkup = (session) => {
      const firstName = escapeHtml(session.firstName || 'Client');
      const email = escapeHtml(session.email || '');
      const initial = escapeHtml((session.firstName || 'C').charAt(0).toUpperCase());

      return [
        '<div class="account-logged-shell">',
        '  <div class="account-user-summary">',
        `    <div class="account-user-avatar">${initial}</div>`,
        '    <div class="account-user-copy">',
        `      <strong>Bonjour ${firstName}</strong>`,
        `      <p>${email}</p>`,
        '    </div>',
        '  </div>',
        '  <div class="account-menu">',
        `    <button class="account-menu-item${activeLoggedSection === 'account' ? ' is-active' : ''}" type="button" data-account-action="account">Voir mon compte</button>`,
        `    <button class="account-menu-item${activeLoggedSection === 'orders' ? ' is-active' : ''}" type="button" data-account-action="orders">Mes commandes</button>`,
        `    <button class="account-menu-item${activeLoggedSection === 'addresses' ? ' is-active' : ''}" type="button" data-account-action="addresses">Mes adresses</button>`,
        '  </div>',
        `  <div class="account-logged-panel" id="account-logged-panel">${getLoggedSectionMarkup(session, activeLoggedSection)}</div>`,
        '  <p class="account-logged-feedback" id="account-logged-feedback">Connexion réussie. Votre espace JACES est prêt.</p>',
        '  <button class="account-logout-button" type="button" data-account-logout>Déconnexion</button>',
        '</div>'
      ].join('');
    };

    const setLoggedSection = (section) => {
      const allowedSections = ['account', 'orders', 'addresses'];
      activeLoggedSection = allowedSections.includes(section) ? section : 'account';
      const session = getAccountSession();
      if (session && loggedView) {
        loggedView.innerHTML = getLoggedViewMarkup(session);
      }
    };

    const renderAccountPopover = () => {
      const session = getAccountSession();

      if (session) {
        if (!['account', 'orders', 'addresses'].includes(activeLoggedSection)) {
          activeLoggedSection = 'account';
        }
        if (accountTitle) accountTitle.textContent = `Bonjour ${session.firstName || 'Client'}`;
        if (accountSubtitle) accountSubtitle.textContent = 'Retrouvez votre compte, vos commandes et vos adresses JACES.';
        if (accountNote) accountNote.textContent = 'Session active.';
        if (authView) authView.hidden = true;
        if (loggedView) {
          loggedView.hidden = false;
          loggedView.innerHTML = getLoggedViewMarkup(session);
        }
        accountButtons.forEach((button) => {
          button.classList.add('account-is-connected');
          button.setAttribute('data-account-name', session.firstName || '');
        });
        return;
      }

      if (accountTitle) accountTitle.textContent = 'Se connecter';
      if (accountSubtitle) accountSubtitle.textContent = 'Accédez à vos favoris, commandes et sélections JACES.';
      if (accountNote) accountNote.textContent = 'Espace compte en préparation.';
      if (authView) authView.hidden = false;
      if (loggedView) {
        loggedView.hidden = true;
        loggedView.innerHTML = '';
      }
      activeLoggedSection = 'account';
      accountButtons.forEach((button) => {
        button.classList.remove('account-is-connected');
        button.removeAttribute('data-account-name');
      });
    };

    const updateLoggedFeedback = (message) => {
      const feedback = overlay.querySelector('#account-logged-feedback');
      if (feedback) feedback.textContent = message;
    };

    const signupCreateMarkup = () => {
      const emailValue = escapeHtml(signupState.email);
      return [
        '<div class="signup-flow-shell">',
        '  <div class="signup-flow-brand">JACES</div>',
        '  <button class="signup-flow-close" type="button" data-close-auth aria-label="Fermer">×</button>',
        '  <div class="signup-flow-content">',
        '    <h2>Créer un compte</h2>',
        '    <p class="signup-flow-subtitle">Créez votre compte JACES et personnalisez vos alertes mode.</p>',
        '    <div class="signup-provider-grid">',
        '      <button class="signup-provider-button signup-provider-apple" type="button" data-provider="apple">',
        '        <span class="signup-provider-icon" aria-hidden="true">',
        '          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.365 1.43c0 1.14-.414 2.203-1.118 2.98-.75.83-1.97 1.47-3.03 1.384-.135-1.09.39-2.255 1.108-3.008.78-.82 2.11-1.41 3.04-1.356zm3.997 16.33c-.31.72-.68 1.38-1.11 1.99-.59.84-1.07 1.42-1.45 1.75-.59.54-1.22.82-1.9.85-.49 0-1.08-.14-1.76-.43-.68-.28-1.31-.42-1.89-.42-.61 0-1.26.14-1.95.42-.7.29-1.26.44-1.69.46-.65.03-1.3-.26-1.95-.87-.41-.36-.91-.97-1.52-1.83-.66-.93-1.21-2-1.64-3.22-.46-1.31-.69-2.57-.69-3.78 0-1.39.3-2.59.9-3.61.47-.82 1.1-1.46 1.89-1.93.79-.47 1.64-.71 2.56-.73.5 0 1.16.16 1.99.48.82.32 1.35.48 1.57.48.17 0 .75-.18 1.73-.55.92-.34 1.7-.48 2.33-.43 1.72.14 3.01.82 3.86 2.03-1.54.93-2.3 2.23-2.28 3.9.02 1.3.49 2.38 1.42 3.24.42.4.89.7 1.42.9-.11.32-.22.62-.35.9z"/></svg>',
        '        </span>',
        '        <span>Se connecter avec Apple</span>',
        '      </button>',
        '      <button class="signup-provider-button signup-provider-google" type="button" data-provider="google">',
        '        <span class="signup-provider-icon" aria-hidden="true">',
        '          <svg viewBox="0 0 24 24"><path fill="#EA4335" d="M12.24 10.285v3.821h5.445c-.234 1.23-.935 2.274-1.99 2.976v2.474h3.223c1.887-1.738 2.972-4.295 2.972-7.332 0-.659-.06-1.293-.17-1.939z"/><path fill="#34A853" d="M12 22c2.7 0 4.965-.896 6.62-2.444l-3.223-2.474c-.896.6-2.04.955-3.397.955-2.61 0-4.82-1.762-5.61-4.13H3.06v2.55A9.997 9.997 0 0 0 12 22z"/><path fill="#4A90E2" d="M6.39 13.907a5.998 5.998 0 0 1 0-3.814v-2.55H3.06a9.997 9.997 0 0 0 0 8.914z"/><path fill="#FBBC05" d="M12 5.964c1.469 0 2.786.506 3.823 1.5l2.865-2.865C16.96 2.987 14.695 2 12 2A9.997 9.997 0 0 0 3.06 7.543l3.33 2.55C7.18 7.725 9.39 5.964 12 5.964z"/></svg>',
        '        </span>',
        '        <span>Se connecter avec Google</span>',
        '      </button>',
        '    </div>',
        '    <div class="signup-flow-divider"><span>ou</span></div>',
        '    <form class="signup-flow-form" data-signup-form="email">',
        '      <div class="signup-flow-field">',
        '        <label for="signup-email">Adresse e-mail <span class="signup-required">*</span></label>',
        `        <input id="signup-email" name="email" type="email" autocomplete="email" placeholder="prenom.nom@gmail.com" value="${emailValue}" required>`,
        '      </div>',
        '      <div class="signup-flow-checkboxes">',
        `        <label class="signup-check"><input type="checkbox" name="newsletterProducts" ${signupState.newsletterProducts ? 'checked' : ''}><span>Recevoir la newsletter nouveaux produits</span></label>`,
        `        <label class="signup-check"><input type="checkbox" name="newsletterCollections" ${signupState.newsletterCollections ? 'checked' : ''}><span>Recevoir la newsletter collaboration JACES</span></label>`,
        '      </div>',
        `      <label class="signup-check signup-check-terms"><input type="checkbox" name="termsAccepted" ${signupState.termsAccepted ? 'checked' : ''} required><span>J’accepte les <button class="signup-inline-link" type="button" data-open-terms>conditions d’utilisation</button> et la politique du site. <span class="signup-required">*</span></span></label>`,
        signupState.error ? `      <p class="signup-flow-error">${escapeHtml(signupState.error)}</p>` : '',
        '      <button class="signup-primary-button" type="submit">Continuer</button>',
        '    </form>',
        '  </div>',
        '</div>'
      ].join('');
    };

    const signupCodeMarkup = () => {
      return [
        '<div class="signup-flow-shell">',
        '  <div class="signup-flow-brand">JACES</div>',
        '  <button class="signup-flow-close" type="button" data-close-auth aria-label="Fermer">×</button>',
        '  <div class="signup-flow-content">',
        '    <h2>Vérifiez votre e-mail</h2>',
        `    <p class="signup-flow-subtitle">Un code à six chiffres a été envoyé à ${escapeHtml(signupState.email)}.</p>`,
        '    <form class="signup-flow-form" data-signup-form="code">',
        '      <div class="signup-flow-field">',
        '        <label for="signup-code">Code de validation</label>',
        `        <input id="signup-code" name="code" type="text" inputmode="numeric" maxlength="6" placeholder="Code à six chiffres" value="${escapeHtml(signupState.code)}">`,
        '      </div>',
        signupState.error ? `      <p class="signup-flow-error">${escapeHtml(signupState.error)}</p>` : '',
        '      <button class="signup-primary-button" type="submit">Valider le code</button>',
        '      <button class="signup-secondary-link" type="button" data-reset-signup-email>Se connecter avec une autre adresse e-mail</button>',
        '    </form>',
        '  </div>',
        '</div>'
      ].join('');
    };

    const signupProfileMarkup = () => {
      const monthOptions = [
        ['', 'Mois'],
        ['01', 'Janvier'],
        ['02', 'Février'],
        ['03', 'Mars'],
        ['04', 'Avril'],
        ['05', 'Mai'],
        ['06', 'Juin'],
        ['07', 'Juillet'],
        ['08', 'Août'],
        ['09', 'Septembre'],
        ['10', 'Octobre'],
        ['11', 'Novembre'],
        ['12', 'Décembre']
      ];
      const emailFieldMarkup = signupState.provider
        ? [
            '      <div class="signup-flow-field">',
            '        <label for="signup-profile-email">Adresse e-mail <span class="signup-required">*</span></label>',
            `        <input id="signup-profile-email" name="email" type="email" placeholder="nom@domaine.com" autocomplete="email" value="${escapeHtml(signupState.email)}" required>`,
            '      </div>'
          ].join('')
        : [
            `      <input name="email" type="hidden" value="${escapeHtml(signupState.email)}">`,
            '      <p class="signup-flow-help signup-email-confirmed">Adresse e-mail confirmée : ' + escapeHtml(signupState.email) + '</p>'
          ].join('');
      const preferenceFieldsMarkup = signupState.provider
        ? [
            '      <div class="signup-flow-checkboxes">',
            `        <label class="signup-check"><input type="checkbox" name="newsletterProducts" ${signupState.newsletterProducts ? 'checked' : ''}><span>Recevoir la newsletter nouveaux produits</span></label>`,
            `        <label class="signup-check"><input type="checkbox" name="newsletterCollections" ${signupState.newsletterCollections ? 'checked' : ''}><span>Recevoir la newsletter collaboration JACES</span></label>`,
            '      </div>',
            `      <label class="signup-check signup-check-terms"><input type="checkbox" name="termsAccepted" ${signupState.termsAccepted ? 'checked' : ''} required><span>J’accepte les <button class="signup-inline-link" type="button" data-open-terms>conditions d’utilisation</button> et la politique du site. <span class="signup-required">*</span></span></label>`
          ].join('')
        : [
            `      <input name="newsletterProducts" type="hidden" value="${signupState.newsletterProducts ? 'true' : 'false'}">`,
            `      <input name="newsletterCollections" type="hidden" value="${signupState.newsletterCollections ? 'true' : 'false'}">`,
            `      <input name="termsAccepted" type="hidden" value="${signupState.termsAccepted ? 'true' : 'false'}">`
          ].join('');
      const passwordFieldMarkup = [
        '      <div class="signup-flow-field">',
        '        <label for="signup-password">Mot de passe <span class="signup-required">*</span></label>',
        `        <input id="signup-password" name="password" type="password" placeholder="8 caractères minimum avec un caractère spécial" autocomplete="new-password" value="${escapeHtml(signupState.password)}" minlength="8" required>`,
        '      </div>'
      ].join('');

      return [
        '<div class="signup-flow-shell">',
        '  <div class="signup-flow-brand">JACES</div>',
        '  <button class="signup-flow-close" type="button" data-close-auth aria-label="Fermer">×</button>',
        '  <div class="signup-flow-content">',
        '    <h2>Complétez votre profil</h2>',
        `    <p class="signup-flow-subtitle">${signupState.provider ? 'Finalisez votre inscription après connexion avec ' + escapeHtml(signupState.provider) + '.' : 'Dernière étape avant de finaliser votre compte.'}</p>`,
        '    <form class="signup-flow-form" data-signup-form="profile">',
        emailFieldMarkup,
        '      <div class="signup-flow-grid">',
        '        <div class="signup-flow-field">',
        '          <label for="signup-first-name">Prénom <span class="signup-required">*</span></label>',
        `          <input id="signup-first-name" name="firstName" type="text" placeholder="Votre prénom" value="${escapeHtml(signupState.firstName)}" inputmode="text" pattern="[A-Za-z]+" required>`,
        '        </div>',
        '        <div class="signup-flow-field">',
        '          <label for="signup-last-name">Nom <span class="signup-required">*</span></label>',
        `          <input id="signup-last-name" name="lastName" type="text" placeholder="Votre nom" value="${escapeHtml(signupState.lastName)}" inputmode="text" pattern="[A-Za-z]+" required>`,
        '        </div>',
        '      </div>',
        '      <div class="signup-flow-field">',
        '        <label>Date de naissance <span class="signup-required">*</span></label>',
        '        <p class="signup-flow-help">Cette information nous aide à personnaliser votre profil JACES.</p>',
        '        <div class="signup-birth-grid">',
        `          <input id="signup-birth-day" name="birthDay" type="text" inputmode="numeric" maxlength="2" placeholder="jj" value="${escapeHtml(signupState.birthDay)}">`,
        '          <select id="signup-birth-month" name="birthMonth">',
        monthOptions.map(([value, label]) => `<option value="${escapeHtml(value)}" ${signupState.birthMonth === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join(''),
        '          </select>',
        `          <input id="signup-birth-year" name="birthYear" type="text" inputmode="numeric" maxlength="4" placeholder="aaaa" value="${escapeHtml(signupState.birthYear)}">`,
        '        </div>',
        '      </div>',
        passwordFieldMarkup,
        preferenceFieldsMarkup,
        signupState.error ? `      <p class="signup-flow-error">${escapeHtml(signupState.error)}</p>` : '',
        '      <button class="signup-primary-button" type="submit">Créer mon compte</button>',
        '    </form>',
        '  </div>',
        '</div>'
      ].join('');
    };

    const signupSuccessMarkup = () => {
      const newsletterSummary = [
        signupState.newsletterProducts ? 'nouveaux produits' : '',
        signupState.newsletterCollections ? 'collaboration JACES' : ''
      ].filter(Boolean).join(' et ');
      const firstName = escapeHtml(signupState.firstName || '');
      const email = escapeHtml(signupState.email || '');

      return [
        '<div class="signup-flow-shell">',
        '  <div class="signup-flow-brand">JACES</div>',
        '  <button class="signup-flow-close" type="button" data-close-auth aria-label="Fermer">×</button>',
        '  <div class="signup-flow-content signup-success-content">',
        '    <div class="signup-success-badge" aria-hidden="true">✓</div>',
        '    <p class="signup-success-kicker">Inscription confirmée</p>',
        '    <h2>Compte créé</h2>',
        `    <p class="signup-flow-subtitle signup-success-subtitle">Bienvenue ${firstName}. Votre compte JACES est prêt et votre profil a bien été enregistré.</p>`,
        '    <div class="signup-success-card">',
        `      <p><span>Adresse e-mail</span><strong>${email}</strong></p>`,
        newsletterSummary ? `      <p><span>Newsletter</span><strong>${escapeHtml(newsletterSummary)}</strong></p>` : '      <p><span>Newsletter</span><strong>Aucune sélection pour le moment</strong></p>',
        '    </div>',
        '    <p class="signup-flow-help signup-success-note">Vous pourrez retrouver ces informations depuis votre espace compte.</p>',
        '  </div>',
        '</div>'
      ].join('');
    };

    const termsMarkup = () => {
      return [
        '<div class="terms-modal-shell" role="dialog" aria-modal="true" aria-labelledby="terms-modal-title">',
        '  <button class="terms-modal-close" type="button" data-close-terms aria-label="Fermer">×</button>',
        '  <div class="terms-modal-content">',
        '    <p class="terms-modal-kicker">JACES</p>',
        '    <h2 id="terms-modal-title">Conditions d’utilisation</h2>',
        '    <p>En créant un compte JACES, vous confirmez que les informations communiquées sont exactes, à jour et utilisées uniquement pour gérer votre espace personnel, vos commandes, vos favoris et vos préférences de communication.</p>',
        '    <p>Votre adresse e-mail, votre nom, votre prénom et votre date de naissance sont traités afin d’assurer le fonctionnement du service, la préparation des commandes et le suivi de votre relation avec JACES.</p>',
        '    <p>Si vous choisissez de recevoir les newsletters JACES, vos coordonnées seront utilisées pour vous envoyer des nouveautés produits, des informations sur les collections et des actualités de la maison. Vous pouvez retirer votre consentement à tout moment depuis votre compte ou via les liens présents dans les e-mails reçus.</p>',
        '    <p>Vos données ne sont conservées que pendant la durée nécessaire à la gestion de votre compte et à l’exécution de nos obligations légales et contractuelles. JACES met en place des mesures raisonnables pour protéger la confidentialité et l’intégrité de vos informations.</p>',
        '    <p>Vous disposez d’un droit d’accès, de rectification et de suppression de vos données personnelles. Pour toute demande relative à votre vie privée ou à l’utilisation de votre compte, vous pouvez contacter le service client JACES.</p>',
        '    <button class="signup-primary-button terms-modal-button" type="button" data-close-terms>J’ai compris</button>',
        '  </div>',
        '</div>'
      ].join('');
    };

    const renderSignupFlow = () => {
      if (!signupModal) return;

      if (signupState.step === 'create') signupModal.innerHTML = signupCreateMarkup();
      if (signupState.step === 'code') signupModal.innerHTML = signupCodeMarkup();
      if (signupState.step === 'profile') signupModal.innerHTML = signupProfileMarkup();
      if (signupState.step === 'success') signupModal.innerHTML = signupSuccessMarkup();

      signupModal.classList.toggle('signup-flow-profile-view', signupState.step === 'profile');
      signupModal.classList.toggle('signup-flow-provider-view', signupState.step === 'profile' && Boolean(signupState.provider));
      signupModal.scrollTop = 0;
    };

    const openTermsModal = () => {
      if (!termsModal) return;
      termsModal.innerHTML = termsMarkup();
      termsModal.hidden = false;
      overlay.classList.add('terms-open');
      const closeTermsButton = termsModal.querySelector('[data-close-terms]');
      if (closeTermsButton) closeTermsButton.focus();
    };

    const closeTermsModal = () => {
      if (!termsModal) return;
      termsModal.hidden = true;
      termsModal.innerHTML = '';
      overlay.classList.remove('terms-open');
    };

    const backToSignupStart = () => {
      signupState.step = 'create';
      signupState.provider = '';
      signupState.code = '';
      signupState.error = '';
      renderSignupFlow();
      openSignupFlow();
    };

    const openSigninPopover = (button) => {
      activeButton = button;
      renderAccountPopover();
      overlay.classList.add('open');
      overlay.classList.remove('signup-flow-open');
      document.body.classList.add('account-modal-open');
      if (popover) popover.hidden = false;
      if (signupModal) signupModal.hidden = true;
      closeTermsModal();
      const loginError = getLoginError();
      if (loginError) {
        loginError.hidden = true;
        loginError.textContent = '';
      }
      positionPopover(button);
      const session = getAccountSession();
      const emailInput = getEmailInput();
      if (!session && emailInput) emailInput.focus();
    };

    const resolvePendingAuthSuccess = () => {
      if (typeof pendingAuthSuccessAction !== 'function') return;
      const callback = pendingAuthSuccessAction;
      pendingAuthSuccessAction = null;
      callback(getAccountSession());
    };

    const requireAuth = (options) => {
      if (getAccountSession()) {
        if (typeof options?.onAuthenticated === 'function') {
          options.onAuthenticated(getAccountSession());
        }
        return true;
      }

      pendingAuthSuccessAction = typeof options?.onAuthenticated === 'function'
        ? options.onAuthenticated
        : null;

      openSigninPopover(options?.button || accountButtons[0] || null);
      return false;
    };

    const openSignupFlow = () => {
      overlay.classList.add('open', 'signup-flow-open');
      document.body.classList.add('account-modal-open');
      if (popover) popover.hidden = true;
      if (signupModal) signupModal.hidden = false;
      closeTermsModal();
      renderSignupFlow();
      const autofocus = signupModal.querySelector('input, textarea, button');
      if (autofocus) autofocus.focus();
    };

    const closeAll = () => {
      overlay.classList.remove('open', 'signup-flow-open');
      document.body.classList.remove('account-modal-open');
      activeButton = null;
      if (popover) popover.hidden = false;
      if (signupModal) signupModal.hidden = true;
      closeTermsModal();
      resetSignupState();
      renderSignupFlow();
      renderAccountPopover();
    };

    accountButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (getAccountSession()) {
          const currentFile = String(window.location.pathname || '').split('/').pop() || '';
          if (currentFile !== 'mon-compte.html') {
            window.location.href = 'mon-compte.html';
          }
          return;
        }
        if (overlay.classList.contains('open') && !overlay.classList.contains('signup-flow-open') && activeButton === button) {
          closeAll();
          return;
        }
        openSigninPopover(button);
      });
    });

    if (closeButton) closeButton.addEventListener('click', closeAll);

    const attachLoginInputListener = () => {
      const loginForm = getLoginForm();
      if (!loginForm || loginForm.dataset.boundInput === 'true') return;
      loginForm.dataset.boundInput = 'true';
      loginForm.addEventListener('input', () => {
        const loginError = getLoginError();
        if (loginError && !loginError.hidden) {
          loginError.hidden = true;
          loginError.textContent = '';
        }
      });
    };

    attachLoginInputListener();

    overlay.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;

      if (target.name === 'firstName' || target.name === 'lastName') {
        const normalizedValue = normalizePersonName(target.value);
        if (normalizedValue !== target.value) {
          target.value = normalizedValue;
        }
      }

      if (target.name === 'birthDay') {
        const sanitizedValue = target.value.replace(/\D/g, '').slice(0, 2);
        if (sanitizedValue !== target.value) {
          target.value = sanitizedValue;
        }
      }

      if (target.name === 'birthYear') {
        const sanitizedValue = target.value.replace(/\D/g, '').slice(0, 4);
        if (sanitizedValue !== target.value) {
          target.value = sanitizedValue;
        }
      }
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        if (overlay.classList.contains('terms-open')) {
          closeTermsModal();
          return;
        }
        closeAll();
      }

      const openTermsTrigger = event.target.closest('[data-open-terms]');
      if (openTermsTrigger) {
        event.preventDefault();
        event.stopPropagation();
        openTermsModal();
        return;
      }

      const closeTermsTrigger = event.target.closest('[data-close-terms]');
      if (closeTermsTrigger) {
        event.preventDefault();
        closeTermsModal();
        return;
      }

      const forgotPasswordTrigger = event.target.closest('[data-forgot-password]');
      if (forgotPasswordTrigger) {
        event.preventDefault();
        const emailInput = getEmailInput();
        const loginError = getLoginError();
        const emailValue = emailInput ? emailInput.value.trim() : '';

        if (!emailValue) {
          if (loginError) {
            loginError.hidden = false;
            loginError.textContent = 'Renseignez votre adresse e-mail pour recevoir le lien de réinitialisation.';
          }
          if (emailInput) emailInput.focus();
          return;
        }

        if (accountNote) accountNote.textContent = `Un e-mail de réinitialisation a été envoyé à ${emailValue}.`;
        if (loginError) {
          loginError.hidden = true;
          loginError.textContent = '';
        }
        return;
      }

      const logoutTrigger = event.target.closest('[data-account-logout]');
      if (logoutTrigger) {
        event.preventDefault();
        pendingAuthSuccessAction = null;
        clearAccountSession();
        renderAccountPopover();
        if (accountNote) accountNote.textContent = 'Vous êtes déconnecté.';
        const emailInput = getEmailInput();
        if (emailInput) emailInput.focus();
        return;
      }

      const accountActionTrigger = event.target.closest('[data-account-action]');
      if (accountActionTrigger) {
        event.preventDefault();
        const action = accountActionTrigger.getAttribute('data-account-action') || '';
        const sectionMap = { account: 'compte', orders: 'commandes', addresses: 'adresses' };
        const targetSection = sectionMap[action] || 'compte';
        const currentFile = String(window.location.pathname || '').split('/').pop() || '';
        window.location.href = currentFile === 'mon-compte.html' ? `#${targetSection}` : `mon-compte.html#${targetSection}`;
        return;
      }

      const closeTrigger = event.target.closest('[data-close-auth]');
      if (closeTrigger) {
        event.preventDefault();

        if (overlay.classList.contains('signup-flow-open') && signupState.step === 'profile' && signupState.provider) {
          backToSignupStart();
          return;
        }

        closeAll();
        return;
      }

      const signupTrigger = event.target.closest('[data-open-signup]');
      if (signupTrigger) {
        event.preventDefault();
        signupState.error = '';
        openSignupFlow();
        return;
      }

      const providerButton = event.target.closest('[data-provider]');
      if (providerButton) {
        event.preventDefault();
        signupState.provider = providerButton.getAttribute('data-provider') === 'apple' ? 'Apple' : 'Google';
        signupState.error = '';
        signupState.step = 'profile';
        openSignupFlow();
        return;
      }

      const resetEmail = event.target.closest('[data-reset-signup-email]');
      if (resetEmail) {
        event.preventDefault();
        signupState.step = 'create';
        signupState.provider = '';
        signupState.code = '';
        signupState.error = '';
        renderSignupFlow();
      }
    });

    overlay.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-signup-form], #account-login-form');
      if (!form) return;

      event.preventDefault();

      if (form.id === 'account-login-form') {
        const loginEmail = String(new FormData(form).get('email') || '').trim();
        const loginPassword = String(new FormData(form).get('password') || '').trim();
        const loginError = getLoginError();
        const emailInput = getEmailInput();
        const passwordInput = getPasswordInput();
        const storedProfile = getStoredProfile(loginEmail);

        if (!loginEmail && !loginPassword) {
          if (loginError) {
            loginError.textContent = 'Veuillez renseigner votre adresse e-mail et votre mot de passe.';
            loginError.hidden = false;
          }
          if (emailInput) emailInput.focus();
          return;
        }

        if (!loginEmail) {
          if (loginError) {
            loginError.textContent = 'Veuillez renseigner votre adresse e-mail.';
            loginError.hidden = false;
          }
          if (emailInput) emailInput.focus();
          return;
        }

        if (!loginPassword) {
          if (loginError) {
            loginError.textContent = 'Veuillez renseigner votre mot de passe.';
            loginError.hidden = false;
          }
          if (passwordInput) passwordInput.focus();
          return;
        }

        if (loginError) {
          loginError.hidden = true;
          loginError.textContent = '';
        }

        if (storedProfile && storedProfile.password && storedProfile.password !== loginPassword) {
          if (loginError) {
            loginError.hidden = false;
            loginError.textContent = 'Le mot de passe ne correspond pas à ce compte.';
          }
          if (passwordInput) passwordInput.focus();
          return;
        }

        setAccountSession(buildSessionFromEmail(loginEmail));
        renderAccountPopover();
        updateLoggedFeedback('Connexion réussie. Bienvenue dans votre espace JACES.');
        if (accountNote) accountNote.textContent = 'Session active.';
        resolvePendingAuthSuccess();
        return;
      }

      const kind = form.getAttribute('data-signup-form');

      if (kind === 'email') {
        const formData = new FormData(form);
        signupState.email = String(formData.get('email') || '').trim();
        signupState.newsletterProducts = formData.get('newsletterProducts') === 'on';
        signupState.newsletterCollections = formData.get('newsletterCollections') === 'on';
        signupState.termsAccepted = formData.get('termsAccepted') === 'on';

        if (!isAllowedEmail(signupState.email)) {
          signupState.error = 'Utilisez une adresse autorisée : gmail.com, icloud.com, hotmail.fr, orange.fr ou outlook.fr.';
          renderSignupFlow();
          return;
        }

        if (!signupState.termsAccepted) {
          signupState.error = 'Vous devez accepter les conditions pour continuer.';
          renderSignupFlow();
          return;
        }

        signupState.error = '';
        signupState.code = '';
        signupState.step = 'code';
        renderSignupFlow();
        return;
      }

      if (kind === 'code') {
        const formData = new FormData(form);
        signupState.code = String(formData.get('code') || '').trim();

        if (!/^\d{6}$/.test(signupState.code)) {
          signupState.error = 'Saisissez un code à six chiffres.';
          renderSignupFlow();
          return;
        }

        signupState.error = '';
        signupState.step = 'profile';
        renderSignupFlow();
        return;
      }

      if (kind === 'profile') {
        const formData = new FormData(form);
        signupState.email = String(formData.get('email') || '').trim();
        signupState.firstName = normalizePersonName(String(formData.get('firstName') || '').trim());
        signupState.lastName = normalizePersonName(String(formData.get('lastName') || '').trim());
        signupState.password = String(formData.get('password') || '').trim();
        signupState.birthDay = String(formData.get('birthDay') || '').trim();
        signupState.birthMonth = String(formData.get('birthMonth') || '').trim();
        signupState.birthYear = String(formData.get('birthYear') || '').trim();
        if (signupState.provider) {
          signupState.newsletterProducts = formData.get('newsletterProducts') === 'on';
          signupState.newsletterCollections = formData.get('newsletterCollections') === 'on';
          signupState.termsAccepted = formData.get('termsAccepted') === 'on';
        }

        if (!isAllowedEmail(signupState.email)) {
          signupState.error = 'Veuillez utiliser une adresse e-mail autorisée.';
          renderSignupFlow();
          return;
        }

        if (!signupState.firstName || !signupState.lastName) {
          signupState.error = 'Complétez le prénom et le nom.';
          renderSignupFlow();
          return;
        }

        if (!nameValidationRegex.test(signupState.firstName) || !nameValidationRegex.test(signupState.lastName)) {
          signupState.error = 'Le prénom et le nom doivent contenir uniquement des lettres de A à Z.';
          renderSignupFlow();
          return;
        }

        if (!/^\d{2}$/.test(signupState.birthDay) || !signupState.birthMonth || !/^\d{4}$/.test(signupState.birthYear)) {
          signupState.error = 'Complétez votre date de naissance.';
          renderSignupFlow();
          return;
        }

        if (!isValidBirthDate(signupState.birthDay, signupState.birthMonth, signupState.birthYear)) {
          signupState.error = 'La date de naissance doit être valide, avec une année comprise entre 1940 et 2020.';
          renderSignupFlow();
          return;
        }

        if (!passwordValidationRegex.test(signupState.password)) {
          signupState.error = 'Le mot de passe doit contenir au moins 8 caractères et un caractère spécial.';
          renderSignupFlow();
          return;
        }

        if (!signupState.termsAccepted) {
          signupState.error = 'Vous devez accepter les conditions pour créer votre compte.';
          renderSignupFlow();
          return;
        }

        signupState.error = '';
        saveStoredProfile({
          firstName: signupState.firstName,
          lastName: signupState.lastName,
          email: signupState.email,
          password: signupState.password,
          newsletterProducts: signupState.newsletterProducts,
          newsletterCollections: signupState.newsletterCollections
        });
        setAccountSession({
          firstName: signupState.firstName,
          lastName: signupState.lastName,
          email: signupState.email,
          deliveryAddress: ''
        });
        resolvePendingAuthSuccess();
        signupState.step = 'success';
        renderSignupFlow();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && overlay.classList.contains('open')) {
        if (overlay.classList.contains('terms-open')) {
          closeTermsModal();
          return;
        }
        closeAll();
      }
    });

    window.addEventListener('resize', () => {
      if (overlay.classList.contains('open') && !overlay.classList.contains('signup-flow-open') && activeButton) {
        positionPopover(activeButton);
      }
    });

    window.addEventListener('scroll', () => {
      if (overlay.classList.contains('open') && !overlay.classList.contains('signup-flow-open') && activeButton) {
        positionPopover(activeButton);
      }
    }, { passive: true });

    renderAccountPopover();
    renderSignupFlow();

    window.JacesAuth = {
      getSession: getAccountSession,
      isAuthenticated() {
        return !!getAccountSession();
      },
      requireAuth,
      openAccount(section) {
        if (getAccountSession()) {
          const sectionMap = { account: 'compte', orders: 'commandes', addresses: 'adresses' };
          const targetSection = sectionMap[section] || 'compte';
          const currentFile = String(window.location.pathname || '').split('/').pop() || '';
          window.location.href = currentFile === 'mon-compte.html' ? `#${targetSection}` : `mon-compte.html#${targetSection}`;
          return;
        }
        openSigninPopover(accountButtons[0] || null);
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initGlobalScrollRestoration();
      initHeaderSubmenuDismissOnClick();
      initAccountModal();
    });
  } else {
    initGlobalScrollRestoration();
    initHeaderSubmenuDismissOnClick();
    initAccountModal();
  }
})();