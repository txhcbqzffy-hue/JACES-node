const { createClient } = require('@supabase/supabase-js');
const { sendRestockEmail } = require('../lib/brevo');

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || 'https://uxhzrobxhumreuntxrzw.supabase.co';
  // Prefer a real service-role key (bypasses RLS for writes). Fall back to the
  // existing SUPABASE_KEY so this works out of the box, but that var usually
  // holds the anon/publishable key, which RLS may block from writing.
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  if (!serviceKey) {
    throw new Error('Aucune cle Supabase configuree (SUPABASE_SERVICE_KEY ou SUPABASE_KEY).');
  }

  return createClient(url, serviceKey);
}

function withRlsHint(message) {
  if (/permission denied|rls|policy|not allowed/i.test(String(message || ''))) {
    return message + ' -- La cle Supabase utilisee n\'a probablement pas les droits d\'ecriture: ajoutez SUPABASE_SERVICE_KEY (cle service_role, pas anon) dans les variables d\'environnement Vercel.';
  }
  return message;
}

function isAuthorized(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const provided = req.headers['x-admin-password'];
  return typeof provided === 'string' && provided === expected;
}

function toPrice(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeImages(images) {
  return (Array.isArray(images) ? images : [])
    .map((url) => String(url || '').trim())
    .filter(Boolean);
}

function sanitizeVariants(variants) {
  return (Array.isArray(variants) ? variants : [])
    .map((variant) => ({
      size: String(variant?.size || '').trim(),
      color: String(variant?.color || '').trim(),
      stock: Number.isFinite(Number(variant?.stock)) ? Math.max(0, Number(variant.stock)) : 0
    }))
    .filter((variant) => variant.size || variant.color);
}

function sanitizeFilterIds(filterIds) {
  return [...new Set((Array.isArray(filterIds) ? filterIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id)))];
}

function sanitizeReviewPhotos(reviewPhotos) {
  return (Array.isArray(reviewPhotos) ? reviewPhotos : [])
    .map((url) => String(url || '').trim())
    .filter(Boolean);
}

const VALID_MATERIALS = new Set(['cuir', 'metal', 'soie', 'laine', 'coton']);

function sanitizeMaterials(materials) {
  return [...new Set((Array.isArray(materials) ? materials : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => VALID_MATERIALS.has(value)))];
}

function sanitizeReviews(reviews) {
  return (Array.isArray(reviews) ? reviews : [])
    .map((review) => ({
      author: String(review?.author || '').trim(),
      rating: Math.max(1, Math.min(5, Number(review?.rating) || 5)),
      text: String(review?.text || '').trim()
    }))
    .filter((review) => review.text);
}

async function replaceProductChildren(supabase, productId, { images, variants, filterIds, reviews }) {
  const [imagesDel, variantsDel, filtersDel, reviewsDel] = await Promise.all([
    supabase.from('product_images').delete().eq('product_id', productId),
    supabase.from('product_variants').delete().eq('product_id', productId),
    supabase.from('product_filters').delete().eq('product_id', productId),
    // product_reviews is a newer, optional table - a missing table here must
    // never abort the function before images/variants/filters are
    // re-inserted below (that previously wiped a product's real images with
    // no way to restore them, since the delete succeeded but the insert was
    // never reached).
    supabase.from('product_reviews').delete().eq('product_id', productId).then((result) => result, (error) => ({ error }))
  ]);

  if (imagesDel.error) throw new Error('product_images (delete): ' + imagesDel.error.message);
  if (variantsDel.error) throw new Error('product_variants (delete): ' + variantsDel.error.message);
  if (filtersDel.error) throw new Error('product_filters (delete): ' + filtersDel.error.message);
  const reviewsTableMissing = /could not find the table/i.test(String(reviewsDel?.error?.message || ''));
  if (reviewsDel?.error && !reviewsTableMissing) throw new Error('product_reviews (delete): ' + reviewsDel.error.message);

  if (images.length) {
    const rows = images.map((url, index) => ({ product_id: productId, url, position: index + 1 }));
    const { error } = await supabase.from('product_images').insert(rows);
    if (error) throw new Error('product_images (insert): ' + error.message);
  }

  if (variants.length) {
    // size is a Postgres enum column: an empty string isn't a valid enum
    // value and would crash the insert, so accessories (color+stock, no
    // size) need null here instead.
    const rows = variants.map((variant) => ({ product_id: productId, size: variant.size || null, color: variant.color, stock: variant.stock }));
    const { error } = await supabase.from('product_variants').insert(rows);
    if (error) throw new Error('product_variants (insert): ' + error.message);
  }

  if (filterIds.length) {
    const rows = filterIds.map((filterId) => ({ product_id: productId, filter_id: filterId }));
    const { error } = await supabase.from('product_filters').insert(rows);
    if (error) throw new Error('product_filters (insert): ' + error.message);
  }

  if (Array.isArray(reviews) && reviews.length) {
    const rows = reviews.map((review) => ({ product_id: productId, author: review.author, rating: review.rating, review_text: review.text }));
    const { error } = await supabase.from('product_reviews').insert(rows);
    if (error && !/could not find the table/i.test(String(error.message || ''))) {
      throw new Error('product_reviews (insert): ' + error.message);
    }
  }
}

function getStockBySize(variants) {
  const stockBySize = new Map();
  (variants || []).forEach((variant) => {
    const size = String(variant?.size || '').trim();
    if (!size) return;
    const stock = Number.isFinite(Number(variant?.stock)) ? Number(variant.stock) : 0;
    stockBySize.set(size, (stockBySize.get(size) || 0) + Math.max(0, stock));
  });
  return stockBySize;
}

function getRestockedSizes(beforeStockBySize, afterVariants) {
  const afterStockBySize = getStockBySize(afterVariants);
  const restocked = [];
  afterStockBySize.forEach((stock, size) => {
    const wasOutOfStock = !beforeStockBySize.has(size) || beforeStockBySize.get(size) <= 0;
    if (wasOutOfStock && stock > 0) restocked.push(size);
  });
  return restocked;
}

// Fire-and-forget: notification delivery must never fail or delay the
// product save itself, so every step here is best-effort and logged only.
async function notifyRestockedSizes(supabase, productId, productName, restockedSizes) {
  if (!restockedSizes.length) return;

  for (const size of restockedSizes) {
    try {
      const { data: pending, error } = await supabase
        .from('stock_notifications')
        .select('id, email')
        .eq('product_id', productId)
        .eq('size', size)
        .eq('notified', false);

      if (error || !pending || !pending.length) continue;

      const productUrl = `https://jaces-node.vercel.app/detail-produit.html?id=${productId}`;

      for (const row of pending) {
        const result = await sendRestockEmail({ toEmail: row.email, productName, size, productUrl });
        if (result.ok) {
          await supabase.from('stock_notifications').update({ notified: true }).eq('id', row.id);
        } else if (!result.skipped) {
          console.error('Brevo send failed:', result.error);
        }
      }
    } catch (notifyError) {
      console.error('notifyRestockedSizes error:', notifyError.message);
    }
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non supportee' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Mot de passe admin invalide' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  const body = req.body || {};
  const action = String(body.action || '').trim();

  try {
    if (action === 'ping') {
      return res.status(200).json({ ok: true });
    }

    if (action === 'diag_reviews') {
      const { data, error, count } = await supabase.from('product_reviews').select('*', { count: 'exact' });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ count, data });
    }

    if (action === 'delete') {
      const productId = String(body.id || '').trim();
      if (!productId) return res.status(400).json({ error: 'id manquant' });

      await replaceProductChildren(supabase, productId, { images: [], variants: [], filterIds: [], reviews: [] });
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) return res.status(500).json({ error: 'products (delete): ' + error.message });

      return res.status(200).json({ ok: true });
    }

    if (action === 'create' || action === 'update') {
      const name = String(body.name || '').trim();
      const price = toPrice(body.price);
      const description = String(body.description || '').trim();
      const styleNotes = String(body.styleNotes || '').trim();
      const careInstructions = String(body.careInstructions || '').trim();
      const showInRelated = Boolean(body.showInRelated);
      const fitRating = String(body.fitRating || 'normal').trim();
      const qualityRating = String(body.qualityRating || 'premium').trim();
      const category = String(body.category || '').trim();
      const pageType = String(body.pageType || '').trim();
      const nouveauteTag = String(body.nouveauteTag || '').trim();
      const images = sanitizeImages(body.images);
      const variants = sanitizeVariants(body.variants);
      const filterIds = sanitizeFilterIds(body.filterIds);
      const reviewPhotos = sanitizeReviewPhotos(body.reviewPhotos);
      const reviews = sanitizeReviews(body.reviews);
      const material = sanitizeMaterials(body.material);

      if (!name) return res.status(400).json({ error: 'Le nom du produit est requis' });
      if (!images.length) return res.status(400).json({ error: 'Au moins une image est requise' });

      const productRow = {
        name,
        price,
        description,
        style_notes: styleNotes || null,
        care_instructions: careInstructions || null,
        show_in_related: showInRelated,
        fit_rating: fitRating,
        quality_rating: qualityRating,
        review_photos: reviewPhotos,
        material,
        category: category || null,
        page_type: pageType || null,
        nouveaute_tag: nouveauteTag || null
      };

      let productId = String(body.id || '').trim();
      let beforeStockBySize = new Map();

      if (action === 'create') {
        const { data, error } = await supabase.from('products').insert(productRow).select('id').single();
        if (error) return res.status(500).json({ error: withRlsHint('products (insert): ' + error.message) });
        productId = data.id;
      } else {
        if (!productId) return res.status(400).json({ error: 'id manquant pour la mise a jour' });
        const { data: existingVariants } = await supabase.from('product_variants').select('size, stock').eq('product_id', productId);
        beforeStockBySize = getStockBySize(existingVariants);
        const { error } = await supabase.from('products').update(productRow).eq('id', productId);
        if (error) return res.status(500).json({ error: withRlsHint('products (update): ' + error.message) });
      }

      await replaceProductChildren(supabase, productId, { images, variants, filterIds, reviews });

      if (action === 'update') {
        // Awaited rather than fire-and-forget: Vercel serverless functions
        // don't guarantee background work continues after the response is
        // sent, so notifications must complete within this invocation.
        const restockedSizes = getRestockedSizes(beforeStockBySize, variants);
        await notifyRestockedSizes(supabase, productId, name, restockedSizes);
      }

      return res.status(200).json({ ok: true, id: productId });
    }

    return res.status(400).json({ error: 'action invalide (attendu: create, update, delete)' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
