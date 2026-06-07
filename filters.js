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

  async function initDynamicMenus() {
    const navRoot = document.querySelector('.nav');
    if (!navRoot) return;

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
