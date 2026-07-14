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
    if (action === 'delete') {
      const id = Number(body.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'id invalide' });

      const relDel = await supabase.from('product_filters').delete().eq('filter_id', id);
      if (relDel.error) return res.status(500).json({ error: withRlsHint('product_filters (delete): ' + relDel.error.message) });

      const { error } = await supabase.from('filters').delete().eq('id', id);
      if (error) return res.status(500).json({ error: withRlsHint('filters (delete): ' + error.message) });

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'action invalide (attendu: delete)' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
