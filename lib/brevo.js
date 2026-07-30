function fillTemplate(str, vars) {
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] != null ? String(vars[key]) : ''));
}

async function sendEmail({ toEmail, subject, htmlContent, attachments }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return { skipped: true, reason: 'BREVO_API_KEY non configuree' };
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'benjamin.peral18@gmail.com';
  const senderName = process.env.BREVO_SENDER_NAME || 'JACES';

  try {
    const payload = {
      sender: { email: senderEmail, name: senderName },
      to: [{ email: toEmail }],
      subject,
      htmlContent
    };
    if (Array.isArray(attachments) && attachments.length) {
      payload.attachment = attachments.map((a) => ({ content: a.content, name: a.name }));
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { skipped: false, error: `Brevo ${res.status}: ${text}` };
    }

    return { skipped: false, ok: true };
  } catch (error) {
    return { skipped: false, error: error.message };
  }
}

function defaultRestockSubject(size) {
  return `La taille ${size} est de nouveau disponible !`;
}

function defaultRestockHtml({ productName, size, color, productUrl, productImageUrl, firstName, toEmail }) {
  const nbProductName = (productName || '').split(' ').join(' ');
  const descText = `La taille ${size}${color ? ` (${color})` : ''}${productName ? ` de &laquo;&nbsp;${nbProductName}&nbsp;&raquo;` : ''} est de nouveau en stock chez JACES.`;
  // Live HTML text now, matching the other transactional emails (confirm
  // signup, reset password) exactly - same font-size, same button markup -
  // so desktop and mobile render identically instead of a fixed-resolution
  // image scaling the whole block (text, spacing, button) down together on
  // narrow screens. This was previously a server-rendered PNG to dodge a
  // Gmail-mobile-app dark-mode text-recoloring bug; re-test that scenario
  // here if reports of broken colors on Gmail mobile come back.
  const body = [
    '<div class="jc-outer" style="background-image:url(https://res.cloudinary.com/dnplvtg6h/image/upload/v1784934446/jaces/bg-outer.png);background-repeat:repeat;padding:48px 20px;font-family:Arial, sans-serif;">',
    '<div class="jc-card" style="max-width:520px;margin:0 auto;background-image:url(https://res.cloudinary.com/dnplvtg6h/image/upload/v1784934447/jaces/bg-card.png);background-repeat:repeat;border:1px solid #684347;border-radius:22px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.25);">',
    '<div class="jc-band" style="background-image:url(https://res.cloudinary.com/dnplvtg6h/image/upload/v1784934448/jaces/bg-band.png);background-repeat:repeat;padding:36px 20px;text-align:center;"><img src="https://res.cloudinary.com/dnplvtg6h/image/upload/v1784929316/jaces/jaces-wordmark-light.png" alt="JACES" width="150" style="display:inline-block;border:0;"></div>',
    '<div class="jc-card" style="background-image:url(https://res.cloudinary.com/dnplvtg6h/image/upload/v1784934447/jaces/bg-card.png);background-repeat:repeat;padding:48px;text-align:center;">',
    productImageUrl
      ? (productUrl
          ? `<p style="margin:0 0 24px;"><a href="${productUrl}"><img src="${productImageUrl}" alt="${(productName || 'Produit JACES').replace(/"/g, '&quot;')}" width="180" style="display:inline-block;width:180px;max-width:45%;height:auto;border:0;border-radius:10px;"></a></p>`
          : `<p style="margin:0 0 24px;"><img src="${productImageUrl}" alt="${(productName || 'Produit JACES').replace(/"/g, '&quot;')}" width="180" style="display:inline-block;width:180px;max-width:45%;height:auto;border:0;border-radius:10px;"></p>`)
      : '',
    `<p style="margin:0 0 8px;color:#e8d8c4;font-size:1rem;">Bonjour${firstName ? ` ${firstName}` : ''},</p>`,
    '<p style="margin:0 0 18px;color:#e8d8c4;font-size:1.6rem;font-weight:bold;">Bonne nouvelle !</p>',
    `<p style="margin:0 0 24px;color:#e8d8c4;font-size:1rem;">${descText}</p>`,
    productUrl
      ? `<p style="margin:0 0 18px;"><a href="${productUrl}" style="display:inline-block;background-color:#e8d8c4;color:#2b1012;font-weight:bold;font-size:16px;padding:16px 32px;border-radius:4px;text-decoration:none;">Voir le produit</a></p>`
      : '',
    '<p style="margin:0 0 18px;"><a href="https://www.instagram.com/jaces.creation/"><img src="https://res.cloudinary.com/dnplvtg6h/image/upload/v1784929298/jaces/instagram-icon-light.png" width="22" height="22" alt="Instagram" style="display:inline-block;border:0;"></a></p>',
    `<p class="jc-muted" style="margin:0 0 4px;font-size:0.75rem;color:#a98d7c;">Cet email a &eacute;t&eacute; envoy&eacute; &agrave; ${toEmail || ''}.</p>`,
    '<p class="jc-muted" style="margin:0 0 10px;font-size:0.75rem;color:#a98d7c;">Vous recevez cet email car vous &ecirc;tes inscrit(e) aux alertes de stock JACES.</p>',
    '<p class="jc-muted" style="margin:0;font-size:0.75rem;color:#a98d7c;"><a href="https://jaces-node.vercel.app/contact.html" class="jc-muted" style="color:#a98d7c;">Contact</a> &middot; <a href="https://jaces-node.vercel.app/politique-confidentialite.html" class="jc-muted" style="color:#a98d7c;">Politique de confidentialit&eacute;</a></p>',
    '</div>',
    '</div>',
    '</div>'
  ].join('');

  return [
    '<!DOCTYPE html>',
    '<html lang="fr">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    '<style>',
    // Best-effort override for Gmail webmail's dark-mode text recoloring
    // (does not reach the Gmail mobile app - see comment on defaultRestockHtml).
    '[data-ogsc].jc-muted { color:#a98d7c !important; }',
    '</style>',
    '</head>',
    '<body style="margin:0;padding:0;">',
    body,
    '</body>',
    '</html>'
  ].join('');
}

function newsletterConfirmHtml({ firstName, confirmUrl, toEmail }) {
  const body = [
    '<div class="jc-outer" style="background-image:url(https://res.cloudinary.com/dnplvtg6h/image/upload/v1784934446/jaces/bg-outer.png);background-repeat:repeat;padding:48px 20px;font-family:Arial, sans-serif;">',
    '<div class="jc-card" style="max-width:520px;margin:0 auto;background-image:url(https://res.cloudinary.com/dnplvtg6h/image/upload/v1784934447/jaces/bg-card.png);background-repeat:repeat;border:1px solid #684347;border-radius:22px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.25);">',
    '<div class="jc-band" style="background-image:url(https://res.cloudinary.com/dnplvtg6h/image/upload/v1784934448/jaces/bg-band.png);background-repeat:repeat;padding:36px 20px;text-align:center;"><img src="https://res.cloudinary.com/dnplvtg6h/image/upload/v1784929316/jaces/jaces-wordmark-light.png" alt="JACES" width="150" style="display:inline-block;border:0;"></div>',
    '<div class="jc-card" style="background-image:url(https://res.cloudinary.com/dnplvtg6h/image/upload/v1784934447/jaces/bg-card.png);background-repeat:repeat;padding:48px;text-align:center;">',
    `<p style="margin:0 0 8px;color:#e8d8c4;font-size:1rem;">Bonjour${firstName ? ` ${firstName}` : ''},</p>`,
    '<p style="margin:0 0 18px;color:#e8d8c4;font-size:1.6rem;font-weight:bold;">Confirmez votre inscription</p>',
    '<p style="margin:0 0 24px;color:#e8d8c4;font-size:1rem;">Plus qu\'un clic pour rejoindre la newsletter JACES et ne rien manquer.</p>',
    `<p style="margin:0 0 18px;"><a href="${confirmUrl}" style="display:inline-block;background-color:#e8d8c4;color:#2b1012;font-weight:bold;font-size:16px;padding:16px 32px;border-radius:4px;text-decoration:none;">Confirmer mon inscription</a></p>`,
    '<p style="margin:0 0 18px;"><a href="https://www.instagram.com/jaces.creation/"><img src="https://res.cloudinary.com/dnplvtg6h/image/upload/v1784929298/jaces/instagram-icon-light.png" width="22" height="22" alt="Instagram" style="display:inline-block;border:0;"></a></p>',
    `<p class="jc-muted" style="margin:0 0 4px;font-size:0.75rem;color:#a98d7c;">Cet email a &eacute;t&eacute; envoy&eacute; &agrave; ${toEmail || ''}.</p>`,
    '<p class="jc-muted" style="margin:0 0 10px;font-size:0.75rem;color:#a98d7c;">Si vous n&rsquo;&ecirc;tes pas &agrave; l&rsquo;origine de cette demande, ignorez simplement cet e-mail.</p>',
    '<p class="jc-muted" style="margin:0;font-size:0.75rem;color:#a98d7c;"><a href="https://jaces-node.vercel.app/contact.html" class="jc-muted" style="color:#a98d7c;">Contact</a> &middot; <a href="https://jaces-node.vercel.app/politique-confidentialite.html" class="jc-muted" style="color:#a98d7c;">Politique de confidentialit&eacute;</a></p>',
    '</div>',
    '</div>',
    '</div>'
  ].join('');

  return [
    '<!DOCTYPE html>',
    '<html lang="fr">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    '<style>',
    '[data-ogsc].jc-muted { color:#a98d7c !important; }',
    '</style>',
    '</head>',
    '<body style="margin:0;padding:0;">',
    body,
    '</body>',
    '</html>'
  ].join('');
}

function influencerQuoteHtml({ firstName, networkTiersHtml, toEmail }) {
  const body = [
    '<div class="jc-outer" style="background-image:url(https://res.cloudinary.com/dnplvtg6h/image/upload/v1784934446/jaces/bg-outer.png);background-repeat:repeat;padding:48px 20px;font-family:Arial, sans-serif;">',
    '<div class="jc-card" style="max-width:560px;margin:0 auto;background-image:url(https://res.cloudinary.com/dnplvtg6h/image/upload/v1784934447/jaces/bg-card.png);background-repeat:repeat;border:1px solid #684347;border-radius:22px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.25);">',
    '<div class="jc-band" style="background-image:url(https://res.cloudinary.com/dnplvtg6h/image/upload/v1784934448/jaces/bg-band.png);background-repeat:repeat;padding:36px 20px;text-align:center;"><img src="https://res.cloudinary.com/dnplvtg6h/image/upload/v1784929316/jaces/jaces-wordmark-light.png" alt="JACES" width="150" style="display:inline-block;border:0;"></div>',
    '<div class="jc-card" style="background-image:url(https://res.cloudinary.com/dnplvtg6h/image/upload/v1784934447/jaces/bg-card.png);background-repeat:repeat;padding:48px;text-align:left;">',
    `<p style="margin:0 0 18px;color:#e8d8c4;font-size:1rem;">Bonjour${firstName ? ` ${firstName}` : ''},</p>`,
    '<p style="margin:0 0 18px;color:#e8d8c4;font-size:0.98rem;line-height:1.6;">Merci pour votre demande de partenariat avec JACES, nous avons bien re&ccedil;u votre candidature.</p>',
    '<p style="margin:0 0 18px;color:#e8d8c4;font-size:0.98rem;line-height:1.6;">JACES est une jeune marque de mode qui construit son univers pas &agrave; pas, avec exigence et sinc&eacute;rit&eacute;. Nous cherchons des cr&eacute;atrices qui partagent notre sensibilit&eacute; pour faire d&eacute;couvrir la marque &agrave; leur communaut&eacute;, dans une vraie relation qui dure - pas une collaboration ponctuelle.</p>',
    `<div style="background-color:#3a1f22;border:1px solid #684347;border-radius:12px;padding:20px 22px;margin:0 0 20px;">`,
    '<p style="margin:0 0 12px;color:#a98d7c;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;">D&rsquo;apr&egrave;s votre audience</p>',
    networkTiersHtml || '<p style="margin:0;color:#e8d8c4;font-size:0.9rem;">Nous confirmerons votre palier une fois votre profil &eacute;tudi&eacute;.</p>',
    '</div>',
    '<p style="margin:0 0 18px;color:#e8d8c4;font-size:0.98rem;line-height:1.6;">Vous trouverez en pi&egrave;ce jointe notre document de pr&eacute;sentation des partenariats JACES : la grille tarifaire compl&egrave;te, comment &ccedil;a fonctionne concr&egrave;tement, et ce que nous attendons de nos partenaires.</p>',
    '<p style="margin:0 0 18px;color:#e8d8c4;font-size:0.98rem;line-height:1.6;">Notre &eacute;quipe va maintenant prendre le temps d&rsquo;&eacute;tudier votre profil et votre audience. Nous revenons vers vous sous 5 jours ouvr&eacute;s, avec ou sans suite - dans tous les cas vous aurez une r&eacute;ponse.</p>',
    '<p style="margin:0 0 24px;color:#e8d8c4;font-size:0.98rem;line-height:1.6;">N&rsquo;h&eacute;sitez pas si vous avez des questions d&rsquo;ici l&agrave;.</p>',
    '<p style="margin:0 0 24px;color:#e8d8c4;font-size:0.98rem;line-height:1.6;">&Agrave; tr&egrave;s vite,<br>L&rsquo;&eacute;quipe JACES</p>',
    '<p style="margin:0 0 18px;text-align:center;"><a href="https://www.instagram.com/jaces.creation/"><img src="https://res.cloudinary.com/dnplvtg6h/image/upload/v1784929298/jaces/instagram-icon-light.png" width="22" height="22" alt="Instagram" style="display:inline-block;border:0;"></a></p>',
    `<p class="jc-muted" style="margin:0;font-size:0.75rem;color:#a98d7c;text-align:center;">Cet email a &eacute;t&eacute; envoy&eacute; &agrave; ${toEmail || ''}.</p>`,
    '</div>',
    '</div>',
    '</div>'
  ].join('');

  return [
    '<!DOCTYPE html>',
    '<html lang="fr">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    '<style>',
    '[data-ogsc].jc-muted { color:#a98d7c !important; }',
    '</style>',
    '</head>',
    '<body style="margin:0;padding:0;">',
    body,
    '</body>',
    '</html>'
  ].join('');
}

// subjectTemplate/htmlTemplate come from the admin-editable template stored
// in site_content (keys restock_email_subject/restock_email_html), with
// {{size}}, {{color}}, {{productName}}, {{productUrl}}, {{firstName}}
// placeholders. Falling back to the original hardcoded copy keeps existing
// behavior for anyone who never customizes the template.
function buildRestockEmailContent({ toEmail, productName, size, color, productUrl, productImageUrl, firstName, subjectTemplate, htmlTemplate }) {
  const vars = {
    size,
    color: color || '',
    productName: productName || '',
    productUrl: productUrl || '',
    productImageUrl: productImageUrl || '',
    firstName: firstName || '',
    email: toEmail || ''
  };
  const subject = subjectTemplate ? fillTemplate(subjectTemplate, vars) : defaultRestockSubject(size);
  const html = htmlTemplate ? fillTemplate(htmlTemplate, vars) : defaultRestockHtml({ productName, size, color, productUrl, productImageUrl, firstName, toEmail });

  return { subject, html };
}

async function sendRestockEmail(params) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return { skipped: true, reason: 'BREVO_API_KEY non configuree' };
  }

  const { subject, html } = buildRestockEmailContent(params);
  return sendEmail({ toEmail: params.toEmail, subject, htmlContent: html });
}

module.exports = { sendRestockEmail, buildRestockEmailContent, sendEmail, fillTemplate, newsletterConfirmHtml, influencerQuoteHtml };
