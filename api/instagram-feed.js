const { getInstagramAccessToken } = require('../lib/instagramToken');
const { getSupabaseAdmin } = require('../lib/adminAuth');

// Collab posts (published by another account with @jaces.creation as
// collaborator) belong to that other account, so Instagram's API never
// returns them in /me/media even though they show on the profile grid.
// They're stored by hand in site_content.instagram_extra_posts as a JSON
// array of { id, permalink, imageUrl (re-hosted on Cloudinary, since
// Instagram CDN links expire), timestamp, caption } and merged in by date.
async function getExtraPosts() {
  try {
    const { data } = await getSupabaseAdmin()
      .from('site_content')
      .select('value')
      .eq('key', 'instagram_extra_posts')
      .maybeSingle();
    const parsed = JSON.parse(data?.value || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((post) => post && post.permalink && post.imageUrl && post.timestamp)
      : [];
  } catch (error) {
    return [];
  }
}

function mergeByDate(posts, extraPosts, limit) {
  const seen = new Set();
  return [...extraPosts, ...posts]
    .filter((post) => {
      const key = post.permalink.replace(/^https?:\/\/(www\.)?instagram\.com\/([^/]+\/)?(p|reel)\//, '$3/');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
}

function pickDisplayUrl(item) {
  // Video media_url points at the raw .mp4 file, not something you can put in
  // an <img> - thumbnail_url is the static cover frame for those.
  if (item.media_type === 'VIDEO') return item.thumbnail_url || item.media_url;
  return item.media_url;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Methode non supportee' });
  }

  const limit = Math.min(Math.max(Number(req.query?.limit) || 6, 1), 12);
  const extraPosts = await getExtraPosts();

  const accessToken = await getInstagramAccessToken();
  if (!accessToken) {
    const posts = mergeByDate([], extraPosts, limit);
    return res.status(200).json({ ok: posts.length > 0, reason: 'INSTAGRAM_ACCESS_TOKEN non configure', posts });
  }

  try {
    const fields = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp';
    const url = `https://graph.instagram.com/me/media?fields=${fields}&limit=${limit}&access_token=${encodeURIComponent(accessToken)}`;
    const igRes = await fetch(url);
    const igJson = await igRes.json();

    if (!igRes.ok) {
      const posts = mergeByDate([], extraPosts, limit);
      return res.status(200).json({ ok: posts.length > 0, reason: igJson?.error?.message || `Instagram ${igRes.status}`, posts });
    }

    const posts = (igJson.data || [])
      .filter((item) => item.media_type !== 'VIDEO' || item.thumbnail_url)
      .map((item) => ({
        id: item.id,
        caption: item.caption || '',
        permalink: item.permalink,
        imageUrl: pickDisplayUrl(item),
        mediaType: item.media_type,
        timestamp: item.timestamp
      }));

    // Cache at the edge for an hour - recent posts don't change minute to
    // minute, and this keeps us well clear of Instagram's rate limits.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ ok: true, posts: mergeByDate(posts, extraPosts, limit) });
  } catch (error) {
    const posts = mergeByDate([], extraPosts, limit);
    return res.status(200).json({ ok: posts.length > 0, reason: error.message, posts });
  }
};
