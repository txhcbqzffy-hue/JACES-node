(function () {
  fetch('/api/site-content')
    .then((res) => (res.ok ? res.json() : null))
    .then((content) => {
      if (!content) return;

      if (content.banner_text) {
        document.querySelectorAll('.topbar').forEach((el) => {
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
          if (img) img.src = url;
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
    })
    // Silent fail - every page already has hardcoded fallback text/images,
    // so a network error here just means nothing gets overridden.
    .catch(() => {});
})();
