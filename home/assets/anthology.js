(() => {
  'use strict';
  const i18n = window.SiteI18n;
  const text = (key, values = {}) => i18n.t('anthology.' + key, values);
  const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\u200b/g, '').toLocaleLowerCase().trim();
  const form = document.getElementById('anthology-filters');
  let update = () => {};
  if (form) {
    const query = document.getElementById('anthology-query');
    const category = document.getElementById('anthology-category');
    const language = document.getElementById('anthology-language');
    const sort = document.getElementById('anthology-sort');
    const cards = Array.from(document.querySelectorAll('[data-work]'));
    const list = document.querySelector('.anthology-list');
    const count = document.getElementById('anthology-count');
    const empty = document.getElementById('anthology-empty');
    function readParams() {
      const params = new URLSearchParams(location.search);
      query.value = params.get('q') || '';
      for (const [input, key] of [[category, 'category'], [language, 'language'], [sort, 'sort']]) {
        const value = params.get(key) || (key === 'sort' ? 'source' : '');
        input.value = Array.from(input.options).some(option => option.value === value) ? value : (key === 'sort' ? 'source' : '');
      }
    }
    readParams();
    update = (writeHistory = true) => {
      const words = normalize(query.value).split(/\s+/).filter(Boolean);
      const filters = new URLSearchParams();
      if (query.value.trim()) filters.set('q', query.value.trim());
      if (category.value) filters.set('category', category.value);
      if (language.value) filters.set('language', language.value);
      if (sort.value !== 'source') filters.set('sort', sort.value);
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
          link.setAttribute('href', i18n.localizedPath(url.pathname + url.search));
        });
      });
      const ordered = [...cards].sort(sort.value === 'title'
        ? (a, b) => a.querySelector('h2').textContent.localeCompare(b.querySelector('h2').textContent, i18n.lang() === 'en' ? 'en' : 'zh-CN')
        : (a, b) => Number(a.dataset.order) - Number(b.dataset.order));
      // Move only when required. A label repaint must not disturb selection or focus.
      ordered.forEach((card, index) => { if (list.children[index] !== card) list.insertBefore(card, list.children[index] || null); });
      count.textContent = text('count', { total: cards.length, visible });
      empty.hidden = visible !== 0;
      if (writeHistory) try { history.replaceState(history.state, '', location.pathname + (search ? '?' + search : '') + location.hash); } catch (_) {}
    };
    function reset() { query.value = ''; category.value = ''; language.value = ''; sort.value = 'source'; update(); }
    form.hidden = false;
    form.addEventListener('submit', event => { event.preventDefault(); update(); });
    form.addEventListener('input', () => update());
    form.addEventListener('change', () => update());
    form.addEventListener('reset', event => { event.preventDefault(); reset(); });
    document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', reset));
    window.addEventListener('popstate', () => { readParams(); update(false); });
    update();
  }
  function repaint() {
    const english = i18n.lang() === 'en';
    document.querySelectorAll('[data-source-excerpt]').forEach(el => { el.hidden = english; });
    document.querySelectorAll('[data-reading-guide]').forEach(el => { el.hidden = !english; });
    document.querySelectorAll('[data-original-title]').forEach(el => { el.hidden = !english || el.textContent === document.getElementById('work-title')?.textContent; });
    document.querySelectorAll('a[href]').forEach(link => {
      const value = link.getAttribute('href');
      if (/^\/(?:en\/)?anthology\//.test(value)) link.setAttribute('href', i18n.localizedPath(value));
    });
    // Return only to our own catalog, retaining recognized filters and the work hash.
    const from = new URLSearchParams(location.search).get('from');
    if (from) {
      const source = new URLSearchParams(from), safe = new URLSearchParams();
      for (const key of ['q', 'category', 'language', 'sort']) if (source.get(key)) safe.set(key, source.get(key));
      document.querySelectorAll('[data-back]').forEach(link => {
        const url = new URL(link.getAttribute('href'), location.origin);
        link.setAttribute('href', i18n.localizedPath('/anthology/?' + safe.toString() + url.hash));
      });
    }
    update(false);
  }
  i18n.onChange(repaint);
  repaint();
})();
