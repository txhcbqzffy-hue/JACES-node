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

  function mapFiltersToLinks(filters, targetPage) {
    return filters.map((f) => ({
      href: `${targetPage}?filterId=${encodeURIComponent(f.id)}&category=${encodeURIComponent(slugify(f.slug || f.label || f.name || f.id))}`,
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
        const isOpen = item.classList.contains('submenu-open');

        // Premier tap: on ouvre le mega menu sans naviguer.
        if (!isOpen) {
          event.preventDefault();
          closeAll(item);
          item.classList.add('submenu-open');
          return;
        }

        // Deuxieme tap: on laisse la navigation se faire normalement.
        item.classList.remove('submenu-open');
      });

      submenu.querySelectorAll('a').forEach((submenuLink) => {
        submenuLink.addEventListener('click', () => {
          // Sur certaines pages (ex: collection), des handlers preventDefault
          // gardent la page ouverte: on ferme explicitement le mega menu.
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

      const groups = {
        // "categories" seulement: pas les filtres de saison (menu "collections")
        categories: filters.filter((f) => normalizeMenu(f.menu) === 'categories'),
        // Nouveautes reste en HTML statique pour conserver la colonne FEMME
        collaborations: filters.filter((f) => normalizeMenu(f.menu) === 'collaborations'),
        accessoires: filters.filter((f) => normalizeMenu(f.menu) === 'accessoires')
      };

      const collectionsItem = findNavItemByHref(navRoot, 'collection.html');
      if (groups.categories.length) {
        replaceSubmenuCategoryLinks(collectionsItem, mapFiltersToLinks(groups.categories, 'collection.html'));
      }

      // Nouveautes: ne pas remplacer submenu-categories (liens de categorie statiques)

      const collaborationsItem = findNavItemByHref(navRoot, 'collaborations.html');
      if (groups.collaborations.length) {
        replaceSubmenuCategoryLinks(collaborationsItem, mapFiltersToLinks(groups.collaborations, 'collaborations.html'));
      }

      const accessoiresItem = findNavItemByHref(navRoot, 'accessoires.html');
      if (groups.accessoires.length) {
        replaceSubmenuCategoryLinks(accessoiresItem, mapFiltersToLinks(groups.accessoires, 'accessoires.html'));
      }
    } catch (error) {
      console.warn('Impossible de charger les filtres dynamiques:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', initDynamicMenus);
})();
