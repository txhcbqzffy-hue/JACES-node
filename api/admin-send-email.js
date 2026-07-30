const { isAuthorized } = require('../lib/adminAuth');
const { sendEmail } = require('../lib/brevo');

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
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

  const body = req.body || {};
  const subject = String(body.subject || '').trim();
  const html = String(body.html || '').trim();
  const emails = [...new Set(
    (Array.isArray(body.emails) ? body.emails : [])
      .map((email) => String(email || '').trim().toLowerCase())
      .filter(isValidEmail)
  )];

  if (!subject || !html) {
    return res.status(400).json({ error: 'Sujet et contenu requis' });
  }
  if (!emails.length) {
    return res.status(400).json({ error: 'Aucun destinataire valide' });
  }

  const results = await Promise.all(emails.map((toEmail) => sendEmail({ toEmail, subject, htmlContent: html })));
  const sent = results.filter((result) => result.ok).length;
  const failed = results.length - sent;
  const skipped = results.some((result) => result.skipped);

  return res.status(200).json({ ok: true, sent, failed, skipped });
};
