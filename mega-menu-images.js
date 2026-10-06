import { getProducts } from './js/productsApi.js';

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

function getFirstProductImage(product) {
  const images = Array.isArray(product?.images) ? product.images : [];
  return normalizeMediaUrl(images[0]?.url || product?.image_url || product?.img || '');
}

function withImages(products) {
  return (Array.isArray(products) ? products : [])
    .map((product) => ({ product, url: getFirstProductImage(product) }))
    .filter((entry) => entry.url);
}

// Not every menu's category has tagged products yet (e.g. a brand-new
// Collaborations/Accessoires filter with nothing assigned in admin) - rather
// than leave the slot empty, fall back to the full catalog so the menu still
// shows something. Fetched once and shared across every slot.
let fullCatalogPromise = null;
function getFullCatalogWithImages() {
  if (!fullCatalogPromise) {
    fullCatalogPromise = getProducts('').then(withImages).catch(() => []);
  }
  return fullCatalogPromise;
}

document.querySelectorAll('.submenu-image[data-menu-image]').forEach((slot) => {
  const pageType = slot.dataset.menuImage;
  const imgs = Array.from(slot.querySelectorAll('img'));
  if (!pageType || !imgs.length) return;

  getProducts(pageType)
    .then(withImages)
    .catch(() => [])
    .then(async (categoryEntries) => {
      let entries = categoryEntries;
      if (entries.length < imgs.length) {
        const fallback = await getFullCatalogWithImages();
        const usedUrls = new Set(entries.map((entry) => entry.url));
        const extra = fallback.filter((entry) => !usedUrls.has(entry.url));
        entries = entries.concat(extra);
      }

      imgs.forEach((img, index) => {
        const entry = entries[index];
        if (!entry) {
          img.remove();
          return;
        }
        img.src = entry.url;
        img.alt = entry.product.name || '';

        // Wrap the bare <img> in a clickable preview card with the
        // product's name/price underneath, instead of a plain decorative
        // thumbnail - a shoppable mega-menu reads as a lot more "real
        // site" than a static image grid.
        const link = document.createElement('a');
        link.className = 'submenu-image-item';
        if (entry.product.id) link.href = `detail-produit.html?id=${entry.product.id}`;
        img.replaceWith(link);
        link.appendChild(img);

        const caption = document.createElement('span');
        caption.className = 'submenu-image-caption';
        const name = document.createElement('span');
        name.className = 'submenu-image-name';
        name.textContent = entry.product.name || '';
        caption.appendChild(name);
        const price = Number(entry.product.price);
        if (Number.isFinite(price)) {
          const priceEl = document.createElement('span');
          priceEl.className = 'submenu-image-price';
          priceEl.textContent = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(price);
          caption.appendChild(priceEl);
        }
        link.appendChild(caption);
      });
    });
});
