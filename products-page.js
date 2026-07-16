import { getProducts } from './js/productsApi.js';

function slugifyToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Matches the standard size range shown (in order) on the product detail
// page, so the quick-buy chips on catalog cards aren't stuck in whatever
// order the variants happen to be stored in the database.
const NUMERIC_SIZE_ORDER = ['34', '36', '38', '40', '42', '44'];

function sortSizes(sizes) {
  return sizes.slice().sort((a, b) => {
    const indexA = NUMERIC_SIZE_ORDER.indexOf(a);
    const indexB = NUMERIC_SIZE_ORDER.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b, 'fr');
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
}

function getPageType() {
  const body = document.body;
  const path = window.location.pathname.split('/').pop() || '';

  if (body?.classList.contains('nouveautes-page')) return 'nouveautes';
  if (body?.classList.contains('accessoires-page')) return 'accessoires';
  if (body?.classList.contains('collaboration-page')) return 'collaboration';
  if (path === 'collection.html') return 'collection';
  return '';
}

// Supabase collaboration filter slugs (e.g. "jaces-x-chloe") don't match the
// short brand tokens the collaborations page filters by ("chloe").
const COLLAB_SLUG_TO_TOKEN = {
  'jaces-x-nike': 'nike',
  'jaces-x-chloe': 'chloe',
  'jaces-x-jacquemus': 'jacquemus',
  'jaces-x-dior': 'dior',
  'jaces-x-saint-laurent': 'saint-laurent'
};

// Slugified admin filter labels (menu "collections") don't match the short
// season tokens the collection page filters by ("ss26" / "aw26").
const SEASON_SLUG_TO_TOKEN = {
  'printemps-ete-2026': 'ss26',
  'automne-hiver-2026': 'aw26'
};

function getProductCollectionSeason(product) {
  const filterTokens = Array.isArray(product?.filter_tokens) ? product.filter_tokens : [];
  const seasonToken = filterTokens.map((token) => SEASON_SLUG_TO_TOKEN[token]).find(Boolean);
  return seasonToken || 'all';
}

function getProductCategoryTokens(product) {
  const tokens = ['all'];

  // Only the real category/accessoire/collaboration tags set in the admin
  // panel (Supabase product_filters) count \u2014 guessing from the product name
  // used to cause false positives (e.g. any name containing "top" or "sac").
  const filterTokens = Array.isArray(product?.filter_tokens) ? product.filter_tokens : [];
  filterTokens.forEach((token) => {
    tokens.unshift(COLLAB_SLUG_TO_TOKEN[token] || token);
  });

  return Array.from(new Set(tokens)).join(' ');
}

function normalizeMediaUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw, window.location.href);
    const host = parsed.hostname.toLowerCase();
    const isDropbox = host === 'dropbox.com' || host === 'www.dropbox.com' || host === 'dl.dropbox.com' || host === 'dl.dropboxusercontent.com';

    if (isDropbox) {
      parsed.hostname = 'dl.dropboxusercontent.com';
      parsed.searchParams.delete('dl');
      parsed.searchParams.set('raw', '1');
    }

    return parsed.toString();
  } catch (error) {
    return raw;
  }
}

function formatPrice(price) {
  if (price === null || price === undefined || price === '') return '';
  const raw = String(price).trim();
  if (raw.includes('€')) return raw;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return raw;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(numeric);
}

function buildProductCard(product, pageType) {
  const card = document.createElement('article');
  const images = Array.isArray(product.images) ? product.images : [];
  const mainImage = normalizeMediaUrl(images[0]?.url || product.image_url || product.img || '');
  const hoverImage = normalizeMediaUrl(images[1]?.url || product.hover_image_url || product.secondaryImg || mainImage);
  const colors = Array.isArray(product.colors) ? product.colors.map((color) => String(color || '').trim()).filter(Boolean) : [];
  const sizes = sortSizes(Array.isArray(product.sizes) ? product.sizes.map((size) => String(size || '').trim()).filter(Boolean) : []);
  // Same rule as the product detail page: if the real sizes are all part of
  // the standard 34-44 range, show that whole range with the unavailable
  // ones greyed out, instead of only listing what happens to be in stock.
  const isNumericSizeSubset = sizes.length > 0 && sizes.every((size) => NUMERIC_SIZE_ORDER.includes(size));
  const displaySizes = isNumericSizeSubset ? NUMERIC_SIZE_ORDER : sizes;
  const quickBuyMarkup = displaySizes.length
    ? `<p class="quick-buy-title"><strong>Achat rapide</strong> (Selectionnez votre taille)</p><div class="quick-buy-grid">${displaySizes.map((size) => {
      const isAvailable = sizes.includes(size);
      // Not a native disabled button: clicking an unavailable size opens
      // the "notify me when back in stock" flow instead of doing nothing.
      return `<button type="button" class="${isAvailable ? '' : 'is-disabled'}">${size}</button>`;
    }).join('')}</div>`
    : '';

  card.className = 'product-card collection-card product-card-linkable';
  card.dataset.productId = String(product.id || '');
  card.dataset.category = getProductCategoryTokens(product);
  card.dataset.collection = getProductCollectionSeason(product);
  card.dataset.collabView = product.collaborationView ? `all ${String(product.collaborationView).toLowerCase()}` : 'all';
  card.dataset.nouveauteTags = Array.isArray(product.nouveauteTags) ? product.nouveauteTags.join(' ') : '';
  card.dataset.material = (Array.isArray(product.material) ? product.material : [product.material]).map(slugifyToken).filter(Boolean).join(' ');
  card.dataset.color = colors.map(slugifyToken).filter(Boolean).join(' ');
  card.dataset.size = sizes.map(slugifyToken).filter(Boolean).join(' ');
  card.dataset.pageType = pageType || String(product.type || '').toLowerCase();

  card.innerHTML = `
    <div class="product-media">
      <button class="product-favorite" type="button" aria-label="Ajouter aux favoris">
        <svg class="heart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
      </button>
      ${mainImage ? `<img src="${mainImage}" alt="${product.name || 'Produit JACES'}" loading="lazy" class="product-image-primary">` : '<div class="favorites-card-placeholder"></div>'}
      ${hoverImage ? `<img src="${hoverImage}" alt="${product.name || 'Produit JACES'}" loading="lazy" class="product-image-secondary">` : ''}
      ${quickBuyMarkup ? `<div class="hover-sizes" aria-hidden="true">${quickBuyMarkup}</div>` : ''}
    </div>
    <div class="product-info">
      <h3>${product.name || 'Produit JACES'}</h3>
      <p class="product-price">${formatPrice(product.price)}</p>
    </div>
  `;

  return card;
}

function buildEmptyState(message) {
  return `
    <div class="product-grid-empty">
      <p class="favorites-empty-kicker">${message}</p>
      <h1>Aucun produit à afficher</h1>
      <p>Essayez une autre sélection ou revenez plus tard.</p>
    </div>
  `;
}

function getVisibleProducts(products, pageType) {
  return Array.isArray(products) ? products : [];
}

async function loadPageProducts() {
  const productGrid = document.querySelector('.product-grid');
  if (!productGrid) return;

  try {
    const pageType = getPageType();
    const products = await getProducts(pageType);
    window.__JACES_PRODUCTS_CACHE = Array.isArray(products) ? products : [];
    const visibleProducts = getVisibleProducts(products, pageType);

    productGrid.hidden = false;
    productGrid.innerHTML = '';

    if (!visibleProducts.length) {
      productGrid.innerHTML = buildEmptyState('Aucun produit disponible pour cette sélection');
      window.dispatchEvent(new CustomEvent('jaces:products-loaded', { detail: { products: [], pageType } }));
      return;
    }

    visibleProducts.forEach((product) => {
      productGrid.appendChild(buildProductCard(product, pageType));
    });

    const countNode = document.querySelector('.filter-count');
    if (countNode) {
      countNode.textContent = `${visibleProducts.length} produits`;
    }

    window.dispatchEvent(new CustomEvent('jaces:products-loaded', { detail: { products: visibleProducts, pageType } }));
  } catch (error) {
    console.error('Impossible de charger les produits API:', error);
    productGrid.hidden = false;
    productGrid.innerHTML = buildEmptyState('Impossible de charger le catalogue Supabase');
  }
}

loadPageProducts();