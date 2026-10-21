(() => {
  'use strict';
  const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\u200b/g, '').toLocaleLowerCase().trim();
  const form = document.getElementById('anthology-filters');
  if (form) {
    const query = document.getElementById('anthology-query');
    const category = document.getElementById('anthology-category');
    const language = document.getElementById('anthology-language');
    const cards = Array.from(document.querySelectorAll('[data-work]'));
    const count = document.getElementById('anthology-count');
    const empty = document.getElementById('anthology-empty');
    const params = new URLSearchParams(location.search);
    query.value = params.get('q') || '';
    for (const [input, key] of [[category, 'category'], [language, 'language']]) {
      const value = params.get(key) || '';
      input.value = Array.from(input.options).some(option => option.value === value) ? value : '';
    }
    function update() {
      const words = normalize(query.value).split(/\s+/).filter(Boolean);
      const filters = new URLSearchParams();
      if (query.value.trim()) filters.set('q', query.value.trim());
      if (category.value) filters.set('category', category.value);
      if (language.value) filters.set('language', language.value);
      const search = filters.toString();
      let visible = 0;
      cards.forEach(card => {
        card.hidden = !((!category.value || card.dataset.category === category.value) &&
          (!language.value || card.dataset.language === language.value) &&
          words.every(word => normalize(card.dataset.search).includes(word)));
        if (!card.hidden) visible++;
        card.querySelectorAll('[data-detail]').forEach(link => {
          const url = new URL(link.getAttribute('href'), location.origin);
          url.search = search ? new URLSearchParams({ from: search }).toString() : '';
          link.setAttribute('href', url.pathname + url.search);
        });
      });
      count.textContent = `共 ${cards.length} 篇 · 显示 ${visible} 篇`;
      empty.hidden = visible !== 0;
      try { history.replaceState(null, '', location.pathname + (search ? '?' + search : '') + location.hash); } catch (_) {}
    }
    function reset() { query.value = ''; category.value = ''; language.value = ''; update(); }
    form.hidden = false;
    form.addEventListener('submit', event => { event.preventDefault(); update(); });
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('reset', event => { event.preventDefault(); reset(); });
    document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', reset));
    update();
  }
  // Return only to our own catalog, keeping recognized filters and the selected work.
  const from = new URLSearchParams(location.search).get('from');
  if (from) {
    const source = new URLSearchParams(from), safe = new URLSearchParams();
    for (const key of ['q', 'category', 'language']) if (source.get(key)) safe.set(key, source.get(key));
    document.querySelectorAll('[data-back]').forEach(link => {
      const url = new URL(link.getAttribute('href'), location.origin);
      link.setAttribute('href', '/anthology/?' + safe.toString() + url.hash);
    });
  }
})();
