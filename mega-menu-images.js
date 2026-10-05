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
      });
    });
});
