const crypto = require('crypto');
const { getSupabaseAdmin, isAuthorized } = require('../lib/adminAuth');
const { sendEmail, newsletterConfirmHtml, influencerQuoteHtml } = require('../lib/brevo');

const CLOUDINARY_UPLOAD_FOLDER = 'jaces/influencer-requests';

// A raw Turnstile token is single-use, so it can't gate every screenshot
// upload plus the final submit without forcing the visitor to re-solve the
// captcha each time. Instead we verify it once and hand back a short-lived
// HMAC-signed session token that covers the whole form session (uploads +
// submit) - this is also what keeps the public Cloudinary-signature
// endpoint from being callable by anyone who never touched the captcha.
const SESSION_TOKEN_TTL_MS = 15 * 60 * 1000;

function issueSessionToken() {
  const secret = process.env.TURNSTILE_SECRET_KEY || '';
  const expiresAt = Date.now() + SESSION_TOKEN_TTL_MS;
  const hmac = crypto.createHmac('sha256', secret).update(String(expiresAt)).digest('hex');
  return `${expiresAt}.${hmac}`;
}

function verifySessionToken(token) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured - don't hard-block submissions

  const [expiresAtStr, hmac] = String(token || '').split('.');
  const expiresAt = Number(expiresAtStr);
  if (!expiresAt || !hmac || Date.now() > expiresAt) return false;

  const expected = crypto.createHmac('sha256', secret).update(String(expiresAt)).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected));
  } catch (error) {
    return false;
  }
}

async function verifyTurnstileToken(token) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured - don't hard-block submissions

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token })
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (error) {
    return false;
  }
}

async function handleVerifyCaptcha(req, res) {
  const captchaToken = String((req.body || {}).captchaToken || '').trim();
  if (!captchaToken) return res.status(400).json({ error: 'Token manquant' });

  const valid = await verifyTurnstileToken(captchaToken);
  if (!valid) return res.status(400).json({ error: 'Vérification anti-robot invalide' });

  return res.status(200).json({ ok: true, sessionToken: issueSessionToken() });
}

function handleCloudinarySignature(req, res) {
  if (!verifySessionToken(req.query.sessionToken)) {
    return res.status(403).json({ error: 'Session expirée, revalidez la vérification anti-robot' });
  }

  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

  if (!apiKey || !apiSecret || !cloudName) {
    return res.status(500).json({ error: 'Upload non configuré' });
  }

  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = `folder=${CLOUDINARY_UPLOAD_FOLDER}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(paramsToSign + apiSecret).digest('hex');

  return res.status(200).json({
    signature,
    timestamp,
    apiKey,
    cloudName,
    folder: CLOUDINARY_UPLOAD_FOLDER
  });
}

const ADMIN_VIGNETTES_FOLDER = 'jaces/vignettes';

// Same signed-upload mechanism as handleCloudinarySignature above, but
// gated by the admin password instead of a captcha session token - used by
// the "Vignettes" panel's drag-and-drop uploader. No public_id is signed so
// Cloudinary assigns a fresh unique name to every upload automatically.
function handleAdminCloudinarySignature(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Mot de passe admin invalide' });
  }

  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

  if (!apiKey || !apiSecret || !cloudName) {
    return res.status(500).json({ error: 'Upload non configuré' });
  }

  const timestamp = Math.round(Date.now() / 1000);
  // colors=true asks Cloudinary to analyze and return the uploaded photo's
  // predominant colors, used by the product form to auto-pick the variant
  // couleur - must be part of the signed params (alphabetical order) since
  // it changes what the upload call returns.
  const paramsToSign = `colors=true&folder=${ADMIN_VIGNETTES_FOLDER}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(paramsToSign + apiSecret).digest('hex');

  return res.status(200).json({
    signature,
    timestamp,
    apiKey,
    cloudName,
    folder: ADMIN_VIGNETTES_FOLDER
  });
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function confirmationPage({ title, message }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | JACES</title>
<style>
body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#ecd7c2; font-family:Arial, sans-serif; color:#2d1216; text-align:center; padding:20px; }
.box { max-width:420px; }
h1 { font-size:1.4rem; margin-bottom:12px; }
a { color:#2d1216; }
</style>
</head>
<body>
  <div class="box">
    <h1>${title}</h1>
    <p>${message}</p>
    <p><a href="https://jaces-node.vercel.app/">Retour sur JACES</a></p>
  </div>
</body>
</html>`;
}

async function handleConfirm(req, res) {
  const token = String(req.query.confirm || '').trim();
  if (!token) return res.status(400).send(confirmationPage({ title: 'Lien invalide', message: 'Ce lien de confirmation est invalide.' }));

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('newsletter_subscribers')
      .update({ confirmed: true })
      .eq('confirm_token', token)
      .select('email, first_name')
      .maybeSingle();

    if (error || !data) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(confirmationPage({ title: 'Lien introuvable', message: 'Ce lien de confirmation n\'est plus valide.' }));
    }

    const greeting = data.first_name ? `Merci ${data.first_name}` : 'Merci';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(confirmationPage({ title: 'Inscription confirmée !', message: `${greeting}, ${data.email} est bien inscrit(e) à la newsletter JACES.` }));
  } catch (error) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(confirmationPage({ title: 'Erreur', message: 'Une erreur est survenue, réessayez plus tard.' }));
  }
}

async function handleCheckEmail(req, res) {
  const email = String(req.query.checkEmail || '').trim().toLowerCase();
  if (!isValidEmail(email)) return res.status(200).json({ confirmed: false });

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('newsletter_subscribers')
      .select('confirmed, first_name, last_name, wants_products, wants_news')
      .eq('email', email)
      .maybeSingle();

    // Name and preferences only leave this endpoint if the caller can prove
    // they own this exact e-mail (a valid Supabase session token for it) -
    // otherwise anyone could harvest name+email pairs by guessing addresses.
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    let ownsEmail = false;
    if (bearer && data) {
      const { data: userData } = await supabase.auth.getUser(bearer);
      ownsEmail = userData?.user?.email?.toLowerCase() === email;
    }

    return res.status(200).json({
      confirmed: Boolean(data?.confirmed),
      firstName: ownsEmail ? (data?.first_name || '') : '',
      lastName: ownsEmail ? (data?.last_name || '') : '',
      wantsProducts: ownsEmail ? Boolean(data?.wants_products) : false,
      wantsNews: ownsEmail ? Boolean(data?.wants_news) : false
    });
  } catch (error) {
    return res.status(200).json({ confirmed: false });
  }
}

async function handleGet(req, res) {
  if (req.query.confirm) return handleConfirm(req, res);
  if (req.query.checkEmail) return handleCheckEmail(req, res);
  if (req.query.cloudinarySignature) return handleCloudinarySignature(req, res);
  if (req.query.adminCloudinarySignature) return handleAdminCloudinarySignature(req, res);
  if (req.query.promoCode) return handleValidatePromoCode(req, res);

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Mot de passe admin invalide' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const [{ data, error }, { data: newsletterData, error: newsletterError }, { data: influencerData, error: influencerError }, { data: promoData, error: promoError }] = await Promise.all([
      supabase
        .from('stock_notifications')
        .select('id, email, size, notified, created_at, product_id, products(name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('newsletter_subscribers')
        .select('id, email, first_name, last_name, wants_products, wants_news, confirmed, source, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('influencer_requests')
        .select('id, email, name, phone, audience_ages, details, screenshots, networks, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('promo_codes')
        .select('id, code, discount_percent, active, usage_count, max_uses, influencer_request_id')
    ]);

    if (error) return res.status(500).json({ error: error.message });
    if (newsletterError) return res.status(500).json({ error: newsletterError.message });
    if (influencerError) return res.status(500).json({ error: influencerError.message });
    if (promoError) return res.status(500).json({ error: promoError.message });

    const promoCodesByRequestId = new Map((promoData || []).map((row) => [row.influencer_request_id, row]));

    const subscribers = (data || []).map((row) => ({
      id: row.id,
      email: row.email,
      size: row.size,
      notified: row.notified,
      createdAt: row.created_at,
      productId: row.product_id,
      productName: row.products?.name || ''
    }));

    const newsletterSubscribers = (newsletterData || []).map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      wantsProducts: row.wants_products,
      wantsNews: row.wants_news,
      confirmed: row.confirmed,
      source: row.source,
      createdAt: row.created_at
    }));

    const influencerRequests = (influencerData || []).map((row) => {
      const promo = promoCodesByRequestId.get(row.id);
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        phone: row.phone,
        audienceAges: row.audience_ages || [],
        details: row.details || '',
        screenshots: row.screenshots || [],
        networks: row.networks || [],
        createdAt: row.created_at,
        promoCode: promo ? { id: promo.id, code: promo.code, discountPercent: promo.discount_percent, active: promo.active, usageCount: promo.usage_count, maxUses: promo.max_uses } : null
      };
    });

    return res.status(200).json({ subscribers, newsletterSubscribers, influencerRequests });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

const ALLOWED_NETWORKS = ['linkedin', 'youtube', 'facebook', 'instagram'];

const ALLOWED_AUDIENCE_AGES = ['13-17', '18-24', '25-34', '35-44', '45-54', '55+'];

async function handleInfluencerPost(req, res) {
  const body = req.body || {};

  // Honeypot: a real visitor never sees or fills this field (hidden via CSS),
  // so anything landing here is near-certainly a bot - accept silently
  // without inserting a row or sending mail, so the bot gets no signal.
  if (String(body.website || '').trim()) {
    return res.status(200).json({ ok: true });
  }

  if (!verifySessionToken(body.sessionToken)) {
    return res.status(400).json({ error: 'Vérification anti-robot manquante ou expirée, réessayez' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const firstName = String(body.firstName || '').trim().slice(0, 80);
  const lastName = String(body.lastName || '').trim().slice(0, 80);
  const phone = String(body.phone || '').trim().slice(0, 30);
  const details = String(body.details || '').trim().slice(0, 2000);
  const rawAudienceAges = Array.isArray(body.audienceAges) ? body.audienceAges : [];
  const audienceAges = rawAudienceAges.filter((age) => ALLOWED_AUDIENCE_AGES.includes(age));
  const name = `${firstName} ${lastName}`.trim();

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Adresse e-mail invalide' });
  }
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'Nom et prénom requis' });
  }
  if (!audienceAges.length) {
    return res.status(400).json({ error: 'Âge moyen de l\'audience requis' });
  }

  const rawScreenshots = Array.isArray(body.screenshots) ? body.screenshots : [];
  const screenshots = rawScreenshots
    .filter((url) => typeof url === 'string' && /^https:\/\/res\.cloudinary\.com\/dnplvtg6h\//.test(url))
    .slice(0, 6);

  const rawNetworks = Array.isArray(body.networks) ? body.networks : [];
  const networks = rawNetworks
    .filter((entry) => entry && ALLOWED_NETWORKS.includes(entry.network))
    .map((entry) => ({
      network: entry.network,
      url: String(entry.url || '').trim().slice(0, 300),
      followers: String(entry.followers || '').trim().slice(0, 30)
    }))
    .filter((entry) => entry.url);

  if (!networks.length) {
    return res.status(400).json({ error: 'Au moins un réseau avec un lien de profil est requis' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Anti-abuse: don't let the same address trigger a fresh automated
    // send more than once a day - stops someone from using the form to
    // mail-bomb a real (their own or someone else's) inbox with the quote.
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from('influencer_requests')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', oneDayAgo);

    const { error } = await supabase
      .from('influencer_requests')
      .insert({ email, name, phone: phone || null, audience_ages: audienceAges, details: details || null, screenshots, networks });

    if (error) return res.status(500).json({ error: error.message });

    // Best-effort: the candidature is already saved regardless of whether
    // this send succeeds, so a Brevo hiccup here must not turn into a 500
    // for someone who just successfully submitted the form.
    if (!recentCount) {
      try {
        await sendInfluencerQuoteEmail({ email, name, networks, audience_ages: audienceAges });
      } catch (sendError) {
        // swallow - admin can still trigger it manually from the admin panel
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

const PARTNER_TIERS = [
  { max: 5000, label: 'Moins de 5 000 abonnés', products: '50 €', commission: '10 %' },
  { max: 20000, label: '5 000 – 20 000 abonnés', products: '100 €', commission: '12 %' },
  { max: Infinity, label: 'Plus de 20 000 abonnés', products: '200 €', commission: '15 %' }
];

function parseFollowerCount(value) {
  const match = String(value || '').trim().toLowerCase().match(/^([\d.,]+)\s*(k|m)?/);
  if (!match) return 0;
  const base = parseFloat(match[1].replace(',', '.'));
  if (Number.isNaN(base)) return 0;
  if (match[2] === 'k') return base * 1000;
  if (match[2] === 'm') return base * 1000000;
  return base;
}

function tierForFollowers(followers) {
  return PARTNER_TIERS.find((t) => followers < t.max) || PARTNER_TIERS[PARTNER_TIERS.length - 1];
}

// JACES' core customer base is 25-44 - an audience skewing outside that range
// is worth less to the brand regardless of size, so it knocks the tier down
// a notch rather than being priced purely on follower count.
const TARGET_AUDIENCE_AGES = ['25-34', '35-44'];

function audienceMatchesTarget(audienceAges) {
  return (audienceAges || []).some((age) => TARGET_AUDIENCE_AGES.includes(age));
}

function tierForFollowersAndAudience(followers, matchesTarget) {
  const baseIndex = PARTNER_TIERS.findIndex((t) => followers < t.max);
  const index = baseIndex === -1 ? PARTNER_TIERS.length - 1 : baseIndex;
  const finalIndex = matchesTarget ? index : Math.max(0, index - 1);
  return PARTNER_TIERS[finalIndex];
}

const NETWORK_LABELS = { linkedin: 'LinkedIn', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram' };

function describeNetworkTiers(networks, audienceAges) {
  const matchesTarget = audienceMatchesTarget(audienceAges);
  return (networks || [])
    .filter((n) => n && n.followers)
    .map((n) => {
      const followers = parseFollowerCount(n.followers);
      const tier = tierForFollowersAndAudience(followers, matchesTarget);
      return {
        label: NETWORK_LABELS[n.network] || n.network,
        followersText: n.followers,
        tier
      };
    });
}

// The code's discount for the audience and the influencer's commission are
// the same percentage - simplest to reason about (and to explain in the
// devis) since there's only one number per tier to track.
function resolveBestTier(networks, audienceAges) {
  const matchesTarget = audienceMatchesTarget(audienceAges);
  const maxFollowers = (networks || []).reduce((max, n) => Math.max(max, parseFollowerCount(n.followers)), 0);
  return tierForFollowersAndAudience(maxFollowers, matchesTarget);
}

function slugifyFirstName(name) {
  const firstName = String(name || '').trim().split(' ')[0] || '';
  return firstName
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 12) || 'JACES';
}

async function handleValidatePromoCode(req, res) {
  const code = String(req.query.promoCode || '').trim().toUpperCase();
  if (!code) return res.status(200).json({ valid: false });

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('promo_codes')
      .select('id, discount_percent, active, usage_count, max_uses')
      .eq('code', code)
      .eq('active', true)
      .maybeSingle();

    if (!data) return res.status(200).json({ valid: false });
    if (data.max_uses != null && data.usage_count >= data.max_uses) {
      return res.status(200).json({ valid: false, reason: 'limit_reached' });
    }

    // Best-effort usage counter - there's no real order/payment backend yet
    // to tie this to actual sales, so this only tracks how often the code
    // gets checked at checkout, not confirmed purchases.
    supabase.from('promo_codes').update({ usage_count: data.usage_count + 1 }).eq('id', data.id).then(() => {});

    return res.status(200).json({ valid: true, discountPercent: data.discount_percent });
  } catch (error) {
    return res.status(200).json({ valid: false });
  }
}

async function handleGenerateInfluencerCode(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Mot de passe admin invalide' });
  }

  const id = String((req.body || {}).id || '').trim();
  if (!id) return res.status(400).json({ error: 'id requis' });

  try {
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('promo_codes')
      .select('code, discount_percent')
      .eq('influencer_request_id', id)
      .maybeSingle();
    if (existing) return res.status(200).json({ ok: true, code: existing.code, discountPercent: existing.discount_percent });

    const { data: row, error } = await supabase
      .from('influencer_requests')
      .select('name, networks, audience_ages')
      .eq('id', id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!row) return res.status(404).json({ error: 'Demande introuvable' });

    const tier = resolveBestTier(row.networks, row.audience_ages);
    const discountPercent = parseInt(tier.commission, 10);
    const base = slugifyFirstName(row.name);

    let code = `${base}${discountPercent}`;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { data: clash } = await supabase.from('promo_codes').select('id').eq('code', code).maybeSingle();
      if (!clash) break;
      code = `${base}${discountPercent}-${attempt + 2}`;
    }

    const { error: insertError } = await supabase
      .from('promo_codes')
      .insert({ code, discount_percent: discountPercent, influencer_request_id: id });
    if (insertError) return res.status(500).json({ error: insertError.message });

    return res.status(200).json({ ok: true, code, discountPercent });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function sendInfluencerQuoteEmail(row) {
  const firstName = (row.name || '').trim().split(' ')[0] || '';
  const matchesTarget = audienceMatchesTarget(row.audience_ages);
  const networkTiers = describeNetworkTiers(row.networks, row.audience_ages);
  const networkTiersHtml = networkTiers.map((n) => `
    <p style="margin:0 0 10px;">
      <span style="color:#e8d8c4;font-size:0.98rem;font-weight:bold;">${n.label}</span>
      <span style="color:#a98d7c;font-size:0.85rem;"> · ${n.followersText} abonnés</span><br>
      <span style="color:#e8d8c4;font-size:0.9rem;">${n.tier.products} de pièces offertes · ${n.tier.commission} de commission sur les ventes générées via votre code personnalisé</span>
    </p>
  `).join('') + (matchesTarget ? '' : `
    <p style="margin:10px 0 0;padding-top:10px;border-top:1px solid #684347;color:#a98d7c;font-size:0.8rem;line-height:1.5;">Notre cœur de cible est actuellement 25-44 ans : le palier proposé en tient compte, en plus du nombre d'abonnés.</p>
  `);

  const docxUrl = 'https://res.cloudinary.com/dnplvtg6h/raw/upload/jaces/documents/jaces-partenariat-media-kit.pdf';
  const docxRes = await fetch(docxUrl);
  if (!docxRes.ok) return { error: 'Document introuvable sur Cloudinary' };
  const docxBuffer = Buffer.from(await docxRes.arrayBuffer());
  const docxBase64 = docxBuffer.toString('base64');

  const htmlContent = influencerQuoteHtml({ firstName, networkTiersHtml, toEmail: row.email });

  const result = await sendEmail({
    toEmail: row.email,
    subject: `JACES × ${row.name || 'vous'} - Votre demande de partenariat`,
    htmlContent,
    attachments: [{ content: docxBase64, name: 'JACES-Partenariat.pdf' }]
  });

  if (result.error) return { error: result.error };
  if (result.skipped) return { error: 'Envoi non configuré (BREVO_API_KEY manquant)' };

  const tierSummary = networkTiers.map((n) => `${n.label}: ${n.tier.label}`).join(', ') || 'à confirmer';
  return { ok: true, tier: tierSummary };
}

async function handleSendInfluencerQuote(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Mot de passe admin invalide' });
  }

  const id = String((req.body || {}).id || '').trim();
  if (!id) return res.status(400).json({ error: 'id requis' });

  try {
    const supabase = getSupabaseAdmin();
    const { data: row, error } = await supabase
      .from('influencer_requests')
      .select('email, name, networks, audience_ages')
      .eq('id', id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!row) return res.status(404).json({ error: 'Demande introuvable' });

    const result = await sendInfluencerQuoteEmail(row);
    if (result.error) return res.status(500).json({ error: result.error });
    return res.status(200).json({ ok: true, tier: result.tier });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handlePost(req, res) {
  const body = req.body || {};
  if (body.formType === 'influencer') return handleInfluencerPost(req, res);
  if (body.action === 'sendInfluencerQuote') return handleSendInfluencerQuote(req, res);
  if (body.action === 'verifyCaptcha') return handleVerifyCaptcha(req, res);
  if (body.action === 'generateInfluencerCode') return handleGenerateInfluencerCode(req, res);
  const email = String(body.email || '').trim().toLowerCase();
  const firstName = String(body.firstName || '').trim().slice(0, 80);
  const lastName = String(body.lastName || '').trim().slice(0, 80);
  const wantsProducts = Boolean(body.wantsProducts);
  const wantsNews = Boolean(body.wantsNews);
  const source = String(body.source || '').trim().slice(0, 60);

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Adresse e-mail invalide' });
  }

  try {
    const supabase = getSupabaseAdmin();
    // confirmed/confirm_token are left out of the payload on purpose - the DB
    // defaults (confirmed=false, a fresh confirm_token) apply for a brand new
    // row, while an existing row keeps whatever it already had so a returning
    // already-confirmed subscriber doesn't get silently unconfirmed.
    // first_name/last_name are ALSO only included when actually provided -
    // the footer form is email-only, and upserting null there would erase a
    // name already captured from an earlier popup signup with the same address.
    // Toggled from the (already-authenticated) account page rather than the
    // public footer form - the account itself is the verification, so this
    // skips the double opt-in confirmation email instead of re-confirming
    // someone who is already a known, logged-in customer.
    const isAccountSync = source === 'account-page';

    const upsertPayload = { email, wants_products: wantsProducts, wants_news: wantsNews, source };
    if (firstName) upsertPayload.first_name = firstName;
    if (lastName) upsertPayload.last_name = lastName;
    if (isAccountSync) upsertPayload.confirmed = true;

    const { data, error } = await supabase
      .from('newsletter_subscribers')
      .upsert(upsertPayload, { onConflict: 'email' })
      .select('confirm_token, confirmed')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    if (!data.confirmed && !isAccountSync) {
      const confirmUrl = `https://jaces-node.vercel.app/api/admin-email-subscribers?confirm=${data.confirm_token}`;
      const html = newsletterConfirmHtml({ firstName, confirmUrl, toEmail: email });
      await sendEmail({ toEmail: email, subject: 'Confirmez votre inscription à la newsletter JACES', htmlContent: html });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handlePatch(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Mot de passe admin invalide' });
  }

  const body = req.body || {};
  const id = String(body.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id requis' });

  if (body.type === 'promoCode') {
    const promoUpdates = {};
    if (typeof body.active === 'boolean') promoUpdates.active = body.active;
    if (body.discountPercent !== undefined) {
      const discountPercent = parseInt(body.discountPercent, 10);
      if (!Number.isFinite(discountPercent) || discountPercent < 1 || discountPercent > 90) {
        return res.status(400).json({ error: 'Pourcentage invalide (1-90)' });
      }
      promoUpdates.discount_percent = discountPercent;
    }
    if (body.code !== undefined) {
      const code = String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (!code) return res.status(400).json({ error: 'Code invalide' });
      promoUpdates.code = code;
    }
    if (body.maxUses !== undefined) {
      const raw = String(body.maxUses || '').trim();
      if (!raw) {
        promoUpdates.max_uses = null; // blank = unlimited
      } else {
        const maxUses = parseInt(raw, 10);
        if (!Number.isFinite(maxUses) || maxUses < 1) {
          return res.status(400).json({ error: 'Limite d\'utilisation invalide' });
        }
        promoUpdates.max_uses = maxUses;
      }
    }
    if (!Object.keys(promoUpdates).length) return res.status(400).json({ error: 'Aucune modification à appliquer' });

    try {
      const supabase = getSupabaseAdmin();
      if (promoUpdates.code) {
        const { data: clash } = await supabase.from('promo_codes').select('id').eq('code', promoUpdates.code).neq('id', id).maybeSingle();
        if (clash) return res.status(400).json({ error: 'Ce code existe déjà' });
      }
      const { error } = await supabase.from('promo_codes').update(promoUpdates).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  const updates = {};
  if (typeof body.wantsProducts === 'boolean') updates.wants_products = body.wantsProducts;
  if (typeof body.wantsNews === 'boolean') updates.wants_news = body.wantsNews;

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'Aucune modification a appliquer' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('newsletter_subscribers').update(updates).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleDelete(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Mot de passe admin invalide' });
  }

  const id = String(req.query.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id requis' });

  const table = req.query.type === 'influencer' ? 'influencer_requests'
    : req.query.type === 'promoCode' ? 'promo_codes'
    : 'newsletter_subscribers';

  try {
    const supabase = getSupabaseAdmin();
    // A full delete (not just wants_products/wants_news = false) is what
    // lets this person fall back into the exit-intent popup cycle - the
    // popup's checkEmail lookup finds nothing and treats them as new again.
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  if (req.method === 'PATCH') return handlePatch(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);

  return res.status(405).json({ error: 'Methode non supportee' });
};
