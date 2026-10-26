/* One line a day from my own essays; rotation follows Beijing time. */
(function () {
  'use strict';
  const quote = document.getElementById('own-quote');
  if (!quote) return;
  const english = (document.documentElement.lang || '').toLowerCase().startsWith('en');
  const find = id => document.getElementById(id);
  let disposed = false;
  function dayNumber(date) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Shanghai',year: 'numeric',month: '2-digit',day: '2-digit'}).formatToParts(date).map(part => [part.type, part.value]));
    return Math.floor(Date.UTC(+p.year, +p.month - 1, +p.day) / 86400000);
  }

  function renderQuote() {
    if (!quote || disposed) return;
    let items = null;
    try { items = JSON.parse(find('own-quotes-data')?.textContent || 'null'); } catch (_) {}
    if (!Array.isArray(items) || !items.length) return;
    const item = items[((dayNumber(new Date()) % items.length) + items.length) % items.length];
    const lang = english ? 'en' : 'zh-CN', url = item?.url?.[lang] || '';
    if (!item?.text?.[lang] || !/^\/(?:en\/)?articles\//.test(url)) return;
    find('own-quote-text').textContent = item.text[lang];
    const link = document.createElement('a');
    link.href = url;
    link.textContent = english ? item.title.en : '《' + item.title['zh-CN'] + '》';
    const dash = document.createElement('span');
    dash.setAttribute('aria-hidden', 'true');
    dash.textContent = english ? '—' : '——';
    const nodes = [dash, document.createTextNode(' '), link];
    if (/^\d{4}-\d{2}-\d{2}$/.test(item.date || '')) {
      const time = document.createElement('time');
      time.dateTime = item.date;
      time.textContent = item.date.replaceAll('-', '.');
      nodes.push(document.createTextNode(' '), time);
    }
    find('own-quote-source').replaceChildren(...nodes);
  }


  renderQuote();
  const quoteTimer = window.setInterval(renderQuote, 60000);
  window.SiteNavigation?.own?.(() => { disposed = true; window.clearInterval(quoteTimer); });
})();
