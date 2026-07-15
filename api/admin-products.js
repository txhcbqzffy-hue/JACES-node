const { createClient } = require('@supabase/supabase-js');

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

async function replaceProductChildren(supabase, productId, { images, variants, filterIds }) {
  const [imagesDel, variantsDel, filtersDel] = await Promise.all([
    supabase.from('product_images').delete().eq('product_id', productId),
    supabase.from('product_variants').delete().eq('product_id', productId),
    supabase.from('product_filters').delete().eq('product_id', productId)
  ]);

  if (imagesDel.error) throw new Error('product_images (delete): ' + imagesDel.error.message);
  if (variantsDel.error) throw new Error('product_variants (delete): ' + variantsDel.error.message);
  if (filtersDel.error) throw new Error('product_filters (delete): ' + filtersDel.error.message);

  if (images.length) {
    const rows = images.map((url, index) => ({ product_id: productId, url, position: index + 1 }));
    const { error } = await supabase.from('product_images').insert(rows);
    if (error) throw new Error('product_images (insert): ' + error.message);
  }

  if (variants.length) {
    const rows = variants.map((variant) => ({ product_id: productId, size: variant.size, color: variant.color, stock: variant.stock }));
    const { error } = await supabase.from('product_variants').insert(rows);
    if (error) throw new Error('product_variants (insert): ' + error.message);
  }

  if (filterIds.length) {
    const rows = filterIds.map((filterId) => ({ product_id: productId, filter_id: filterId }));
    const { error } = await supabase.from('product_filters').insert(rows);
    if (error) throw new Error('product_filters (insert): ' + error.message);
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

    if (action === 'delete') {
      const productId = String(body.id || '').trim();
      if (!productId) return res.status(400).json({ error: 'id manquant' });

      await replaceProductChildren(supabase, productId, { images: [], variants: [], filterIds: [] });
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
      const category = String(body.category || '').trim();
      const pageType = String(body.pageType || '').trim();
      const nouveauteTag = String(body.nouveauteTag || '').trim();
      const images = sanitizeImages(body.images);
      const variants = sanitizeVariants(body.variants);
      const filterIds = sanitizeFilterIds(body.filterIds);

      if (!name) return res.status(400).json({ error: 'Le nom du produit est requis' });
      if (!images.length) return res.status(400).json({ error: 'Au moins une image est requise' });

      const productRow = {
        name,
        price,
        description,
        style_notes: styleNotes || null,
        care_instructions: careInstructions || null,
        category: category || null,
        page_type: pageType || null,
        nouveaute_tag: nouveauteTag || null
      };

      let productId = String(body.id || '').trim();

      if (action === 'create') {
        const { data, error } = await supabase.from('products').insert(productRow).select('id').single();
        if (error) return res.status(500).json({ error: withRlsHint('products (insert): ' + error.message) });
        productId = data.id;
      } else {
        if (!productId) return res.status(400).json({ error: 'id manquant pour la mise a jour' });
        const { error } = await supabase.from('products').update(productRow).eq('id', productId);
        if (error) return res.status(500).json({ error: withRlsHint('products (update): ' + error.message) });
      }

      await replaceProductChildren(supabase, productId, { images, variants, filterIds });

      return res.status(200).json({ ok: true, id: productId });
    }

    return res.status(400).json({ error: 'action invalide (attendu: create, update, delete)' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
