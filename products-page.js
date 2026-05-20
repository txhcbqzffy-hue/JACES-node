console.log("NOUVELLE VERSION PRODUCTS PAGE");
import { getProducts } from './api/productsApi.js';

async function loadPageProducts() {
  const productGrid = document.querySelector('.product-grid');
  if (!productGrid) return;

  try {
    const products = await getProducts();
    console.log(products);

    // Si peu de produits API, garder les cartes statiques
    // Sinon, remplacer par les produits API
    if (products.length < 5) {
      // Ajouter les produits API au début de la grille
      const cards = products.map((product) => {
        const card = document.createElement('article');
        card.className = 'product-card collection-card';
        card.setAttribute('data-category', `${product.category || 'all'} all`);

        if (product.subcategory) {
          card.setAttribute('data-subcategory', product.subcategory);
        }

        const images = Array.isArray(product.images) ? product.images : [];
        const mainImage = images[0]?.url || product.image_url || product.img || '';
        const hoverImage = images[1]?.url || product.hover_image_url || mainImage;

        card.innerHTML = `
          <div class="product-media">
            <button class="product-favorite" type="button" aria-label="Ajouter aux favoris">
              <svg class="heart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>

            <img src="${mainImage}" alt="${product.name || 'Produit JACES'}" loading="lazy" class="product-image-primary">
            <img src="${hoverImage}" alt="${product.name || 'Produit JACES'}" loading="lazy" class="product-image-secondary">
          </div>

          <div class="product-info">
            <h3>${product.name || 'Produit JACES'}</h3>
            <p class="product-price">${product.price || ''}</p>
          </div>
        `;

        return card;
      });

      // Insérer les cartes API au début
      cards.reverse().forEach((card) => productGrid.insertBefore(card, productGrid.firstChild));
    } else {
      // Remplacer la grille si on a assez de produits
      const cards = products.map((product) => {
        const card = document.createElement('article');
        card.className = 'product-card collection-card';
        card.setAttribute('data-category', `${product.category || 'all'} all`);

        if (product.subcategory) {
          card.setAttribute('data-subcategory', product.subcategory);
        }

        const images = Array.isArray(product.images) ? product.images : [];
        const mainImage = images[0]?.url || product.image_url || product.img || '';
        const hoverImage = images[1]?.url || product.hover_image_url || mainImage;

        card.innerHTML = `
          <div class="product-media">
            <button class="product-favorite" type="button" aria-label="Ajouter aux favoris">
              <svg class="heart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>

            <img src="${mainImage}" alt="${product.name || 'Produit JACES'}" loading="lazy" class="product-image-primary">
            <img src="${hoverImage}" alt="${product.name || 'Produit JACES'}" loading="lazy" class="product-image-secondary">
          </div>

          <div class="product-info">
            <h3>${product.name || 'Produit JACES'}</h3>
            <p class="product-price">${product.price || ''}</p>
          </div>
        `;

        return card;
      });

      productGrid.innerHTML = '';
      cards.forEach((card) => productGrid.appendChild(card));
    }

    window.dispatchEvent(new CustomEvent('jaces:products-loaded', { detail: { products } }));
    attachProductCardNavigation(productGrid, products);
  } catch (error) {
    console.error('Impossible de charger les produits API:', error);
  }
}

function attachProductCardNavigation(productGrid, products) {
  function navigateToProduct(card) {
    const name = card.querySelector('h3')?.textContent?.trim() || '';
    const price = card.querySelector('.product-price')?.textContent?.trim() || '';
    const img = card.querySelector('.product-image-primary')?.getAttribute('src') || '';
    const id = products.find((product) => product.name === name)?.id || normalizeId(name);

    const params = new URLSearchParams();
    params.set('id', id);
    if (name) params.set('name', name);
    if (price) params.set('price', price);
    if (img) params.set('img', img);

    params.set('origin', document.body.classList.contains('nouveautes-page') ? 'nouveautes' : 'produits');
    params.set('originLabel', document.body.classList.contains('nouveautes-page') ? 'Nouveautes' : 'Produits');
    params.set('originUrl', window.location.pathname.split('/').pop());
    params.set('originNav', document.body.classList.contains('nouveautes-page') ? 'nouveautes' : 'produits');

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

loadPageProducts();