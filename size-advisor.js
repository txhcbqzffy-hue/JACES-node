(function () {
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function hasUniqueSize(product) {
    return Array.isArray(product?.sizes)
      && product.sizes.length === 1
      && String(product.sizes[0]).toLowerCase() === 'unique';
  }

  function getGarmentRecommendationProfile(product) {
    const name = String(product?.name || '').toLowerCase();

    if (/jupe|pantalon|short|jean/.test(name)) {
      return { baseShift: 0.1, hipsWeight: 1.2, bellyWeight: 1.1, chestWeight: 0.2, easeShift: 0.1 };
    }

    if (/veste/.test(name)) {
      return { baseShift: -0.2, hipsWeight: 0.5, bellyWeight: 0.6, chestWeight: 1.0, easeShift: 0.5 };
    }

    if (/top/.test(name)) {
      return { baseShift: -0.1, hipsWeight: 0.35, bellyWeight: 0.5, chestWeight: 1.15, easeShift: 0.35 };
    }

    if (/robe/.test(name)) {
      return { baseShift: 0, hipsWeight: 0.85, bellyWeight: 0.75, chestWeight: 0.8, easeShift: 0.35 };
    }

    return { baseShift: 0, hipsWeight: 0.7, bellyWeight: 0.7, chestWeight: 0.6, easeShift: 0.3 };
  }

  function getRecommendation(product, profile, fitMode) {
    const availableSizes = Array.isArray(product.sizes) ? product.sizes : [];
    if (!availableSizes.length) return '';
    if (hasUniqueSize(product)) return availableSizes[0];

    const height = Number(profile.height) || 168;
    const weight = Number(profile.weight) || 60;
    const age = Number(profile.age) || 30;
    const bmi = weight / Math.pow(height / 100, 2);
    const chestBand = Number(profile.chestBand) || 90;
    const cup = String(profile.cup || 'C');
    const garmentProfile = getGarmentRecommendationProfile(product);

    let score = garmentProfile.baseShift;
    if (bmi < 18.5) score -= 1;
    if (bmi >= 22.5) score += 1;
    if (bmi >= 25) score += 1;
    if (height >= 174) score += 1;
    if (height <= 160) score -= 1;
    if (age >= 45) score += 0.2;
    if (profile.belly === 'rond') score += 0.7 * garmentProfile.bellyWeight;
    if (profile.belly === 'plat') score -= 0.2 * garmentProfile.bellyWeight;
    if (profile.hips === 'large') score += 0.7 * garmentProfile.hipsWeight;
    if (profile.hips === 'etroit') score -= 0.2 * garmentProfile.hipsWeight;
    if (chestBand >= 100) score += 0.5 * garmentProfile.chestWeight;
    if ('EFGHIJK'.includes(cup)) score += 0.5 * garmentProfile.chestWeight;
    if ('AAB'.includes(cup)) score -= 0.2 * garmentProfile.chestWeight;
    const baseSizeIndex = clamp(Math.round(score + 1), 0, availableSizes.length - 1);
    const sizeIndex = fitMode === 'ample'
      ? clamp(baseSizeIndex + 1, 0, availableSizes.length - 1)
      : baseSizeIndex;

    return availableSizes[sizeIndex];
  }

  function createAdvisorOptionCards(options, field, selected) {
    return options.map((option) => `
      <button class="size-advisor-option${selected === option.value ? ' is-selected' : ''}" type="button" data-field="${field}" data-value="${option.value}">
        <span class="size-advisor-figure size-advisor-figure--${option.value}" aria-hidden="true"></span>
        <span class="size-advisor-option-label">${option.label}</span>
      </button>
    `).join('');
  }

  function openSizeAdvisor(product, initialSize, onApply) {
    const savedAdvisorProfile = window.JacesFavorites && typeof window.JacesFavorites.getSizeAdvisorProfile === 'function'
      ? window.JacesFavorites.getSizeAdvisorProfile()
      : null;
    const overlay = document.createElement('div');
    overlay.className = 'size-advisor-overlay open';
    overlay.innerHTML = '<div class="size-advisor-modal" id="size-advisor-modal"></div>';
    document.body.appendChild(overlay);
    document.body.classList.add('size-advisor-open');

    const modal = overlay.querySelector('#size-advisor-modal');
    const state = {
      step: 0,
      fitMode: savedAdvisorProfile?.fitMode || 'ideal',
      errors: {},
      form: {
        height: savedAdvisorProfile?.height || '',
        weight: savedAdvisorProfile?.weight || '',
        age: savedAdvisorProfile?.age || '',
        belly: savedAdvisorProfile?.belly || '',
        hips: savedAdvisorProfile?.hips || '',
        chestBand: savedAdvisorProfile?.chestBand || '',
        cup: savedAdvisorProfile?.cup || '',
        size: initialSize || ''
      }
    };

    function closeAdvisor() {
      overlay.remove();
      document.body.classList.remove('size-advisor-open');
    }

    function persistSuggestedSizes(activeSize, alternateSize) {
      if (!product?.id) return;
      if (!window.JacesFavorites || typeof window.JacesFavorites.saveProductSelection !== 'function') return;
      window.JacesFavorites.saveProductSelection(product.id, 'suggestedSize', activeSize || '');
      window.JacesFavorites.saveProductSelection(product.id, 'alternateSuggestedSize', alternateSize || '');
    }

    function persistAdvisorProfile(activeSize) {
      if (!window.JacesFavorites || typeof window.JacesFavorites.saveSizeAdvisorProfile !== 'function') return;
      window.JacesFavorites.saveSizeAdvisorProfile(Object.assign({}, state.form, {
        size: activeSize || ''
      }), state.fitMode);
    }

    function validateIntroStep(height, weight, age) {
      const errors = {};
      const parsedHeight = Number.parseInt(height, 10);
      const parsedWeight = Number.parseInt(weight, 10);
      const parsedAge = Number.parseInt(age, 10);

      if (!/^\d{3}$/.test(String(height || '').trim()) || !Number.isInteger(parsedHeight) || parsedHeight < 100 || parsedHeight > 210) {
        errors.height = 'Entrez une taille en cm entre 100 et 210.';
      }

      if (!Number.isInteger(parsedWeight) || parsedWeight < 30 || parsedWeight > 130) {
        errors.weight = 'Entrez un poids entre 30 et 130 kg.';
      }

      if (!Number.isInteger(parsedAge) || parsedAge < 13 || parsedAge > 90) {
        errors.age = 'Entrez un âge entre 13 et 90 ans.';
      }

      return errors;
    }

    function renderResult() {
      const recommended = getRecommendation(product, state.form, state.fitMode);
      const alternate = getRecommendation(product, state.form, state.fitMode === 'ideal' ? 'ample' : 'ideal');
      const activeSize = recommended || product.sizes[0] || '';
      persistAdvisorProfile(activeSize);
      persistSuggestedSizes(activeSize, alternate && alternate !== activeSize ? alternate : '');
      return `
        <div class="size-advisor-shell size-advisor-result">
          <div class="size-advisor-topbar">
            <div></div>
            <button class="size-advisor-close" type="button" data-close="true" aria-label="Fermer">×</button>
          </div>
          <p class="size-advisor-kicker">Votre taille est :</p>
          <div class="size-advisor-size">${activeSize}</div>
          <p class="size-advisor-saved-suggestion">Suggestion ideale enregistree : ${activeSize}</p>
          ${alternate && alternate !== activeSize ? `<p class="size-advisor-alt">Alternative suggeree : ${alternate}</p>` : ''}
          <p class="size-advisor-result-note">Notre recommandation${product?.name ? ' pour cette pièce' : ''}, selon les informations renseignées.</p>
          <div class="size-advisor-fit-toggle">
            <button class="size-advisor-fit-button${state.fitMode === 'ideal' ? ' is-active' : ''}" type="button" data-fit="ideal">Idéale</button>
            <button class="size-advisor-fit-button${state.fitMode === 'ample' ? ' is-active' : ''}" type="button" data-fit="ample">Plus ample</button>
          </div>
          <p class="size-advisor-result-text">${state.fitMode === 'ideal' ? 'Une allure nette, équilibrée et fidèle à la coupe du modèle.' : 'Une option plus relâchée, avec davantage d’aisance sur la silhouette.'}</p>
          <button class="size-advisor-primary" type="button" data-apply-size="${activeSize}">Appliquer la taille ${activeSize}</button>
        </div>
      `;
    }

    function renderStep() {
      const bellyOptions = [
        { value: 'plat', label: 'Plat', figure: 'Plat' },
        { value: 'moyen', label: 'Moyen', figure: 'Moyen' },
        { value: 'rond', label: 'Rond', figure: 'Rond' }
      ];
      const hipsOptions = [
        { value: 'etroit', label: 'Étroit', figure: 'Étroit' },
        { value: 'moyen', label: 'Moyen', figure: 'Moyen' },
        { value: 'large', label: 'Large', figure: 'Large' }
      ];

      if (state.step === 3) {
        modal.innerHTML = renderResult();
        return;
      }

      const showBack = state.step > 0;
      let content = '';

      if (state.step === 0) {
        content = `
          <div class="size-advisor-shell">
            <div class="size-advisor-topbar">
              <button class="size-advisor-back${showBack ? ' visible' : ''}" type="button" data-back="true" aria-label="Retour">←</button>
              <button class="size-advisor-close" type="button" data-close="true" aria-label="Fermer">×</button>
            </div>
            <div class="size-advisor-intro">
              <h2>Trouvez votre taille idéale${product?.name ? ' pour cette pièce' : ''}</h2>
              <p class="size-advisor-subtitle">Quelques informations suffisent pour estimer la coupe la plus juste, dans un parcours pensé pour la femme JACES.</p>
            </div>
            <div class="size-advisor-fields">
              <label class="size-advisor-field">
                <span>Taille*</span>
                <div class="size-advisor-input-wrap${state.errors.height ? ' is-invalid' : ''}">
                  <input id="advisor-height" type="number" min="100" max="210" placeholder="ex : 168" value="${state.form.height}">
                  <strong>cm</strong>
                </div>
                ${state.errors.height ? `<p class="size-advisor-error">${state.errors.height}</p>` : ''}
              </label>
              <label class="size-advisor-field">
                <span>Poids*</span>
                <div class="size-advisor-input-wrap${state.errors.weight ? ' is-invalid' : ''}">
                  <input id="advisor-weight" type="number" min="30" max="130" placeholder="ex : 60" value="${state.form.weight}">
                  <strong>kg</strong>
                </div>
                ${state.errors.weight ? `<p class="size-advisor-error">${state.errors.weight}</p>` : ''}
              </label>
              <label class="size-advisor-field">
                <span>Âge*</span>
                <div class="size-advisor-input-wrap${state.errors.age ? ' is-invalid' : ''}">
                  <input id="advisor-age" type="number" min="13" max="90" placeholder="ex : 30" value="${state.form.age}">
                </div>
                ${state.errors.age ? `<p class="size-advisor-error">${state.errors.age}</p>` : ''}
              </label>
            </div>
            <button class="size-advisor-primary" type="button" data-next="true">Continuer</button>
          </div>
        `;
      }

      if (state.step === 1) {
        content = `
          <div class="size-advisor-shell">
            <div class="size-advisor-topbar">
              <button class="size-advisor-back visible" type="button" data-back="true" aria-label="Retour">←</button>
              <button class="size-advisor-close" type="button" data-close="true" aria-label="Fermer">×</button>
            </div>
            <div class="size-advisor-intro">
              <h2>Choisissez la forme de votre ventre</h2>
              <p class="size-advisor-subtitle">Cette information nous aide à nuancer la recommandation de coupe.</p>
            </div>
            <div class="size-advisor-options-grid">${createAdvisorOptionCards(bellyOptions, 'belly', state.form.belly)}</div>
            <button class="size-advisor-primary" type="button" data-next="true">Continuer</button>
          </div>
        `;
      }

      if (state.step === 2) {
        const bands = ['80', '85', '90', '95', '100', '105', '110'];
        const cups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        content = `
          <div class="size-advisor-shell">
            <div class="size-advisor-topbar">
              <button class="size-advisor-back visible" type="button" data-back="true" aria-label="Retour">←</button>
              <button class="size-advisor-close" type="button" data-close="true" aria-label="Fermer">×</button>
            </div>
            <div class="size-advisor-intro">
              <h2>Affinez votre silhouette</h2>
              <p class="size-advisor-subtitle">Bassin et poitrine affinent la recommandation finale.</p>
            </div>
            <div class="size-advisor-options-grid size-advisor-options-grid-hips">${createAdvisorOptionCards(hipsOptions, 'hips', state.form.hips)}</div>
            <div class="size-advisor-bust">
              <div class="size-advisor-bust-head">
                <span>Tour de dos</span>
                <span>Bonnet</span>
              </div>
              <div class="size-advisor-chip-group">
                ${bands.map((band) => `<button class="size-advisor-chip${state.form.chestBand === band ? ' is-selected' : ''}" type="button" data-field="chestBand" data-value="${band}">${band}</button>`).join('')}
              </div>
              <div class="size-advisor-chip-group size-advisor-chip-group-cups">
                ${cups.map((cup) => `<button class="size-advisor-chip${state.form.cup === cup ? ' is-selected' : ''}" type="button" data-field="cup" data-value="${cup}">${cup}</button>`).join('')}
              </div>
            </div>
            <button class="size-advisor-primary" type="button" data-next="true">Trouver ma taille idéale</button>
          </div>
        `;
      }

      modal.innerHTML = content;
    }

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-close="true"]')) {
        closeAdvisor();
        return;
      }

      const back = event.target.closest('[data-back="true"]');
      if (back) {
        state.step = clamp(state.step - 1, 0, 3);
        renderStep();
        return;
      }

      const option = event.target.closest('[data-field]');
      if (option) {
        state.form[option.dataset.field] = option.dataset.value;
        renderStep();
        return;
      }

      const fitButton = event.target.closest('[data-fit]');
      if (fitButton) {
        state.fitMode = fitButton.dataset.fit;
        renderStep();
        return;
      }

      const restart = event.target.closest('[data-restart="true"]');
      if (restart) {
        state.step = 0;
        state.fitMode = 'ideal';
        renderStep();
        return;
      }

      const apply = event.target.closest('[data-apply-size]');
      if (apply) {
        onApply(apply.dataset.applySize);
        closeAdvisor();
        return;
      }

      const next = event.target.closest('[data-next="true"]');
      if (next) {
        if (state.step === 0) {
          const height = modal.querySelector('#advisor-height')?.value || '';
          const weight = modal.querySelector('#advisor-weight')?.value || '';
          const age = modal.querySelector('#advisor-age')?.value || '';
          state.errors = validateIntroStep(height, weight, age);
          if (Object.keys(state.errors).length) {
            state.form.height = height;
            state.form.weight = weight;
            state.form.age = age;
            renderStep();
            return;
          }
          state.errors = {};
          state.form.height = height;
          state.form.weight = weight;
          state.form.age = age;
        }

        if (state.step === 1 && !state.form.belly) return;

        if (state.step === 2) {
          if (!state.form.hips || !state.form.chestBand || !state.form.cup) return;
        }

        state.step = clamp(state.step + 1, 0, 3);
        renderStep();
      }
    });

    renderStep();
  }

  window.JacesSizeAdvisor = { open: openSizeAdvisor };
})();
