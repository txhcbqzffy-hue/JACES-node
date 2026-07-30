const { getSupabaseAdmin, isAuthorized } = require('../lib/adminAuth');

async function handleLog(req, res) {
  const body = req.body || {};

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('cookie_consents').insert({
      necessary: true,
      analytics: Boolean(body.analytics),
      marketing: Boolean(body.marketing)
    });

    if (error) {
      return res.status(200).json({ ok: false, reason: error.message });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(200).json({ ok: false, reason: error.message });
  }
}

async function handleStats(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Mot de passe admin invalide' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('cookie_consents')
      .select('analytics, marketing, created_at')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const rows = data || [];
    const total = rows.length;
    const analyticsCount = rows.filter((row) => row.analytics).length;
    const marketingCount = rows.filter((row) => row.marketing).length;
    const rejectAllCount = rows.filter((row) => !row.analytics && !row.marketing).length;

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const last30Days = rows.filter((row) => new Date(row.created_at).getTime() >= thirtyDaysAgo).length;

    return res.status(200).json({
      total,
      analyticsCount,
      marketingCount,
      rejectAllCount,
      last30Days,
      latest: rows.slice(0, 20)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') return handleLog(req, res);
  if (req.method === 'GET') return handleStats(req, res);

  return res.status(405).json({ error: 'Methode non supportee' });
};
