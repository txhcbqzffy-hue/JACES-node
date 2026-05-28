async function loadPageProducts() {
  const productGrid = document.querySelector('.product-grid');
  if (!productGrid) return;

  let products = [];

  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error(`Erreur ${response.status}`);
    products = await response.json();

    productGrid.innerHTML = '';

    if (products.length === 0) {
      productGrid.innerHTML = '<p class="empty-message">Aucun produit disponible pour le moment.</p>';
      return;
    }

    const cards = products.map((product) => {
      const card = document.createElement('article');
      card.className = 'product-card collection-card';
      card.setAttribute('data-category', `${product.category || 'all'} all`);

      if (product.subcategory) {
        card.setAttribute('data-subcategory', product.subcategory);
      }

      const mainImage = product.image_url || '';
      const hoverImage = product.hover_image_url || mainImage;

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

    cards.forEach((card) => productGrid.appendChild(card));

    window.dispatchEvent(new CustomEvent('jaces:products-loaded', { detail: { products } }));
  } catch (error) {
    console.error('Impossible de charger les produits API:', error);
    productGrid.innerHTML = '<p class="error-message">Erreur lors du chargement des produits.</p>';
  }

  attachProductCardNavigation(productGrid, products);
}

function attachProductCardNavigation(productGrid, products) {
  const productsByName = new Map(
    (Array.isArray(products) ? products : []).map((product) => [product?.name, product])
  );

  function normalizeId(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[-6f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function navigateToProduct(card) {
    const name = card.querySelector('h3')?.textContent?.trim() || '';
    const price = card.querySelector('.product-price')?.textContent?.trim() || '';
    const img = card.querySelector('.product-image-primary')?.getAttribute('src') || '';
    const secondaryImg = card.querySelector('.product-image-secondary')?.getAttribute('src') || '';
    const matchedProduct = productsByName.get(name);
    const productPayload = matchedProduct || {
      id: normalizeId(name),
      name,
      price,
      img,
      secondaryImg
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

loadPageProducts();