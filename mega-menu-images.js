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

document.querySelectorAll('.submenu-image[data-menu-image]').forEach((slot) => {
  const pageType = slot.dataset.menuImage;
  const imgs = Array.from(slot.querySelectorAll('img'));
  if (!pageType || !imgs.length) return;

  getProducts(pageType)
    .then((products) => {
      const list = Array.isArray(products) ? products : [];
      const withImages = list
        .map((product) => ({ product, url: getFirstProductImage(product) }))
        .filter((entry) => entry.url);

      imgs.forEach((img, index) => {
        const entry = withImages[index];
        if (!entry) {
          img.remove();
          return;
        }
        img.src = entry.url;
        img.alt = entry.product.name || '';
      });
    })
    .catch(() => {
      // Leave the neutral placeholder backgrounds - no broken-image icons.
    });
});
