/* Local, progressive quotation filters. The complete reading list remains in HTML. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.EnglishQuotes = api; api.mount({window:root,document:root.document}); }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const INSTANCE = Symbol.for('english-quote-library.mount');
  const all = 'all';
  function choice(value, known) { return typeof value === 'string' && known.has(value) ? value : all; }
  function readFilters(search, authors, periods) {
    const params = new URLSearchParams(typeof search === 'string' ? search : '');
    function read(key, known) {
      const values = params.getAll(key);
      return values.length === 1 ? choice(values[0], known) : all;
    }
    return {author:read('author',authors),period:read('period',periods)};
  }
  function matches(item, filters) {
    return (filters.author === all || item.author === filters.author)
      && (filters.period === all || item.period === filters.period);
  }
  function queryString(search, filters) {
    const params = new URLSearchParams(typeof search === 'string' ? search : '');
    for (const key of ['author','period']) {
      params.delete(key);
      if (typeof filters[key] === 'string' && filters[key] && filters[key] !== all) params.set(key,filters[key]);
    }
    const result = params.toString();
    return result ? '?' + result : '';
  }
  function mount(options = {}) {
    const win = options.window, doc = options.document;
    const root = doc?.querySelector?.('[data-english-quote-library]');
    if (!win || !root) return {destroy() {}};
    if (root[INSTANCE]) return root[INSTANCE];
    const controls = root.querySelector('[data-english-quote-filters]');
    const author = root.querySelector('#ec-quote-author'), period = root.querySelector('#ec-quote-period');
    const count = root.querySelector('#ec-quote-count'), empty = root.querySelector('#ec-quote-empty');
    if (!controls || !author || !period || !count || !empty) return {destroy() {}};
    const rows = [...root.querySelectorAll('[data-english-quote-row]')];
    const authors = new Set(rows.map(row => row.dataset.author)), periods = new Set(rows.map(row => row.dataset.period));
    const pathname = win.location?.pathname;
    const initial = {controls:controls.hidden,count:count.textContent,empty:empty.hidden,
      author:author.value,period:period.value,rows:rows.map(row => row.hidden)};
    const cleanups = [];
    let disposed = false, filters = {author:all,period:all};
    const active = () => !disposed && (pathname === undefined || win.location?.pathname === pathname);
    function listen(target, type, fn) {
      target.addEventListener(type,fn);
      cleanups.push(() => target.removeEventListener(type,fn));
    }
    function saveQuery() {
      if (!win.location || !win.history?.replaceState) return;
      const next = win.location.pathname + queryString(win.location.search,filters) + (win.location.hash || '');
      const current = win.location.pathname + win.location.search + (win.location.hash || '');
      if (next !== current) {
        try { win.history.replaceState(win.history.state,'',next); }
        catch (_) { /* Filtering still works when a browser disallows history updates. */ }
      }
    }
    function render(updateURL) {
      if (!active()) return;
      let visible = 0;
      for (const row of rows) {
        row.hidden = !matches(row.dataset,filters);
        if (!row.hidden) visible++;
      }
      author.value = filters.author; period.value = filters.period;
      count.textContent = '显示 ' + visible + ' / ' + rows.length + ' 条';
      empty.hidden = visible !== 0;
      if (updateURL) saveQuery();
    }
    function refresh(updateURL = true) {
      if (!active()) return;
      filters = {author:choice(author.value,authors),period:choice(period.value,periods)};
      render(updateURL);
    }
    function restore() {
      if (!active()) return;
      filters = readFilters(win.location?.search || '',authors,periods);
      render(true);
    }
    function destroy() {
      if (disposed) return;
      disposed = true;
      cleanups.splice(0).reverse().forEach(fn => fn());
      rows.forEach((row,index) => { row.hidden = initial.rows[index]; });
      controls.hidden = initial.controls; count.textContent = initial.count; empty.hidden = initial.empty;
      author.value = initial.author; period.value = initial.period;
      if (root[INSTANCE] === api) delete root[INSTANCE];
    }
    const api = {refresh,destroy,state:() => ({...filters})};
    root[INSTANCE] = api;
    listen(author,'change',() => refresh());
    listen(period,'change',() => refresh());
    listen(controls,'submit',event => { event.preventDefault();refresh(); });
    listen(controls,'reset',event => {
      if (!active()) return;
      event.preventDefault(); filters = {author:all,period:all}; render(true);
    });
    listen(win,'popstate',restore);
    controls.hidden = false;
    restore();
    win.SiteNavigation?.own?.(destroy);
    return api;
  }
  return {readFilters,matches,queryString,mount};
});
