const { createClient } = require('@supabase/supabase-js');
const { getSupabaseAdmin } = require('../lib/adminAuth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non supportee' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ error: 'Non authentifie' });
  }

  try {
    // Verify the token identifies a real, currently valid session before
    // touching anything - never trust a user id passed in the request body.
    const anonClient = createClient(
      process.env.SUPABASE_URL || 'https://uxhzrobxhumreuntxrzw.supabase.co',
      process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY
    );
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ error: 'Session invalide' });
    }

    const adminClient = getSupabaseAdmin();
    // profiles.id has ON DELETE CASCADE on auth.users(id), so this also
    // removes the profile row.
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return res.status(500).json({ error: 'Suppression impossible pour le moment' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
