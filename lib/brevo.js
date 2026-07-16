async function sendRestockEmail({ toEmail, productName, size, productUrl }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return { skipped: true, reason: 'BREVO_API_KEY non configuree' };
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'contact@jaces.com';
  const senderName = process.env.BREVO_SENDER_NAME || 'JACES';

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: toEmail }],
        subject: `La taille ${size} est de nouveau disponible !`,
        htmlContent: [
          '<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #16130f;">',
          '<h2 style="margin: 0 0 12px;">Bonne nouvelle !</h2>',
          `<p style="margin: 0 0 16px;">La taille <strong>${size}</strong>${productName ? ` de &laquo;&nbsp;${productName}&nbsp;&raquo;` : ''} est de nouveau en stock chez JACES.</p>`,
          productUrl ? `<p><a href="${productUrl}" style="display:inline-block;background:#111111;color:#ffffff;padding:12px 22px;text-decoration:none;font-weight:bold;">Voir le produit</a></p>` : '',
          '</div>'
        ].join('')
      })
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

module.exports = { sendRestockEmail };
