const { getInstagramAccessToken, saveInstagramAccessToken } = require('../../lib/instagramToken');

// Instagram long-lived tokens are valid 60 days and can be refreshed for
// another 60 any time after they're 24h old - running this weekly (see
// vercel.json) keeps it comfortably inside that window forever, so the
// feed never needs a manually pasted token again.
module.exports = async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = req.headers['authorization'];
    if (provided !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const currentToken = await getInstagramAccessToken();
    if (!currentToken) {
      return res.status(200).json({ ok: false, reason: 'Aucun token Instagram en base' });
    }

    const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(currentToken)}`;
    const igRes = await fetch(url);
    const igJson = await igRes.json();

    if (!igRes.ok || !igJson.access_token) {
      return res.status(200).json({ ok: false, reason: igJson?.error?.message || `Instagram ${igRes.status}` });
    }

    await saveInstagramAccessToken(igJson.access_token);

    return res.status(200).json({ ok: true, expiresInSeconds: igJson.expires_in });
  } catch (error) {
    return res.status(200).json({ ok: false, reason: error.message });
  }
};
