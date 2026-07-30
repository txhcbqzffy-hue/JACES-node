(function () {
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

      // Homepage cover image (the full-bleed "Cet été, ose aussi." hero) -
      // only exists on index.html (body.home-page), no-op elsewhere. Keeps
      // the same dark gradient overlay so the title text stays readable.
      if (content.home_hero_image) {
        const hero = document.querySelector('body.home-page .hero');
        if (hero) {
          hero.style.backgroundImage =
            `linear-gradient(rgba(8, 7, 5, 0.44), rgba(8, 7, 5, 0.44)), url("${content.home_hero_image}")`;
        }
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
