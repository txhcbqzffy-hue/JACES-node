const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://uxhzrobxhumreuntxrzw.supabase.co',
  'sb_publishable_VsHXPk-y4UTt4R7aAbidXg_MtIbEAhp'
);

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

async function checkTable(table) {
  const startedAt = Date.now();
  const { data, error } = await supabase.from(table).select('*', { count: 'exact', head: false }).limit(1);
  const durationMs = Date.now() - startedAt;

  if (error) {
    return {
      table,
      ok: false,
      durationMs,
      error: error.message,
      hint: /permission|rls|policy|not allowed/i.test(String(error.message || ''))
        ? 'Lecture bloquee: verifier les policies RLS SELECT pour role anon.'
        : undefined
    };
  }

  return {
    table,
    ok: true,
    durationMs,
    sampledRows: Array.isArray(data) ? data.length : 0
  };
}

module.exports = async function handler(req, res) {
  try {
    const tables = ['products', 'product_images', 'product_variants', 'filters', 'product_filters'];
    const checks = [];

    for (const table of tables) {
      checks.push(await checkTable(table));
    }

    const relationChecks = [];

    const { data: images, error: imagesError } = await supabase
      .from('product_images')
      .select('product_id, url')
      .limit(500);

    if (imagesError) {
      relationChecks.push({
        name: 'product_images -> products',
        ok: false,
        error: imagesError.message
      });
    } else {
      const imageRows = Array.isArray(images) ? images : [];
      const productIds = [...new Set(imageRows.map((row) => row.product_id).filter((id) => id !== null && id !== undefined))];
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id')
        .in('id', productIds.length ? productIds : ['__none__']);

      if (productsError) {
        relationChecks.push({ name: 'product_images -> products', ok: false, error: productsError.message });
      } else {
        const knownIds = new Set((products || []).map((row) => String(row.id)));
        const orphans = productIds.filter((id) => !knownIds.has(String(id)));
        relationChecks.push({
          name: 'product_images -> products',
          ok: orphans.length === 0,
          orphanCount: orphans.length,
          orphanProductIds: orphans.slice(0, 20)
        });
      }

      const nonCloudinary = imageRows
        .map((row) => String(row.url || '').trim())
        .filter(Boolean)
        .filter((url) => !isCloudinaryUrl(url));

      relationChecks.push({
        name: 'cloudinary_urls',
        ok: nonCloudinary.length === 0,
        nonCloudinaryCount: nonCloudinary.length,
        examples: nonCloudinary.slice(0, 10)
      });
    }

    const { data: pfRows, error: pfError } = await supabase
      .from('product_filters')
      .select('product_id, filter_id')
      .limit(1000);

    if (pfError) {
      relationChecks.push({ name: 'product_filters relations', ok: false, error: pfError.message });
    } else {
      const relations = Array.isArray(pfRows) ? pfRows : [];
      const pfProductIds = [...new Set(relations.map((row) => row.product_id).filter((id) => id !== null && id !== undefined))];
      const pfFilterIds = [...new Set(relations.map((row) => row.filter_id).filter((id) => id !== null && id !== undefined))];

      const [{ data: products }, { data: filters }] = await Promise.all([
        supabase.from('products').select('id').in('id', pfProductIds.length ? pfProductIds : ['__none__']),
        supabase.from('filters').select('id').in('id', pfFilterIds.length ? pfFilterIds : ['__none__'])
      ]);

      const productSet = new Set((products || []).map((row) => String(row.id)));
      const filterSet = new Set((filters || []).map((row) => String(row.id)));

      const orphanProducts = pfProductIds.filter((id) => !productSet.has(String(id)));
      const orphanFilters = pfFilterIds.filter((id) => !filterSet.has(String(id)));

      relationChecks.push({
        name: 'product_filters -> products',
        ok: orphanProducts.length === 0,
        orphanCount: orphanProducts.length,
        orphanProductIds: orphanProducts.slice(0, 20)
      });

      relationChecks.push({
        name: 'product_filters -> filters',
        ok: orphanFilters.length === 0,
        orphanCount: orphanFilters.length,
        orphanFilterIds: orphanFilters.slice(0, 20)
      });
    }

    const ok = checks.every((check) => check.ok) && relationChecks.every((check) => check.ok);

    return res.status(200).json({
      ok,
      checkedAt: new Date().toISOString(),
      checks,
      relationChecks
    });
  } catch (error) {
    return res.status(500).json({
      source: 'health',
      error: error.message
    });
  }
};
