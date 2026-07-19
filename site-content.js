(function () {
  // The category-nav-strip circles start with opacity:0 (see style.css
  // .cat-nav-circle img) so admin-edited thumbnails never show the
  // hardcoded HTML default first and then visibly swap to the real one -
  // revealCatNavImages() only runs once we know the final src for every
  // circle (either the admin override, once it has actually loaded, or
  // the untouched hardcoded default).
  function revealCatNavImages() {
    document.querySelectorAll('.cat-nav-circle img').forEach((img) => {
      img.classList.add('is-ready');
    });
  }

  // Safety net: never leave the thumbnails invisible indefinitely if the
  // fetch hangs or an override image fails to load.
  setTimeout(revealCatNavImages, 4000);

  fetch('/api/site-content')
    .then((res) => (res.ok ? res.json() : null))
    .then((content) => {
      if (!content) {
        revealCatNavImages();
        return;
      }

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

      const items = pagePrefix
        ? Array.from(document.querySelectorAll('.cat-nav-item[data-category]'))
        : [];

      if (!items.length) {
        revealCatNavImages();
      } else {
        let pending = 0;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          revealCatNavImages();
        };

        items.forEach((item) => {
          const url = content[`${pagePrefix}_thumb_${item.dataset.category}`];
          const img = item.querySelector('.cat-nav-circle img');
          if (!img || !url || url === img.getAttribute('src')) return;
          // Swap only once the new image has actually finished loading, so
          // revealing it never shows a half-loaded/broken frame either.
          pending += 1;
          const onSettle = () => {
            pending -= 1;
            if (pending === 0) finish();
          };
          const probe = new Image();
          probe.onload = () => { img.src = url; onSettle(); };
          probe.onerror = onSettle;
          probe.src = url;
        });

        if (pending === 0) finish();
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
    .catch(() => {
      revealCatNavImages();
    });
})();
