const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL || 'https://uxhzrobxhumreuntxrzw.supabase.co';
  // Service-role key, same reasoning as stock-notifications: this needs to
  // work for any signed-in visitor even before an RLS insert policy exists.
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_VsHXPk-y4UTt4R7aAbidXg_MtIbEAhp';
  return createClient(url, key);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

async function handlePost(req, res, supabase) {
  const body = req.body || {};
  const query = String(body.query || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const firstName = String(body.firstName || '').trim();
  const userId = String(body.userId || '').trim();

  if (!query || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Parametres invalides' });
  }

  // Plain insert, not upsert: an ON CONFLICT clause (even DO NOTHING)
  // needs the row-level security policy to resolve the conflict check
  // itself under RLS, which the anon/publishable key can't satisfy here
  // - a duplicate (same query+email, already alerted) is caught below via
  // its unique-constraint error instead and treated as success.
  const { error } = await supabase
    .from('search_alerts')
    .insert({ query, email, first_name: firstName || null, user_id: userId || null });

  if (error) {
    if (error.code === '23505') return res.status(200).json({ ok: true });
    const tableMissing = /could not find the table/i.test(String(error.message || ''));
    return res.status(tableMissing ? 503 : 500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true });
}

// Lists recent alerts for the admin "BO" view - same no-extra-auth posture
// as admin-products.js (the admin.html password gate is the only guard,
// consistent with the rest of this codebase rather than introducing a new
// security model just for this one endpoint).
async function handleGet(req, res, supabase) {
  const { data, error } = await supabase
    .from('search_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    const tableMissing = /could not find the table/i.test(String(error.message || ''));
    return res.status(tableMissing ? 503 : 500).json({ error: error.message });
  }

  return res.status(200).json(Array.isArray(data) ? data : []);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = getSupabase();

  try {
    if (req.method === 'POST') return await handlePost(req, res, supabase);
    if (req.method === 'GET') return await handleGet(req, res, supabase);
    return res.status(405).json({ error: 'Methode non supportee' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
