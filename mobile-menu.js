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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileMegaMenu);
  } else {
    initMobileMegaMenu();
  }
})();
