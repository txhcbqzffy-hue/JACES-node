(function () {
  function normalizeMenu(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function slugify(value) {
    return normalizeMenu(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function findNavItemByHref(navRoot, href) {
    const link = navRoot.querySelector(`.nav-item > a[href="${href}"]`);
    return link ? link.closest('.nav-item') : null;
  }

  function replaceSubmenuCategoryLinks(navItem, links) {
    if (!navItem) return;
    const categoryCol = navItem.querySelector('.submenu .submenu-categories');
    if (!categoryCol) return;

    const titleNode = categoryCol.querySelector('.submenu-title');
    categoryCol.querySelectorAll('a').forEach((a) => a.remove());

    const fragment = document.createDocumentFragment();
    links.forEach(({ href, label }) => {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = label;
      fragment.appendChild(a);
    });

    if (titleNode) {
      titleNode.insertAdjacentElement('afterend', document.createElement('span'));
      const marker = titleNode.nextSibling;
      marker.replaceWith(fragment);
    } else {
      categoryCol.appendChild(fragment);
    }
  }

  // Génère des liens simples ?category=slug (sans filterId)
  // pour rester compatible avec les scripts inline de chaque page
  function mapFiltersToSimpleLinks(filters, targetPage) {
    return filters.map((f) => ({
      href: `${targetPage}?category=${encodeURIComponent(slugify(f.slug || f.label || f.name || f.id))}`,
      label: f.label || f.name || 'Filtre'
    }));
  }

  function initMobileMegaMenu(navRoot) {
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

        // Laisser la navigation normale vers les autres pages du site.
        // On intercepte uniquement quand on est deja sur la page cible.
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

  async function initDynamicMenus() {
    const navRoot = document.querySelector('.nav');
    if (!navRoot) return;

    initMobileMegaMenu(navRoot);

    try {
      const response = await fetch('/api/filters');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const filters = Array.isArray(data) ? data : [];

      // COLLECTION : remplace les catégories (Robes, Tops, etc.)
      // On exclut "tout-voir" qui n'est pas dans le submenu hardcodé
      const categoryFilters = filters.filter((f) =>
        normalizeMenu(f.menu) === 'categories' &&
        slugify(f.slug || f.label || f.name || '') !== 'tout-voir'
      );
      const collectionsItem = findNavItemByHref(navRoot, 'collection.html');
      if (categoryFilters.length) {
        replaceSubmenuCategoryLinks(collectionsItem, mapFiltersToSimpleLinks(categoryFilters, 'collection.html'));
      }

      // NOUVEAUTÉS : ne pas remplacer — la colonne FEMME est hardcodée et correcte

      // COLLABORATIONS : ne pas remplacer — les slugs API (jaces-x-nike) ne correspondent
      // pas aux catégories attendues par la page (nike, chloe, etc.)

      // ACCESSOIRES : remplace les catégories (Sacs, Bijoux, etc.)
      const accessoiresFilters = filters.filter((f) => normalizeMenu(f.menu) === 'accessoires');
      const accessoiresItem = findNavItemByHref(navRoot, 'accessoires.html');
      if (accessoiresFilters.length) {
        replaceSubmenuCategoryLinks(accessoiresItem, mapFiltersToSimpleLinks(accessoiresFilters, 'accessoires.html'));
      }

    } catch (error) {
      console.warn('Impossible de charger les filtres dynamiques:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', initDynamicMenus);
})();