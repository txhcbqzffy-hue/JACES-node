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

function getMenusForPage(pageName) {
  const map = {
    collection: ['categories', 'collections'],
    nouveautes: ['nouveautes'],
    collaborations: ['collaborations'],
    collaboration: ['collaborations'],
    accessoires: ['accessoires']
  };
  return map[normalizeToken(pageName)] || [];
}

function withRlsHint(source, errorMessage) {
  const payload = { source, error: errorMessage };
  if (/permission denied|rls|policy|not allowed/i.test(String(errorMessage || ''))) {
    payload.rls_hint = 'Autoriser SELECT pour le role anon sur la table filters.';
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
    const requestedMenu = req.query?.menu || null;
    const requestedPage = req.query?.page || null;

    const { data, error } = await supabase
      .from('filters')
      .select('*')
      .order('menu', { ascending: true })
      .order('position', { ascending: true, nullsFirst: true })
      .order('label', { ascending: true });

    if (error) {
      return res.status(500).json(withRlsHint('filters', error.message));
    }

    const rows = Array.isArray(data) ? data : [];
    let filtered = rows;

    if (requestedMenu) {
      const normalizedMenu = normalizeToken(requestedMenu);
      filtered = filtered.filter((row) => normalizeToken(row.menu) === normalizedMenu);
    }

    if (requestedPage) {
      const menus = getMenusForPage(requestedPage);
      if (menus.length) {
        filtered = filtered.filter((row) => menus.includes(normalizeToken(row.menu)));
      }
    }

    const enriched = filtered.map((row) => ({
      ...row,
      slug: row.slug || slugify(row.code || row.label || row.name || row.id)
    }));

    return res.status(200).json(enriched);
  } catch (error) {
    return res.status(500).json({
      source: 'API crashed',
      error: error.message
    });
  }
};
