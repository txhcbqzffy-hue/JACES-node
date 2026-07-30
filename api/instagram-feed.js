const { getInstagramAccessToken } = require('../lib/instagramToken');

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

  const accessToken = await getInstagramAccessToken();
  if (!accessToken) {
    return res.status(200).json({ ok: false, reason: 'INSTAGRAM_ACCESS_TOKEN non configure', posts: [] });
  }

  const limit = Math.min(Math.max(Number(req.query?.limit) || 6, 1), 12);

  try {
    const fields = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp';
    const url = `https://graph.instagram.com/me/media?fields=${fields}&limit=${limit}&access_token=${encodeURIComponent(accessToken)}`;
    const igRes = await fetch(url);
    const igJson = await igRes.json();

    if (!igRes.ok) {
      return res.status(200).json({ ok: false, reason: igJson?.error?.message || `Instagram ${igRes.status}`, posts: [] });
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
    return res.status(200).json({ ok: true, posts });
  } catch (error) {
    return res.status(200).json({ ok: false, reason: error.message, posts: [] });
  }
};
