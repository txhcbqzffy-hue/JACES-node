(function () {
  function getFavorites() {
    if (window.JacesFavorites && typeof window.JacesFavorites.getFavorites === 'function') {
      return window.JacesFavorites.getFavorites();
    }

    try {
      return JSON.parse(window.localStorage.getItem('jaces-favorites') || '[]');
    } catch (error) {
      return [];
    }
  }

  function saveFavorites(items) {
    if (window.JacesFavorites && typeof window.JacesFavorites.saveFavorites === 'function') {
      window.JacesFavorites.saveFavorites(items);
      if (typeof window.JacesFavorites.updateHeaderCount === 'function') {
        window.JacesFavorites.updateHeaderCount();
      }
      return;
    }

    try {
      window.localStorage.setItem('jaces-favorites', JSON.stringify(items));
    } catch (error) {
      // Ignore storage failures and keep the UI usable.
    }
  }

  function buildProduct(product) {
    if (window.JacesCatalog && typeof window.JacesCatalog.buildProduct === 'function') {
      return window.JacesCatalog.buildProduct(product);
    }
    return product;
  }

  function renderFavoritesPage() {
    const grid = document.getElementById('favorites-page-grid');
    const total = document.getElementById('favorites-page-total');
    if (!grid) return;

    if (!window.JacesAuth || typeof window.JacesAuth.isAuthenticated !== 'function' || !window.JacesAuth.isAuthenticated()) {
      if (total) {
        total.textContent = '0 pièce';
      }

      grid.innerHTML = [
        '<div class="favorites-empty-state">',
        '  <p class="favorites-empty-kicker">Connexion requise</p>',
        '  <h2>Connectez-vous pour retrouver vos favoris et votre panier.</h2>',
        '  <p>Vos coups de coeur et vos selections sont maintenant associes a votre compte JACES.</p>',
        '  <button class="favorites-empty-link" id="favorites-login-button" type="button">Se connecter</button>',
        '</div>'
      ].join('');

      grid.querySelector('#favorites-login-button')?.addEventListener('click', () => {
        if (window.JacesAuth && typeof window.JacesAuth.requireAuth === 'function') {
          window.JacesAuth.requireAuth();
        }
      });
      return;
    }

    const favorites = getFavorites().map(buildProduct);
    if (total) {
      total.textContent = favorites.length + (favorites.length > 1 ? ' pièces' : ' pièce');
    }

    if (!favorites.length) {
      grid.innerHTML = [
        '<div class="favorites-empty-state">',
        '  <p class="favorites-empty-kicker">Aucune sélection</p>',
        '  <h2>Votre page favoris est vide pour le moment.</h2>',
        '  <p>Ajoutez des pièces depuis la collection ou les pages produit pour les retrouver ici.</p>',
        '  <a class="favorites-empty-link" href="collection.html">Découvrir la collection</a>',
        '</div>'
      ].join('');
      return;
    }

    grid.innerHTML = favorites.map((product) => {
      return `
        <article class="favorites-product-card" data-product-id="${product.id}">
          <a class="favorites-card-media" href="${product.url}" aria-label="Voir le détail de ${product.name}">
            ${product.img ? `<img src="${product.img}" alt="${product.name}">` : '<div class="favorites-card-placeholder"></div>'}
          </a>
          <div class="favorites-card-content">
            <a class="favorites-card-title" href="${product.url}">${product.name}</a>
            <p class="favorites-card-price">${product.price}</p>
            <p class="favorites-card-description">${product.description}</p>
            <div class="favorites-card-actions">
              <a class="favorites-card-cta" href="${product.url}">Choisir et ajouter au panier</a>
            </div>
          </div>
          <button class="favorites-remove-button" type="button" aria-label="Retirer ${product.name} des favoris">×</button>
        </article>
      `;
    }).join('');

    grid.querySelectorAll('.favorites-remove-button').forEach((button) => {
      button.addEventListener('click', () => {
        const card = button.closest('.favorites-product-card');
        const productId = card?.dataset.productId;
        const product = favorites.find((item) => item.id === productId);
        if (!productId) return;
        if (product && window.JacesFavorites && typeof window.JacesFavorites.archiveFavorite === 'function') {
          window.JacesFavorites.archiveFavorite(product, 'removed');
        }
        saveFavorites(getFavorites().filter((item) => buildProduct(item).id !== productId));
        if (window.JacesFavorites && typeof window.JacesFavorites.updateHeaderCount === 'function') {
          window.JacesFavorites.updateHeaderCount();
        }
        if (window.JacesFavorites && typeof window.JacesFavorites.renderPanel === 'function') {
          window.JacesFavorites.renderPanel();
        }
        renderFavoritesPage();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderFavoritesPage);
  } else {
    renderFavoritesPage();
  }

  window.addEventListener('jaces:favorites-sync', renderFavoritesPage);
  window.addEventListener('jaces:account-sync', renderFavoritesPage);
})();