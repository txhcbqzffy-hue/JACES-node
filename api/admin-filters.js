const { createClient } = require('@supabase/supabase-js');

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || 'https://uxhzrobxhumreuntxrzw.supabase.co';
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

const ALLOWED_MENUS = new Set(['categories', 'nouveautes', 'accessoires', 'collaborations', 'collections']);

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
    if (action === 'create') {
      const menu = String(body.menu || '').trim();
      const label = String(body.label || '').trim();
      const position = Number.isFinite(Number(body.position)) ? Number(body.position) : null;

      if (!ALLOWED_MENUS.has(menu)) return res.status(400).json({ error: 'menu invalide' });
      if (!label) return res.status(400).json({ error: 'label requis' });

      let nextPosition = position;
      if (nextPosition === null) {
        const { data: existing, error: existingError } = await supabase
          .from('filters')
          .select('position')
          .eq('menu', menu)
          .order('position', { ascending: false, nullsFirst: false })
          .limit(1);

        if (existingError) return res.status(500).json({ error: withRlsHint('filters (select): ' + existingError.message) });
        nextPosition = existing && existing.length ? Number(existing[0].position || 0) + 1 : 0;
      }

      const { data, error } = await supabase
        .from('filters')
        .insert({ menu, label, position: nextPosition, is_active: true })
        .select('*')
        .single();

      if (error) return res.status(500).json({ error: withRlsHint('filters (insert): ' + error.message) });

      return res.status(200).json({ ok: true, filter: data });
    }

    return res.status(400).json({ error: 'action invalide (attendu: create)' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
