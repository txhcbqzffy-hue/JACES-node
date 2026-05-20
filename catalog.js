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

  const baseProducts = {
    'jupe-plissee': {
      id: 'jupe-plissee',
      name: 'Jupe plissée',
      price: '155€',
      img: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80',
      sizes: ['34', '36', '38', '40', '42'],
      colors: ['Noir', 'Beige', 'Ivoire'],
      description: 'Une jupe fluide à plis réguliers, pensée pour accompagner les silhouettes de jour comme de soirée.'
    },
    'top-en-soie': {
      id: 'top-en-soie',
      name: 'Top en soie',
      price: '135€',
      img: 'https://images.unsplash.com/photo-1463100099107-aa0980c362e6?q=80&w=900',
      sizes: ['XS', 'S', 'M', 'L'],
      colors: ['Ivoire', 'Noir', 'Taupe'],
      description: 'Un top léger et satiné, au tombé précis, conçu pour une allure raffinée et effortless.'
    },
    'chemise-blanche': {
      id: 'chemise-blanche',
      name: 'Top blanc',
      price: '98€',
      img: 'https://images.unsplash.com/photo-1495121605193-b116b5b9c2b9?auto=format&fit=crop&w=900&q=80',
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: ['Blanc', 'Ivoire'],
      description: 'Un top blanc essentiel, revisité avec une coupe nette et une matière lumineuse.'
    },
    'short-structure': {
      id: 'short-structure',
      name: 'Short structuré',
      price: '140€',
      img: 'https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?auto=format&fit=crop&w=900&q=80',
      sizes: ['34', '36', '38', '40'],
      colors: ['Noir', 'Beige'],
      description: 'Un short structuré au tombé couture, pensé pour des ensembles nets et contemporains.'
    },
    'veste-en-cuir': {
      id: 'veste-en-cuir',
      name: 'Veste en cuir',
      price: '265€',
      img: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=900',
      sizes: ['XS', 'S', 'M', 'L'],
      colors: ['Noir', 'Marine'],
      description: 'Une veste en cuir souple qui apporte de la structure et une tension mode à la silhouette.'
    },
    'top-crochete': {
      id: 'top-crochete',
      name: 'Top crocheté',
      price: '175€',
      img: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?q=80&w=900',
      sizes: ['XS', 'S', 'M', 'L'],
      colors: ['Ivoire', 'Rose poudre'],
      description: 'Un top texturé au toucher délicat, pensé comme une pièce forte de superposition.'
    },
    'blouse-fluide': {
      id: 'blouse-fluide',
      name: 'Top fluide',
      price: '125€',
      img: 'https://dl.dropboxusercontent.com/scl/fi/kf4rmja6pww8ucxg91b9j/Blouse-fluide-rose-1.png?rlkey=lo5jotwk32ckia3xdpk4pt6rh&st=z3yp196u',
      secondaryImg: 'https://dl.dropboxusercontent.com/scl/fi/nr8qiv5qcjqn0rmjie3cd/Blouse-fluide-rose-2.png?rlkey=g051g871misgomhj06rxdbwqz&st=5rehs96t',
      tertiaryImg: 'https://dl.dropboxusercontent.com/scl/fi/ipwcwna5ajzesfthb1f7k/Blouse-fluide-rose-3.png?rlkey=x4gx3o6er7ix0kox0jbaz8754&st=fdlxyrta',
      quaternaryImg: 'https://dl.dropboxusercontent.com/scl/fi/loe7z9q1piz66vgwdfdyd/Blouse-fluide-rose-4.png?rlkey=3dzgmapfk3s3qbjmpryisg2by&st=bpvxf0p8',
      sizes: ['34', '36', '38', '40', '42', '44'],
      colors: ['Rose', 'Ivoire'],
      description: 'Un top fluide et lumineux, pensé pour une silhouette souple et élégante du matin au soir.'
    },
    'robe-portefeuille-imprimee': {
      id: 'robe-portefeuille-imprimee',
      name: 'Robe portefeuille imprimée',
      price: '295€',
      img: 'https://images.unsplash.com/photo-1485968579580-b6d095142e6e?q=80&w=1200',
      sizes: ['34', '36', '38', '40', '42'],
      colors: ['Noir', 'Beige'],
      description: 'Une robe portefeuille imprimée, fluide et féminine, qui accompagne le mouvement avec élégance.'
    },
    'sac-a-bandouliere': {
      id: 'sac-a-bandouliere',
      name: 'Sac à bandoulière',
      price: '138€',
      img: 'https://images.unsplash.com/photo-1463100099107-aa0980c362e6?auto=format&fit=crop&w=900&q=80',
      sizes: [],
      colors: ['Noir', 'Camel'],
      description: 'Un sac compact et graphique, pensé pour accompagner les essentiels du quotidien.'
    },
    'mules-elegantes': {
      id: 'mules-elegantes',
      name: 'Accessoire élégant',
      price: '150€',
      img: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
      sizes: [],
      colors: ['Ivoire', 'Noir'],
      description: 'Un accessoire à la ligne pure, facile à porter et immédiatement sophistiqué.'
    },
    'ceinture-fine': {
      id: 'ceinture-fine',
      name: 'Ceinture fine',
      price: '65€',
      img: 'https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?auto=format&fit=crop&w=900&q=80',
      sizes: [],
      colors: ['Noir', 'Camel'],
      description: 'Une ceinture minimaliste pour structurer les silhouettes et signer la taille.'
    },
    'boucles-doreilles': {
      id: 'boucles-doreilles',
      name: 'Boucles d’oreilles',
      price: '75€',
      img: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=900&q=80',
      sizes: [],
      colors: ['Dore', 'Argent'],
      description: 'Des boucles d’oreilles graphiques, pensées pour illuminer le visage en un geste.'
    }
  };

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
    const baseProduct = baseProducts[normalizedId] || {};
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
    const product = baseProducts[normalizedId];
    return product ? buildProduct(product) : null;
  }

  function getAllProducts() {
    return Object.values(baseProducts).map((product) => buildProduct(product));
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