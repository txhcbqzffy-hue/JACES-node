(function () {
  // Builds the crossfading hero slideshow + its bottom-right dot nav. Each
  // slide gets its own timer (slides can have different durations), so this
  // schedules one setTimeout per step rather than a single fixed interval.
  function initHeroSlideshow(hero, slides) {
    const overlay = 'linear-gradient(rgba(8, 7, 5, 0.28), rgba(8, 7, 5, 0.28)), ';
    const track = document.createElement('div');
    track.className = 'hero-slideshow';

    const dots = document.createElement('div');
    dots.className = 'hero-slide-dots';

    // Resume on the slide the visitor was already looking at instead of
    // always restarting at 1 - sessionStorage so it only persists within
    // the same tab/visit, not forever across unrelated future sessions.
    const STORAGE_KEY = 'jaces-hero-slide-index';
    let startIndex = 0;
    try {
      const stored = parseInt(sessionStorage.getItem(STORAGE_KEY), 10);
      if (Number.isInteger(stored)) startIndex = ((stored % slides.length) + slides.length) % slides.length;
    } catch (error) {}

    const slideEls = slides.map((slide, index) => {
      const el = document.createElement('div');
      el.className = 'hero-slide' + (index === startIndex ? ' is-active' : '');
      el.style.backgroundImage = overlay + `url("${slide.url}")`;
      track.appendChild(el);
      return el;
    });

    const dotEls = slides.map((slide, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'hero-slide-dot' + (index === startIndex ? ' is-active' : '');
      dot.setAttribute('aria-label', `Image ${index + 1}`);
      dot.addEventListener('click', () => goTo(index, true));
      dots.appendChild(dot);
      return dot;
    });

    // Pause/play toggle, same row as the dots - stops the auto-advance
    // timer outright rather than just lengthening it, so a paused slide
    // stays put until explicitly resumed or a dot is clicked.
    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.className = 'hero-slide-pause';
    pauseBtn.setAttribute('aria-label', 'Mettre en pause le défilement');
    pauseBtn.innerHTML =
      '<svg class="hero-slide-pause-icon hero-slide-pause-icon-pause" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="3.4" height="12"/><rect x="9.6" y="2" width="3.4" height="12"/></svg>' +
      '<svg class="hero-slide-pause-icon hero-slide-pause-icon-play" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l10-5.5z"/></svg>';
    dots.appendChild(pauseBtn);

    hero.prepend(dots);
    hero.prepend(track);

    let current = startIndex;
    let timer = null;
    let isPaused = false;

    function goTo(index, isManual) {
      if (index === current) {
        if (isManual && !isPaused) scheduleNext();
        return;
      }
      slideEls[current].classList.remove('is-active');
      dotEls[current].classList.remove('is-active');
      current = index;
      slideEls[current].classList.add('is-active');
      dotEls[current].classList.add('is-active');
      try { sessionStorage.setItem(STORAGE_KEY, String(current)); } catch (error) {}
      if (!isPaused) scheduleNext();
    }

    function scheduleNext() {
      if (timer) clearTimeout(timer);
      if (slides.length < 2) return;
      timer = setTimeout(() => {
        goTo((current + 1) % slides.length, false);
      }, slides[current].duration * 1000);
    }

    pauseBtn.addEventListener('click', () => {
      isPaused = !isPaused;
      pauseBtn.classList.toggle('is-paused', isPaused);
      pauseBtn.setAttribute('aria-label', isPaused ? 'Reprendre le défilement' : 'Mettre en pause le défilement');
      if (isPaused) {
        if (timer) clearTimeout(timer);
      } else {
        scheduleNext();
      }
    });

    scheduleNext();
  }

  fetch('/api/site-content')
    .then((res) => (res.ok ? res.json() : null))
    .then((content) => {
      if (!content) return;

      try {
        localStorage.setItem('jaces-site-content-cache', JSON.stringify(content));
      } catch (error) {
        // Ignore storage failures (private browsing, quota) - the page still
        // works, it just won't have the instant-thumbnail cache next visit.
      }

      if (content.banner_text) {
        document.querySelectorAll('#topbar-banner-text').forEach((el) => {
          el.textContent = content.banner_text;
        });
      }

      // Category-nav-strip thumbnails (Nouveautés/Collection/Collaborations/
      // Accessoires all have the same .cat-nav-item markup with overlapping
      // data-category values like "robes" or "all" - keys are namespaced
      // per page so editing one page's "Robes" thumbnail never touches
      // another page's "Robes" thumbnail.
      const body = document.body;
      const pagePrefix = body.classList.contains('nouveautes-page') ? 'nouveautes'
        : body.classList.contains('accessoires-page') ? 'accessoires'
        : body.classList.contains('collaboration-page') ? 'collaborations'
        : body.classList.contains('collection-page-body') ? 'collection'
        : null;
      if (pagePrefix) {
        document.querySelectorAll('.cat-nav-item[data-category]').forEach((item) => {
          const url = content[`${pagePrefix}_thumb_${item.dataset.category}`];
          if (!url) return;
          const img = item.querySelector('.cat-nav-circle img');
          if (!img) return;
          img.src = url;
          const position = content[`${pagePrefix}_thumb_${item.dataset.category}_position`];
          if (position) img.style.objectPosition = position;
          const zoom = content[`${pagePrefix}_thumb_${item.dataset.category}_zoom`];
          if (zoom && Number(zoom) !== 100) img.style.transform = `scale(${(Number(zoom) / 100).toFixed(2)})`;
        });
      }

      // Homepage hero - only exists on index.html (body.home-page), no-op
      // elsewhere. Admin can configure up to 4 slides (home_hero_slide_1..4
      // + a _duration in seconds for each, default 15s); with none set, the
      // single legacy home_hero_image still works as a static background.
      const heroSlides = [1, 2, 3, 4]
        .map((n) => ({
          url: content[`home_hero_slide_${n}`],
          duration: Number(content[`home_hero_slide_${n}_duration`]) || 15
        }))
        .filter((slide) => slide.url);

      const hero = document.querySelector('body.home-page .hero');
      if (hero && heroSlides.length) {
        initHeroSlideshow(hero, heroSlides);
      } else if (hero && content.home_hero_image) {
        hero.style.backgroundImage =
          `linear-gradient(rgba(8, 7, 5, 0.28), rgba(8, 7, 5, 0.28)), url("${content.home_hero_image}")`;
      }

      // Header logo: an image replaces the plain "JACES" text once set,
      // otherwise (site name only, no logo image) the text itself updates.
      if (content.site_logo) {
        document.querySelectorAll('a.logo').forEach((el) => {
          el.innerHTML = '';
          const img = document.createElement('img');
          img.className = 'logo-image';
          img.src = content.site_logo;
          img.alt = content.site_name || 'JACES';
          el.appendChild(img);
        });
      } else if (content.site_name) {
        document.querySelectorAll('a.logo').forEach((el) => {
          el.textContent = content.site_name;
        });
      }

      if (content.site_name) {
        document.title = document.title.replace('JACES', content.site_name);
      }

      if (content.favicon_url) {
        const favicon = document.getElementById('site-favicon');
        if (favicon) favicon.setAttribute('href', content.favicon_url);
      }
    })
    // Silent fail - every page already has hardcoded fallback text/images,
    // so a network error here just means nothing gets overridden.
    .catch(() => {});
})();
