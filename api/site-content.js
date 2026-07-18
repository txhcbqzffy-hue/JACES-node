const { createClient } = require('@supabase/supabase-js');

function getSupabaseAnon() {
  return createClient(
    process.env.SUPABASE_URL || 'https://uxhzrobxhumreuntxrzw.supabase.co',
    process.env.SUPABASE_KEY || 'sb_publishable_VsHXPk-y4UTt4R7aAbidXg_MtIbEAhp'
  );
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || 'https://uxhzrobxhumreuntxrzw.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!serviceKey) {
    throw new Error('Aucune cle Supabase configuree (SUPABASE_SERVICE_KEY ou SUPABASE_KEY).');
  }
  return createClient(url, serviceKey);
}

function isAuthorized(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const provided = req.headers['x-admin-password'];
  return typeof provided === 'string' && provided === expected;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      const supabase = getSupabaseAnon();
      const { data, error } = await supabase.from('site_content').select('key, value');
      // Degrade gracefully to an empty object so every page's fallback
      // (hardcoded) text/images stay untouched if the table isn't reachable.
      if (error) return res.status(200).json({});
      const content = {};
      (data || []).forEach((row) => { content[row.key] = row.value; });
      return res.status(200).json(content);
    } catch (error) {
      return res.status(200).json({});
    }
  }

  if (req.method === 'POST') {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: 'Mot de passe invalide.' });
    }
    try {
      const updates = req.body || {};
      const rows = Object.entries(updates)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => ({ key, value: value.trim() }));
      if (!rows.length) {
        return res.status(400).json({ error: 'Aucune donnee a enregistrer.' });
      }
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from('site_content').upsert(rows, { onConflict: 'key' });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Methode non supportee' });
};
