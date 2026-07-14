const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://uxhzrobxhumreuntxrzw.supabase.co',
  process.env.SUPABASE_KEY || 'sb_publishable_VsHXPk-y4UTt4R7aAbidXg_MtIbEAhp'
);

function normalizeToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function slugify(value) {
  return normalizeToken(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function asNumber(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
}

function parseVariantStock(variant) {
  if (!variant || typeof variant !== 'object') return 0;

  const direct = [variant.stock, variant.stock_qty, variant.stock_quantity, variant.quantity, variant.qty, variant.inventory];
  for (const candidate of direct) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }

  if (typeof variant.in_stock === 'boolean') {
    return variant.in_stock ? 1 : 0;
  }

  return 0;
}

function getPageMenus(pageName) {
  const normalizedPage = normalizeToken(pageName);
  if (!normalizedPage) return [];

  const map = {
    'collection': ['categories', 'collections'],
    'nouveautes': ['nouveautes'],
    'collaborations': ['collaborations'],
    'collaboration': ['collaborations'],
    'accessoires': ['accessoires']
  };

  return map[normalizedPage] || [];
}

function isCloudinaryUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;

  try {
    const parsed = new URL(raw);
    return parsed.hostname.toLowerCase() === 'res.cloudinary.com';
  } catch (error) {
    return false;
  }
}

function withRlsHint(source, errorMessage) {
  const payload = { source, error: errorMessage };
  if (/permission denied|rls|policy|not allowed/i.test(String(errorMessage || ''))) {
    payload.rls_hint = 'Autoriser SELECT pour le role anon sur les tables filters, product_filters et product_variants.';
  }
  return payload;
}

module.exports = async function handler(req, res) {
  // CORS - necessaire pour les appels depuis le frontend Vercel.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const requestedId = req.query?.id || null;
    const incomingFilter = req.query?.filterId || req.query?.filter || null;
    const incomingFilterSlug = req.query?.filterSlug || null;
    const incomingPage = req.query?.page || null;
    const includeDiagnostics = String(req.query?.debug || '') === '1';

    const [{ data: filters, error: filtersError }, { data: allRelations, error: relationsError }] = await Promise.all([
      supabase.from('filters').select('*'),
      supabase.from('product_filters').select('product_id, filter_id')
    ]);

    if (filtersError) {
      return res.status(500).json(withRlsHint('filters', filtersError.message));
    }

    if (relationsError) {
      return res.status(500).json(withRlsHint('product_filters', relationsError.message));
    }

    const safeFilters = Array.isArray(filters) ? filters : [];
    const safeRelations = Array.isArray(allRelations) ? allRelations : [];
    const filtersById = new Map(safeFilters.map((filter) => [String(filter.id), filter]));

    const activeFilterIds = new Set();
    if (incomingFilter) {
      activeFilterIds.add(String(incomingFilter));
    }

    if (incomingFilterSlug) {
      const normalizedRequestedSlug = slugify(incomingFilterSlug);
      const matched = safeFilters.find((filter) => {
        const slug = slugify(filter.slug || filter.code || filter.label || filter.name);
        return slug && slug === normalizedRequestedSlug;
      });
      if (matched) {
        activeFilterIds.add(String(matched.id));
      } else {
        return res.status(200).json([]);
      }
    }

    if (!activeFilterIds.size && incomingPage) {
      const pageMenus = getPageMenus(incomingPage);
      if (pageMenus.length) {
        safeFilters.forEach((filter) => {
          const normalizedMenu = normalizeToken(filter.menu);
          if (pageMenus.includes(normalizedMenu)) {
            activeFilterIds.add(String(filter.id));
          }
        });
      }
    }

    let filteredProductIds = null;
    if (activeFilterIds.size) {
      const ids = safeRelations
        .filter((row) => activeFilterIds.has(String(row.filter_id)))
        .map((row) => row.product_id)
        .filter((value) => value !== null && value !== undefined);
      filteredProductIds = [...new Set(ids.map((id) => String(id)))];

      if (!filteredProductIds.length) {
        return res.status(200).json([]);
      }
    }

    let productsQuery = supabase.from('products').select('*');
    if (requestedId) {
      productsQuery = productsQuery.eq('id', requestedId);
    }
    if (Array.isArray(filteredProductIds) && filteredProductIds.length) {
      productsQuery = productsQuery.in('id', filteredProductIds);
    }

    const { data: products, error: productsError } = await productsQuery;

    if (productsError) {
      return res.status(500).json(withRlsHint('products', productsError.message));
    }

    const safeProducts = Array.isArray(products) ? products : [];
    if (!safeProducts.length) {
      return res.status(200).json([]);
    }

    const productIds = safeProducts.map((product) => String(product.id));

    const [{ data: images, error: imagesError }, { data: variants, error: variantsError }] = await Promise.all([
      supabase
        .from('product_images')
        .select('*')
        .in('product_id', productIds)
        .order('product_id', { ascending: true })
        .order('position', { ascending: true, nullsFirst: true }),
      supabase
        .from('product_variants')
        .select('*')
        .in('product_id', productIds)
    ]);

    if (imagesError) {
      return res.status(500).json(withRlsHint('product_images', imagesError.message));
    }

    if (variantsError) {
      return res.status(500).json(withRlsHint('product_variants', variantsError.message));
    }

    const imagesByProduct = new Map();
    (images || []).forEach((image) => {
      const key = String(image.product_id);
      if (!imagesByProduct.has(key)) imagesByProduct.set(key, []);
      imagesByProduct.get(key).push(image);
    });

    const variantsByProduct = new Map();
    (variants || []).forEach((variant) => {
      const key = String(variant.product_id);
      if (!variantsByProduct.has(key)) variantsByProduct.set(key, []);
      variantsByProduct.get(key).push(variant);
    });

    const filtersByProduct = new Map();
    safeRelations.forEach((relation) => {
      const productKey = String(relation.product_id);
      if (!filtersByProduct.has(productKey)) filtersByProduct.set(productKey, []);

      const filter = filtersById.get(String(relation.filter_id));
      if (!filter) return;
      filtersByProduct.get(productKey).push(filter);
    });

    const mapped = safeProducts.map((product) => {
      const key = String(product.id);
      const productImages = (imagesByProduct.get(key) || []).slice().sort((a, b) => {
        return asNumber(a.position, Number.MAX_SAFE_INTEGER) - asNumber(b.position, Number.MAX_SAFE_INTEGER);
      });
      const productVariants = (variantsByProduct.get(key) || []).slice();
      const productFilters = (filtersByProduct.get(key) || []).slice();

      const sortedImages = productImages.map((image, index) => ({
        ...image,
        position: asNumber(image.position, index)
      }));

      const normalizedVariants = productVariants.map((variant) => {
        const stock = parseVariantStock(variant);
        return {
          ...variant,
          stock,
          size: variant.size || variant.taille || '',
          color: variant.color || variant.couleur || ''
        };
      });

      const availableVariants = normalizedVariants.filter((variant) => variant.stock > 0);

      const sizes = [...new Set(
        (availableVariants.length ? availableVariants : normalizedVariants)
          .map((variant) => String(variant.size || '').trim())
          .filter(Boolean)
      )];

      const colors = [...new Set(
        (availableVariants.length ? availableVariants : normalizedVariants)
          .map((variant) => String(variant.color || '').trim())
          .filter(Boolean)
      )];

      const imageUrls = sortedImages.map((image) => String(image.url || '').trim()).filter(Boolean);
      const mainImage = imageUrls[0] || '';
      const hoverImage = imageUrls[1] || mainImage;

      const filterIds = [...new Set(productFilters.map((filter) => String(filter.id)))];
      const filterTokens = productFilters
        .map((filter) => slugify(filter.slug || filter.code || filter.label || filter.name))
        .filter(Boolean);

      const filterMenus = productFilters.reduce((acc, filter) => {
        const normalizedMenu = normalizeToken(filter.menu);
        if (!normalizedMenu) return acc;
        if (!acc[normalizedMenu]) acc[normalizedMenu] = [];

        acc[normalizedMenu].push({
          id: filter.id,
          label: filter.label || filter.name || 'Filtre',
          slug: filter.slug || slugify(filter.label || filter.name)
        });
        return acc;
      }, {});

      const cloudinaryWarnings = imageUrls
        .filter((url) => !isCloudinaryUrl(url))
        .map((url) => ({ type: 'non_cloudinary_image', url }));

      const nouveauteTags = [...new Set(
        (filterMenus.nouveautes || []).map((filter) => filter.slug).filter(Boolean)
      )];
      if (!nouveauteTags.length && product.nouveaute_tag) {
        const legacyTag = slugify(product.nouveaute_tag);
        if (legacyTag) nouveauteTags.push(legacyTag);
      }

      return {
        ...product,
        images: sortedImages,
        all_images: imageUrls,
        image_url: mainImage,
        hover_image_url: hoverImage,
        img: mainImage,
        secondaryImg: imageUrls[1] || mainImage,
        tertiaryImg: imageUrls[2] || imageUrls[1] || mainImage,
        quaternaryImg: imageUrls[3] || imageUrls[2] || imageUrls[1] || mainImage,
        variants: normalizedVariants,
        available_variants: availableVariants,
        sizes,
        colors,
        stock_total: availableVariants.reduce((sum, variant) => sum + Math.max(0, Number(variant.stock || 0)), 0),
        filter_ids: filterIds,
        filter_tokens: [...new Set(filterTokens)],
        filter_menus: filterMenus,
        filters: productFilters,
        nouveauteTags,
        diagnostics: includeDiagnostics ? { cloudinaryWarnings } : undefined
      };
    });

    return res.status(200).json(mapped);
  } catch (error) {
    return res.status(500).json({
      source: 'API crashed',
      error: error.message
    });
  }
};