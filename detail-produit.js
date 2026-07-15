(function () {
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function formatPrice(price) {
    if (price === null || price === undefined || price === '') return '';
    const raw = String(price).trim();
    if (raw.includes('€')) return raw;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return raw;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(numeric);
  }

  function getProductId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id') || '';
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

  async function fetchProductsFromApi() {
    const response = await fetch('/api/products', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Impossible de charger les produits Supabase');
    }

    return await response.json();
  }

  async function fetchProductFromApi(id) {
    const productId = String(id || '').trim();
    if (!productId) return null;

    const response = await fetch(`/api/products?id=${encodeURIComponent(productId)}`, { cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error('Impossible de charger le produit Supabase');
    }

    const data = await response.json();
    return Array.isArray(data) ? (data[0] || null) : data;
  }

  function normalizeApiProduct(product) {
    const images = Array.isArray(product?.images) ? product.images : [];
    return Object.assign({}, product, {
      img: product?.img || product?.image_url || images[0]?.url || '',
      secondaryImg: product?.secondaryImg || product?.hover_image_url || images[1]?.url || '',
      tertiaryImg: product?.tertiaryImg || images[2]?.url || '',
      quaternaryImg: product?.quaternaryImg || images[3]?.url || ''
    });
  }

  function getProductFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || '';
    const name = params.get('name') || '';
    const img = params.get('img') || '';
    if (!id && !name && !img) return null;

    return {
      id,
      name,
      price: params.get('price') || '',
      subtitle: params.get('subtitle') || '',
      img: normalizeMediaUrl(params.get('img') || ''),
      secondaryImg: normalizeMediaUrl(params.get('secondaryImg') || ''),
      tertiaryImg: normalizeMediaUrl(params.get('tertiaryImg') || ''),
      quaternaryImg: normalizeMediaUrl(params.get('quaternaryImg') || ''),
      imageCaption: params.get('imageCaption') || '',
      ratingValue: params.get('ratingValue') || '',
      ratingCount: params.get('ratingCount') || '',
      reviewQuote: params.get('reviewQuote') || '',
      sizes: (params.get('sizes') || '').split(',').map((value) => value.trim()).filter(Boolean),
      colors: (params.get('colors') || '').split(',').map((value) => value.trim()).filter(Boolean),
      description: params.get('description') || '',
      selectedSize: params.get('selectedSize') || '',
      selectedColor: params.get('selectedColor') || ''
    };
  }

  function normalizeProductKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function getOriginContext() {
    const params = new URLSearchParams(window.location.search);
    const originUrl = params.get('originUrl') || 'collection.html';
    const originLabel = params.get('originLabel') || 'Collection';
    const originKey = params.get('origin') || params.get('originNav') || 'collection';

    return {
      key: originKey,
      label: originLabel,
      url: originUrl,
      navKey: params.get('originNav') || originKey
    };
  }

  function applyOriginContext(origin, productName) {
    const breadcrumbCurrent = document.getElementById('product-detail-breadcrumb-current');
    const breadcrumbOrigin = document.getElementById('product-detail-breadcrumb-origin');

    if (breadcrumbCurrent) breadcrumbCurrent.textContent = productName || 'Produit';
    if (breadcrumbOrigin) {
      breadcrumbOrigin.textContent = origin?.label || 'Collection';
      breadcrumbOrigin.setAttribute('href', origin?.url || 'collection.html');
    }

    document.querySelectorAll('.nav a[data-product-origin-nav]').forEach((link) => {
      const isActive = link.dataset.productOriginNav === (origin?.navKey || origin?.key || 'collection');
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    if (breadcrumbOrigin) {
      breadcrumbOrigin.addEventListener('click', (event) => {
        if (event.defaultPrevented) return;
        if (event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const href = breadcrumbOrigin.getAttribute('href');
        if (!href) return;

        if (window.JacesScrollRestoration && typeof window.JacesScrollRestoration.markPendingRestore === 'function') {
          window.JacesScrollRestoration.markPendingRestore(href);
        }
      });
    }
  }

  function ensureHeaderSubmenus() {
    const nav = document.querySelector('.nav');
    if (!nav || nav.querySelector('.submenu')) return;

    const submenuByHref = {
      'nouveautes.html': [
        '<div>',
        '  <p class="submenu-title">NOUVEAUTES</p>',
        '  <a href="nouveautes.html">Drop ete</a>',
        '  <a href="nouveautes.html">Edition limitee</a>',
        '  <a href="nouveautes.html">Pieces signature</a>',
        '  <a href="nouveautes.html" class="underline-link">Tout voir</a>',
        '</div>',
        '<div class="submenu-categories">',
        '  <p class="submenu-title">FEMME</p>',
        '  <a href="nouveautes.html">Robes</a>',
        '  <a href="nouveautes.html">Tops</a>',
        '  <a href="nouveautes.html">Jupes</a>',
        '  <a href="nouveautes.html">Pantalons</a>',
        '  <a href="nouveautes.html">Vestes</a>',
        '  <a href="nouveautes.html">Accessoires</a>',
        '</div>'
      ].join(''),
      'collection.html': [
        '<div>',
        '  <a href="collection.html?collection=ss26">Printemps-Ete 2026</a>',
        '  <a href="collection.html?collection=aw26">Automne-Hiver 2026</a>',
        '  <a href="collection.html?collection=all" class="underline-link">Toutes les collections</a>',
        '</div>',
        '<div class="submenu-categories">',
        '  <a href="collection.html">Robes</a>',
        '  <a href="collection.html">Tops</a>',
        '  <a href="collection.html">Jupes</a>',
        '  <a href="collection.html">Pantalons</a>',
        '  <a href="collection.html">Vestes</a>',
        '  <a href="collection.html">Accessoires</a>',
        '</div>'
      ].join(''),
      'collaborations.html': [
        '<div>',
        '  <a href="collaborations.html">Creations exclusives</a>',
        '  <a href="collaborations.html">Pop-up stores</a>',
        '  <a href="collaborations.html">Evenements</a>',
        '  <a href="collaborations.html" class="underline-link">Toutes les collaborations</a>',
        '</div>',
        '<div class="submenu-categories">',
        '  <a href="collaborations.html">JACES x Nike</a>',
        '  <a href="collaborations.html">JACES x Chloé</a>',
        '  <a href="collaborations.html">JACES x Jacquemus</a>',
        '  <a href="collaborations.html">JACES x Dior</a>',
        '  <a href="collaborations.html">JACES x Saint Laurent</a>',
        '</div>'
      ].join(''),
      'accessoires.html': [
        '<div>',
        '  <p class="submenu-title">ACCESSOIRES</p>',
        '  <a href="accessoires.html">Sacs</a>',
        '  <a href="accessoires.html">Bijoux</a>',
        '  <a href="accessoires.html">Ceintures</a>',
        '  <a href="accessoires.html">Foulards</a>',
        '</div>'
      ].join(''),
      'defile.html': [
        '<div>',
        '  <p class="submenu-title">DEFILE</p>',
        '  <a href="#">Dernier show</a>',
        '  <a href="#">Collection pret-a-porter</a>',
        '  <a href="#" class="underline-link">Voir le defile</a>',
        '</div>',
        '<div>',
        '  <p class="submenu-title">Coulisses</p>',
        '  <a href="#">Design studio</a>',
        '  <a href="#">Inspiration</a>',
        '</div>'
      ].join(''),
      'univers.html': [
        '<div>',
        '  <p class="submenu-title">MAISON</p>',
        '  <a href="#">Notre histoire</a>',
        '  <a href="#">Savoir-faire</a>',
        '  <a href="#" class="underline-link">Services VIP</a>',
        '</div>',
        '<div>',
        '  <p class="submenu-title">DECOUVERTE</p>',
        '  <a href="#">Ateliers</a>',
        '  <a href="#">Boutiques</a>',
        '</div>'
      ].join('')
    };

    nav.querySelectorAll('.nav-item').forEach((item) => {
      const link = item.querySelector(':scope > a');
      if (!link) return;
      const href = String(link.getAttribute('href') || '').split('?')[0];
      const content = submenuByHref[href];
      if (!content) return;

      const submenu = document.createElement('div');
      submenu.className = 'submenu';
      submenu.innerHTML = content;
      item.appendChild(submenu);
    });
  }

  let releaseDetailPanelScrollBinding = null;

  function bindDetailPanelScroll(shell) {
    if (typeof releaseDetailPanelScrollBinding === 'function') {
      releaseDetailPanelScrollBinding();
      releaseDetailPanelScrollBinding = null;
    }

    const header = document.querySelector('.header');
    const detailMain = document.querySelector('.product-detail-page main');

    function updateStickyTop() {
      const top = header ? header.offsetHeight : 80;
      shell.style.setProperty('--product-detail-sticky-top', top + 'px');

      // Keep breadcrumb/content aligned right under the fixed header across breakpoints.
      if (detailMain && header) {
        const headerBottom = Math.ceil(header.getBoundingClientRect().bottom);
        detailMain.style.paddingTop = (headerBottom + 8) + 'px';
      }
    }

    updateStickyTop();
    window.addEventListener('resize', updateStickyTop);

    releaseDetailPanelScrollBinding = () => {
      window.removeEventListener('resize', updateStickyTop);
      shell.style.removeProperty('--product-detail-sticky-top');
    };
  }

  function hasUniqueSize(product) {
    return Array.isArray(product?.sizes)
      && product.sizes.length === 1
      && String(product.sizes[0]).toLowerCase() === 'unique';
  }

  function hasNoSize(product) {
    return !Array.isArray(product?.sizes) || product.sizes.length === 0;
  }

  function buildGallery(product) {
    const customCaption = String(product?.imageCaption || product?.caption || '').trim();
    const primaryImage = normalizeMediaUrl(product.img || '');
    const secondaryImage = normalizeMediaUrl(product.secondaryImg || product.img || '');
    const tertiaryImage = normalizeMediaUrl(product.tertiaryImg || product.galleryImage3 || primaryImage);
    const quaternaryImage = normalizeMediaUrl(product.quaternaryImg || product.galleryImage4 || secondaryImage);
    return {
      primaryImage,
      secondaryImage,
      tertiaryImage,
      quaternaryImage,
      caption: customCaption
    };
  }

  function getProductDetailSubtitle(product) {
    const customSubtitle = String(product?.subtitle || '').trim();
    if (customSubtitle) return customSubtitle;

    const name = String(product?.name || '').toLowerCase();
    if (name.includes('top')) {
      return '100% Laine Merinos - Certifiee RWS';
    }
    if (name.includes('pantalon') || name.includes('short') || name.includes('jean')) {
      return 'Laine melangee - Doublure signee JACES';
    }
    if (name.includes('veste')) {
      return 'Laine melangee - Doublure signee JACES';
    }
    if (name.includes('robe') || name.includes('jupe')) {
      return 'Crepe signature - Finition fluide';
    }
    if (name.includes('top')) {
      return 'Coton premium - Coupe structuree';
    }
    if (name.includes('boucle') || name.includes('creole') || name.includes('collier') || name.includes('bijou') || name.includes('sac') || name.includes('ceinture') || name.includes('mule') || name.includes('sandale') || name.includes('chaussure')) {
      return 'Laiton dore - Finition polie';
    }
    return 'Matiere premium - Finition signature JACES';
  }

  function clampSingleLineText(text, maxLength) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    const limit = Number(maxLength) || 70;
    if (!normalized || normalized.length <= limit) return normalized;
    return normalized.slice(0, limit).trim();
  }

  function formatRatingFr(rating) {
    const value = Number(rating || 0);
    if (!Number.isFinite(value)) return '0';
    if (Math.abs(value - Math.round(value)) < 0.001) {
      return String(Math.round(value));
    }
    return value.toFixed(1).replace('.', ',');
  }

  function buildReviewPreview(text, maxLength) {
    const value = String(text || '').trim();
    const limit = Number(maxLength) || 64;
    if (!value || value.length <= limit) return value;
    const clipped = value.slice(0, limit).trim().replace(/[\s,;:.!?-]+$/g, '');
    return clipped + '..';
  }

  function buildStarMarkup(rating) {
    const safeRating = Math.max(0, Math.min(5, Number(rating || 0)));
    const fullStars = Math.floor(safeRating);
    const hasHalf = safeRating - fullStars >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
    return [
      '<p class="product-detail-reassurance-stars" aria-label="Note moyenne ' + formatRatingFr(safeRating) + ' sur 5">',
      '<span class="star">&#9733;</span>'.repeat(fullStars),
      hasHalf ? '<span class="star star-half">&#9733;</span>' : '',
      '<span class="star star-empty">&#9733;</span>'.repeat(emptyStars),
      '</p>'
    ].join('');
  }

  function getProductReviewData(product) {
    const ratingRaw = String(product?.ratingValue ?? '').trim();
    const countRaw = String(product?.ratingCount ?? '').trim();
    const customRating = ratingRaw === '' ? NaN : Number(ratingRaw);
    const customCount = countRaw === '' ? NaN : Number(countRaw);
    const customQuote = String(product?.reviewQuote || '').trim();
    const customReviews = Array.isArray(product?.reviews)
      ? product.reviews.map((review, index) => ({
        author: String(review?.author || `Cliente ${index + 1}`),
        rating: Math.max(1, Math.min(5, Number(review?.rating || 5))),
        text: String(review?.text || '').trim()
      })).filter((review) => !!review.text)
      : [];

    if (customReviews.length) {
      const starsTotal = customReviews.reduce((sum, review) => sum + review.rating, 0);
      const average = starsTotal / customReviews.length;
      const resolvedRating = Number.isFinite(customRating) ? customRating : average;
      const resolvedCount = Number.isFinite(customCount) ? customCount : customReviews.length;
      return {
        rating: Math.max(0, Math.min(5, Math.round(resolvedRating * 10) / 10)),
        verifiedCount: Math.max(1, Math.round(resolvedCount)),
        quote: customQuote || customReviews[0].text,
        reviews: customReviews
      };
    }

    const reviewSeed = normalizeProductKey(product?.id || product?.name || 'jaces')
      .split('')
      .reduce((sum, ch) => sum + ch.charCodeAt(0), 0);

    const fitMentions = ['la coupe tombe exactement comme attendu', 'la taille conseillee est juste', 'la coupe est flatteuse sans comprimer', 'la tenue est bien equilibree sur la silhouette'];
    const fabricMentions = ['matiere douce et premium', 'tissu net avec beau tombe', 'matiere confortable au porter', 'finition haut de gamme visible'];
    const styleMentions = ['piece facile a styliser', 'rendu encore plus beau en vrai', 'allure chic des la premiere tenue', 'tombe impeccable toute la journee'];

    const pick = (list, offset) => list[(reviewSeed + offset) % list.length];
    const reviews = [
      `${pick(fitMentions, 0)}, ${pick(fabricMentions, 1)}.`,
      `${pick(styleMentions, 2)}, je recommande cette ${String(product?.name || 'piece').toLowerCase()}.`,
      `${pick(fabricMentions, 3)}, couture propre et sensation premium.`,
      `${pick(fitMentions, 1)}, je la reprendrai dans une autre couleur.`
    ];

    const rating = Number.isFinite(customRating) ? customRating : (4.6 + ((reviewSeed % 4) * 0.1));
    const verifiedCount = Number.isFinite(customCount) ? customCount : (92 + (reviewSeed % 89));
    const itemRatings = [5, 5, 4 + ((reviewSeed + 1) % 2), 4 + ((reviewSeed + 2) % 2)];

    return {
      rating: Math.min(5, Math.round(rating * 10) / 10),
      verifiedCount,
      quote: customQuote || reviews[0],
      reviews: reviews.map((text, index) => ({
        author: `Cliente ${index + 1}`,
        rating: itemRatings[index],
        text
      }))
    };
  }

  function getReviewBreakdown(reviewData) {
    const total = Math.max(1, Math.round(Number(reviewData?.verifiedCount || 0)));
    const targetRating = Math.max(0, Math.min(5, Number(reviewData?.rating || 4.7)));
    const seed = Math.round((targetRating % 1) * 100);

    // Keep low-star counts compact, then solve 5★/4★ to match the target average.
    const one = Math.max(0, Math.round(total * (0.005 + ((seed + 1) % 3) * 0.003)));
    const two = Math.max(0, Math.round(total * (0.008 + ((seed + 2) % 3) * 0.003)));
    const three = Math.max(0, Math.round(total * (0.02 + ((seed + 3) % 4) * 0.004)));

    const remaining = Math.max(0, total - one - two - three);
    const lowStarsWeighted = (one * 1) + (two * 2) + (three * 3);
    const targetWeighted = Math.round(targetRating * total);
    let five = Math.round(targetWeighted - lowStarsWeighted - (4 * remaining));
    five = clamp(five, 0, remaining);
    let four = Math.max(0, remaining - five);

    // Nudge distribution so weighted average is as close as possible to target.
    let currentWeighted = (five * 5) + (four * 4) + lowStarsWeighted;
    let diff = targetWeighted - currentWeighted;
    while (diff > 0 && four > 0) {
      five += 1;
      four -= 1;
      diff -= 1;
    }
    while (diff < 0 && five > 0) {
      five -= 1;
      four += 1;
      diff += 1;
    }

    return [
      { stars: 5, count: five },
      { stars: 4, count: four },
      { stars: 3, count: three },
      { stars: 2, count: two },
      { stars: 1, count: one }
    ];
  }

  function getReviewStatsFromBreakdown(reviewData, breakdown) {
    const rows = Array.isArray(breakdown) ? breakdown : [];
    const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row?.count || 0)), 0);
    if (!total) {
      return {
        rating: Number(reviewData?.rating || 0),
        verifiedCount: Number(reviewData?.verifiedCount || 0)
      };
    }

    const weighted = rows.reduce((sum, row) => {
      const stars = Math.max(1, Math.min(5, Number(row?.stars || 0)));
      const count = Math.max(0, Number(row?.count || 0));
      return sum + (stars * count);
    }, 0);

    return {
      rating: Math.round((weighted / total) * 10) / 10,
      verifiedCount: total
    };
  }

  function openDirectPhotoLightbox(photos, startIndex) {
    const safePhotos = Array.isArray(photos) ? photos.filter(Boolean) : [];
    if (!safePhotos.length) return;

    document.querySelectorAll('.product-reviews-overlay').forEach((node) => node.remove());

    const overlay = document.createElement('div');
    overlay.className = 'product-reviews-overlay product-reviews-overlay--lightbox-only';
    overlay.innerHTML = [
      '<div class="product-reviews-lightbox">',
      '  <button class="product-reviews-lightbox-close" type="button" aria-label="Fermer">×</button>',
      '  <button class="product-reviews-lightbox-nav product-reviews-lightbox-nav-prev" type="button" aria-label="Photo pr&eacute;c&eacute;dente">←</button>',
      '  <img class="product-reviews-lightbox-image" alt="Photo cliente agrandie">',
      '  <button class="product-reviews-lightbox-nav product-reviews-lightbox-nav-next" type="button" aria-label="Photo suivante">→</button>',
      '</div>'
    ].join('');

    let activeIndex = Math.max(0, Math.min(safePhotos.length - 1, Number(startIndex) || 0));
    const image = overlay.querySelector('.product-reviews-lightbox-image');

    const updateImage = () => {
      image.setAttribute('src', safePhotos[activeIndex]);
      image.setAttribute('alt', `Photo cliente ${activeIndex + 1}`);
    };

    const go = (step) => {
      activeIndex = (activeIndex + step + safePhotos.length) % safePhotos.length;
      updateImage();
    };

    const close = () => {
      overlay.remove();
      document.body.classList.remove('product-reviews-open');
      window.removeEventListener('keydown', onEsc);
    };

    const onEsc = (event) => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('.product-reviews-lightbox-close')) {
        close();
        return;
      }
      if (event.target.closest('.product-reviews-lightbox-nav-prev')) {
        go(-1);
        return;
      }
      if (event.target.closest('.product-reviews-lightbox-nav-next')) {
        go(1);
      }
    });

    updateImage();
    document.body.appendChild(overlay);
    document.body.classList.add('product-reviews-open');
    window.addEventListener('keydown', onEsc);
  }

  function openReviewsPanel(product, reviewData, photos, focusSection, initialPhotoIndex) {
    document.querySelectorAll('.product-reviews-overlay').forEach((node) => node.remove());

    const overlay = document.createElement('div');
    overlay.className = 'product-reviews-overlay';
    const initialTab = focusSection === 'photos' ? 'photos' : 'reviews';

    const reviewsHtml = reviewData.reviews.map((entry) => {
      const stars = '&#9733;'.repeat(entry.rating) + '<span class="star-empty">&#9733;</span>'.repeat(5 - entry.rating);
      return [
        '<article class="product-reviews-item">',
        `  <p class="product-reviews-item-stars" aria-label="${entry.rating} sur 5">${stars}</p>`,
        `  <p class="product-reviews-item-text">${entry.text}</p>`,
        `  <p class="product-reviews-item-author">${entry.author}</p>`,
        '</article>'
      ].join('');
    }).join('');

    const safePhotos = Array.isArray(photos) ? photos.filter(Boolean) : [];

    const photosHtml = safePhotos.map((src, index) => {
      return `<img src="${src}" alt="Photo cliente ${index + 1}" loading="lazy">`;
    }).join('');

    const photosContent = photosHtml || '<p class="product-reviews-photos-empty">Aucune photo cliente disponible pour le moment.</p>';

    overlay.innerHTML = [
      '<div class="product-reviews-modal" role="dialog" aria-modal="true" aria-label="Avis clients">',
      '  <div class="product-reviews-head">',
      `    <h3>Avis sur ${product.name}</h3>`,
      '    <button class="product-reviews-close" type="button" aria-label="Fermer">×</button>',
      '  </div>',
      '  <div class="product-reviews-summary">',
      `    ${buildStarMarkup(reviewData.rating)}`,
      `    <p class="product-reviews-score">${formatRatingFr(reviewData.rating)}/5</p>`,
      `    <p class="product-reviews-count">${reviewData.verifiedCount} avis v&eacute;rifi&eacute;s</p>`,
      '  </div>',
      '  <div class="product-reviews-tabs" role="tablist" aria-label="Contenu avis">',
      `    <button class="product-reviews-tab${initialTab === 'reviews' ? ' is-active' : ''}" type="button" role="tab" aria-selected="${initialTab === 'reviews' ? 'true' : 'false'}" data-tab="reviews">Avis</button>`,
      `    <button class="product-reviews-tab${initialTab === 'photos' ? ' is-active' : ''}" type="button" role="tab" aria-selected="${initialTab === 'photos' ? 'true' : 'false'}" data-tab="photos">Photos</button>`,
      '  </div>',
      '  <div class="product-reviews-content">',
      `    <section class="product-reviews-section" data-tab-content="reviews"${initialTab === 'reviews' ? '' : ' hidden'}><h4>Avis des clientes</h4><div class="product-reviews-list">${reviewsHtml}</div></section>`,
      `    <section class="product-reviews-section" data-tab-content="photos"${initialTab === 'photos' ? '' : ' hidden'}><h4>Photos clientes</h4><div class="product-reviews-photos-grid">${photosContent}</div></section>`,
      '  </div>',
      '</div>'
    ].join('');

    const closeLightbox = () => {
      overlay.querySelector('.product-reviews-lightbox')?.remove();
    };

    const openPhotoLightbox = (startIndex) => {
      if (!safePhotos.length) return;
      closeLightbox();

      const lightbox = document.createElement('div');
      lightbox.className = 'product-reviews-lightbox';
      lightbox.innerHTML = [
        '<button class="product-reviews-lightbox-close" type="button" aria-label="Fermer">×</button>',
        '<button class="product-reviews-lightbox-nav product-reviews-lightbox-nav-prev" type="button" aria-label="Photo pr&eacute;c&eacute;dente">←</button>',
        '<img class="product-reviews-lightbox-image" alt="Photo cliente agrandie">',
        '<button class="product-reviews-lightbox-nav product-reviews-lightbox-nav-next" type="button" aria-label="Photo suivante">→</button>'
      ].join('');

      let activeIndex = Math.max(0, Math.min(safePhotos.length - 1, Number(startIndex) || 0));
      const image = lightbox.querySelector('.product-reviews-lightbox-image');

      const updateImage = () => {
        image.setAttribute('src', safePhotos[activeIndex]);
        image.setAttribute('alt', `Photo cliente ${activeIndex + 1}`);
      };

      const go = (step) => {
        activeIndex = (activeIndex + step + safePhotos.length) % safePhotos.length;
        updateImage();
      };

      lightbox.addEventListener('click', (event) => {
        if (event.target === lightbox || event.target.closest('.product-reviews-lightbox-close')) {
          closeLightbox();
          return;
        }
        if (event.target.closest('.product-reviews-lightbox-nav-prev')) {
          go(-1);
          return;
        }
        if (event.target.closest('.product-reviews-lightbox-nav-next')) {
          go(1);
        }
      });

      updateImage();
      overlay.appendChild(lightbox);
    };

    const close = () => {
      closeLightbox();
      overlay.remove();
      document.body.classList.remove('product-reviews-open');
      window.removeEventListener('keydown', onEsc);
    };

    const onEsc = (event) => {
      if (event.key === 'Escape') {
        if (overlay.querySelector('.product-reviews-lightbox')) {
          closeLightbox();
          return;
        }
        close();
        return;
      }

      if (!overlay.querySelector('.product-reviews-lightbox')) return;
      if (event.key === 'ArrowLeft') {
        overlay.querySelector('.product-reviews-lightbox-nav-prev')?.click();
      }
      if (event.key === 'ArrowRight') {
        overlay.querySelector('.product-reviews-lightbox-nav-next')?.click();
      }
    };

    const switchTab = (tabName) => {
      overlay.querySelectorAll('.product-reviews-tab').forEach((button) => {
        const isActive = button.dataset.tab === tabName;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      overlay.querySelectorAll('[data-tab-content]').forEach((section) => {
        const isHidden = section.getAttribute('data-tab-content') !== tabName;
        section.hidden = isHidden;
        section.classList.toggle('is-hidden', isHidden);
      });
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('.product-reviews-close')) {
        close();
        return;
      }

      const tabButton = event.target.closest('.product-reviews-tab');
      if (tabButton) {
        switchTab(tabButton.dataset.tab);
        return;
      }

      const photo = event.target.closest('.product-reviews-photos-grid img');
      if (photo) {
        const allPhotos = Array.from(overlay.querySelectorAll('.product-reviews-photos-grid img'));
        const index = Math.max(0, allPhotos.indexOf(photo));
        openPhotoLightbox(index);
      }
    });

    document.body.appendChild(overlay);
    document.body.classList.add('product-reviews-open');
    window.addEventListener('keydown', onEsc);

    overlay.querySelectorAll('.product-reviews-photos-grid img').forEach((imageNode, index) => {
      imageNode.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPhotoLightbox(index);
      });
    });

    if (initialTab === 'photos' && Number.isInteger(initialPhotoIndex) && initialPhotoIndex >= 0) {
      openPhotoLightbox(initialPhotoIndex);
    }
  }

  function getProductFamily(product) {
    const name = String(product?.name || '').toLowerCase();

    if (/robe|jupe/.test(name)) return 'silhouette';
    if (/veste|pantalon|short/.test(name)) return 'vestes-pantalons';
    if (/top/.test(name)) return 'tops';
    if (/sac|ceinture|foulard/.test(name)) return 'accessoires';
    if (/mule|sandale|botte|chaussure/.test(name)) return 'souliers';
    if (/boucle|collier|bracelet|bijou/.test(name)) return 'bijoux';

    return 'selection';
  }

  function isAccessoryProduct(product, origin) {
    const type = String(product?.type || '').toLowerCase();
    const category = String(product?.category || '').toLowerCase();
    const sourceOrigin = String(origin || '').toLowerCase();
    const tags = Array.isArray(product?.tags)
      ? product.tags.map((tag) => String(tag || '').toLowerCase())
      : [];
    const family = getProductFamily(product);

    if (['accessoires', 'accessoire', 'bijoux', 'bijou'].includes(type)) return true;
    if (['accessoires', 'accessoire', 'bijoux', 'bijou'].includes(category)) return true;
    if (sourceOrigin === 'accessoires') return true;
    if (tags.includes('accessoires') || tags.includes('accessoire') || tags.includes('bijoux') || tags.includes('bijou')) return true;
    return family === 'accessoires' || family === 'bijoux';
  }

  function buildProductUrl(product, origin) {
    const params = new URLSearchParams();
    params.set('id', product.id || '');
    if (product.name) params.set('name', product.name);
    if (product.price) params.set('price', product.price);
    if (product.subtitle) params.set('subtitle', product.subtitle);
    if (product.img) params.set('img', product.img);
    if (product.secondaryImg) params.set('secondaryImg', product.secondaryImg);
    if (product.tertiaryImg) params.set('tertiaryImg', product.tertiaryImg);
    if (product.quaternaryImg) params.set('quaternaryImg', product.quaternaryImg);
    if (product.imageCaption) params.set('imageCaption', product.imageCaption);
    if (Array.isArray(product.colors) && product.colors.length) params.set('colors', product.colors.join(','));
    if (Array.isArray(product.sizes) && product.sizes.length) params.set('sizes', product.sizes.join(','));
    if (product.selectedSize) params.set('selectedSize', product.selectedSize);
    if (product.selectedColor) params.set('selectedColor', product.selectedColor);
    if (product.ratingValue !== undefined && product.ratingValue !== null) params.set('ratingValue', String(product.ratingValue));
    if (product.ratingCount !== undefined && product.ratingCount !== null) params.set('ratingCount', String(product.ratingCount));

    const originKey = origin?.key || 'collection';
    params.set('origin', originKey);
    params.set('originLabel', origin?.label || 'Collection');
    params.set('originUrl', origin?.url || 'collection.html');
    params.set('originNav', origin?.navKey || originKey);

    return `detail-produit.html?${params.toString()}`;
  }

  // Which products appear here is chosen explicitly in admin (a checkbox
  // per product), not guessed from the name/colors — matches the same
  // "no auto-fallback" preference already applied to categories/tags.
  function getRelatedProducts(product, origin, allProducts) {
    const sourceProducts = Array.isArray(allProducts) ? allProducts : [];

    return sourceProducts
      .filter((candidate) => candidate.id !== product.id && candidate.show_in_related)
      .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
      .slice(0, 8)
      .map((candidate) => ({
        product: candidate,
        url: buildProductUrl(candidate, origin || { key: 'collection', label: 'Collection', url: 'collection.html', navKey: 'collection' })
      }));
  }

  function bindHorizontalSlider(track, prevBtn, nextBtn) {
    if (!track || !prevBtn || !nextBtn) return;

    const updateButtons = () => {
      const maxScrollLeft = track.scrollWidth - track.clientWidth;
      const atStart = track.scrollLeft <= 4;
      const atEnd = track.scrollLeft >= maxScrollLeft - 4;
      prevBtn.classList.toggle('is-hidden', atStart);
      nextBtn.classList.toggle('is-hidden', atEnd || maxScrollLeft <= 0);
    };

    const getStep = () => {
      const card = track.querySelector('.home-slider-card');
      if (!card) return track.clientWidth * 0.8;
      const styles = window.getComputedStyle(track);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
      return card.getBoundingClientRect().width + gap;
    };

    prevBtn.addEventListener('click', () => {
      track.scrollBy({ left: -getStep(), behavior: 'smooth' });
    });

    nextBtn.addEventListener('click', () => {
      track.scrollBy({ left: getStep(), behavior: 'smooth' });
    });

    // Drag-to-scroll (souris)
    let isDragging = false;
    let dragStartX = 0;
    let scrollStartLeft = 0;

    track.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragStartX = e.clientX;
      scrollStartLeft = track.scrollLeft;
      track.style.cursor = 'grabbing';
      track.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      track.scrollLeft = scrollStartLeft - dx;
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      track.style.cursor = 'grab';
      track.style.userSelect = '';
    });

    track.style.cursor = 'grab';

    track.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons);
    requestAnimationFrame(() => requestAnimationFrame(updateButtons));
    window.addEventListener('load', updateButtons);
  }

  function getSwatchColor(colorName) {
    const map = {
      'noir': '#111111', 'black': '#111111',
      'blanc': '#f8f8f8', 'white': '#f8f8f8',
      'beige': '#d4b89a',
      'creme': '#f5f0e0', 'ivoire': '#f5eedb', 'ivory': '#f5eedb',
      'camel': '#c19a6b', 'taupe': '#8c7c6c',
      'marron': '#6b3a2a', 'brown': '#6b3a2a', 'chocolat': '#4a2e1a',
      'bleu': '#2d52a0', 'blue': '#2d52a0', 'navy': '#1a2851', 'marine': '#1a2851',
      'rouge': '#c41b18', 'red': '#c41b18', 'bordeaux': '#6b0f1a',
      'rose': '#e8a0b0', 'pink': '#e8a0b0', 'blush': '#f0cac0',
      'vert': '#2d5a30', 'green': '#2d5a30', 'kaki': '#7a7b4b', 'olive': '#707850',
      'gris': '#808080', 'grey': '#808080', 'gray': '#808080',
      'terracotta': '#c56b45', 'orange': '#e06020',
      'violet': '#5c3d8f', 'purple': '#5c3d8f', 'prune': '#6b2a5c',
      'jaune': '#e8c43d', 'yellow': '#e8c43d',
      'or': '#c9a227', 'gold': '#c9a227', 'dore': '#c9a227',
      'argent': '#b0b0b0', 'silver': '#b0b0b0',
      'lavande': '#9b8ec0', 'lavender': '#9b8ec0',
      'turquoise': '#2abfbf', 'corail': '#e8796b', 'coral': '#e8796b'
    };
    const normalized = (colorName || '').toLowerCase()
      .replace(/[\u00e9\u00e8\u00ea\u00eb]/g, 'e').replace(/[\u00e0\u00e2\u00e4]/g, 'a')
      .replace(/[\u00f9\u00fb\u00fc]/g, 'u').replace(/[\u00ee\u00ef]/g, 'i')
      .replace(/[\u00f4\u00f6]/g, 'o').replace(/[\u00e7]/g, 'c');
    return map[normalized] || '#cccccc';
  }

  async function renderDetailPage() {
    const shell = document.getElementById('product-detail-shell');
    if (!shell) return;

    ensureHeaderSubmenus();

    const queryParams = new URLSearchParams(window.location.search);
    const queryProduct = getProductFromQuery();
    const queryName = queryParams.get('name') || queryProduct?.name || '';
    const origin = getOriginContext();
    shell.innerHTML = [
      '<div class="product-detail-empty">',
      '  <p class="favorites-empty-kicker">Chargement du produit</p>',
      '  <h1>Merci de patienter…</h1>',
      '  <p>Le produit est en cours de chargement depuis Supabase.</p>',
      '</div>'
    ].join('');

    let allProducts = [];
    let product = null;

    try {
      const [apiProducts, apiProduct] = await Promise.all([
        fetchProductsFromApi(),
        fetchProductFromApi(getProductId())
      ]);

      allProducts = Array.isArray(apiProducts) ? apiProducts.map(normalizeApiProduct) : [];
      const normalizedApiProduct = apiProduct ? normalizeApiProduct(apiProduct) : null;

      const productByName = !normalizedApiProduct && queryName
        ? allProducts.find((candidate) => {
          const nameMatch = normalizeProductKey(candidate?.name) === normalizeProductKey(queryName);
          const idMatch = normalizeProductKey(candidate?.id) === normalizeProductKey(queryName);
          return nameMatch || idMatch;
        })
        : null;

      product = normalizedApiProduct || productByName;
      if (product && queryProduct) {
        // Prefer fresh Supabase data (real colors/sizes/images) over the
        // degraded copy encoded in the URL by legacy listing-card links.
        // The URL copy is only a useful fallback when we couldn't fetch the
        // product directly (normalizedApiProduct is null).
        const preferApi = Boolean(normalizedApiProduct);
        const pick = (apiValue, queryValue) => (preferApi ? (apiValue || queryValue) : (queryValue || apiValue));
        const pickList = (apiValue, queryValue) => (preferApi
          ? (Array.isArray(apiValue) && apiValue.length ? apiValue : queryValue)
          : (Array.isArray(queryValue) && queryValue.length ? queryValue : apiValue));

        product = Object.assign({}, product, queryProduct, {
          name: pick(product.name, queryProduct.name),
          price: pick(product.price, queryProduct.price),
          description: pick(product.description, queryProduct.description),
          img: pick(product.img, queryProduct.img),
          secondaryImg: pick(product.secondaryImg, queryProduct.secondaryImg),
          tertiaryImg: pick(product.tertiaryImg, queryProduct.tertiaryImg),
          quaternaryImg: pick(product.quaternaryImg, queryProduct.quaternaryImg),
          colors: pickList(product.colors, queryProduct.colors),
          sizes: pickList(product.sizes, queryProduct.sizes)
        });
      }
    } catch (error) {
      console.error('Impossible de charger le produit Supabase:', error);
    }

    if (!product) {
      applyOriginContext(origin, 'Produit');
      shell.innerHTML = [
        '<div class="product-detail-empty">',
        '  <p class="favorites-empty-kicker">Produit indisponible</p>',
        '  <h1>Ce produit n’est plus accessible.</h1>',
        '  <p>Retournez à votre sélection pour explorer les autres pièces enregistrées.</p>',
        '  <a class="favorites-empty-link" href="collection.html">Retour à la collection</a>',
        '</div>'
      ].join('');
      return;
    }

    applyOriginContext(origin, product.name);

    const isAccessory = isAccessoryProduct(product, origin);
    const isUnique = !isAccessory && hasUniqueSize(product);
    // Trust the real tagged sizes, not the accessory guess: a product
    // categorized "Accessoires" that still has actual size variants (e.g.
    // a dress cross-tagged for the Accessoires filter) must keep showing
    // its size picker.
    const noSize = hasNoSize(product);
    const gallery = buildGallery(product);
    const detailSubtitle = clampSingleLineText(getProductDetailSubtitle(product), 70);
    const colors = (product.colors && product.colors.length) ? product.colors : [];
    const savedSelection = window.JacesFavorites && typeof window.JacesFavorites.getSavedSelection === 'function'
      ? window.JacesFavorites.getSavedSelection(product.id, product)
      : { color: '', size: '' };
    const availableSizes = Array.isArray(product.sizes) ? product.sizes : [];
    const numericReferenceSizes = ['34', '36', '38', '40', '42', '44'];
    const isNumericSizeSubset = availableSizes.length > 0
      && availableSizes.every((size) => numericReferenceSizes.includes(String(size)));
    const displaySizes = !noSize && !isUnique && isNumericSizeSubset
      ? numericReferenceSizes
      : availableSizes;
    const querySelectedSize = String(queryProduct?.selectedSize || '').trim();
    const querySelectedColor = String(queryProduct?.selectedColor || '').trim();
    const suggestedSize = savedSelection.suggestedSize && availableSizes.includes(savedSelection.suggestedSize)
      ? savedSelection.suggestedSize
      : '';
    const firstColor = querySelectedColor && colors.includes(querySelectedColor)
      ? querySelectedColor
      : (savedSelection.color && colors.includes(savedSelection.color)
      ? savedSelection.color
      : (colors[0] || ''));
    const firstSize = noSize
      ? ''
      : (isUnique
      ? availableSizes[0]
      : (querySelectedSize && availableSizes.includes(querySelectedSize)
        ? querySelectedSize
      : (savedSelection.size && availableSizes.includes(savedSelection.size)
        ? savedSelection.size
        : suggestedSize)));
    const globalRecommendedSize = suggestedSize || querySelectedSize || firstSize || (availableSizes && availableSizes[0]) || '';
    const isFavorite = window.JacesFavorites && typeof window.JacesFavorites.getFavorites === 'function'
      ? window.JacesFavorites.getFavorites().some((item) => item.id === product.id)
      : false;
    const colorSwatches = colors.map((color) => `<button class="product-detail-swatch${color === firstColor ? ' is-selected' : ''}" type="button" data-color="${color}" style="--swatch-bg: ${getSwatchColor(color)}" aria-label="${color}" title="${color}"></button>`).join('');
    const sizeChipsHtml = !isUnique && !noSize
      ? displaySizes.map((size) => {
        const isAvailable = availableSizes.includes(size);
        const selectedClass = isAvailable && size === firstSize ? ' is-selected' : '';
        const recommendedClass = isAvailable && size === suggestedSize ? ' is-recommended' : '';
        const disabledClass = !isAvailable ? ' is-disabled' : '';
        const disabledAttr = !isAvailable ? ' disabled aria-disabled="true" tabindex="-1"' : '';
        return `<button class="product-detail-size-chip${selectedClass}${recommendedClass}${disabledClass}" type="button" data-size="${size}"${disabledAttr}>${size}</button>`;
      }).join('')
      : '';
    const relatedProducts = getRelatedProducts(product, origin, allProducts);
    const rawReviewData = getProductReviewData(product);
    const reviewBreakdown = getReviewBreakdown(rawReviewData);
    const hasCustomRating = String(product?.ratingValue ?? '').trim() !== '';
    const hasCustomCount = String(product?.ratingCount ?? '').trim() !== '';
    const reviewData = Object.assign({}, rawReviewData, getReviewStatsFromBreakdown(rawReviewData, reviewBreakdown));
    if (hasCustomRating) reviewData.rating = rawReviewData.rating;
    if (hasCustomCount) reviewData.verifiedCount = rawReviewData.verifiedCount;
    const reviewStarsMarkup = buildStarMarkup(reviewData.rating);
    const reviewQuotePreview = buildReviewPreview(reviewData.quote, 40);
    const isAdminTechnicalReference = /^admin-/i.test(String(product.id || '').trim());
    const customerPhotos = [gallery.primaryImage, gallery.secondaryImage, gallery.tertiaryImage, gallery.quaternaryImage].filter(Boolean).slice(0, 4);
    const getQuickBuyMarkup = (entryProduct) => {
      if (isAccessoryProduct(entryProduct, origin)) return '';
      const quickBuySizes = Array.isArray(entryProduct?.sizes)
        ? entryProduct.sizes.map((size) => String(size || '').trim()).filter((size) => size && size.toLowerCase() !== 'unique')
        : [];
      if (!quickBuySizes.length) return '';

      const savedSelectionForCard = window.JacesFavorites && typeof window.JacesFavorites.getSavedSelection === 'function'
        ? window.JacesFavorites.getSavedSelection(entryProduct.id, entryProduct)
        : { suggestedSize: '', size: '' };
      const suggestedSize = savedSelectionForCard.suggestedSize
        || savedSelectionForCard.size
        || globalRecommendedSize
        || quickBuySizes[0];
      const buttonsHtml = quickBuySizes
        .map((size) => `<button class="${suggestedSize === size ? 'is-recommended' : ''}" type="button">${size}</button>`)
        .join('');
      return `<p class="quick-buy-title"><strong>Achat rapide</strong> (Selectionnez votre taille)</p><div class="quick-buy-grid">${buttonsHtml}</div>`;
    };

    shell.innerHTML = `
      <div class="product-detail-top">
        <div class="product-detail-gallery">
        <figure class="product-detail-media-block product-detail-media-primary">
          ${gallery.primaryImage ? `<img class="product-detail-image" src="${gallery.primaryImage}" alt="${product.name}">` : '<div class="favorites-card-placeholder product-detail-placeholder"></div>'}
          ${gallery.caption ? `<figcaption class="product-detail-caption">${gallery.caption}</figcaption>` : ''}
        </figure>
        <figure class="product-detail-media-block product-detail-media-secondary">
          <button class="product-favorite product-detail-favorite${isFavorite ? ' active' : ''}" id="detail-product-favorite" type="button" aria-label="${isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}" title="${isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
            <svg class="heart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
          ${gallery.secondaryImage ? `<img class="product-detail-image product-detail-image-secondary" src="${gallery.secondaryImage}" alt="${product.name} vue d&eacute;tail">` : '<div class="favorites-card-placeholder product-detail-placeholder"></div>'}
        </figure>
        <figure class="product-detail-media-block product-detail-media-tertiary">
          ${gallery.tertiaryImage ? `<img class="product-detail-image product-detail-image-tertiary" src="${gallery.tertiaryImage}" alt="${product.name} vue compl&eacute;mentaire">` : '<div class="favorites-card-placeholder product-detail-placeholder"></div>'}
        </figure>
        <figure class="product-detail-media-block product-detail-media-quaternary">
          ${gallery.quaternaryImage ? `<img class="product-detail-image product-detail-image-quaternary" src="${gallery.quaternaryImage}" alt="${product.name} seconde vue compl&eacute;mentaire">` : '<div class="favorites-card-placeholder product-detail-placeholder"></div>'}
        </figure>
        </div>
        <div class="product-detail-copy">
        <div class="product-detail-heading-block">
          <div class="product-detail-header">
            <h1>${product.name}</h1>
            <p class="product-detail-price">${formatPrice(product.price)}</p>
          </div>
          <p class="product-detail-subtitle">${detailSubtitle}</p>
        </div>
        <div class="product-detail-sticky-region js-product-detail-sticky-region">
          <div class="product-detail-sticky-panel js-product-detail-scroll-panel">
            ${colors.length ? `<div class="product-detail-color-section js-product-detail-color-trigger">
              <p class="product-detail-field-label">Couleur&nbsp;: <strong id="detail-color-label">${firstColor || '&mdash;'}</strong></p>
              <div class="product-detail-swatches">${colorSwatches}</div>
            </div>` : ''}
            ${!noSize ? `<div class="product-detail-size-section">
              <div class="product-detail-size-head">
                <p class="product-detail-field-label">Taille${isUnique ? '&nbsp;: <strong>Unique</strong>' : `&nbsp;: <strong id="detail-size-label">${firstSize || '&mdash;'}</strong>`}</p>
                ${!isUnique ? `<div class="product-detail-size-meta"><button class="product-detail-size-link" id="detail-size-advisor" type="button">Trouver ma taille id&eacute;ale</button><p class="product-detail-size-suggestion-inline" id="detail-size-suggestion"${savedSelection.suggestedSize ? '' : ' hidden'}>${savedSelection.suggestedSize ? savedSelection.suggestedSize : ''}</p></div>` : ''}
              </div>
              ${!isUnique ? `<div class="product-detail-size-chips">${sizeChipsHtml}</div>` : ''}
              <input type="hidden" id="detail-size" value="${firstSize}">
              <input type="hidden" id="detail-color" value="${firstColor}">
            </div>` : `<input type="hidden" id="detail-size" value=""><input type="hidden" id="detail-color" value="${firstColor}">`}
            <div class="product-detail-actions">
              <button class="product-detail-add" type="button">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
                Ajouter au panier
              </button>
            </div>
            <p class="favorites-card-message" id="detail-product-message" aria-live="polite"></p>
            <section class="product-detail-reassurance" aria-label="R&eacute;assurance produit">
              <div class="product-detail-reassurance-card">
                <div class="product-detail-reassurance-col product-detail-reassurance-col--score">
                  ${reviewStarsMarkup}
                  <p class="product-detail-reassurance-score">${formatRatingFr(reviewData.rating)}/5</p>
                  <p class="product-detail-reassurance-count">${reviewData.verifiedCount} avis v&eacute;rifi&eacute;s</p>
                </div>
                <div class="product-detail-reassurance-col product-detail-reassurance-col--quote">
                  <p class="product-detail-reassurance-quote">&ldquo;${reviewQuotePreview}&rdquo;</p>
                  <button type="button" class="product-detail-reassurance-link" data-open-reviews="reviews">Voir les avis</button>
                </div>
              </div>
            </section>
            <div class="product-detail-info">
              <div class="product-detail-info-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h5"/><path d="M6 13h9"/><path d="M16 16l3-3"/></svg>
                <span>Livraison estim&eacute;e entre le mer. 15/04 et le jeu. 16/04</span>
              </div>
              <div class="product-detail-info-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h5"/><path d="M6 13h9"/><path d="M16 16l3-3"/></svg>
                <span>Ou payez 3 fois 46&euro; sans frais</span>
              </div>
              <div class="product-detail-info-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 010 20"/><path d="M12 2a15 15 0 000 20"/></svg>
                <span class="product-detail-info-link">Livraison dans le monde entier</span>
              </div>
              <div class="product-detail-info-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 14l4-4 4 4"/><path d="M6 10v8a2 2 0 002 2h9"/><path d="M22 10l-4 4-4-4"/><path d="M18 14V6a2 2 0 00-2-2H7"/></svg>
                <span>Retours gratuits</span>
              </div>
            </div>
            <div class="product-detail-accordions">
              <details class="product-detail-accordion" open>
                <summary class="product-detail-accordion-summary">D&eacute;tails</summary>
                <div class="product-detail-accordion-body">
                  <p>${product.description}</p>
                  ${isAdminTechnicalReference ? '' : `<p>R&eacute;f&eacute;rence&nbsp;: ${product.id}</p>`}
                </div>
              </details>
              ${product.style_notes ? `
              <details class="product-detail-accordion">
                <summary class="product-detail-accordion-summary">${isAccessory ? 'Port&eacute; et Style' : 'Taille et Coupe'}</summary>
                <div class="product-detail-accordion-body">
                  <p>${product.style_notes}</p>
                </div>
              </details>` : ''}
              ${product.care_instructions ? `
              <details class="product-detail-accordion">
                <summary class="product-detail-accordion-summary">Entretien</summary>
                <div class="product-detail-accordion-body">
                  <p>${product.care_instructions}</p>
                </div>
              </details>` : ''}
            </div>

          </div>
        </div>
      </div>
      </div>
      <section class="product-detail-insights-band" aria-label="Avis clients et indicateurs">
        <div class="product-detail-insights-col product-detail-insights-col--reviews">
          <h3>Avis clients</h3>
          <p class="product-detail-insights-score">${formatRatingFr(reviewData.rating)}/5</p>
          ${reviewStarsMarkup}
          <p class="product-detail-insights-count">${reviewData.verifiedCount} avis v&eacute;rifi&eacute;s</p>
          <div class="product-detail-insights-breakdown" aria-label="R&eacute;partition des notes">
            ${reviewBreakdown.map((row) => {
              const percent = Math.max(1, Math.round((row.count / Math.max(1, reviewData.verifiedCount)) * 100));
              return `<div class="product-detail-insights-breakdown-row"><span class="stars-label">${row.stars} &#9733;</span><span class="bar"><span style="width:${percent}%;"></span></span><span class="count">${row.count}</span></div>`;
            }).join('')}
          </div>
        </div>
        <div class="product-detail-insights-col product-detail-insights-col--photos">
          <h3>Photos clientes</h3>
          <div class="product-detail-insights-photos">
            ${customerPhotos.map((src, index) => `<img src="${src}" alt="Photo cliente ${index + 1}" loading="lazy">`).join('')}
          </div>
          <button class="product-detail-insights-photos-btn" type="button" data-open-reviews="photos">Voir toutes les photos</button>
        </div>
        <div class="product-detail-insights-col product-detail-insights-col--fit">
          <div class="product-detail-fit-meters" aria-label="Indicateurs ${isAccessory ? 'port&eacute; et qualit&eacute;' : 'taille et qualit&eacute;'}"><div class="product-detail-fit-meter"><p class="product-detail-fit-meter-title">${isAccessory ? 'Port&eacute;' : 'Taille'}</p><div class="product-detail-fit-meter-track" role="img" aria-label="${isAccessory ? 'Port&eacute;: Normal' : 'Taille: Normal'}"><span class="product-detail-fit-meter-dot" style="left: 50%;"></span></div><div class="product-detail-fit-meter-labels"><span>Petit</span><span>Normal</span><span>Grand</span></div></div><div class="product-detail-fit-meter"><p class="product-detail-fit-meter-title">Qualit&eacute;</p><div class="product-detail-fit-meter-track" role="img" aria-label="Qualit&eacute;: Premium"><span class="product-detail-fit-meter-dot" style="left: 94%;"></span></div><div class="product-detail-fit-meter-labels"><span>Moyenne</span><span>Bonne</span><span>Premium</span></div></div></div>
        </div>
      </section>
      ${relatedProducts.length ? `
        <section class="home-slider-section product-detail-alternatives" aria-label="Produits en ce moment">
          <div class="home-slider-header">
            <h2>EN CE MOMENT</h2>
          </div>
          <div class="home-slider-controls">
            <button class="slider-btn is-hidden" type="button" data-detail-related-prev aria-label="Produits précédents">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12h16M13 5l7 7-7 7"/></svg>
            </button>
            <button class="slider-btn" type="button" data-detail-related-next aria-label="Produits suivants">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12h16M13 5l7 7-7 7"/></svg>
            </button>
          </div>
          <div class="home-slider-track" data-detail-related-track>
            ${relatedProducts.map((entry, index) => {
              const primarySrc = entry.product.img || '';
              const fallbackSecondary = (relatedProducts[(index + 1) % relatedProducts.length]?.product?.img) || entry.product.img;
              const secondarySrc = entry.product.secondaryImg || entry.product.tertiaryImg || entry.product.quaternaryImg || fallbackSecondary || entry.product.img;
              const primaryFallbackSrc = secondarySrc || product.img || '';
              const secondaryFallbackSrc = primarySrc || product.img || '';
              const quickBuyMarkup = getQuickBuyMarkup(entry.product);

              return `
              <article class="home-slider-card" data-product-id="${entry.product.id}" data-product-url="${entry.url}" data-sizes="${(entry.product.sizes || []).join(',')}" data-colors="${(entry.product.colors || []).join(',')}">
                <a class="home-slider-media" href="${entry.url}" aria-label="Voir ${entry.product.name}">
                  ${primarySrc
                    ? `<img class="home-slider-image-primary" src="${primarySrc}" data-fallback-src="${primaryFallbackSrc}" alt="${entry.product.name}" loading="lazy">`
                    : '<div class="favorites-card-placeholder product-detail-related-placeholder"></div>'}
                  ${primarySrc
                    ? `<img class="home-slider-image-secondary" src="${secondarySrc}" data-fallback-src="${secondaryFallbackSrc}" alt="${entry.product.name} vue 2" loading="lazy">`
                    : ''}
                  ${quickBuyMarkup ? `<div class="hover-sizes" aria-hidden="true">${quickBuyMarkup}</div>` : ''}
                </a>
                <div class="home-slider-meta"><h3>${entry.product.name}</h3><p>${formatPrice(entry.product.price)}</p></div>
              </article>
            `;
            }).join('')}
          </div>
        </section>
      ` : ''}
    `;

    const relatedTrack = shell.querySelector('[data-detail-related-track]');
    const relatedPrevBtn = shell.querySelector('[data-detail-related-prev]');
    const relatedNextBtn = shell.querySelector('[data-detail-related-next]');
    bindHorizontalSlider(relatedTrack, relatedPrevBtn, relatedNextBtn);

    shell.querySelectorAll('.home-slider-image-primary, .home-slider-image-secondary').forEach((image) => {
      image.addEventListener('error', () => {
        const fallbackSrc = image.dataset.fallbackSrc || '';
        const currentSrc = image.getAttribute('src') || '';
        if (fallbackSrc && currentSrc !== fallbackSrc) {
          image.setAttribute('src', fallbackSrc);
          return;
        }

        const media = image.closest('.home-slider-media');
        image.remove();
        if (media && !media.querySelector('.home-slider-image-primary, .favorites-card-placeholder')) {
          media.insertAdjacentHTML('afterbegin', '<div class="favorites-card-placeholder product-detail-related-placeholder"></div>');
        }
      });
    });

    bindDetailPanelScroll(shell);

    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      shell.querySelectorAll('.product-detail-media-block').forEach((block) => {
        const image = block.querySelector('.product-detail-image');
        if (!image) return;

        block.addEventListener('mousemove', (event) => {
          const rect = block.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * 100;
          const y = ((event.clientY - rect.top) / rect.height) * 100;
          image.style.setProperty('--image-pan-x', `${Math.max(0, Math.min(100, x))}%`);
          image.style.setProperty('--image-pan-y', `${Math.max(0, Math.min(100, y))}%`);
        });

        block.addEventListener('mouseleave', () => {
          image.style.setProperty('--image-pan-x', '50%');
          image.style.setProperty('--image-pan-y', '50%');
        });
      });
    }

    const message = document.getElementById('detail-product-message');
    const sizeInput = document.getElementById('detail-size');
    const colorInput = document.getElementById('detail-color');
    const favoriteButton = document.getElementById('detail-product-favorite');
    const colorLabel = document.getElementById('detail-color-label');
    const sizeLabel = document.getElementById('detail-size-label');
    const sizeSuggestionLabel = document.getElementById('detail-size-suggestion');
    const saveSelection = (field, value) => {
      if (window.JacesFavorites && typeof window.JacesFavorites.saveProductSelection === 'function') {
        window.JacesFavorites.saveProductSelection(product.id, field, value);
      }
    };

    const getCartEntriesForProduct = () => {
      if (!window.JacesCart || typeof window.JacesCart.getCart !== 'function') return [];
      return window.JacesCart.getCart().filter((item) => item.id === product.id);
    };

    const formatCartVariant = (item) => {
      const parts = [];
      if (item.color) parts.push(item.color);
      if (item.size) parts.push('taille ' + item.size);
      return parts.join(', ');
    };

    const renderCartStatus = () => {
      if (!message) return;
      message.textContent = '';
    };

    const syncSuggestedSizeUI = (suggested) => {
      shell.querySelectorAll('.product-detail-size-chip').forEach((button) => {
        button.classList.toggle('is-recommended', !!suggested && button.dataset.size === suggested);
      });

      if (sizeSuggestionLabel) {
        sizeSuggestionLabel.textContent = suggested || '';
        sizeSuggestionLabel.hidden = !suggested;
      }
    };

    const syncSelectionUI = () => {
      const nextSelection = window.JacesFavorites && typeof window.JacesFavorites.getSavedSelection === 'function'
        ? window.JacesFavorites.getSavedSelection(product.id, product)
        : { color: '', size: '' };

      const nextColor = querySelectedColor && colors.includes(querySelectedColor)
        ? querySelectedColor
        : (nextSelection.color && colors.includes(nextSelection.color)
        ? nextSelection.color
        : (colors[0] || ''));
      const nextSuggestedSize = nextSelection.suggestedSize && availableSizes.includes(nextSelection.suggestedSize)
        ? nextSelection.suggestedSize
        : '';
      const nextSize = isUnique
        ? availableSizes[0]
        : (querySelectedSize && availableSizes.includes(querySelectedSize)
          ? querySelectedSize
          : (nextSelection.size && availableSizes.includes(nextSelection.size)
          ? nextSelection.size
          : nextSuggestedSize));

      shell.querySelectorAll('.product-detail-swatch').forEach((button) => {
        button.classList.toggle('is-selected', button.dataset.color === nextColor && !!nextColor);
      });

      shell.querySelectorAll('.product-detail-size-chip').forEach((button) => {
        button.classList.toggle('is-selected', button.dataset.size === nextSize && !!nextSize);
      });
      syncSuggestedSizeUI(nextSuggestedSize);

      if (colorLabel) colorLabel.innerHTML = nextColor || '&mdash;';
      if (sizeLabel) sizeLabel.innerHTML = nextSize || '&mdash;';
      if (colorInput) colorInput.value = nextColor;
      if (sizeInput) sizeInput.value = nextSize;
      renderCartStatus();
    };

    const syncFavoriteUI = () => {
      const isActive = window.JacesFavorites && typeof window.JacesFavorites.getFavorites === 'function'
        ? window.JacesFavorites.getFavorites().some((item) => item.id === product.id)
        : false;

      favoriteButton?.classList.toggle('active', isActive);
      favoriteButton?.setAttribute('aria-label', isActive ? 'Retirer des favoris' : 'Ajouter aux favoris');
      favoriteButton?.setAttribute('title', isActive ? 'Retirer des favoris' : 'Ajouter aux favoris');
    };

    favoriteButton?.addEventListener('click', () => {
      if (!window.JacesFavorites || typeof window.JacesFavorites.toggleFavorite !== 'function') {
        return;
      }

      const added = window.JacesFavorites.toggleFavorite(product);
      if (added === null) {
        return;
      }
      if (added) {
        saveSelection('color', colorInput?.value || '');
        saveSelection('size', sizeInput?.value || (isUnique ? product.sizes[0] : ''));
      }
      favoriteButton.classList.toggle('active', added);
      favoriteButton.setAttribute('aria-label', added ? 'Retirer des favoris' : 'Ajouter aux favoris');
      favoriteButton.setAttribute('title', added ? 'Retirer des favoris' : 'Ajouter aux favoris');

      if (typeof window.JacesFavorites.updateHeaderCount === 'function') {
        window.JacesFavorites.updateHeaderCount();
      }

      if (typeof window.JacesFavorites.renderPanel === 'function') {
        window.JacesFavorites.renderPanel();
      }
    });

    shell.querySelectorAll('.product-detail-swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        shell.querySelectorAll('.product-detail-swatch').forEach((b) => b.classList.remove('is-selected'));

        btn.classList.add('is-selected');
        if (colorLabel) colorLabel.textContent = btn.dataset.color;
        if (colorInput) colorInput.value = btn.dataset.color;
        saveSelection('color', btn.dataset.color);
        renderCartStatus();
      });
    });

    shell.querySelectorAll('.product-detail-size-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('is-disabled')) return;
        const isAlreadySelected = btn.classList.contains('is-selected');
        const hasMandatorySize = !!(window.JacesFavorites
          && typeof window.JacesFavorites.getSavedSelection === 'function'
          && window.JacesFavorites.getSavedSelection(product.id, product).suggestedSize);

        if (isAlreadySelected) {
          if (hasMandatorySize) {
            return;
          }

          shell.querySelectorAll('.product-detail-size-chip').forEach((b) => b.classList.remove('is-selected'));
          if (sizeLabel) sizeLabel.innerHTML = '&mdash;';
          if (sizeInput) sizeInput.value = '';
          saveSelection('size', '');
          return;
        }

        shell.querySelectorAll('.product-detail-size-chip').forEach((b) => b.classList.remove('is-selected'));

        btn.classList.add('is-selected');
        if (sizeLabel) sizeLabel.textContent = btn.dataset.size;
        if (sizeInput) sizeInput.value = btn.dataset.size;
        saveSelection('size', btn.dataset.size);
        renderCartStatus();
      });
    });

    window.addEventListener('jaces:favorite-selection-sync', (event) => {
      const syncedProductId = event.detail?.productId;
      if (syncedProductId && syncedProductId !== product.id) return;
      syncSelectionUI();
    });

    window.addEventListener('jaces:favorites-sync', () => {
      syncFavoriteUI();
      syncSelectionUI();
    });

    window.addEventListener('jaces:cart-sync', renderCartStatus);

    document.querySelector('.product-detail-add')?.addEventListener('click', () => {
      const selectedSize = sizeInput?.value || (isUnique ? availableSizes[0] : '');
      const selectedColor = colorInput?.value || colors[0] || '';
      if (!selectedSize && !noSize) {
        if (message) message.textContent = 'Choisissez une taille avant de continuer.';
        return;
      }
      if (colors.length && !selectedColor) {
        if (message) message.textContent = 'Choisissez une couleur avant de continuer.';
        return;
      }
      if (window.JacesCart && typeof window.JacesCart.addItem === 'function') {
        const added = window.JacesCart.addItem(product, noSize ? '' : selectedSize, 1, selectedColor);
        if (!added) return;
      }
      if (window.JacesCart && typeof window.JacesCart.openCartPanel === 'function') {
        window.JacesCart.openCartPanel();
      }
      renderCartStatus();
    });

    document.getElementById('detail-size-advisor')?.addEventListener('click', () => {
      window.JacesSizeAdvisor.open(product, sizeInput?.value || '', (recommendedSize) => {
        if (!availableSizes.includes(recommendedSize)) return;
        if (sizeInput) sizeInput.value = recommendedSize;
        shell.querySelectorAll('.product-detail-size-chip').forEach((btn) => {
          if (btn.classList.contains('is-disabled')) {
            btn.classList.remove('is-selected');
            return;
          }
          btn.classList.toggle('is-selected', btn.dataset.size === recommendedSize);
        });
        syncSuggestedSizeUI(recommendedSize);
        const sizeLabel = document.getElementById('detail-size-label');
        if (sizeLabel) sizeLabel.textContent = recommendedSize;
        saveSelection('size', recommendedSize);
        renderCartStatus();
      });
    });

    shell.querySelectorAll('[data-open-reviews]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.getAttribute('data-open-reviews') || 'reviews';
        openReviewsPanel(product, reviewData, customerPhotos, mode);
      });
    });

    shell.querySelectorAll('.product-detail-insights-photos img').forEach((imageNode, index) => {
      imageNode.addEventListener('click', (event) => {
        event.preventDefault();
        openDirectPhotoLightbox(customerPhotos, index);
      });
    });

    if (firstColor) {
      saveSelection('color', firstColor);
    }
    renderCartStatus();

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderDetailPage);
  } else {
    renderDetailPage();
  }
})();