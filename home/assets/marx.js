/* Local progressive enhancement: filtering and a date-based deck, with no persistent state. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { root.ReadMarx = api; api.mount(root.document, root); }
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function beijingKey(now = Date.now()) {
    return new Date(Number(now) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  function daySeed(key) {
    let value = 2166136261;
    for (const character of key) value = Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0;
    return value;
  }
  function createDeck(items, key, random = Math.random) {
    if (!Array.isArray(items) || !items.length) throw new Error('A reading deck needs cards.');
    const original = items.slice();
    const first = daySeed(key) % original.length;
    let previous, queue = [original[first], ...shuffle(original.filter((_, i) => i !== first))];
    function shuffle(values) {
      for (let i = values.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [values[i], values[j]] = [values[j], values[i]];
      }
      return values;
    }
    return {
      next() {
        if (!queue.length) {
          queue = shuffle(original.slice());
          if (queue.length > 1 && queue[0] === previous) [queue[0], queue[1]] = [queue[1], queue[0]];
        }
        previous = queue.shift();
        return previous;
      }
    };
  }
  function filterState(search, columns) {
    const params = new URLSearchParams(search);
    return {
      branch: ['philosophy', 'economics', 'socialism'].includes(params.get('branch')) ? params.get('branch') : 'all',
      level: ['1', '2', '3'].includes(params.get('level')) ? params.get('level') : 'all',
      column: columns.includes(params.get('column')) ? params.get('column') : 'all'
    };
  }
  function filterQuery(state) {
    const params = new URLSearchParams();
    for (const key of ['branch', 'level', 'column']) if (state[key] !== 'all') params.set(key, state[key]);
    return params.size ? '?' + params.toString() : '';
  }
  function matchesFilters(row, state) {
    return (state.branch === 'all' || (row.branch || '').split(' ').includes(state.branch))
      && (state.level === 'all' || row.level === state.level)
      && (state.column === 'all' || row.column === state.column);
  }
  function legacyDirectory(pathname, search, hash = '') {
    const params = new URLSearchParams(search);
    return pathname === '/marx/' && ['branch', 'level', 'column'].some(key => params.has(key)) ? '/marx/cards/' + search + hash : null;
  }
  function mount(doc, win) {
    const root = doc.querySelector('[data-marx-engels]');
    if (!root) return () => {};
    const legacy = legacyDirectory(win.location.pathname, win.location.search, win.location.hash);
    if (legacy) {
      if (win.SiteNavigation?.visit) void win.SiteNavigation.visit(legacy, {replace: true});
      else win.location.href = legacy;
      return () => {};
    }
    const cleanups = [];
    const listen = (node, type, handler) => {
      node.addEventListener(type, handler);
      cleanups.push(() => node.removeEventListener(type, handler));
    };
    const rows = [...root.querySelectorAll('[data-me-row]')];
    const controls = root.querySelector('[data-me-filters]');
    const returnLink = root.querySelector('[data-me-return]');
    const columns = [...new Set([...root.querySelectorAll('[data-me-column]')].map(button => button.dataset.meColumn).filter(value => value !== 'all').concat((returnLink?.dataset.meColumns || '').split(' ').filter(Boolean)))];
    let selection;
    function readQuery() {
      selection = filterState(win.location.search, columns);
    }
    function query() {
      return filterQuery(selection);
    }
    function renderFilters(update) {
      let count = 0;
      for (const row of rows) {
        row.hidden = !matchesFilters(row.dataset, selection);
        if (!row.hidden) count++;
      }
      root.querySelectorAll('[data-me-group]').forEach(group => { group.hidden = ![...group.querySelectorAll('[data-me-row]')].some(row => !row.hidden); });
      root.querySelectorAll('[data-me-branch]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.meBranch === selection.branch)));
      root.querySelectorAll('[data-me-level]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.meLevel === selection.level)));
      root.querySelectorAll('[data-me-column]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.meColumn === selection.column)));
      const counter = root.querySelector('[data-me-count]');
      if (counter) counter.textContent = '显示 ' + count + ' / ' + rows.length + ' 张';
      const empty = root.querySelector('[data-me-empty]');
      if (empty) empty.hidden = count !== 0;
      root.querySelectorAll('[data-me-card-link]').forEach(link => { link.search = query(); });
      if (update) win.history.replaceState(win.history.state, '', win.location.pathname + query() + win.location.hash);
    }
    readQuery();
    root.querySelectorAll('[data-me-return]').forEach(link => { link.search = query(); });
    if (rows.length && controls) {
      controls.hidden = false;
      listen(controls, 'click', event => {
        const button = event.target.closest?.('[data-me-branch],[data-me-level],[data-me-column]');
        if (!button || !controls.contains(button)) return;
        if (button.hasAttribute('data-me-branch')) selection.branch = button.dataset.meBranch;
        if (button.hasAttribute('data-me-level')) selection.level = button.dataset.meLevel;
        if (button.hasAttribute('data-me-column')) selection.column = button.dataset.meColumn;
        renderFilters(true);
      });
      listen(win, 'popstate', () => { readQuery(); renderFilters(false); });
      renderFilters(false);
    }
    const periods = [...root.querySelectorAll('[data-me-life-period]')];
    const desktop = win.matchMedia?.('(min-width: 769px)');
    function revealHash(hash = win.location.hash) {
      let target;
      try { target = doc.getElementById(decodeURIComponent(hash.slice(1))); } catch (_) { return; }
      if (!target || !root.contains(target)) return;
      let parent = target.closest('details[data-me-collapsible]');
      while (parent) {
        if (parent.hasAttribute('data-me-life-period') && !desktop?.matches) periods.forEach(other => { if (other !== parent) other.open = false; });
        parent.open = true;
        parent = parent.parentElement?.closest('details[data-me-collapsible]');
      }
    }
    function syncPeriods() {
      const active = periods.find(period => period.open && !period.hidden) || periods.find(period => !period.hidden);
      periods.forEach(period => { period.open = Boolean(desktop?.matches || period === active); });
      revealHash();
    }
    if (periods.length) {
      syncPeriods();
      periods.forEach(period => listen(period, 'toggle', () => {
        if (period.open && !desktop?.matches) periods.forEach(other => { if (other !== period) other.open = false; });
      }));
      if (desktop?.addEventListener) listen(desktop, 'change', syncPeriods);
      else if (desktop?.addListener) { desktop.addListener(syncPeriods); cleanups.push(() => desktop.removeListener(syncPeriods)); }
    }
    listen(root, 'click', event => {
      const anchor = event.target.closest?.('a[href^="#"]');
      if (anchor && root.contains(anchor)) revealHash(anchor.getAttribute('href'));
    });
    listen(win, 'hashchange', () => revealHash());
    revealHash();
    const pool = root.querySelector('[data-me-deck-data]');
    const button = root.querySelector('[data-me-next]');
    if (pool && button) {
      let cards;
      try { cards = JSON.parse(pool.textContent); } catch (_) { cards = []; }
      if (Array.isArray(cards) && cards.length && cards.every(card => card && /^[a-z][a-z0-9-]+$/.test(card.slug) && card.route === '/marx/' + card.slug + '/' && typeof card.title === 'string' && typeof card.summary === 'string')) {
        let key = beijingKey(), deck = createDeck(cards, key);
        const title = root.querySelector('[data-me-daily-title]');
        const summary = root.querySelector('[data-me-daily-summary]');
        const stamp = root.querySelector('[data-me-daily-date]');
        function show(card) {
          title.textContent = card.title;
          title.href = card.route;
          summary.textContent = card.summary;
          stamp.textContent = key + ' · 北京时间';
          stamp.setAttribute('datetime', key);
          root.querySelector('[data-me-daily]').dataset.slug = card.slug;
        }
        function resetIfNeeded() {
          const today = beijingKey();
          if (today === key) return false;
          key = today;
          deck = createDeck(cards, key);
          show(deck.next());
          return true;
        }
        if (title && summary && stamp) {
          show(deck.next());
          button.hidden = false;
          listen(button, 'click', () => { if (!resetIfNeeded()) show(deck.next()); });
          const timer = win.setInterval(resetIfNeeded, 60000);
          cleanups.push(() => win.clearInterval(timer));
        }
      }
    }
    root.dataset.meMounted = 'true';
    let disposed = false;
    const dispose = () => { if (!disposed) { disposed = true; delete root.dataset.meMounted; cleanups.splice(0).reverse().forEach(fn => fn()); } };
    win.SiteNavigation?.own?.(dispose);
    return dispose;
  }
  return { beijingKey, daySeed, createDeck, filterState, filterQuery, matchesFilters, legacyDirectory, mount };
});
