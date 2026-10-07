(function () {
  // Tap-to-open mobile mega menu.
  //
  // style.css has a `@media (max-width: 920px) and (hover: none) and
  // (pointer: coarse)` block that turns .submenu into an absolute-positioned
  // panel shown only while its .nav-item carries a `submenu-open` class.
  // This is the only place that class gets toggled - it was previously
  // wired up through filters.js, but no page currently includes that
  // script, so on real phones/tablets tapping a nav item just followed the
  // link straight away and the submenu panel was unreachable. This re-adds
  // just the touch-toggle behaviour (no desktop/hover code path, no
  // dynamic category-fetching - that part of filters.js is left untouched).
  function initMobileMegaMenu() {
    const navRoot = document.querySelector('.nav');
    if (!navRoot || window.__JACES_MEGAMENU_INIT) return;

    const isTouchLike = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    if (!isTouchLike) return;

    window.__JACES_MEGAMENU_INIT = true;

    const items = Array.from(navRoot.querySelectorAll('.nav-item'));

    function closeAll(exceptItem) {
      items.forEach((item) => {
        if (item !== exceptItem) item.classList.remove('submenu-open');
      });
    }

    items.forEach((item) => {
      const trigger = item.querySelector(':scope > a');
      const submenu = item.querySelector(':scope > .submenu');
      if (!trigger || !submenu) return;

      trigger.addEventListener('click', (event) => {
        const href = String(trigger.getAttribute('href') || '').trim();
        const currentPage = (window.location.pathname.split('/').pop() || '').toLowerCase();
        const targetPage = href.split('?')[0].toLowerCase();
        const isSamePageLink = !!targetPage && targetPage === currentPage;

        // Let normal navigation happen toward other pages of the site.
        // We only intercept the tap when we're already on the target page.
        if (!isSamePageLink) {
          closeAll(null);
          return;
        }

        const isOpen = item.classList.contains('submenu-open');
        if (!isOpen) {
          event.preventDefault();
          closeAll(item);
          item.classList.add('submenu-open');
          return;
        }
        item.classList.remove('submenu-open');
      });

      submenu.querySelectorAll('a').forEach((submenuLink) => {
        submenuLink.addEventListener('click', () => {
          closeAll(null);
        });
      });
    });

    document.addEventListener('click', (event) => {
      if (!navRoot.contains(event.target)) {
        closeAll(null);
      }
    });
  }

  // Burger + slide-in drawer for narrow screens (<=900px, touch or not).
  // style.css hides the inline .nav at that width and shows the burger
  // instead; the drawer is built here from the existing .nav markup so the
  // ~20 HTML pages don't each need a second copy of the menu.
  const MOBILE_QUERY = window.matchMedia('(max-width: 900px)');

  function updateHeaderOffset() {
    const header = document.querySelector('.header');
    if (!header) return;
    // Space pages need to reserve under the fixed topbar + header.
    const offset = header.offsetTop + header.offsetHeight;
    document.documentElement.style.setProperty('--jaces-header-offset', offset + 'px');
  }

  function initMobileDrawer() {
    const header = document.querySelector('.header');
    const nav = header && header.querySelector('.nav');
    const headerLeft = header && header.querySelector('.header-left');
    if (!nav || !headerLeft || document.getElementById('mobile-drawer')) return;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mobile-menu-toggle';
    toggle.setAttribute('aria-label', 'Ouvrir le menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'mobile-drawer');
    toggle.innerHTML = '<span></span><span></span><span></span>';
    headerLeft.prepend(toggle);

    const backdrop = document.createElement('div');
    backdrop.className = 'mobile-drawer-backdrop';

    const drawer = document.createElement('aside');
    drawer.className = 'mobile-drawer';
    drawer.id = 'mobile-drawer';
    drawer.setAttribute('aria-label', 'Menu');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;

    const head = document.createElement('div');
    head.className = 'mobile-drawer-head';
    const logo = header.querySelector('.logo');
    if (logo) head.appendChild(logo.cloneNode(true));
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'mobile-drawer-close';
    closeBtn.setAttribute('aria-label', 'Fermer le menu');
    closeBtn.innerHTML = '&times;';
    head.appendChild(closeBtn);
    drawer.appendChild(head);

    const list = document.createElement('nav');
    list.className = 'mobile-drawer-nav';

    nav.querySelectorAll(':scope > .nav-item').forEach((item, index) => {
      const link = item.querySelector(':scope > a');
      if (!link) return;
      const row = document.createElement('div');
      row.className = 'mobile-drawer-item';

      const rowHead = document.createElement('div');
      rowHead.className = 'mobile-drawer-row';
      const mainLink = link.cloneNode(true);
      mainLink.className = 'mobile-drawer-link';
      rowHead.appendChild(mainLink);
      row.appendChild(rowHead);

      const submenu = item.querySelector(':scope > .submenu');
      const columns = submenu
        ? Array.from(submenu.children).filter((col) => !col.classList.contains('submenu-image') && col.querySelector('a'))
        : [];

      if (columns.length) {
        const panelId = 'mobile-drawer-sub-' + index;
        const expand = document.createElement('button');
        expand.type = 'button';
        expand.className = 'mobile-drawer-expand';
        expand.setAttribute('aria-expanded', 'false');
        expand.setAttribute('aria-controls', panelId);
        expand.setAttribute('aria-label', 'Afficher ' + link.textContent.trim());
        rowHead.appendChild(expand);

        const panel = document.createElement('div');
        panel.className = 'mobile-drawer-sub';
        panel.id = panelId;
        panel.hidden = true;
        columns.forEach((col) => {
          const group = document.createElement('div');
          group.className = 'mobile-drawer-group';
          const title = col.querySelector('.submenu-title');
          if (title) {
            const t = document.createElement('p');
            t.className = 'mobile-drawer-group-title';
            t.textContent = title.textContent.trim();
            group.appendChild(t);
          }
          col.querySelectorAll('a').forEach((a) => {
            const copy = document.createElement('a');
            copy.href = a.getAttribute('href') || '#';
            copy.textContent = a.textContent.trim();
            group.appendChild(copy);
          });
          panel.appendChild(group);
        });
        row.appendChild(panel);

        expand.addEventListener('click', () => {
          const open = expand.getAttribute('aria-expanded') === 'true';
          expand.setAttribute('aria-expanded', String(!open));
          panel.hidden = open;
        });
      }

      list.appendChild(row);
    });

    drawer.appendChild(list);
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    function setOpen(open) {
      document.body.classList.toggle('mobile-drawer-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      drawer.setAttribute('aria-hidden', String(!open));
      drawer.inert = !open;
      if (open) closeBtn.focus();
    }

    toggle.addEventListener('click', () => setOpen(true));
    closeBtn.addEventListener('click', () => { setOpen(false); toggle.focus(); });
    backdrop.addEventListener('click', () => setOpen(false));
    drawer.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && document.body.classList.contains('mobile-drawer-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    MOBILE_QUERY.addEventListener('change', (event) => {
      if (!event.matches) setOpen(false);
    });
  }

  function init() {
    initMobileDrawer();
    initMobileMegaMenu();
    updateHeaderOffset();
    window.addEventListener('resize', updateHeaderOffset);
    window.addEventListener('load', updateHeaderOffset);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
