(function () {
  const STORAGE_KEY = 'jaces-newsletter-popup-shown';
  const SUBSCRIBED_KEY = 'jaces-newsletter-subscribed';
  const RESHOW_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const DELAY_MS = 800;

  // Someone who actually completed a subscription form (popup or footer) is
  // suppressed indefinitely (not just the 7-day reshow window) - only an
  // admin deletion combined with clearing browser storage brings them back.
  function isAlreadySubscribedLocally() {
    try {
      return window.localStorage.getItem(SUBSCRIBED_KEY) === '1';
    } catch (error) {
      return false;
    }
  }

  // The "shown" value is a timestamp, not a flag - someone who only saw the
  // popup without subscribing becomes eligible again after RESHOW_AFTER_MS
  // instead of being suppressed on this browser forever.
  function wasRecentlyShown() {
    try {
      const storedAt = Number(window.localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(storedAt) && (Date.now() - storedAt) < RESHOW_AFTER_MS;
    } catch (error) {
      return false;
    }
  }

  function markShown() {
    try { window.localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch (error) { /* ignore */ }
  }

  function markSubscribed() {
    try { window.localStorage.setItem(SUBSCRIBED_KEY, '1'); } catch (error) { /* ignore */ }
  }

  // A logged-in visitor whose account e-mail is already a confirmed
  // subscriber should never see this again, even on a browser/device where
  // the localStorage flag was never set (new machine, cleared storage...).
  async function isAlreadyConfirmedSubscriber() {
    const session = window.JacesAuth && window.JacesAuth.getSession && window.JacesAuth.getSession();
    if (!session || !session.email) return false;

    try {
      const res = await fetch(`/api/admin-email-subscribers?checkEmail=${encodeURIComponent(session.email)}`);
      const data = await res.json().catch(() => ({}));
      return Boolean(data.confirmed);
    } catch (error) {
      return false;
    }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function buildPopup() {
    const overlay = document.createElement('div');
    overlay.className = 'newsletter-popup-overlay';
    overlay.innerHTML = [
      '<div class="newsletter-popup" role="dialog" aria-modal="true" aria-label="Inscription à la newsletter JACES">',
      '  <button type="button" class="newsletter-popup-close" aria-label="Fermer">×</button>',
      '  <img class="newsletter-popup-logo" src="https://res.cloudinary.com/dnplvtg6h/image/upload/v1784927191/jaces/jaces-wordmark.png" alt="JACES" width="110">',
      '  <form class="newsletter-popup-form">',
      '    <label class="visually-hidden" for="newsletter-popup-email">Votre e-mail</label>',
      '    <input id="newsletter-popup-email" name="email" type="email" placeholder="Votre e-mail" required>',
      '    <label class="newsletter-popup-check"><input type="checkbox" name="wantsProducts" checked><span>Nouveaux produits</span></label>',
      '    <label class="newsletter-popup-check"><input type="checkbox" name="wantsNews" checked><span>Actualités JACES</span></label>',
      '    <p class="newsletter-popup-status" hidden></p>',
      '    <button type="submit" class="newsletter-popup-submit">S’inscrire à la newsletter</button>',
      '    <p class="newsletter-popup-legal">En vous inscrivant, vous acceptez de recevoir nos e-mails et notre <button type="button" class="newsletter-popup-legal-toggle">politique de confidentialité</button>. Désinscription possible à tout moment.</p>',
      '    <div class="newsletter-popup-legal-details" hidden>',
      '      <p><strong>Données collectées</strong> : e-mail et vos préférences (nouveaux produits / actualités).</p>',
      '      <p><strong>Pourquoi</strong> : vous envoyer les e-mails correspondant à ce que vous avez coché, rien d’autre.</p>',
      '      <p><strong>Qui y a accès</strong> : Supabase (hébergement, UE) et Brevo (envoi des e-mails). Jamais revendu à des tiers.</p>',
      '      <p><strong>Vos droits</strong> : accès, rectification, suppression à tout moment - un lien de désinscription est présent dans chaque e-mail, ou écrivez à <a href="mailto:benjamin.peral18@gmail.com">benjamin.peral18@gmail.com</a>.</p>',
      '    </div>',
      '  </form>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);
    return overlay;
  }

  function showPopup() {
    if (document.querySelector('.newsletter-popup-overlay')) return;
    markShown();

    const overlay = buildPopup();
    const form = overlay.querySelector('.newsletter-popup-form');
    const statusEl = overlay.querySelector('.newsletter-popup-status');
    const closeBtn = overlay.querySelector('.newsletter-popup-close');
    const legalToggle = overlay.querySelector('.newsletter-popup-legal-toggle');
    const legalDetails = overlay.querySelector('.newsletter-popup-legal-details');

    legalToggle.addEventListener('click', () => {
      legalDetails.hidden = !legalDetails.hidden;
    });

    requestAnimationFrame(() => overlay.classList.add('open'));

    function close() {
      overlay.classList.remove('open');
      window.setTimeout(() => overlay.remove(), 250);
    }

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', function onEscape(event) {
      if (event.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onEscape);
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const email = String(formData.get('email') || '').trim();
      const submitBtn = form.querySelector('.newsletter-popup-submit');

      statusEl.hidden = true;
      submitBtn.disabled = true;

      try {
        const res = await fetch('/api/admin-email-subscribers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            wantsProducts: formData.get('wantsProducts') === 'on',
            wantsNews: formData.get('wantsNews') === 'on',
            source: 'exit_popup'
          })
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(data.error || 'Erreur serveur');

        markSubscribed();
        form.innerHTML = `<p class="newsletter-popup-success">Merci ! Vérifiez votre boîte mail (${escapeHtml(email)}) pour confirmer votre inscription.</p>`;
        window.setTimeout(close, 10000);
      } catch (error) {
        statusEl.hidden = false;
        statusEl.textContent = 'Impossible de vous inscrire pour le moment, réessayez plus tard.';
        submitBtn.disabled = false;
      }
    });
  }

  async function maybeShowPopup() {
    if (document.querySelector('.newsletter-popup-overlay')) return;
    if (await isAlreadyConfirmedSubscriber()) {
      markSubscribed();
      return;
    }
    showPopup();
  }

  function armExitIntent() {
    function onMouseOut(event) {
      if (event.relatedTarget || event.toElement) return;
      if (event.clientY > 0) return;
      maybeShowPopup();
      document.removeEventListener('mouseout', onMouseOut);
    }
    document.addEventListener('mouseout', onMouseOut);
  }

  function initExitIntentPopup() {
    // Touch devices have no cursor to detect leaving through - a timed
    // popup there would just feel like a random interruption.
    const isTouchDevice = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    if (isTouchDevice) return;
    if (isAlreadySubscribedLocally()) return;
    if (wasRecentlyShown()) return;

    window.setTimeout(armExitIntent, DELAY_MS);
    // Exit-intent via mouseout is notoriously unreliable across browsers
    // (Safari in particular often never fires it) - a time-based fallback
    // guarantees visitors who stick around actually see the offer.
    window.setTimeout(maybeShowPopup, 25000);
  }

  // The footer newsletter form (present on most pages) is a lighter,
  // always-visible alternative to the exit-intent popup - email only, no
  // name fields, no touch-device restriction, and always shown (unlike the
  // popup, resubmitting here just harmlessly re-confirms the same prefs).
  async function initFooterForms() {
    const forms = document.querySelectorAll('.footer-newsletter-form');
    if (!forms.length) return;

    forms.forEach((form) => {
      const emailInput = form.querySelector('input[type="email"]');
      const submitBtn = form.querySelector('button[type="submit"]');
      let statusEl = form.parentElement.querySelector('.footer-newsletter-status');
      if (!statusEl) {
        statusEl = document.createElement('p');
        statusEl.className = 'footer-newsletter-status';
        form.insertAdjacentElement('afterend', statusEl);
      }

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = String(emailInput.value || '').trim();
        statusEl.textContent = '';
        submitBtn.disabled = true;

        try {
          const res = await fetch('/api/admin-email-subscribers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, wantsProducts: true, wantsNews: true, source: 'footer' })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Erreur serveur');

          markSubscribed();
          statusEl.textContent = `Vérifiez votre boîte mail (${email}) pour confirmer votre inscription.`;
          form.reset();
        } catch (error) {
          statusEl.textContent = 'Impossible de vous inscrire pour le moment, réessayez plus tard.';
        } finally {
          submitBtn.disabled = false;
        }
      });
    });
  }

  function init() {
    initExitIntentPopup();
    initFooterForms();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
