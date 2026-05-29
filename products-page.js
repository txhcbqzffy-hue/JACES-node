function removeDiacritics(str) {
  const input = String(str || '');
  // Prefer Unicode property escapes when available; fallback to explicit combining mark ranges.
  try {
    return input.normalize('NFD').replace(/\p{M}+/gu, '');
  } catch (e) {
    // Some engines may not support \p{M}; use explicit ranges for combining marks (uppercase F for safety)
    return input.normalize('NFD').replace(/[\u0300-\u036F]/g, '');
  }
}

function normalizeToken(value) {
  return removeDiacritics(value)
    .toLowerCase()
    .trim();
}

function slugify(value) {
  return normalizeToken(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function getCurrentPageName() {
  return (window.location.pathname.split('/').pop() || '').toLowerCase();
}

function getApiPage(pageName) {
  const map = {
    'collection.html': 'collection',
    'nouveautes.html': 'nouveautes',
    'collaborations.html': 'collaborations',
    'collaboration.html': 'collaboration',
    'accessoires.html': 'accessoires'
  };
  return map[pageName] || '';
}

function shouldLoadDynamicProducts(pageName, hasFilter) {
  const pages = new Set([
    'index.html',
    'nouveautes.html',
    'produits.html',
    'collection.html',
    'collaborations.html',
    'collaboration.html',
    'accessoires.html'
  ]);
  return hasFilter || pages.has(pageName);
}

function getPageMenusFromApiPage(apiPage) {
  const map = {
    collection: ['categories', 'collections'],
    nouveautes: ['nouveautes'],
    collaborations: ['collaborations'],
    collaboration: ['collaborations'],
    accessoires: ['accessoires']
  };
  return map[normalizeToken(apiPage)] || [];
}

function filterSlug(filter) {
  return slugify(filter?.slug || filter?.code || filter?.label || filter?.name || filter?.id);
}

function resolveActiveFilter(filters, rawFilterId, requestedCategory) {
  const safeFilters = Array.isArray(filters) ? filters : [];
  const byId = new Map(safeFilters.map((filter) => [String(filter.id), filter]));

  if (rawFilterId) {
    const matchedById = byId.get(String(rawFilterId));
    if (matchedById) {
      return {
        id: String(matchedById.id),
        slug: filterSlug(matchedById),
        label: matchedById.label || matchedById.name || 'Filtre',
        source: 'query.filterId'
      };
    }

    return {
      id: String(rawFilterId),
      slug: '',
      label: `Filtre ${String(rawFilterId)}`,
      source: 'query.filterId_unresolved'
    };
  }

  const normalizedCategory = slugify(requestedCategory);
  if (!normalizedCategory || normalizedCategory === 'all') return null;

  const matchedBySlug = safeFilters.find((filter) => filterSlug(filter) === normalizedCategory);
  if (!matchedBySlug) {
    return {
      id: '',
      slug: normalizedCategory,
      label: requestedCategory,
      source: 'query.category_unresolved'
    };
  }

  return {
    id: String(matchedBySlug.id),
    slug: filterSlug(matchedBySlug),
    label: matchedBySlug.label || matchedBySlug.name || requestedCategory,
    source: 'query.category'
  };
}

function getProductFilterIds(product) {
  return uniqueStrings((Array.isArray(product?.filter_ids) ? product.filter_ids : []).map((id) => String(id)));
}

function getProductFilterTokens(product) {
  const directTokens = uniqueStrings((Array.isArray(product?.filter_tokens) ? product.filter_tokens : []).map((token) => slugify(token)));
  const fromFilters = uniqueStrings((Array.isArray(product?.filters) ? product.filters : [])
    .map((filter) => filterSlug(filter))
    .filter(Boolean));

  const fromMenus = [];
  const menus = product?.filter_menus;
  if (menus && typeof menus === 'object') {
    Object.values(menus).forEach((entries) => {
      (Array.isArray(entries) ? entries : []).forEach((entry) => {
        const token = slugify(entry?.slug || entry?.label || entry?.id);
        if (token) fromMenus.push(token);
      });
    });
  }

  return uniqueStrings([...directTokens, ...fromFilters, ...fromMenus]);
}

function productMatchesPageMenus(product, pageMenus, pageFilterIdSet) {
  if (!pageMenus.length) return true;

  const safePageMenus = pageMenus.map((menu) => normalizeToken(menu));
  const filterMenus = product?.filter_menus;

  if (filterMenus && typeof filterMenus === 'object') {
    const hasMenuMatch = Object.keys(filterMenus).some((menuKey) => safePageMenus.includes(normalizeToken(menuKey)));
    if (hasMenuMatch) return true;
  }

  const ids = getProductFilterIds(product);
  if (ids.some((id) => pageFilterIdSet.has(id))) return true;

  const fromFilters = Array.isArray(product?.filters) ? product.filters : [];
  if (fromFilters.some((filter) => safePageMenus.includes(normalizeToken(filter?.menu)))) return true;

  return false;
}

function productMatchesActiveFilter(product, activeFilter) {
  if (!activeFilter) return true;

  const ids = getProductFilterIds(product);
  if (activeFilter.id && ids.includes(String(activeFilter.id))) return true;

  const tokens = getProductFilterTokens(product);
  if (activeFilter.slug && tokens.includes(activeFilter.slug)) return true;

  return false;
}

function logFilterDiagnostics(products, allFilters, pageMenus, activeFilter) {
  const safeProducts = Array.isArray(products) ? products : [];
  const safeFilters = Array.isArray(allFilters) ? allFilters : [];
  const allFilterIds = new Set(safeFilters.map((filter) => String(filter.id)));

  const unknownIds = new Set();
  safeProducts.forEach((product) => {
    getProductFilterIds(product).forEach((id) => {
      if (!allFilterIds.has(id)) unknownIds.add(id);
    });
  });

  if (unknownIds.size) {
    console.warn('IDs de filtres presents sur des produits mais absents de /api/filters:', [...unknownIds]);
  }

  const mappingPreview = safeProducts.slice(0, 15).map((product) => ({
    product_id: String(product?.id || ''),
    product_name: product?.name || '',
    filter_ids: getProductFilterIds(product).join(', '),
    filter_tokens: getProductFilterTokens(product).join(', ')
  }));
  console.table(mappingPreview);

  console.log('Menus de page utilises pour filtrage:', pageMenus);
  console.log('Filtre actif:', activeFilter || null);
}

function getProductImages(product) {
  const primary = String(product?.image_url || '').trim();
  const hover = String(product?.hover_image_url || '').trim();
  const fromList = Array.isArray(product?.all_images) ? product.all_images : [];
  const fallback = [primary, hover, product?.img, product?.secondaryImg, product?.tertiaryImg, product?.quaternaryImg]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const merged = uniqueStrings([...fromList, ...fallback]);
  return {
    main: primary || merged[0] || '',
    hover: hover || merged[1] || primary || merged[0] || '',
    all: merged
  };
}

function getVariantOptions(product) {
  const sizes = uniqueStrings(product?.sizes || []).map((size) => String(size).trim()).filter(Boolean);
  const colors = uniqueStrings(product?.colors || []).map((color) => String(color).trim()).filter(Boolean);
  return { sizes, colors };
}

function extractFiltersForMenu(product, menuName) {
  const map = product?.filter_menus;
  if (!map || typeof map !== 'object') return [];
  const key = normalizeToken(menuName);
  const values = Array.isArray(map[key]) ? map[key] : [];
  return values.map((entry) => ({
    id: entry?.id,
    label: entry?.label || '',
    slug: slugify(entry?.slug || entry?.label || entry?.id)
  }));
}

function buildCategoryTokens(product) {
  const categories = extractFiltersForMenu(product, 'categories');
  const collaborations = extractFiltersForMenu(product, 'collaborations');
  const accessories = extractFiltersForMenu(product, 'accessoires');
  const fallback = [slugify(product?.category), slugify(product?.subcategory)].filter(Boolean);

  return uniqueStrings([
    ...categories.map((entry) => entry.slug),
    ...collaborations.map((entry) => entry.slug),
    ...accessories.map((entry) => entry.slug),
    ...fallback,
    'all'
  ]);
}

function buildNouveauteTags(product) {
  const nouveautes = extractFiltersForMenu(product, 'nouveautes').map((entry) => entry.slug);
  return uniqueStrings(nouveautes);
}

function buildCollectionToken(product) {
  const collections = extractFiltersForMenu(product, 'collections');
  if (collections.length) return collections[0].slug;
  return slugify(product?.collection || 'all') || 'all';
}

function buildCollabViewTokens(product) {
  const collabFilters = extractFiltersForMenu(product, 'collaborations').map((entry) => entry.slug);
  return uniqueStrings(['all', ...collabFilters]);
}

function buildQuickBuyMarkup(sizes) {
  const cleanSizes = (Array.isArray(sizes) ? sizes : [])
    .map((size) => String(size || '').trim())
    .filter((size) => size && normalizeToken(size) !== 'unique');

  if (!cleanSizes.length) return '';

  const buttons = cleanSizes.map((size) => `<button type="button">${size}</button>`).join('');
  return `<div class="hover-sizes" aria-hidden="true"><p class="quick-buy-title"><strong>Achat rapide</strong> (Selectionnez votre taille)</p><div class="quick-buy-grid">${buttons}</div></div>`;
}

function setCategoryNavFromFilters(filters, activeCategory) {
  const track = document.getElementById('category-nav-track');
  if (!track || !Array.isArray(filters) || !filters.length) return;

  const safeActive = slugify(activeCategory || 'all') || 'all';
  const links = [
    '<a href="#product-grid" class="cat-nav-item" data-category="all"><div class="cat-nav-circle"></div><span>Tout voir</span></a>',
    ...filters.map((filter) => {
      const slug = slugify(filter.slug || filter.label || filter.name || filter.id);
      const label = filter.label || filter.name || 'Filtre';
      return `<a href="#product-grid" class="cat-nav-item" data-category="${slug}" data-filter-id="${filter.id}"><div class="cat-nav-circle"></div><span>${label}</span></a>`;
    })
  ].join('');

  track.innerHTML = links;
  track.querySelectorAll('.cat-nav-item').forEach((item) => {
    item.classList.toggle('active', (item.getAttribute('data-category') || 'all') === safeActive);
  });
}

function buildProductCard(product) {
  const images = getProductImages(product);
  const variants = getVariantOptions(product);
  const categories = buildCategoryTokens(product);
  const nouveauteTags = buildNouveauteTags(product);
  const collectionToken = buildCollectionToken(product);
  const collabViews = buildCollabViewTokens(product);
  const colors = variants.colors.map((color) => slugify(color));
  const materials = uniqueStrings([
    ...(Array.isArray(product?.materials) ? product.materials : []),
    ...(product?.material ? [product.material] : [])
  ]).map((value) => slugify(value));

  const card = document.createElement('article');
  card.className = 'product-card collection-card';
  card.setAttribute('data-product-id', String(product.id || ''));
  card.setAttribute('data-category', categories.join(' '));
  card.setAttribute('data-color', colors.join(' '));
  card.setAttribute('data-size', variants.sizes.join(' '));
  card.setAttribute('data-collection', collectionToken || 'all');
  card.setAttribute('data-collab-view', collabViews.join(' '));

  if (materials.length) {
    card.setAttribute('data-material', materials.join(' '));
  }

  if (nouveauteTags.length) {
    card.setAttribute('data-nouveaute-tags', nouveauteTags.join(' '));
  }

  const quickBuyMarkup = buildQuickBuyMarkup(variants.sizes);
  card.innerHTML = `
    <div class="product-media">
      <button class="product-favorite" type="button" aria-label="Ajouter aux favoris">
        <svg class="heart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
      </button>
      ${images.main ? `<img src="${images.main}" alt="${product.name || 'Produit JACES'}" loading="lazy" class="product-image-primary">` : ''}
      ${images.hover ? `<img src="${images.hover}" alt="${product.name || 'Produit JACES'}" loading="lazy" class="product-image-secondary">` : ''}
      ${quickBuyMarkup}
    </div>
    <div class="product-info">
      <h3>${product.name || 'Produit JACES'}</h3>
      <p class="product-price">${product.price || ''}</p>
      <p class="product-description">${product.description || ''}</p>
    </div>
  `;

  return card;
}

async function loadPageProducts() {
  const productGrid =
    document.querySelector('main .product-grid') ||
    document.getElementById('product-grid') ||
    document.querySelector('.product-grid');
  if (!productGrid) {
    console.error('Conteneur .product-grid introuvable sur la page.');
    return;
  }
  console.log('before render');

  try {
    const mo = new MutationObserver(() => {
      try {
        console.log('product grid HTML (mutation)', productGrid.innerHTML.length);
      } catch (e) {}
    });
    mo.observe(productGrid, { childList: true, subtree: false });
  } catch (e) {
    // ignore observer errors
  }

  const pageName = getCurrentPageName();
  const apiPage = getApiPage(pageName);
  const params = new URLSearchParams(window.location.search || '');
  const rawFilterId = params.get('filterId') || params.get('filter');
  const requestedCategory = params.get('category') || '';

  const shouldLoadFromApi = shouldLoadDynamicProducts(pageName, !!rawFilterId);
  if (!shouldLoadFromApi) return;

  let products = [];

  try {
    let allFilters = [];
    const filterRes = await fetch('/api/filters');
    if (filterRes.ok) {
      const filterData = await filterRes.json();
      allFilters = Array.isArray(filterData) ? filterData : [];
    } else {
      console.warn('Impossible de charger /api/filters:', filterRes.status);
    }

    const pageMenus = getPageMenusFromApiPage(apiPage);
    const pageFilters = pageMenus.length
      ? allFilters.filter((filter) => pageMenus.includes(normalizeToken(filter.menu)))
      : allFilters;

    console.log('Filtres recuperes depuis /api/filters:', pageFilters.map((filter) => ({
      id: String(filter.id),
      slug: filterSlug(filter),
      menu: normalizeToken(filter.menu),
      label: filter.label || filter.name || 'Filtre'
    })));

    if (pageFilters.length) {
      setCategoryNavFromFilters(pageFilters, requestedCategory || 'all');
    }

    const activeFilter = resolveActiveFilter(pageFilters, rawFilterId, requestedCategory);
    const pageFilterIdSet = new Set(pageFilters.map((filter) => String(filter.id)));
    const endpoint = '/api/products';

    console.log('Chargement des produits depuis:', endpoint);

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Erreur HTTP ${response.status}`);
    }

    const data = await response.json();
    const productsFromApi = Array.isArray(data) ? data : [];
    console.log('Produits recus depuis /api/products:', productsFromApi);

    products = productsFromApi
      .filter((product) => productMatchesPageMenus(product, pageMenus, pageFilterIdSet))
      .filter((product) => productMatchesActiveFilter(product, activeFilter));

    logFilterDiagnostics(productsFromApi, allFilters, pageMenus, activeFilter);
    console.log('Produits apres filtrage:', products);

    productGrid.innerHTML = '';
    console.log('product grid HTML', productGrid.innerHTML.length);

    if (!products.length) {
      const empty = document.createElement('p');
      empty.className = 'filter-empty-note';
      if (activeFilter) {
        empty.textContent = `Aucun produit ne correspond au filtre "${activeFilter.label || activeFilter.slug || activeFilter.id}".`;
      } else if (pageMenus.length) {
        empty.textContent = 'Aucun produit lie a cette section pour le moment.';
      } else {
        empty.textContent = 'Aucun produit disponible pour le moment.';
      }
      productGrid.appendChild(empty);
      console.log('after render');
      console.log('product grid HTML', productGrid.innerHTML.length);
      window.dispatchEvent(new CustomEvent('jaces:products-loaded', {
        detail: {
          products,
          allProducts: productsFromApi,
          activeFilter,
          pageMenus,
          pageFilters
        }
      }));
      setTimeout(() => {
        console.log('after filters');
        console.log('product grid HTML', productGrid.innerHTML.length);
      }, 0);
      return;
    }

    products.forEach((product) => {
      productGrid.appendChild(buildProductCard(product));
    });
    console.log('after render');
    console.log('product grid HTML', productGrid.innerHTML.length);

    window.dispatchEvent(new CustomEvent('jaces:products-loaded', {
      detail: {
        products,
        allProducts: productsFromApi,
        activeFilter,
        pageMenus,
        pageFilters
      }
    }));
    setTimeout(() => {
      console.log('after filters');
      console.log('product grid HTML', productGrid.innerHTML.length);
    }, 0);
  } catch (error) {
    console.error('Impossible de charger les produits API:', error);
    productGrid.innerHTML = '';
    const errorNote = document.createElement('p');
    errorNote.className = 'filter-empty-note';
    errorNote.textContent = 'Erreur lors du chargement des produits.';
    productGrid.appendChild(errorNote);
  }

  attachProductCardNavigation(productGrid, products);
}

function attachProductCardNavigation(productGrid, products) {
  const productsByName = new Map(
    (Array.isArray(products) ? products : []).map((product) => [product?.name, product])
  );
  const productsById = new Map(
    (Array.isArray(products) ? products : []).map((product) => [String(product?.id || ''), product])
  );

  function navigateToProduct(card) {
    const productId = String(card.getAttribute('data-product-id') || '');
    const name = card.querySelector('h3')?.textContent?.trim() || '';
    const price = card.querySelector('.product-price')?.textContent?.trim() || '';
    const img = card.querySelector('.product-image-primary')?.getAttribute('src') || '';
    const secondaryImg = card.querySelector('.product-image-secondary')?.getAttribute('src') || '';
    const matchedProduct = productsById.get(productId) || productsByName.get(name);
    const selectedSize = document.querySelector('#collection-filter-bar input[name="taille"]:checked')?.value || '';
    const selectedColor = document.querySelector('#collection-filter-bar input[name="couleur"]:checked')?.value || '';

    const productPayload = matchedProduct || {
      id: productId || normalizeId(name),
      name,
      price,
      img,
      secondaryImg,
      selectedSize,
      selectedColor
    };

    if (window.JacesCatalog && typeof window.JacesCatalog.getProductUrl === 'function') {
      window.location.href = window.JacesCatalog.getProductUrl(productPayload, true);
      return;
    }

    const params = new URLSearchParams();
    params.set('id', productPayload.id || normalizeId(name));
    if (name) params.set('name', name);
    if (price) params.set('price', price);
    if (img) params.set('img', img);
    if (secondaryImg) params.set('secondaryImg', secondaryImg);
    window.location.href = `detail-produit.html?${params.toString()}`;
  }

  productGrid.querySelectorAll('.product-card').forEach((card) => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', (event) => {
      if (
        event.target.closest('.product-favorite') ||
        event.target.closest('.quick-buy-grid') ||
        event.target.closest('.hover-sizes')
      ) return;

      navigateToProduct(card);
    });
  });
}

function normalizeId(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.__JACES_PRODUCTS_PAGE_INIT) return;
  window.__JACES_PRODUCTS_PAGE_INIT = true;
  loadPageProducts();
});