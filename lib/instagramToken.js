const { getSupabaseAdmin } = require('./adminAuth');

// Stored in Supabase (not a Vercel env var) so the weekly refresh cron can
// write the new token back without needing to touch Vercel env vars or
// trigger a redeploy - api/instagram-feed.js just reads whatever's current.
async function getInstagramAccessToken() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('instagram_token')
    .select('access_token')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) return process.env.INSTAGRAM_ACCESS_TOKEN || '';
  return data.access_token || process.env.INSTAGRAM_ACCESS_TOKEN || '';
}

async function saveInstagramAccessToken(accessToken) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('instagram_token')
    .upsert({ id: 1, access_token: accessToken, updated_at: new Date().toISOString() });

  if (error) throw new Error(error.message);
}

module.exports = { getInstagramAccessToken, saveInstagramAccessToken };
