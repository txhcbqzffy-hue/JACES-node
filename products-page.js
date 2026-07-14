import { getProducts } from './js/productsApi.js';

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
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(numeric);
}

function buildProductCard(product, pageType) {
  const card = document.createElement('article');
  const images = Array.isArray(product.images) ? product.images : [];
  const mainImage = normalizeMediaUrl(images[0]?.url || product.image_url || product.img || '');
  const hoverImage = normalizeMediaUrl(images[1]?.url || product.hover_image_url || product.secondaryImg || mainImage);
  const colors = Array.isArray(product.colors) ? product.colors.map((color) => String(color || '').trim()).filter(Boolean) : [];
  const sizes = Array.isArray(product.sizes) ? product.sizes.map((size) => String(size || '').trim()).filter(Boolean) : [];
  const quickBuyMarkup = sizes.length
    ? `<p class="quick-buy-title"><strong>Achat rapide</strong> (Selectionnez votre taille)</p><div class="quick-buy-grid">${sizes.map((size) => `<button type="button">${size}</button>`).join('')}</div>`
    : '';

  card.className = 'product-card collection-card product-card-linkable';
  card.dataset.productId = String(product.id || '');
  card.dataset.category = getProductCategoryTokens(product);
  card.dataset.collection = String(product.collectionSeason || 'all').toLowerCase() || 'all';
  card.dataset.collabView = product.collaborationView ? `all ${String(product.collaborationView).toLowerCase()}` : 'all';
  card.dataset.nouveauteTags = Array.isArray(product.nouveauteTags) ? product.nouveauteTags.join(' ') : '';
  card.dataset.material = String(product.material || '').toLowerCase();
  card.dataset.color = colors.join(' ').toLowerCase();
  card.dataset.size = sizes.join(' ');
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