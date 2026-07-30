(function () {
  const SUPABASE_URL = 'https://uxhzrobxhumreuntxrzw.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4aHpyb2J4aHVtcmV1bnR4cnp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwODg1MjcsImV4cCI6MjA5NDY2NDUyN30.DohXjwqw56TEvimLg2p3qo-lmxaK5h0EzjyN8bI1kdk';
  // Get a real site key from https://dash.cloudflare.com/?to=/:account/turnstile (free) and
  // put it here, then enable "Turnstile" under Supabase Auth > Attack protection with the
  // matching secret key. Until then Supabase just ignores the captchaToken we send.
  const TURNSTILE_SITE_KEY = '0x4AAAAAAD9fM227Tcu4I_9i';
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const allowedDomains = ['gmail.com', 'icloud.com', 'hotmail.fr', 'orange.fr', 'outlook.fr'];
  const nameValidationRegex = /^[\p{L}\s'-]+$/u;
  const passwordValidationRegex = /^(?=.*[^A-Za-z0-9]).{8,}$/;
  const scrollPositionsKey = 'jaces-scroll-positions';
  const pendingScrollRestoreKey = 'jaces-pending-scroll-restore';
  const accountSyncEvent = 'jaces:account-sync';

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

      // Exclude placeholder links (href="#", e.g. unfinished Défilé/Univers
      // entries): they resolve to the current page's own URL including its
      // full query string, so they'd accidentally "match" any state and
      // steal the highlight from the real link.
      const candidates = Array.from(nav.querySelectorAll('.submenu a:not([href="#"])'))
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
            // Only Drop / Pièces signature (or, absent
            // any tag, "Toutes les nouveautés") may be highlighted here —
            // category pills (Robes, Tops, ...) never get the active style,
            // whether picked from an on-page pill or the mega-menu.
            if (link.nouveauteTag) {
              if (link.nouveauteTag !== currentNouveauteTag) return null;
              score += 25;
            } else if (!currentNouveauteTag && link.category === 'all') {
              score += 3;
            } else {
              return null;
            }
          }

          if (pageName === 'collection.html') {
            // Only Printemps–Été 2026 / Automne–Hiver 2026 (or, absent any
            // season, "Toutes les collections") may be highlighted here —
            // category pills (Robes, Tops, ...) never get the active style,
            // whether picked from an on-page pill or the mega-menu.
            if (link.collection) {
              if (link.collection !== currentCollection) return null;
              score += 25;
            } else if (!currentCollection && link.category === 'all') {
              score += 3;
            } else {
              return null;
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

  // Real session state now lives in Supabase Auth (JWT in its own localStorage
  // key, refreshed automatically by the SDK). Callers throughout the codebase
  // (favorites.js, cart.js, stock-notify.js, account-page.js...) all call
  // window.JacesAuth.getSession() synchronously, so we mirror the real state
  // into this in-memory cache and keep it current via onAuthStateChange.
  let cachedSession = null;
  // True when a user is authenticated (real Supabase session) but has no
  // profiles row yet - i.e. they verified their email but closed the modal
  // before finishing the profile step. Read by initAccountModal to force
  // them straight back into that step on any subsequent page load.
  let profileIncomplete = false;
  // True once refreshSessionFromSupabase has resolved at least once. Before
  // that, cachedSession is always null (nobody's fetched the real session
  // yet) - so the very first renderAccountPopover() call must not use that
  // null to strip an "account-is-connected" dot the inline anti-flash
  // script in each page's <head> may have already applied optimistically
  // from cached localStorage, or every page load would flash the dot off
  // and back on while the real Supabase check is in flight.
  let hasCheckedRealSession = false;

  function getAccountSession() {
    return cachedSession;
  }

  function buildSessionFromUserAndProfile(user, profileRow) {
    if (!user) return null;
    return {
      firstName: profileRow?.first_name || deriveFirstNameFromEmail(user.email),
      lastName: profileRow?.last_name || '',
      email: user.email || '',
      deliveryAddress: profileRow?.delivery_address || '',
      orders: []
    };
  }

  async function refreshSessionFromSupabase() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    hasCheckedRealSession = true;
    if (!user) {
      cachedSession = null;
      profileIncomplete = false;
      window.dispatchEvent(new CustomEvent(accountSyncEvent, { detail: { session: null } }));
      return null;
    }

    const { data: profileRow } = await supabaseClient
      .from('profiles')
      .select('first_name, last_name, delivery_address')
      .eq('id', user.id)
      .maybeSingle();

    profileIncomplete = !profileRow || !profileRow.first_name || !profileRow.last_name;
    cachedSession = buildSessionFromUserAndProfile(user, profileRow);
    window.dispatchEvent(new CustomEvent(accountSyncEvent, { detail: { session: cachedSession } }));
    return cachedSession;
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
    // Letters (incl. accents: é, è, ç, ü...), spaces, hyphens and apostrophes
    // only - covers real French names ("Jean-Paul", "O'Brien") while still
    // blocking digits, symbols and emoji.
    const cleaned = String(value || '').replace(/[^\p{L}\s'-]/gu, '');
    if (!/\p{L}/u.test(cleaned)) return '';
    return cleaned
      .toLowerCase()
      .replace(/(^|[\s'-])(\p{L})/gu, (match, boundary, letter) => boundary + letter.toUpperCase());
  }

  // If this e-mail already has a name on file from the newsletter (popup or
  // footer form), reuse it here instead of asking again - only fires when
  // the fields are still empty, and only fills in what the server actually
  // returns (footer-only subscribers have no name on file, so nothing changes).
  async function prefillNameFromNewsletter(email) {
    const hadNothingToPrefill = !signupState.firstName && !signupState.lastName
      && !signupState.newsletterProducts && !signupState.newsletterCollections;
    if (!hadNothingToPrefill) return;

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`/api/admin-email-subscribers?checkEmail=${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));

      // User may have started typing/checking things meanwhile - only fill
      // in whatever's still untouched, never overwrite a real choice.
      let changed = false;
      if (!signupState.firstName && !signupState.lastName && (data.firstName || data.lastName)) {
        signupState.firstName = data.firstName || '';
        signupState.lastName = data.lastName || '';
        // Only the popup newsletter signup collects a name (the footer form
        // is e-mail-only) - if a name came back, this person already gave
        // us everything once, so the profile step can skip re-asking for
        // name/newsletter prefs entirely instead of just pre-filling them.
        signupState.newsletterKnown = true;
        changed = true;
      }
      if (!signupState.newsletterProducts && data.wantsProducts) {
        signupState.newsletterProducts = true;
        changed = true;
      }
      if (!signupState.newsletterCollections && data.wantsNews) {
        signupState.newsletterCollections = true;
        changed = true;
      }
      if (changed) renderSignupFlow();
    } catch (error) {
      // Best effort - if it fails the user just fills the form normally.
    }
  }

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  function daysInMonth(month, year) {
    const daysPerMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return daysPerMonth[month - 1] || 31;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Native <select> dropdown popups can't be restyled in CSS in any
  // cross-browser way, so the day/month/year birth-date pickers use this
  // custom listbox instead - a plain button + absolutely positioned option
  // list, with a hidden input carrying the real value for form submission.
  function customSelectMarkup(id, name, options, selectedValue) {
    const selectedOption = options.find(([value]) => value === selectedValue);
    const triggerLabel = selectedOption ? selectedOption[1] : (options[0] ? options[0][1] : '');
    const isPlaceholder = !selectedOption;
    return [
      `<div class="jc-select" data-select-name="${escapeHtml(name)}">`,
      `  <button type="button" id="${escapeHtml(id)}" class="jc-select-trigger${isPlaceholder ? ' jc-select-placeholder' : ''}" data-select-trigger aria-haspopup="listbox" aria-expanded="false">`,
      `    <span>${escapeHtml(triggerLabel)}</span>`,
      '    <svg class="jc-select-caret" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '  </button>',
      '  <ul class="jc-select-panel" role="listbox" data-select-panel hidden>',
      options
        .filter(([value]) => value !== '')
        .map(([value, label]) => `<li class="jc-select-option${value === selectedValue ? ' is-selected' : ''}" role="option" data-value="${escapeHtml(value)}" aria-selected="${value === selectedValue}">${escapeHtml(label)}</li>`)
        .join(''),
      '  </ul>',
      `  <input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(selectedValue)}" data-select-value>`,
      '</div>'
    ].join('');
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
      '      </div>',
      TURNSTILE_SITE_KEY ? `      <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}"></div>` : '',
      '      <p class="account-form-error" id="account-login-error" hidden></p>',
      '      <button class="account-submit" type="submit">Se connecter</button>',
      '      <button class="account-text-button account-create-link" type="button" data-open-signup>Créer un compte</button>',
      '      <div class="account-modal-footer">',
      '        <span class="account-modal-note" id="account-modal-note"></span>',
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
    const accountTitleWrap = overlay.querySelector('.account-modal-title-wrap');
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
      newsletterKnown: false,
      termsAccepted: false,
      error: '',
      codeNotice: '',
      forced: false
    };

    let activeButton = null;
    let pendingAuthSuccessAction = null;

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
      signupState.newsletterKnown = false;
      signupState.termsAccepted = false;
      signupState.error = '';
      signupState.codeNotice = '';
      signupState.forced = false;
    };


    const getLoggedViewMarkup = (session) => {
      const firstName = escapeHtml(session.firstName || 'Client');
      const initial = escapeHtml((session.firstName || 'C').charAt(0).toUpperCase());

      return [
        '<div class="account-logged-shell">',
        '  <div class="account-user-summary">',
        `    <div class="account-user-avatar">${initial}</div>`,
        '    <div class="account-user-copy">',
        `      <strong>Bonjour ${firstName}</strong>`,
        '    </div>',
        '  </div>',
        '  <div class="account-menu">',
        '    <button class="account-menu-item" type="button" data-account-action="account">Voir mon compte</button>',
        '    <button class="account-menu-item" type="button" data-account-action="orders">Mes commandes</button>',
        '    <button class="account-menu-item" type="button" data-account-action="addresses">Mes adresses</button>',
        '  </div>',
        '  <p class="account-logged-feedback" id="account-logged-feedback">Connexion réussie. Votre espace JACES est prêt.</p>',
        '  <button class="account-logout-button" type="button" data-account-logout>Déconnexion</button>',
        '</div>'
      ].join('');
    };

    const renderAccountPopover = () => {
      const session = getAccountSession();

      if (session) {
        if (accountTitleWrap) accountTitleWrap.hidden = true;
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

      if (accountTitleWrap) accountTitleWrap.hidden = false;
      if (accountTitle) accountTitle.textContent = 'Se connecter';
      if (accountSubtitle) accountSubtitle.textContent = 'Accédez à vos favoris, commandes et sélections JACES.';
      if (accountNote) accountNote.textContent = '';
      if (authView) authView.hidden = false;
      if (loggedView) {
        loggedView.hidden = true;
        loggedView.innerHTML = '';
      }
      accountButtons.forEach((button) => {
        // Only strip a dot the inline anti-flash script may have applied
        // optimistically once the real Supabase check has actually run -
        // otherwise this null-session render (which fires synchronously
        // before that check resolves) would flash it off every page load.
        if (hasCheckedRealSession) button.classList.remove('account-is-connected');
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
        '  <div class="signup-flow-image" aria-hidden="true"></div>',
        '  <div class="signup-flow-panel">',
        '  <div class="signup-flow-brand"><img src="https://res.cloudinary.com/dnplvtg6h/image/upload/v1784927191/jaces/jaces-wordmark.png" alt="JACES" width="130"></div>',
        '  <button class="signup-flow-close" type="button" data-close-auth aria-label="Fermer">×</button>',
        '  <div class="signup-flow-content">',
        '    <h2>Créer un compte</h2>',
        '    <p class="signup-flow-subtitle">Créez votre compte JACES et personnalisez vos alertes mode.</p>',
        '    <div class="signup-provider-grid signup-provider-grid-single">',
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
        '      <div class="signup-flow-field">',
        '        <label for="signup-create-password">Mot de passe <span class="signup-required">*</span></label>',
        `        <input id="signup-create-password" name="password" type="password" placeholder="8 caractères minimum avec un caractère spécial" autocomplete="new-password" value="${escapeHtml(signupState.password)}" minlength="8" required>`,
        '      </div>',
        '      <div class="signup-flow-field">',
        '        <label for="signup-create-password-confirm">Confirmer le mot de passe <span class="signup-required">*</span></label>',
        `        <input id="signup-create-password-confirm" name="confirmPassword" type="password" placeholder="Retapez votre mot de passe" autocomplete="new-password" minlength="8" required>`,
        '      </div>',
        TURNSTILE_SITE_KEY ? `      <div class="cf-turnstile" data-sitekey="${escapeHtml(TURNSTILE_SITE_KEY)}"></div>` : '',
        signupState.error ? `      <p class="signup-flow-error">${escapeHtml(signupState.error)}</p>` : '',
        '      <button class="signup-primary-button" type="submit">Continuer</button>',
        '      <button class="signup-secondary-link account-create-link" type="button" data-open-login>Déjà un compte ? Se connecter</button>',
        '    </form>',
        '  </div>',
        '  </div>',
        '</div>'
      ].join('');
    };

    const signupCodeMarkup = () => {
      return [
        '<div class="signup-flow-shell">',
        '  <div class="signup-flow-image" aria-hidden="true"></div>',
        '  <div class="signup-flow-panel">',
        '  <div class="signup-flow-brand"><img src="https://res.cloudinary.com/dnplvtg6h/image/upload/v1784927191/jaces/jaces-wordmark.png" alt="JACES" width="130"></div>',
        '  <button class="signup-flow-close" type="button" data-close-auth aria-label="Fermer">×</button>',
        '  <div class="signup-flow-content">',
        '    <h2>Vérifiez votre e-mail</h2>',
        `    <p class="signup-flow-subtitle">Un code de vérification a été envoyé à ${escapeHtml(signupState.email)}.</p>`,
        '    <form class="signup-flow-form" data-signup-form="code">',
        '      <div class="signup-flow-field">',
        '        <label for="signup-code">Code de validation</label>',
        `        <input id="signup-code" name="code" type="text" inputmode="numeric" maxlength="8" placeholder="Code de vérification" value="${escapeHtml(signupState.code)}">`,
        '      </div>',
        TURNSTILE_SITE_KEY ? `      <div class="cf-turnstile" data-sitekey="${escapeHtml(TURNSTILE_SITE_KEY)}"></div>` : '',
        signupState.error ? `      <p class="signup-flow-error">${escapeHtml(signupState.error)}</p>` : '',
        signupState.codeNotice ? `      <p class="signup-flow-help">${escapeHtml(signupState.codeNotice)}</p>` : '',
        '      <button class="signup-primary-button" type="submit">Valider le code</button>',
        '      <button class="signup-secondary-link" type="button" data-resend-code>Renvoyer le code</button>',
        '      <button class="signup-secondary-link" type="button" data-reset-signup-email>Se connecter avec une autre adresse e-mail</button>',
        '    </form>',
        '  </div>',
        '  </div>',
        '</div>'
      ].join('');
    };

    const signupProfileMarkup = () => {
      const dayOptions = [['', 'Jour']];
      for (let day = 1; day <= 31; day++) {
        const padded = String(day).padStart(2, '0');
        dayOptions.push([padded, padded]);
      }
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
      // 15-75 years old, recomputed from today's date on every render - the
      // range shifts on its own each January 1st with no code change needed.
      const currentYear = new Date().getFullYear();
      const yearOptions = [['', 'Année']];
      for (let year = currentYear - 15; year >= currentYear - 75; year--) {
        yearOptions.push([String(year), String(year)]);
      }
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
      // Already known from a prior newsletter popup signup (same e-mail) -
      // don't ask again, just carry the values through silently.
      const preferenceFieldsMarkup = signupState.newsletterKnown
        ? [
            `      <input type="hidden" name="newsletterProducts" value="${signupState.newsletterProducts ? 'on' : ''}">`,
            `      <input type="hidden" name="newsletterCollections" value="${signupState.newsletterCollections ? 'on' : ''}">`,
            `      <label class="signup-check signup-check-terms"><input type="checkbox" name="termsAccepted" ${signupState.termsAccepted ? 'checked' : ''} required><span>J’accepte les <button class="signup-inline-link" type="button" data-open-terms>conditions d’utilisation</button> et la politique du site. <span class="signup-required">*</span></span></label>`
          ].join('')
        : [
            '      <div class="signup-flow-checkboxes">',
            `        <label class="signup-check"><input type="checkbox" name="newsletterProducts" ${signupState.newsletterProducts ? 'checked' : ''}><span>Recevoir la newsletter nouveaux produits</span></label>`,
            `        <label class="signup-check"><input type="checkbox" name="newsletterCollections" ${signupState.newsletterCollections ? 'checked' : ''}><span>Recevoir la newsletter actualités JACES</span></label>`,
            '      </div>',
            `      <label class="signup-check signup-check-terms"><input type="checkbox" name="termsAccepted" ${signupState.termsAccepted ? 'checked' : ''} required><span>J’accepte les <button class="signup-inline-link" type="button" data-open-terms>conditions d’utilisation</button> et la politique du site. <span class="signup-required">*</span></span></label>`
          ].join('');
      return [
        '<div class="signup-flow-shell">',
        '  <div class="signup-flow-image" aria-hidden="true"></div>',
        '  <div class="signup-flow-panel">',
        '  <div class="signup-flow-brand"><img src="https://res.cloudinary.com/dnplvtg6h/image/upload/v1784927191/jaces/jaces-wordmark.png" alt="JACES" width="130"></div>',
        signupState.forced ? '' : '  <button class="signup-flow-close" type="button" data-close-auth aria-label="Fermer">×</button>',
        '  <div class="signup-flow-content">',
        '    <h2>Complétez votre profil</h2>',
        `    <p class="signup-flow-subtitle">${signupState.forced ? 'Votre e-mail est vérifié : quelques informations avant de finaliser votre compte.' : (signupState.provider ? 'Finalisez votre inscription après connexion avec ' + escapeHtml(signupState.provider) + '.' : 'Dernière étape avant de finaliser votre compte.')}</p>`,
        '    <form class="signup-flow-form" data-signup-form="profile">',
        emailFieldMarkup,
        signupState.newsletterKnown
          ? [
              `      <input type="hidden" name="firstName" value="${escapeHtml(signupState.firstName)}">`,
              `      <input type="hidden" name="lastName" value="${escapeHtml(signupState.lastName)}">`
            ].join('')
          : [
              '      <div class="signup-flow-grid">',
              '        <div class="signup-flow-field">',
              '          <label for="signup-first-name">Prénom <span class="signup-required">*</span></label>',
              `          <input id="signup-first-name" name="firstName" type="text" placeholder="Votre prénom" value="${escapeHtml(signupState.firstName)}" inputmode="text" required>`,
              '        </div>',
              '        <div class="signup-flow-field">',
              '          <label for="signup-last-name">Nom <span class="signup-required">*</span></label>',
              `          <input id="signup-last-name" name="lastName" type="text" placeholder="Votre nom" value="${escapeHtml(signupState.lastName)}" inputmode="text" required>`,
              '        </div>',
              '      </div>'
            ].join(''),
        '      <div class="signup-flow-field">',
        '        <label>Date de naissance <span class="signup-required">*</span></label>',
        '        <p class="signup-flow-help">Cette information nous aide à personnaliser votre profil JACES.</p>',
        '        <div class="signup-birth-grid">',
        customSelectMarkup('signup-birth-day', 'birthDay', dayOptions, signupState.birthDay),
        customSelectMarkup('signup-birth-month', 'birthMonth', monthOptions, signupState.birthMonth),
        customSelectMarkup('signup-birth-year', 'birthYear', yearOptions, signupState.birthYear),
        '        </div>',
        '      </div>',
        preferenceFieldsMarkup,
        signupState.error ? `      <p class="signup-flow-error">${escapeHtml(signupState.error)}</p>` : '',
        '      <button class="signup-primary-button" type="submit">Créer mon compte</button>',
        '    </form>',
        '  </div>',
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

    let turnstileScriptPromise = null;

    function loadTurnstileScript() {
      if (turnstileScriptPromise) return turnstileScriptPromise;
      turnstileScriptPromise = new Promise((resolve) => {
        if (window.turnstile) {
          resolve(window.turnstile);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = () => resolve(window.turnstile);
        document.head.appendChild(script);
      });
      return turnstileScriptPromise;
    }

    function renderTurnstileWidgetIfNeeded(root) {
      if (!TURNSTILE_SITE_KEY) return;
      const scope = root || signupModal;
      const container = scope.querySelector('.cf-turnstile');
      if (!container || container.dataset.rendered === 'true') return;
      container.dataset.rendered = 'true';

      // The background check (Managed mode) isn't instant - submitting before
      // it resolves sends an empty captchaToken and Supabase rejects it with
      // "invalid captcha", which reads as a random failure to the user. Keep
      // the submit button disabled until a token actually lands.
      const form = container.closest('form');
      const submitButton = form ? form.querySelector('button[type="submit"]') : null;
      const originalLabel = submitButton ? submitButton.textContent : '';
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Vérification de sécurité...';
      }

      loadTurnstileScript().then((turnstile) => {
        if (!turnstile || !scope.contains(container)) return;
        turnstile.render(container, {
          sitekey: TURNSTILE_SITE_KEY,
          size: 'normal',
          callback: (token) => {
            container.dataset.token = token;
            if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = originalLabel;
            }
          }
        });
      });
    }

    // Cloudflare Turnstile tokens are single-use - Supabase rejects a token
    // it's already verified once with "captcha protection: request
    // disallowed (timeout-or-duplicate)". The widget's callback only fires
    // once per solve, so without this the SAME token would get replayed for
    // every subsequent action on the same form (e.g. a failed login attempt
    // immediately followed by "mot de passe oublié"). Consuming the token
    // here and resetting the widget means the very next fresh token is
    // already on its way by the time the next action needs one.
    function getTurnstileToken(form) {
      const container = form.querySelector('.cf-turnstile');
      if (!container) return '';
      const token = container.dataset.token || '';
      if (token) {
        container.dataset.token = '';
        if (window.turnstile) {
          try { window.turnstile.reset(container); } catch (error) {}
        }
      }
      return token;
    }

    // For actions right after another captcha-gated action on the same
    // form (token just consumed, widget still silently re-verifying),
    // give the Managed-mode background check a moment to land a fresh
    // token instead of failing immediately with an empty captchaToken.
    function waitForTurnstileToken(form, timeoutMs) {
      return new Promise((resolve) => {
        const container = form ? form.querySelector('.cf-turnstile') : null;
        if (!container) return resolve('');
        if (container.dataset.token) return resolve(container.dataset.token);

        const deadline = Date.now() + (timeoutMs || 4000);
        const poll = () => {
          if (container.dataset.token) return resolve(container.dataset.token);
          if (Date.now() >= deadline) return resolve('');
          setTimeout(poll, 150);
        };
        poll();
      });
    }

    const renderSignupFlow = () => {
      if (!signupModal) return;

      if (signupState.step === 'create') signupModal.innerHTML = signupCreateMarkup();
      if (signupState.step === 'code') signupModal.innerHTML = signupCodeMarkup();
      if (signupState.step === 'profile') signupModal.innerHTML = signupProfileMarkup();

      signupModal.classList.toggle('signup-flow-profile-view', signupState.step === 'profile');
      signupModal.classList.toggle('signup-flow-provider-view', signupState.step === 'profile' && Boolean(signupState.provider));
      signupModal.scrollTop = 0;

      if (signupState.step === 'create' || signupState.step === 'code') renderTurnstileWidgetIfNeeded();
    };

    const openTermsModal = () => {
      if (!termsModal) return;
      termsModal.innerHTML = termsMarkup();
      termsModal.hidden = false;
      overlay.classList.add('terms-open');
      const closeTermsButton = termsModal.querySelector('[data-close-terms]');
      if (closeTermsButton) closeTermsButton.focus({ preventScroll: true });
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

    let bodyScrollLockY = 0;

    // Plain `overflow: hidden` on body doesn't reliably block touch-scroll
    // on iOS Safari (the page rubber-bands behind the drawer anyway) - pinning
    // the body in place with position:fixed is the technique that actually
    // holds on every browser, so we restore the exact scroll offset on close.
    const lockBodyScroll = () => {
      if (document.body.classList.contains('account-modal-open')) return;
      bodyScrollLockY = window.scrollY || window.pageYOffset || 0;
      document.body.style.top = `-${bodyScrollLockY}px`;
      document.body.classList.add('account-modal-open');
      document.documentElement.classList.add('account-modal-open');
    };

    const unlockBodyScroll = () => {
      document.body.classList.remove('account-modal-open');
      document.documentElement.classList.remove('account-modal-open');
      document.body.style.top = '';
      // The site sets scroll-behavior:smooth globally, which would turn this
      // restore into a visible animated scroll instead of landing back
      // instantly where the user was - force it instant here.
      window.scrollTo({ top: bodyScrollLockY, left: 0, behavior: 'instant' });
    };

    const openSigninPopover = (button) => {
      activeButton = button;
      renderAccountPopover();
      overlay.classList.add('open');
      overlay.classList.remove('signup-flow-open');
      lockBodyScroll();
      if (popover) popover.hidden = false;
      if (signupModal) signupModal.hidden = true;
      closeTermsModal();
      const loginError = getLoginError();
      if (loginError) {
        loginError.hidden = true;
        loginError.textContent = '';
      }
      const session = getAccountSession();
      const emailInput = getEmailInput();
      if (!session && emailInput) emailInput.focus({ preventScroll: true });
      if (!session) renderTurnstileWidgetIfNeeded(popover);
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
      lockBodyScroll();
      if (popover) popover.hidden = true;
      if (signupModal) signupModal.hidden = false;
      closeTermsModal();
      renderSignupFlow();
      const autofocus = signupModal.querySelector('input, textarea, button');
      if (autofocus) autofocus.focus({ preventScroll: true });
    };

    const closeAll = () => {
      // The profile step is mandatory once the email is verified (a real,
      // signed-in Supabase user exists with no profiles row yet) - don't let
      // the modal be dismissed until that row is created.
      if (signupState.forced) return;
      overlay.classList.remove('open', 'signup-flow-open');
      unlockBodyScroll();
      activeButton = null;
      if (popover) popover.hidden = false;
      if (signupModal) signupModal.hidden = true;
      closeTermsModal();
      resetSignupState();
      renderSignupFlow();
      renderAccountPopover();
    };

    accountButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        // getAccountSession() only reflects a network-validated session and
        // can still be null right after page load - check the locally
        // persisted session too (no network round trip) so a quick click
        // right after navigation doesn't fall through to the popover.
        let loggedIn = !!getAccountSession();
        if (!loggedIn) {
          const { data } = await supabaseClient.auth.getSession();
          loggedIn = !!data?.session;
        }

        if (loggedIn) {
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

      if (target.name === 'code') {
        const sanitizedValue = target.value.replace(/\D/g, '').slice(0, 8);
        if (sanitizedValue !== target.value) {
          target.value = sanitizedValue;
        }
      }

      // Keep signupState in sync with the create-account form as the user
      // types, not just on submit - switching to "Se connecter" and back
      // re-renders this step from signupState, and without this the
      // in-progress email/password/checkboxes would be lost.
      if (target.closest('[data-signup-form="email"]')) {
        if (target.name === 'email') signupState.email = target.value;
        else if (target.name === 'password') signupState.password = target.value;
        else if (target.name === 'newsletterProducts') signupState.newsletterProducts = target.checked;
        else if (target.name === 'newsletterCollections') signupState.newsletterCollections = target.checked;
        else if (target.name === 'termsAccepted') signupState.termsAccepted = target.checked;
      }
    });

    const refreshDayOptions = (birthGrid) => {
      const daySelect = birthGrid.querySelector('.jc-select[data-select-name="birthDay"]');
      const monthInput = birthGrid.querySelector('.jc-select[data-select-name="birthMonth"] [data-select-value]');
      const yearInput = birthGrid.querySelector('.jc-select[data-select-name="birthYear"] [data-select-value]');
      if (!daySelect || !monthInput) return;

      const month = Number.parseInt(monthInput.value, 10);
      const year = Number.parseInt(yearInput ? yearInput.value : '', 10);
      const maxDay = Number.isInteger(month) && month >= 1 && month <= 12
        ? daysInMonth(month, Number.isInteger(year) ? year : 2001)
        : 31;

      const panel = daySelect.querySelector('[data-select-panel]');
      const hiddenInput = daySelect.querySelector('[data-select-value]');
      const trigger = daySelect.querySelector('[data-select-trigger]');
      if (!panel || !hiddenInput || !trigger) return;

      const currentValue = hiddenInput.value;
      const currentDayNumber = Number.parseInt(currentValue, 10);
      const stillValid = currentValue && Number.isInteger(currentDayNumber) && currentDayNumber <= maxDay;

      const items = [];
      for (let day = 1; day <= maxDay; day++) {
        const padded = String(day).padStart(2, '0');
        items.push(`<li class="jc-select-option${padded === currentValue ? ' is-selected' : ''}" role="option" data-value="${padded}" aria-selected="${padded === currentValue}">${padded}</li>`);
      }
      panel.innerHTML = items.join('');

      if (!stillValid) {
        hiddenInput.value = '';
        hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
        const triggerText = trigger.querySelector('span');
        if (triggerText) triggerText.textContent = 'Jour';
        trigger.classList.add('jc-select-placeholder');
      }
    };

    const closeCustomSelects = (exceptPanel) => {
      overlay.querySelectorAll('[data-select-panel]').forEach((panel) => {
        if (panel === exceptPanel) return;
        panel.hidden = true;
        panel.querySelectorAll('.jc-select-option').forEach((option) => { option.hidden = false; });
        const trigger = panel.previousElementSibling;
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      });
    };

    let typeaheadBuffer = '';
    let typeaheadTimer = null;

    const clearTypeahead = () => {
      typeaheadBuffer = '';
      if (typeaheadTimer) {
        clearTimeout(typeaheadTimer);
        typeaheadTimer = null;
      }
    };

    // Native <select> lets you type "3" to jump near "31" - our custom
    // listbox needs to rebuild that itself, and the user specifically wants
    // it to filter down to matches (not just scroll to the first one).
    overlay.addEventListener('keydown', (event) => {
      const trigger = event.target.closest('[data-select-trigger]');
      if (!trigger) return;
      const jcSelect = trigger.closest('.jc-select');
      const panel = jcSelect ? jcSelect.querySelector('[data-select-panel]') : null;
      if (!panel) return;

      if (event.key === 'Escape') {
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        panel.querySelectorAll('.jc-select-option').forEach((option) => { option.hidden = false; });
        clearTypeahead();
        return;
      }

      if (event.key === 'Enter') {
        const visibleOptions = Array.from(panel.querySelectorAll('.jc-select-option')).filter((option) => !option.hidden);
        if (visibleOptions.length === 1) {
          event.preventDefault();
          visibleOptions[0].click();
          clearTypeahead();
        }
        return;
      }

      if (!/^[a-zA-Z0-9]$/.test(event.key)) return;
      event.preventDefault();

      closeCustomSelects(panel);
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');

      const applyFilter = (buffer) => {
        let firstMatch = null;
        let visibleCount = 0;
        panel.querySelectorAll('.jc-select-option').forEach((option) => {
          const matches = (option.textContent || '').trim().toLowerCase().startsWith(buffer);
          option.hidden = !matches;
          if (matches) {
            visibleCount++;
            if (!firstMatch) firstMatch = option;
          }
        });
        return { firstMatch, visibleCount };
      };

      typeaheadBuffer += event.key.toLowerCase();
      let { firstMatch, visibleCount } = applyFilter(typeaheadBuffer);

      // No option matches at all (e.g. a digit typed into the month list,
      // whose options are words) - show everything again instead of leaving
      // the panel empty. Retrying with just the last key would only repeat
      // the same failed filter, since the buffer was that key already.
      if (visibleCount === 0) {
        typeaheadBuffer = '';
        ({ firstMatch, visibleCount } = applyFilter(''));
      }

      if (typeaheadTimer) clearTimeout(typeaheadTimer);
      typeaheadTimer = setTimeout(clearTypeahead, 800);

      if (firstMatch) firstMatch.scrollIntoView({ block: 'nearest' });
    });

    overlay.addEventListener('click', async (event) => {
      if (event.target === overlay) {
        if (overlay.classList.contains('terms-open')) {
          closeTermsModal();
          return;
        }
        closeAll();
      }

      const selectTrigger = event.target.closest('[data-select-trigger]');
      if (selectTrigger) {
        event.preventDefault();
        const panel = selectTrigger.nextElementSibling;
        const willOpen = panel && panel.hidden;
        closeCustomSelects(willOpen ? panel : null);
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
          const label = selectOption.textContent || '';
          const hiddenInput = jcSelect.querySelector('[data-select-value]');
          const trigger = jcSelect.querySelector('[data-select-trigger]');
          if (hiddenInput) {
            hiddenInput.value = value;
            hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (trigger) {
            const triggerText = trigger.querySelector('span');
            if (triggerText) triggerText.textContent = label;
            trigger.classList.remove('jc-select-placeholder');
            trigger.setAttribute('aria-expanded', 'false');
          }
          jcSelect.querySelectorAll('.jc-select-option').forEach((option) => {
            option.classList.toggle('is-selected', option === selectOption);
            option.setAttribute('aria-selected', String(option === selectOption));
          });

          const selectName = jcSelect.getAttribute('data-select-name');
          const birthGrid = jcSelect.closest('.signup-birth-grid');
          if (birthGrid && (selectName === 'birthMonth' || selectName === 'birthYear')) {
            refreshDayOptions(birthGrid);
          }
        }
        closeCustomSelects(null);
        return;
      }

      if (!event.target.closest('.jc-select')) {
        closeCustomSelects(null);
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
          if (emailInput) emailInput.focus({ preventScroll: true });
          return;
        }

        if (loginError) {
          loginError.hidden = true;
          loginError.textContent = '';
        }
        if (accountNote) accountNote.textContent = 'Vérification de sécurité...';

        const loginForm = getLoginForm();
        const captchaToken = loginForm ? await waitForTurnstileToken(loginForm) : '';
        if (loginForm) getTurnstileToken(loginForm); // consume it so it can't be replayed by a later action

        if (accountNote) accountNote.textContent = 'Envoi en cours...';

        const { error } = await supabaseClient.auth.resetPasswordForEmail(emailValue, {
          redirectTo: `${window.location.origin}/reset-password.html`,
          captchaToken: captchaToken || undefined
        });

        if (error) {
          if (accountNote) accountNote.textContent = '';
          if (loginError) {
            loginError.hidden = false;
            const waitMatch = /after (\d+) seconds/i.exec(error.message || '');
            loginError.textContent = waitMatch
              ? `Vous avez déjà demandé un lien il y a moins d'une minute. Réessayez dans ${waitMatch[1]} secondes.`
              : "Impossible d'envoyer l'e-mail de réinitialisation pour le moment.";
          }
          return;
        }

        if (accountNote) accountNote.textContent = `Un e-mail de réinitialisation a été envoyé à ${emailValue}.`;
        return;
      }

      const logoutTrigger = event.target.closest('[data-account-logout]');
      if (logoutTrigger) {
        event.preventDefault();
        pendingAuthSuccessAction = null;
        await supabaseClient.auth.signOut();
        await refreshSessionFromSupabase();
        renderAccountPopover();
        if (accountNote) accountNote.textContent = 'Vous êtes déconnecté.';
        const emailInput = getEmailInput();
        if (emailInput) emailInput.focus({ preventScroll: true });
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

        // From the signup flow, the × goes back to the login drawer rather
        // than closing outright.
        if (overlay.classList.contains('signup-flow-open')) {
          resetSignupState();
          openSigninPopover(activeButton || accountButtons[0] || null);
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

      const loginTrigger = event.target.closest('[data-open-login]');
      if (loginTrigger) {
        event.preventDefault();
        openSigninPopover(activeButton || accountButtons[0] || null);
        return;
      }

      const providerButton = event.target.closest('[data-provider]');
      if (providerButton) {
        event.preventDefault();
        // Full-page redirect to Google, then back here with a session already
        // established - enterForcedProfileStepIfNeeded() (see init below)
        // takes over from there since there's no profiles row yet for a
        // brand new OAuth user.
        const { error } = await supabaseClient.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin }
        });
        if (error) {
          signupState.error = translateAuthError(error);
          renderSignupFlow();
        }
        return;
      }

      const resetEmail = event.target.closest('[data-reset-signup-email]');
      if (resetEmail) {
        event.preventDefault();
        signupState.step = 'create';
        signupState.provider = '';
        signupState.code = '';
        signupState.error = '';
        signupState.codeNotice = '';
        renderSignupFlow();
        return;
      }

      const resendCodeTrigger = event.target.closest('[data-resend-code]');
      if (resendCodeTrigger) {
        event.preventDefault();
        const resendForm = resendCodeTrigger.closest('form');
        const captchaToken = resendForm ? await waitForTurnstileToken(resendForm) : '';
        if (resendForm) getTurnstileToken(resendForm);
        signupState.error = '';
        signupState.codeNotice = 'Envoi en cours...';
        renderSignupFlow();

        const { error } = await supabaseClient.auth.resend({
          type: 'signup',
          email: signupState.email,
          options: { captchaToken: captchaToken || undefined }
        });

        signupState.codeNotice = error ? '' : 'Un nouveau code vous a été envoyé.';
        if (error) signupState.error = translateAuthError(error);
        renderSignupFlow();
        return;
      }
    });

    function translateAuthError(error) {
      const message = String(error?.message || '');
      if (/invalid login credentials/i.test(message)) return 'Votre adresse e-mail ou votre mot de passe est invalide.';
      if (/email not confirmed/i.test(message)) return 'Votre adresse e-mail ou votre mot de passe est invalide.';
      if (/user already registered|already been registered/i.test(message)) return 'Un compte existe déjà avec cette adresse e-mail.';
      if (/password should be at least/i.test(message)) return 'Le mot de passe est trop court.';
      if (/captcha/i.test(message)) return 'La vérification de sécurité a expiré, rechargez la page et réessayez.';
      if (/token has expired|invalid.*(otp|token)/i.test(message)) return 'Ce code est invalide ou a expiré. Demandez-en un nouveau.';
      const securityWaitMatch = message.match(/for security purposes.*after (\d+) seconds?/i);
      if (securityWaitMatch) {
        const seconds = Number(securityWaitMatch[1]);
        return seconds > 0
          ? `Pour des raisons de sécurité, vous ne pouvez refaire cette demande que dans ${seconds} seconde${seconds > 1 ? 's' : ''}.`
          : 'Veuillez patienter quelques instants avant de réessayer.';
      }
      if (/rate limit/i.test(message)) return 'Trop de tentatives, réessayez dans quelques minutes.';
      return message || 'Une erreur est survenue, veuillez réessayer.';
    }

    overlay.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-signup-form], #account-login-form');
      if (!form) return;

      event.preventDefault();

      if (form.id === 'account-login-form') {
        const loginEmail = String(new FormData(form).get('email') || '').trim();
        const loginPassword = String(new FormData(form).get('password') || '').trim();
        const loginError = getLoginError();
        const emailInput = getEmailInput();
        const passwordInput = getPasswordInput();

        if (!loginEmail && !loginPassword) {
          if (loginError) {
            loginError.textContent = 'Veuillez renseigner votre adresse e-mail et votre mot de passe.';
            loginError.hidden = false;
          }
          if (emailInput) emailInput.focus({ preventScroll: true });
          return;
        }

        if (!loginEmail) {
          if (loginError) {
            loginError.textContent = 'Veuillez renseigner votre adresse e-mail.';
            loginError.hidden = false;
          }
          if (emailInput) emailInput.focus({ preventScroll: true });
          return;
        }

        if (!loginPassword) {
          if (loginError) {
            loginError.textContent = 'Veuillez renseigner votre mot de passe.';
            loginError.hidden = false;
          }
          if (passwordInput) passwordInput.focus({ preventScroll: true });
          return;
        }

        if (loginError) {
          loginError.hidden = true;
          loginError.textContent = '';
        }

        const loginCaptchaToken = await waitForTurnstileToken(form);
        getTurnstileToken(form);
        const { error } = await supabaseClient.auth.signInWithPassword({
          email: loginEmail,
          password: loginPassword,
          options: { captchaToken: loginCaptchaToken || undefined }
        });

        if (error) {
          if (loginError) {
            loginError.hidden = false;
            loginError.textContent = translateAuthError(error);
          }
          if (passwordInput) passwordInput.focus({ preventScroll: true });
          return;
        }

        await refreshSessionFromSupabase();
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
        signupState.password = String(formData.get('password') || '').trim();
        const confirmPassword = String(formData.get('confirmPassword') || '').trim();

        if (!isAllowedEmail(signupState.email)) {
          signupState.error = 'Utilisez une adresse autorisée : gmail.com, icloud.com, hotmail.fr, orange.fr ou outlook.fr.';
          renderSignupFlow();
          return;
        }

        if (!passwordValidationRegex.test(signupState.password)) {
          signupState.error = 'Le mot de passe doit contenir au moins 8 caractères et un caractère spécial.';
          renderSignupFlow();
          return;
        }

        if (signupState.password !== confirmPassword) {
          signupState.error = 'Les mots de passe ne correspondent pas.';
          renderSignupFlow();
          return;
        }

        const captchaToken = await waitForTurnstileToken(form);
        getTurnstileToken(form);
        signupState.error = '';
        renderSignupFlow();

        const { error } = await supabaseClient.auth.signUp({
          email: signupState.email,
          password: signupState.password,
          options: {
            captchaToken: captchaToken || undefined
          }
        });

        if (error) {
          signupState.error = translateAuthError(error);
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

        if (!/^\d{4,8}$/.test(signupState.code)) {
          signupState.error = 'Saisissez le code de vérification reçu par e-mail.';
          renderSignupFlow();
          return;
        }

        signupState.error = '';
        renderSignupFlow();

        const { error } = await supabaseClient.auth.verifyOtp({
          email: signupState.email,
          token: signupState.code,
          type: 'signup'
        });

        if (error) {
          signupState.error = translateAuthError(error);
          renderSignupFlow();
          return;
        }

        await refreshSessionFromSupabase();
        signupState.error = '';
        signupState.step = 'profile';
        await prefillNameFromNewsletter(signupState.email);
        renderSignupFlow();
        return;
      }

      if (kind === 'profile') {
        const formData = new FormData(form);
        signupState.firstName = normalizePersonName(String(formData.get('firstName') || '').trim());
        signupState.lastName = normalizePersonName(String(formData.get('lastName') || '').trim());
        signupState.birthDay = String(formData.get('birthDay') || '').trim();
        signupState.birthMonth = String(formData.get('birthMonth') || '').trim();
        signupState.birthYear = String(formData.get('birthYear') || '').trim();
        signupState.newsletterProducts = formData.get('newsletterProducts') === 'on';
        signupState.newsletterCollections = formData.get('newsletterCollections') === 'on';
        signupState.termsAccepted = formData.get('termsAccepted') === 'on';

        if (!signupState.termsAccepted) {
          signupState.error = 'Vous devez accepter les conditions pour continuer.';
          renderSignupFlow();
          return;
        }

        if (!signupState.firstName || !signupState.lastName) {
          signupState.error = 'Complétez le prénom et le nom.';
          renderSignupFlow();
          return;
        }

        if (!nameValidationRegex.test(signupState.firstName) || !nameValidationRegex.test(signupState.lastName)) {
          signupState.error = 'Le prénom et le nom ne peuvent contenir que des lettres, espaces, tirets et apostrophes.';
          renderSignupFlow();
          return;
        }

        if (!/^\d{2}$/.test(signupState.birthDay) || !signupState.birthMonth || !/^\d{4}$/.test(signupState.birthYear)) {
          signupState.error = 'Complétez votre date de naissance.';
          renderSignupFlow();
          return;
        }

        signupState.error = '';

        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
          signupState.error = 'Votre session a expiré, recommencez l’inscription.';
          renderSignupFlow();
          return;
        }

        const birthDate = `${signupState.birthYear}-${signupState.birthMonth}-${signupState.birthDay}`;
        const { error } = await supabaseClient.from('profiles').upsert({
          id: user.id,
          first_name: signupState.firstName,
          last_name: signupState.lastName,
          birth_date: birthDate,
          newsletter_products: signupState.newsletterProducts,
          newsletter_collections: signupState.newsletterCollections
        });

        if (error) {
          signupState.error = 'Impossible d’enregistrer votre profil pour le moment.';
          renderSignupFlow();
          return;
        }

        await refreshSessionFromSupabase();
        resolvePendingAuthSuccess();
        signupState.forced = false;
        closeAll();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && overlay.classList.contains('open')) {
        const openPanel = overlay.querySelector('[data-select-panel]:not([hidden])');
        if (openPanel) {
          closeCustomSelects(null);
          return;
        }
        if (overlay.classList.contains('terms-open')) {
          closeTermsModal();
          return;
        }
        closeAll();
      }
    });

    renderAccountPopover();
    renderSignupFlow();

    const enterForcedProfileStepIfNeeded = () => {
      if (!profileIncomplete) return;
      signupState.email = cachedSession?.email || '';
      signupState.step = 'profile';
      signupState.forced = true;
      signupState.error = '';
      openSignupFlow();
      if (signupState.email) prefillNameFromNewsletter(signupState.email);
    };

    refreshSessionFromSupabase().then(() => {
      renderAccountPopover();
      window.dispatchEvent(new CustomEvent('jaces:nav-state-changed'));
      enterForcedProfileStepIfNeeded();
    });

    supabaseClient.auth.onAuthStateChange((authEvent) => {
      if (authEvent === 'SIGNED_OUT' || authEvent === 'SIGNED_IN' || authEvent === 'USER_UPDATED') {
        refreshSessionFromSupabase().then(() => {
          renderAccountPopover();
          enterForcedProfileStepIfNeeded();
        });
      }
    });

    window.JacesAuth = {
      supabase: supabaseClient,
      getSession: getAccountSession,
      refreshSession: refreshSessionFromSupabase,
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