/* Local quotation decks: a Beijing-date opening line, then a non-repeating shuffle. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.DailyReading = api; api.mount({window:root,document:root.document}); }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  function dayNumber(date) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(part => [part.type,part.value]));
    return Math.floor(Date.UTC(+parts.year,+parts.month-1,+parts.day)/86400000);
  }
  function createDeck(length, day, random = Math.random, saved = null) {
    const size = Number.isSafeInteger(length) && length > 0 ? length : 0;
    let selected = size ? ((day % size) + size) % size : -1, bag = [];
    function shuffle(values) {
      for (let index = values.length-1; index > 0; index--) {
        const value = Number(random()), bounded = Number.isFinite(value) ? Math.max(0,Math.min(1-Number.EPSILON,value)) : 0;
        const other = Math.floor(bounded*(index+1)); [values[index],values[other]] = [values[other],values[index]];
      }
      return values;
    }
    function refill(includeSelected) {
      bag = shuffle(Array.from({length:size},(_,index) => index).filter(index => includeSelected || index !== selected));
      if (bag.length > 1 && bag[0] === selected) [bag[0],bag[1]] = [bag[1],bag[0]];
    }
    refill(false);
    if (saved && Number.isInteger(saved.selected) && saved.selected >= 0 && saved.selected < size && Array.isArray(saved.remaining)
      && saved.remaining.length < size && new Set(saved.remaining).size === saved.remaining.length
      && saved.remaining.every(index => Number.isInteger(index) && index >= 0 && index < size && index !== saved.selected)) {
      selected = saved.selected; bag = saved.remaining.slice();
    }
    return {
      current:() => selected,
      snapshot:() => ({selected,remaining:bag.slice()}),
      next() { if (size < 2) return selected; if (!bag.length) refill(true); selected = bag.shift(); return selected; }
    };
  }
  const bilingual = value => value && typeof value === 'object' && ['zh-CN','en'].every(language => typeof value[language] === 'string' && value[language].trim());
  function safeSource(value) {
    if (typeof value !== 'string' || !/^https:\/\//.test(value) || /[\s\u0000-\u001f<>\\]/.test(value)) return false;
    try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; } catch (_) { return false; }
  }
  function safeArticle(value) {
    if (typeof value !== 'string' || !/^\/(?:en\/)?articles\/(?!\/)/.test(value) || /[\s\u0000-\u001f<>\\]/.test(value)) return false;
    try { const url = new URL(value,'https://reading.invalid'); return url.origin === 'https://reading.invalid' && /^\/(?:en\/)?articles\/(?!\/)/.test(url.pathname); } catch (_) { return false; }
  }
  function quotations(value) {
    const seen = new Set();
    return (value?.version === 1 && Array.isArray(value.quotes) ? value.quotes : []).filter(item => {
      const sourcesValid = typeof item?.url === 'string' ? safeSource(item.url) : bilingual(item?.url) && ['zh-CN','en'].every(language => safeSource(item.url[language]));
      if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id) || !['text','author','work','translation_note'].every(key => bilingual(item[key])) || !sourcesValid) return false;
      seen.add(item.id); return true;
    });
  }
  function essayLines(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).filter(item => {
      if (!item || !bilingual(item.text) || !bilingual(item.title) || !bilingual(item.url) || !['zh-CN','en'].every(language => safeArticle(item.url[language]))) return false;
      const identity = JSON.stringify(item.text); if (seen.has(identity)) return false; seen.add(identity); return true;
    });
  }
  function mount(options = {}) {
    const win = options.window, doc = options.document;
    if (!win || !doc?.getElementById) return {destroy() {}};
    const find = id => doc.getElementById(id), read = id => { try { return JSON.parse(find(id)?.textContent || 'null'); } catch (_) { return null; } };
    const classic = find('daily-quote-text') ? quotations(read('daily-content-data')) : [];
    const own = find('own-quote-text') ? essayLines(read('own-quotes-data')) : [];
    const now = options.now || (() => new Date()), random = options.random || Math.random;
    const lang = () => String(win.SiteI18n?.lang?.() || doc.documentElement?.lang || 'zh-CN').startsWith('en') ? 'en' : 'zh-CN';
    // The persistent document element survives progressive page replacement.
    // This one-use handoff is only created by the language control, never saved.
    const carrier = doc.documentElement, handoff = carrier?.__dailyReadingTransfer;
    if (carrier) delete carrier.__dailyReadingTransfer;
    const poolKey = JSON.stringify([classic.map(item => item.id),own.map(item => item.text)]);
    const carried = handoff?.poolKey === poolKey && handoff.day === dayNumber(now()) && handoff.language === lang()
      && Number.isFinite(handoff.created) && now().getTime()-handoff.created >= 0 && now().getTime()-handoff.created < 120000 ? handoff : null;
    let disposed = false, today, language, classicDeck, ownDeck;
    const cleanups = [];
    function listen(target,type,handler,settings) { if (!target?.addEventListener) return; target.addEventListener(type,handler,settings); cleanups.push(() => target.removeEventListener(type,handler,settings)); }
    function write(id,value) { const element = find(id); if (element) element.textContent = value; }
    function renderButton(id,titleId,fallback) {
      const button = find(id); if (!button) return;
      const label = language === 'en' ? 'Another quote' : '换一句';
      button.textContent = label; button.setAttribute('aria-label',label+' · '+(find(titleId)?.textContent || fallback));
    }
    function renderClassic() {
      const item = classic[classicDeck?.current()]; if (!item) return;
      write('daily-quotation-title',language === 'en' ? 'Red quotations' : '红色语录');
      write('daily-quote-text',item.text[language]); write('daily-quote-author',item.author[language]); write('daily-quote-note',item.translation_note[language]);
      const link = find('daily-quote-work'); if (link) { link.href = typeof item.url === 'string' ? item.url : item.url[language]; link.textContent = item.work[language]+' ↗'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('hreflang',language); link.setAttribute('lang',language); }
      if (find('daily-quote')) find('daily-quote').dataset.quoteId = item.id;
      renderButton('daily-quote-button','daily-quotation-title',language === 'en' ? 'Red quotations' : '红色语录');
    }
    function renderOwn() {
      const index = ownDeck?.current(), item = own[index]; if (!item) return;
      write('own-quote-text',item.text[language]);
      const source = find('own-quote-source');
      if (source) {
        const dash = doc.createElement('span'); dash.setAttribute('aria-hidden','true'); dash.textContent = language === 'en' ? '—' : '——';
        const link = doc.createElement('a'); link.href = item.url[language]; link.textContent = language === 'en' ? item.title.en : '《'+item.title['zh-CN']+'》';
        const nodes = [dash,doc.createTextNode(' '),link];
        if (typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date)) { const time = doc.createElement('time'); time.dateTime = item.date; time.textContent = item.date.replaceAll('-','.'); nodes.push(doc.createTextNode(' '),time); }
        source.replaceChildren(...nodes);
      }
      if (find('own-quote')) find('own-quote').dataset.quoteIndex = String(index);
      renderButton('own-quote-button','quote-title',language === 'en' ? 'A line from my essays' : '旧文一句');
    }
    function refresh(force) {
      if (disposed) return;
      const day = dayNumber(now()), selectedLanguage = lang();
      if (today !== day) { today = day; classicDeck = createDeck(classic.length,day,random,carried?.day === day ? carried.classic : null); ownDeck = createDeck(own.length,day,random,carried?.day === day ? carried.own : null); force = true; }
      if (force || language !== selectedLanguage) { language = selectedLanguage; renderClassic(); renderOwn(); }
    }
    for (const [id,items,deck,render] of [['daily-quote-button',classic,() => classicDeck,renderClassic],['own-quote-button',own,() => ownDeck,renderOwn]]) {
      const button = find(id); if (!button) continue;
      button.hidden = items.length < 2;
      if (items.length > 1) listen(button,'click',() => { if (disposed) return; refresh(false); deck().next(); render(); });
    }
    refresh(true);
    let timer = null;
    if (classic.length || own.length) {
      timer = win.setInterval(() => refresh(false),60000);
      listen(doc,'visibilitychange',() => { if (!doc.hidden) refresh(false); });
      listen(doc,'click',event => {
        if (disposed || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const control = event.target.closest?.('.site-language-switch, [data-site-language-switch]');
        if (!control || control.getAttribute('target') === '_blank' || control.hasAttribute?.('download')) { if (carrier) delete carrier.__dailyReadingTransfer; return; }
        if (win.SiteI18n?.page?.().switchMode === 'history') return;
        refresh(false);
        const requested = control.getAttribute('data-site-language-switch'), target = ['zh-CN','en'].includes(requested) ? requested : language === 'en' ? 'zh-CN' : 'en';
        if (carrier && target !== language) carrier.__dailyReadingTransfer = {poolKey,day:today,language:target,created:now().getTime(),classic:classicDeck.snapshot(),own:ownDeck.snapshot()};
      },true);
      const unsubscribe = win.SiteI18n?.onChange?.(() => refresh(true)); if (typeof unsubscribe === 'function') cleanups.push(unsubscribe);
    }
    function destroy() { if (disposed) return; disposed = true; if (timer !== null) win.clearInterval(timer); cleanups.splice(0).reverse().forEach(cleanup => cleanup()); }
    win.SiteNavigation?.own?.(destroy);
    return {destroy};
  }
  return {dayNumber,createDeck,quotations,essayLines,mount};
});
