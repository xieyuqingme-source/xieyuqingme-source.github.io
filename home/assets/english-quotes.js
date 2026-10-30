/* Local quotation browsing; the complete source-backed list remains in HTML. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.EnglishQuotes = api; api.mount({window:root,document:root.document}); }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const INSTANCE = Symbol.for('english-quote-library.mount'), all = 'all', BATCH = 20;
  function choice(value, known) { return typeof value === 'string' && known.has(value) ? value : all; }
  function readFilters(search, authors, periods, themes) {
    const params = new URLSearchParams(typeof search === 'string' ? search : '');
    function read(key, known) {
      const values = params.getAll(key);
      return values.length === 1 ? choice(values[0], known) : all;
    }
    const result = {author:read('author',authors),period:read('period',periods)};
    if (themes) result.theme = read('theme',themes);
    return result;
  }
  function rowThemes(value) {
    return typeof value === 'string' ? value.trim().split(/\s+/).filter(Boolean) : [];
  }
  function matches(item, filters) {
    return (filters.author === all || item.author === filters.author)
      && (filters.period === all || item.period === filters.period)
      && (!filters.theme || filters.theme === all || rowThemes(item.themes).includes(filters.theme));
  }
  function queryString(search, filters) {
    const params = new URLSearchParams(typeof search === 'string' ? search : '');
    for (const key of ['author','period',...(Object.hasOwn(filters,'theme') ? ['theme'] : [])]) {
      params.delete(key);
      if (typeof filters[key] === 'string' && filters[key] && filters[key] !== all) params.set(key,filters[key]);
    }
    const result = params.toString();
    return result ? '?' + result : '';
  }
  function readingText(element) {
    if (!element) return '';
    if (!element.childNodes?.length) return element.textContent || '';
    return [...element.childNodes].map(node => node.nodeName === 'BR' ? '\n' : readingText(node)).join('');
  }
  function copyText(row) {
    const original = row.querySelector?.('.ec-library-original'), translation = row.querySelector?.('.ec-library-translation');
    return [readingText(original).trim(),readingText(translation).trim(),row.dataset.copySource || ''].filter(Boolean).join('\n\n');
  }
  function mount(options = {}) {
    const win = options.window, doc = options.document;
    const root = doc?.querySelector?.('[data-english-quote-library]');
    if (!win || !root) return {destroy() {}};
    if (root[INSTANCE]) return root[INSTANCE];
    const controls = root.querySelector('[data-english-quote-filters]');
    const author = root.querySelector('#ec-quote-author'), period = root.querySelector('#ec-quote-period');
    const theme = root.querySelector('#ec-quote-theme'), more = root.querySelector('#ec-quote-more');
    const randomButton = root.querySelector('#ec-quote-random');
    const count = root.querySelector('#ec-quote-count'), empty = root.querySelector('#ec-quote-empty');
    if (!controls || !author || !period || !count || !empty) return {destroy() {}};
    const rows = [...root.querySelectorAll('[data-english-quote-row]')];
    const authors = new Set(rows.map(row => row.dataset.author)), periods = new Set(rows.map(row => row.dataset.period));
    const themes = new Set(rows.flatMap(row => rowThemes(row.dataset.themes)));
    const copies = rows.map(row => ({row,button:row.querySelector?.('[data-english-quote-copy]'),status:row.querySelector?.('[data-english-quote-copy-status]')}));
    const pathname = win.location?.pathname, random = options.random || Math.random;
    const initial = {controls:controls.hidden,count:count.textContent,empty:empty.hidden,
      author:author.value,period:period.value,theme:theme?.value,more:more && {hidden:more.hidden,text:more.textContent},
      random:randomButton && {hidden:randomButton.hidden,disabled:randomButton.disabled},rows:rows.map(row => row.hidden),
      copies:copies.map(({button,status}) => ({button:button?.hidden,status:status && {hidden:status.hidden,text:status.textContent}}))};
    const cleanups = [];
    const blank = () => ({author:all,period:all,...(theme ? {theme:all} : {})});
    let disposed = false, filters = blank(), visibleRows = new Set(), lastRandom;
    const active = () => !disposed && (pathname === undefined || win.location?.pathname === pathname);
    function listen(target, type, fn) {
      target.addEventListener(type,fn);
      cleanups.push(() => target.removeEventListener(type,fn));
    }
    function saveQuery(hash = win.location?.hash || '') {
      if (!win.location || !win.history?.replaceState) return;
      const next = win.location.pathname + queryString(win.location.search,filters) + hash;
      const current = win.location.pathname + win.location.search + (win.location.hash || '');
      if (next !== current) {
        try { win.history.replaceState(win.history.state,'',next); }
        catch (_) { /* Browsing still works when history updates are unavailable. */ }
      }
    }
    const matching = () => rows.filter(row => matches(row.dataset,filters));
    function resetVisible() { visibleRows = new Set(more ? matching().slice(0,BATCH) : matching()); }
    function hashRow() {
      const hash = win.location?.hash || '';
      return rows.find(row => '#' + row.id === hash);
    }
    function reveal(row, resetFilters = false) {
      if (!row) return;
      if (resetFilters && !matches(row.dataset,filters)) {
        if (filters.author !== all && filters.author !== row.dataset.author) filters.author = all;
        if (filters.period !== all && filters.period !== row.dataset.period) filters.period = all;
        if (theme && filters.theme !== all && !rowThemes(row.dataset.themes).includes(filters.theme)) filters.theme = all;
        resetVisible();
      }
      if (matches(row.dataset,filters)) visibleRows.add(row);
    }
    function render(updateURL, hash) {
      if (!active()) return;
      const matched = matching(), shown = matched.filter(row => visibleRows.has(row)), visible = new Set(shown);
      for (const row of rows) row.hidden = !visible.has(row);
      author.value = filters.author; period.value = filters.period;
      if (theme) theme.value = filters.theme;
      count.textContent = '显示 ' + shown.length + ' / ' + (more ? matched.length : rows.length) + ' 条'
        + (more && matched.length !== rows.length ? '（共 ' + rows.length + ' 条）' : '');
      empty.hidden = matched.length !== 0;
      if (more) { more.hidden = shown.length === matched.length;more.textContent = '再看 ' + Math.min(BATCH,Math.max(0,matched.length - shown.length)) + ' 句'; }
      if (randomButton) { randomButton.hidden = false;randomButton.disabled = matched.length === 0; }
      if (updateURL) saveQuery(hash);
    }
    function refresh(updateURL = true) {
      if (!active()) return;
      filters = {author:choice(author.value,authors),period:choice(period.value,periods),...(theme ? {theme:choice(theme.value,themes)} : {})};
      resetVisible();
      const hash = hashRow() ? '' : win.location?.hash || '';
      render(updateURL,hash);
    }
    function locate(row, focus = false) {
      row?.scrollIntoView?.({block:'start',behavior:'auto'});
      if (focus) row?.focus?.({preventScroll:true});
    }
    function restore() {
      if (!active()) return;
      filters = readFilters(win.location?.search || '',authors,periods,theme ? themes : undefined);
      resetVisible();
      const target = hashRow();reveal(target,true);render(true);locate(target);
    }
    function pickRandom() {
      if (!active()) return;
      let candidates = matching();
      if (candidates.length > 1) candidates = candidates.filter(row => row !== lastRandom);
      if (!candidates.length) return;
      const value = random(), index = Number.isFinite(value) && value >= 0 && value < 1 ? Math.floor(value * candidates.length) : 0;
      const target = candidates[index];lastRandom = target;
      reveal(target);render(true,target.id ? '#' + target.id : win.location?.hash || '');locate(target,true);
    }
    async function copy({row,status}) {
      if (!active() || !status) return;
      let succeeded = false;
      try {
        const text = copyText(row), clipboard = win.navigator?.clipboard;
        if (text && typeof clipboard?.writeText === 'function') { await clipboard.writeText(text);succeeded = true; }
      } catch (_) { /* A denied or absent clipboard has a readable manual alternative. */ }
      if (!active()) return;
      status.hidden = false;
      status.textContent = succeeded ? '已复制原句、译文和作者作品。' : '复制未成功，请手动选中原句、译文和作者作品复制。';
    }
    function destroy() {
      if (disposed) return;
      disposed = true;
      cleanups.splice(0).reverse().forEach(fn => fn());
      rows.forEach((row,index) => { row.hidden = initial.rows[index]; });
      controls.hidden = initial.controls; count.textContent = initial.count; empty.hidden = initial.empty;
      author.value = initial.author; period.value = initial.period;
      if (theme) theme.value = initial.theme;
      if (more) { more.hidden = initial.more.hidden;more.textContent = initial.more.text; }
      if (randomButton) { randomButton.hidden = initial.random.hidden;randomButton.disabled = initial.random.disabled; }
      copies.forEach(({button,status},index) => {
        if (button) button.hidden = initial.copies[index].button;
        if (status) { status.hidden = initial.copies[index].status.hidden;status.textContent = initial.copies[index].status.text; }
      });
      if (root[INSTANCE] === api) delete root[INSTANCE];
    }
    const api = {refresh,destroy,state:() => ({...filters})};
    root[INSTANCE] = api;
    listen(author,'change',() => refresh());
    listen(period,'change',() => refresh());
    if (theme) listen(theme,'change',() => refresh());
    listen(controls,'submit',event => { event.preventDefault();refresh(); });
    listen(controls,'reset',event => {
      if (!active()) return;
      event.preventDefault(); filters = blank();resetVisible();render(true,hashRow() ? '' : win.location?.hash || '');
    });
    listen(win,'popstate',restore);
    if (more) {
      listen(more,'click',() => { if (active()) { matching().filter(row => !visibleRows.has(row)).slice(0,BATCH).forEach(row => visibleRows.add(row));render(false); } });
      listen(win,'hashchange',restore);
    }
    if (randomButton) listen(randomButton,'click',pickRandom);
    copies.forEach(item => {
      if (!item.button || !item.status) return;
      item.button.hidden = false;
      listen(item.button,'click',() => copy(item));
    });
    controls.hidden = false;
    restore();
    win.SiteNavigation?.own?.(destroy);
    return api;
  }
  return {readFilters,matches,queryString,readingText,copyText,mount};
});
