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

      // Nouveautés category thumbnails (.cat-nav-item only exists on that
      // page - harmless no-op everywhere else).
      document.querySelectorAll('.cat-nav-item[data-category]').forEach((item) => {
        const url = content[`nouveautes_thumb_${item.dataset.category}`];
        if (!url) return;
        const img = item.querySelector('.cat-nav-circle img');
        if (img) img.src = url;
      });
    })
    // Silent fail - every page already has hardcoded fallback text/images,
    // so a network error here just means nothing gets overridden.
    .catch(() => {});
})();
