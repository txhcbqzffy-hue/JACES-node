const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.SUPABASE_URL || 'https://uxhzrobxhumreuntxrzw.supabase.co';
  // Prefer the service-role key so this works even before RLS insert
  // policies exist for anonymous visitors, matching the admin-products
  // pattern used elsewhere.
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_VsHXPk-y4UTt4R7aAbidXg_MtIbEAhp';
  return createClient(url, key);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non supportee' });
  }

  const body = req.body || {};
  const productId = String(body.productId || '').trim();
  const size = String(body.size || '').trim();
  const email = String(body.email || '').trim().toLowerCase();

  if (!productId || !size || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Parametres invalides' });
  }

  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('stock_notifications')
      .upsert(
        { product_id: productId, size, email },
        { onConflict: 'product_id,size,email', ignoreDuplicates: true }
      );

    if (error) {
      const tableMissing = /could not find the table/i.test(String(error.message || ''));
      return res.status(tableMissing ? 503 : 500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
