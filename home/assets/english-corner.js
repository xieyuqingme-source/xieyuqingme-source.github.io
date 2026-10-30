/* Local filtering and optional read marks; reading content works without JavaScript. */
(function (global, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global && global.document) api.mount(global);
})(typeof window === 'object' ? window : null, function () {
  'use strict';
  const READ_KEY = 'xieyuqing-english-read-v1';
  const validSlug = value => typeof value === 'string' && /^[a-z][a-z0-9-]{1,63}$/.test(value);
  function parseRead(raw) {
    if (!raw) return new Set();
    try {
      const value = JSON.parse(raw);
      if (!value || value.version !== 1 || !Array.isArray(value.read) || value.read.length > 512 || Object.keys(value).some(key => !['version', 'read'].includes(key)) || !value.read.every(validSlug)) return new Set();
      return new Set(value.read);
    } catch (_) { return new Set(); }
  }
  function chooseUnread(slugs, read, random = Math.random) {
    const unseen = slugs.filter(slug => !read.has(slug)), pool = unseen.length ? unseen : slugs;
    if (!pool.length) return null;
    const roll = Number(random());
    const index = Math.floor((Number.isFinite(roll) ? Math.max(0, Math.min(roll, 1 - Number.EPSILON)) : 0) * pool.length);
    return pool[index];
  }
  function createReadStore(storage) {
    let available = false, read = new Set();
    try {
      read = parseRead(storage.getItem(READ_KEY));
      const probe = READ_KEY + '-probe';
      storage.setItem(probe, '1'); storage.removeItem(probe); available = true;
    } catch (_) {}
    function reload() {
      if (available) try { read = parseRead(storage.getItem(READ_KEY)); } catch (_) { available = false; read = new Set(); }
      return new Set(read);
    }
    return {
      get available() { return available; }, reload,
      add(slug) {
        if (!available || !validSlug(slug)) return false;
        try { reload(); if (!available) return false; read.add(slug); storage.setItem(READ_KEY, JSON.stringify({version: 1, read: [...read].slice(-512)})); return true; }
        catch (_) { available = false; read = new Set(); return false; }
      },
      clear() {
        if (!available) return false;
        try { storage.removeItem(READ_KEY); read = new Set(); return true; }
        catch (_) { available = false; read = new Set(); return false; }
      }
    };
  }
  function mount(global) {
    const root = global.document.querySelector('[data-english-corner]');
    if (!root) return;
    const cleanups = [], listen = (target, type, fn) => { target.addEventListener(type, fn); cleanups.push(() => target.removeEventListener(type, fn)); };
    const rows = [...root.querySelectorAll('[data-ec-row]')], controls = root.querySelector('[data-ec-filters]');
    const columns = new Set((root.dataset.englishColumns || 'words classics between myths').split(/\s+/).filter(Boolean));
    const params = new URLSearchParams(global.location.search);
    let column = columns.has(params.get('column')) ? params.get('column') : 'all', level = ['1', '2', '3'].includes(params.get('level')) ? params.get('level') : 'all';
    function query() { const values = new URLSearchParams(); if (column !== 'all') values.set('column', column); if (level !== 'all') values.set('level', level); return values.size ? '?' + values : ''; }
    const currentSlug = root.querySelector('[data-ec-current-card]')?.dataset.ecCurrentCard;
    let store = null;
    if (rows.length || currentSlug) {
      try { store = createReadStore(global.localStorage); } catch (_) {}
      if (currentSlug) store?.add(currentSlug);
    }
    function renderRead() {
      const available = Boolean(store?.available), read = available ? store.reload() : new Set();
      const tools = root.querySelector('[data-ec-read-tools]');
      if (tools) tools.hidden = !(available && store.available);
      let count = 0;
      rows.forEach(row => {
        const done = available && store.available && read.has(row.dataset.slug);
        const badge = row.querySelector('[data-ec-read-flag]');
        if (badge) badge.hidden = !done;
        if (done) count++;
      });
      const summary = root.querySelector('[data-ec-read-count]');
      if (summary && available && store.available) summary.textContent = '已读 ' + count + ' / ' + rows.length;
    }
    function render(update) {
      let count = 0;
      rows.forEach(row => { row.hidden = !(column === 'all' || row.dataset.column === column) || !(level === 'all' || row.dataset.level === level); if (!row.hidden) count++; });
      root.querySelectorAll('[data-ec-group]').forEach(group => { group.hidden = ![...group.querySelectorAll('[data-ec-row]')].some(row => !row.hidden); });
      root.querySelectorAll('[data-ec-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.ecFilter === column)));
      root.querySelectorAll('[data-ec-level]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.ecLevel === level)));
      const countNode = root.querySelector('[data-ec-count]'); if (countNode) countNode.textContent = '显示 ' + count + ' / ' + rows.length + ' 张';
      const empty = root.querySelector('[data-ec-empty]'); if (empty) empty.hidden = count > 0;
      const random = root.querySelector('[data-ec-random]'); if (random) random.disabled = !count;
      root.querySelectorAll('[data-ec-card],[data-ec-full]').forEach(link => { link.search = query(); });
      if (update) global.history.replaceState(global.history.state, '', global.location.pathname + query() + global.location.hash);
      renderRead();
    }
    if (rows.length && controls) {
      controls.hidden = false;
      root.querySelectorAll('a[data-ec-filter]').forEach(link => link.setAttribute('role', 'button'));
      const random = root.querySelector('[data-ec-random]'); if (random) random.hidden = false;
      listen(root, 'click', event => {
        const target = event.target.closest('[data-ec-filter],[data-ec-level],[data-ec-column],[data-ec-clear],[data-ec-random]');
        if (!target || !root.contains(target)) return;
        if (target.hasAttribute('data-ec-clear')) { store?.clear(); renderRead(); return; }
        if (target.hasAttribute('data-ec-random')) {
          const visible = rows.filter(row => !row.hidden), read = store?.available ? store.reload() : new Set();
          const selected = chooseUnread(visible.map(row => row.dataset.slug), read);
          const row = visible.find(row => row.dataset.slug === selected);
          row?.querySelector('[data-ec-card]')?.click(); return;
        }
        if (target.hasAttribute('data-ec-column')) { event.preventDefault(); column = target.dataset.ecColumn; }
        if (target.hasAttribute('data-ec-filter')) { event.preventDefault(); column = target.dataset.ecFilter; }
        if (target.hasAttribute('data-ec-level')) level = target.dataset.ecLevel;
        render(true);
      });
      listen(root, 'keydown', event => { const link = event.target.closest('a[data-ec-filter]'); if (link && event.key === ' ') { event.preventDefault(); link.click(); } });
      listen(global, 'popstate', () => { const p = new URLSearchParams(global.location.search); column = columns.has(p.get('column')) ? p.get('column') : 'all'; level = ['1', '2', '3'].includes(p.get('level')) ? p.get('level') : 'all'; render(false); });
      listen(global, 'storage', event => { if (event.key === READ_KEY || event.key === null) renderRead(); });
      render(false);
    }
    root.querySelectorAll('[data-ec-return]').forEach(link => { if (params.has('column') || params.has('level')) link.search = query(); });
    root.dataset.ecMounted = 'true';
    global.SiteNavigation?.own?.(() => { delete root.dataset.ecMounted; cleanups.splice(0).reverse().forEach(fn => fn()); });
  }
  return {READ_KEY, parseRead, chooseUnread, createReadStore, mount};
});
