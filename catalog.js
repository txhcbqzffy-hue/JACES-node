(function () {
  const STANDARD_APPAREL_SIZES = ['34', '36', '38', '40', '42', '44'];

  function normalizeId(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  const pageContexts = {
    'collection.html': { key: 'collection', label: 'Collection', url: 'collection.html', navKey: 'collection' },
    'accessoires.html': { key: 'accessoires', label: 'Accessoires', url: 'accessoires.html', navKey: 'accessoires' },
    'nouveautes.html': { key: 'nouveautes', label: 'Nouveautés', url: 'nouveautes.html', navKey: 'nouveautes' },
    'collaborations.html': { key: 'collaboration', label: 'Collaboration', url: 'collaborations.html', navKey: 'collaboration' },
    'defile.html': { key: 'defile', label: 'Défilé', url: 'defile.html', navKey: 'defile' },
    'univers.html': { key: 'univers', label: 'Univers', url: 'univers.html', navKey: 'univers' }
  };

  function cloneContext(context) {
    if (!context || !context.url) return null;
    return {
      key: context.key || normalizeId(context.label || context.navKey || context.url),
      label: context.label || 'Collection',
      url: context.url,
      navKey: context.navKey || context.key || normalizeId(context.label || context.url)
    };
  }

  function getContextFromPathname(pathname) {
    const fileName = String(pathname || '')
      .split('/')
      .filter(Boolean)
      .pop() || '';
    return cloneContext(pageContexts[fileName]);
  }

  function getPageContext() {
    const contextFromPath = getContextFromPathname(window.location.pathname);
    if (contextFromPath) return contextFromPath;

    const body = document.body;
    if (!body) return null;

    if (body.classList.contains('accessoires-page')) return cloneContext(pageContexts['accessoires.html']);
    if (body.classList.contains('nouveautes-page')) return cloneContext(pageContexts['nouveautes.html']);
    if (body.classList.contains('collaboration-page')) return cloneContext(pageContexts['collaborations.html']);
    if (body.classList.contains('defile-page')) return cloneContext(pageContexts['defile.html']);
    if (body.classList.contains('univers-page')) return cloneContext(pageContexts['univers.html']);
    if (body.classList.contains('products-page')) return cloneContext(pageContexts['collection.html']);
    if (body.classList.contains('collection-page-body')) return cloneContext(pageContexts['collection.html']);

    return null;
  }

  function resolveContext(context) {
    if (!context) return null;
    if (context === true) return getPageContext();
    if (typeof context === 'string') {
      return cloneContext(
        pageContexts[context]
        || pageContexts[context + '.html']
        || Object.values(pageContexts).find((item) => item.key === normalizeId(context) || item.navKey === normalizeId(context))
      );
    }

    if (typeof context === 'object') {
      if (context.url) {
        return cloneContext({
          key: context.key,
          label: context.label,
          url: context.url,
          navKey: context.navKey
        });
      }

      if (context.pathname) return getContextFromPathname(context.pathname);
    }

    return null;
  }

  function getOriginContextFromSearch(search) {
    const params = new URLSearchParams(search || window.location.search || '');
    const originUrl = params.get('originUrl') || '';
    const originLabel = params.get('originLabel') || '';
    const originKey = params.get('origin') || params.get('originNav') || '';
    const resolved = resolveContext(originUrl || originKey);

    if (!originUrl && !originLabel && !originKey) return null;

    return cloneContext({
      key: originKey || resolved?.key,
      label: originLabel || resolved?.label || 'Collection',
      url: originUrl || resolved?.url || 'collection.html',
      navKey: params.get('originNav') || resolved?.navKey || originKey || 'collection'
    });
  }

  // Les produits sont désormais fournis par l’API. La lecture locale de produits
  // stockés dans localStorage n’est plus nécessaire pour la construction de cartes.

  function inferSizes(productName) {
    const name = String(productName || '').toLowerCase();

    if (/sac|ceinture|boucles|collier|bracelet|bijou|foulard|echarpe|mule|sandale|botte|chaussure|chaussette/.test(name)) {
      return [];
    }

    return STANDARD_APPAREL_SIZES;
  }

  function shouldUseStandardApparelSizes(product) {
    const name = String(product?.name || '').toLowerCase();
    const sizes = Array.isArray(product?.sizes) ? product.sizes : [];

    if (!sizes.length) return false;
    if (sizes.length === 1 && String(sizes[0]).toLowerCase() === 'unique') return false;
    if (/sac|ceinture|boucles|collier|bracelet|bijou|foulard|echarpe|mule|sandale|botte|chaussure|chaussette/.test(name)) return false;

    return true;
  }

  function inferColors(productName) {
    const name = String(productName || '').toLowerCase();

    if (/bijou|boucle|collier|bracelet/.test(name)) return ['Dore', 'Argent'];
    if (/ceinture|sac/.test(name)) return ['Noir', 'Camel'];
    if (/top/.test(name)) return ['Blanc', 'Ivoire'];
    if (/top|tops|foulard/.test(name)) return ['Ivoire', 'Noir'];

    return ['Noir', 'Beige'];
  }

  function inferDescription(product) {
    const name = product.name || 'Produit JACES';
    return name + ' s’inscrit dans la sélection JACES avec une ligne nette, une matière soignée et une allure facile à porter.';
  }

  function buildProductUrl(product, context) {
    const params = new URLSearchParams();
    params.set('id', product.id);
    if (product.name) params.set('name', product.name);
    if (product.price) params.set('price', product.price);
    if (product.subtitle) params.set('subtitle', product.subtitle);
    if (product.imageCaption) params.set('imageCaption', product.imageCaption);
    if (String(product.ratingValue ?? '').trim() !== '' && Number.isFinite(Number(product.ratingValue))) params.set('ratingValue', String(product.ratingValue));
    if (String(product.ratingCount ?? '').trim() !== '' && Number.isFinite(Number(product.ratingCount))) params.set('ratingCount', String(product.ratingCount));
    if (product.reviewQuote) params.set('reviewQuote', product.reviewQuote);
    if (product.img) params.set('img', product.img);
    if (product.secondaryImg) params.set('secondaryImg', product.secondaryImg);
    if (product.tertiaryImg) params.set('tertiaryImg', product.tertiaryImg);
    if (product.quaternaryImg) params.set('quaternaryImg', product.quaternaryImg);
    if (Array.isArray(product.sizes) && product.sizes.length) params.set('sizes', product.sizes.join(','));
    if (Array.isArray(product.colors) && product.colors.length) params.set('colors', product.colors.join(','));
    if (product.selectedSize) params.set('selectedSize', product.selectedSize);
    if (product.selectedColor) params.set('selectedColor', product.selectedColor);
    if (product.description) params.set('description', product.description);
    const resolvedContext = resolveContext(context);
    if (resolvedContext) {
      params.set('origin', resolvedContext.key);
      params.set('originLabel', resolvedContext.label);
      params.set('originUrl', resolvedContext.url);
      params.set('originNav', resolvedContext.navKey);
    }
    return 'detail-produit.html?' + params.toString();
  }

  function buildProduct(product) {
    const normalizedId = normalizeId(product.id || product.name);
    const baseProduct = {};
    const hasExplicitSizes = Array.isArray(product?.sizes) && product.sizes.length > 0;
    const mergedProduct = Object.assign({}, baseProduct, product, {
      id: normalizedId,
      name: product.name || baseProduct.name || 'Produit JACES'
    });

    mergedProduct.price = mergedProduct.price || '';
    mergedProduct.img = mergedProduct.img || '';
    mergedProduct.sizes = Array.isArray(mergedProduct.sizes) && mergedProduct.sizes.length
      ? mergedProduct.sizes
      : inferSizes(mergedProduct.name);
    if (!hasExplicitSizes && shouldUseStandardApparelSizes(mergedProduct)) {
      mergedProduct.sizes = [...STANDARD_APPAREL_SIZES];
    }
    mergedProduct.colors = Array.isArray(mergedProduct.colors) && mergedProduct.colors.length
      ? mergedProduct.colors
      : inferColors(mergedProduct.name);
    mergedProduct.description = mergedProduct.description || inferDescription(mergedProduct);
    mergedProduct.url = buildProductUrl(mergedProduct);

    return mergedProduct;
  }

  function getProductById(id) {
    const normalizedId = normalizeId(id);
    const cache = Array.isArray(window.__JACES_PRODUCTS_CACHE) ? window.__JACES_PRODUCTS_CACHE : [];
    const product = cache.find((item) => normalizeId(item?.id) === normalizedId);
    return product ? buildProduct(product) : null;
  }

  function getAllProducts() {
    const cache = Array.isArray(window.__JACES_PRODUCTS_CACHE) ? window.__JACES_PRODUCTS_CACHE : [];
    return cache.map((product) => buildProduct(product));
  }

  window.JacesCatalog = {
    normalizeId,
    buildProduct,
    getProductById,
    getAllProducts,
    buildProductUrl,
    getPageContext,
    resolveContext,
    getOriginContextFromSearch,
    getProductUrl(product, context) {
      return buildProductUrl(buildProduct(product), context);
    }
  };
})();