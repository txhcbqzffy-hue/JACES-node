(function () {
  function getAccountEmail() {
    if (window.JacesAuth && typeof window.JacesAuth.getSession === 'function') {
      return String(window.JacesAuth.getSession()?.email || '').trim();
    }
    return '';
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  async function submitNotification(productId, size, email) {
    try {
      const res = await fetch('/api/stock-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, size, email })
      });
      return res.ok;
    } catch (error) {
      return false;
    }
  }

  function openStockNotify(productId, size, productName) {
    document.querySelectorAll('.stock-notify-overlay').forEach((node) => node.remove());

    const overlay = document.createElement('div');
    overlay.className = 'stock-notify-overlay open';
    document.body.appendChild(overlay);

    function close() {
      overlay.remove();
    }

    function renderLoading() {
      overlay.innerHTML = `
        <div class="stock-notify-modal">
          <button class="stock-notify-close" type="button" data-close="true" aria-label="Fermer">×</button>
          <p class="stock-notify-title">Un instant&hellip;</p>
        </div>
      `;
    }

    function renderConfirmed() {
      overlay.innerHTML = `
        <div class="stock-notify-modal">
          <button class="stock-notify-close" type="button" data-close="true" aria-label="Fermer">×</button>
          <p class="stock-notify-title">C'est not&eacute; !</p>
          <p class="stock-notify-text">Vous recevrez un e-mail d&egrave;s que la taille <strong>${size}</strong> sera de nouveau disponible${productName ? ' pour "' + productName + '"' : ''}.</p>
        </div>
      `;
    }

    function renderForm(errorMessage) {
      const accountEmail = getAccountEmail();
      overlay.innerHTML = `
        <div class="stock-notify-modal">
          <button class="stock-notify-close" type="button" data-close="true" aria-label="Fermer">×</button>
          <p class="stock-notify-title">Taille ${size} indisponible</p>
          <p class="stock-notify-text">Soyez averti(e) par e-mail d&egrave;s qu'elle sera de nouveau en stock.</p>
          <label class="stock-notify-field">
            <span>E-mail</span>
            <input type="email" id="stock-notify-email" placeholder="vous@exemple.com" value="${accountEmail.replace(/"/g, '&quot;')}">
          </label>
          ${errorMessage ? `<p class="stock-notify-error">${errorMessage}</p>` : ''}
          <button type="button" class="stock-notify-primary" data-submit="true">M'avertir</button>
        </div>
      `;
      overlay.querySelector('#stock-notify-email')?.focus();
    }

    overlay.addEventListener('click', async (event) => {
      if (event.target === overlay || event.target.closest('[data-close="true"]')) {
        close();
        return;
      }

      if (event.target.closest('[data-submit="true"]')) {
        const email = overlay.querySelector('#stock-notify-email')?.value || '';
        if (!isValidEmail(email)) {
          renderForm('Entrez une adresse e-mail valide.');
          return;
        }
        renderLoading();
        const ok = await submitNotification(productId, size, email.trim());
        if (ok) renderConfirmed();
        else renderForm('Une erreur est survenue, r&eacute;essayez.');
      }
    });

    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.id === 'stock-notify-email') {
        event.preventDefault();
        overlay.querySelector('[data-submit="true"]')?.click();
      }
    });

    const accountEmail = getAccountEmail();
    if (accountEmail) {
      renderLoading();
      submitNotification(productId, size, accountEmail).then((ok) => {
        if (ok) renderConfirmed();
        else renderForm('Une erreur est survenue, r&eacute;essayez.');
      });
    } else {
      renderForm();
    }
  }

  window.JacesStockNotify = { open: openStockNotify };
})();
