(function () {
  // Builds the crossfading hero slideshow + its bottom-right dot nav. Each
  // slide gets its own timer (slides can have different durations), so this
  // schedules one setTimeout per step rather than a single fixed interval.
  function initHeroSlideshow(hero, slides) {
    const overlay = 'linear-gradient(rgba(8, 7, 5, 0.44), rgba(8, 7, 5, 0.44)), ';
    const track = document.createElement('div');
    track.className = 'hero-slideshow';

    const dots = document.createElement('div');
    dots.className = 'hero-slide-dots';

    const slideEls = slides.map((slide, index) => {
      const el = document.createElement('div');
      el.className = 'hero-slide' + (index === 0 ? ' is-active' : '');
      el.style.backgroundImage = overlay + `url("${slide.url}")`;
      track.appendChild(el);
      return el;
    });

    const dotEls = slides.map((slide, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'hero-slide-dot' + (index === 0 ? ' is-active' : '');
      dot.setAttribute('aria-label', `Image ${index + 1}`);
      dot.addEventListener('click', () => goTo(index, true));
      dots.appendChild(dot);
      return dot;
    });

    hero.prepend(dots);
    hero.prepend(track);

    let current = 0;
    let timer = null;

    function goTo(index, isManual) {
      if (index === current) {
        if (isManual) scheduleNext();
        return;
      }
      slideEls[current].classList.remove('is-active');
      dotEls[current].classList.remove('is-active');
      current = index;
      slideEls[current].classList.add('is-active');
      dotEls[current].classList.add('is-active');
      scheduleNext();
    }

    function scheduleNext() {
      if (timer) clearTimeout(timer);
      if (slides.length < 2) return;
      timer = setTimeout(() => {
        goTo((current + 1) % slides.length, false);
      }, slides[current].duration * 1000);
    }

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
          `linear-gradient(rgba(8, 7, 5, 0.44), rgba(8, 7, 5, 0.44)), url("${content.home_hero_image}")`;
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
