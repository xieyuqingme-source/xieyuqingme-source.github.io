/* Source-linked reading sample and small, date-based daily selections. */
(function () {
  'use strict';
  const root = document.querySelector('.daily-home');
  if (!root) return;
  const read = id => { try { return JSON.parse(document.getElementById(id)?.textContent || 'null'); } catch (_) { return null; } };
  const brief = read('daily-brief-data'), content = read('daily-content-data');
  const find = id => document.getElementById(id);
  const lang = () => (window.SiteI18n?.lang?.() || document.documentElement.lang || 'zh-CN').startsWith('en') ? 'en' : 'zh-CN';
  const text = value => typeof value === 'string' ? value : value?.[lang()] || value?.['zh-CN'] || '';
  const word = (zh, en) => lang() === 'en' ? en : zh;
  const categories = {domestic: ['国内', 'China'], world: ['国际', 'World'], business: ['商业', 'Business'], science: ['科学', 'Science'], culture: ['文化', 'Culture']};
  const briefKey = 'xieyuqing-brief-closed';
  let filter = 'all', lastDay = '', lastLanguage = '', closed = false;
  const cleanup = [];
  function listen(target, type, handler) {
    if (!target) return;
    target.addEventListener(type, handler);
    cleanup.push(() => target.removeEventListener(type, handler));
  }
  function write(id, value) { const target = find(id); if (target) target.textContent = value; }
  function node(tag, className, value) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (value !== undefined) result.textContent = value;
    return result;
  }
  function link(url, value) {
    const result = node('a', '', value);
    // Content is validated during the build; keep the DOM boundary explicit too.
    if (/^https:\/\//.test(url || '') || /^\/(?:en\/)?articles\//.test(url || '')) result.href = url;
    if (/^https:\/\//.test(url || '')) { result.target = '_blank'; result.rel = 'noopener noreferrer'; }
    return result;
  }
  function source(item) {
    const result = node('div', 'yl-source');
    result.append(document.createTextNode(item.source + ' · '));
    if (item.published) {
      const time = node('time', '', item.published.replaceAll('-', '.'));
      time.dateTime = item.published;
      result.append(time);
    } else result.append(document.createTextNode(text(item.published_label)));
    result.append(document.createTextNode(' · '), link(item.url, word('阅读原文 ↗', 'Read source ↗')));
    return result;
  }
  function renderFeed(date) {
    if (!brief?.items?.length || !find('daily-feed')) return;
    const stale = /^\d{4}-\d{2}-\d{2}$/.test(brief.edition_date || '')
      && dayIndex(date || new Date()) - Math.floor(Date.parse(brief.edition_date + 'T00:00:00Z') / 86400000) > 3;
    root.classList.toggle('brief-news-stale', stale);
    const paused = word('新闻暂停更新，先看看地球', 'News updates paused; take a look at Earth');
    const edition = new Date(brief.edition_date + 'T00:00:00Z');
    write('daily-edition', word('新闻更新于 ', 'News updated ') + new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'zh-CN', {timeZone: 'UTC',month: 'long',day: 'numeric'}).format(edition));
    const filters = find('daily-filters'), notice = find('daily-brief-notice');
    if (filters) filters.hidden = stale;
    if (notice) { notice.hidden = stale; notice.textContent = text(brief.notice); }
    if (stale) {
      find('daily-feed').replaceChildren(node('p', 'yl-note yl-news-paused', paused));
      write('brief-headline', paused);
      return;
    }
    const entries = brief.items.filter(item => filter === 'all' || item.categories.includes(filter)).slice(0, 6);
    write('brief-headline', text((entries[0] || brief.items[0]).title));
    const fragment = document.createDocumentFragment();
    if (!entries.length) fragment.append(node('p', 'yl-note', word('这个类别暂无选读。', 'No selections in this category.')));
    const grid = node('div', 'yl-news-grid');
    entries.forEach((item, index) => {
      const article = node('article', index === 0 ? 'yl-lead' : 'yl-item');
      const heading = node(index === 0 ? 'h2' : 'h3');
      heading.append(link(item.url, text(item.title)));
      if (index === 0) {
        article.append(node('span', 'yl-label', word('选读样刊', 'Reading sample') + ' · ' + item.categories.map(key => categories[key]?.[lang() === 'en' ? 1 : 0]).filter(Boolean).join(' / ')), heading, node('p', '', text(item.summary)), source(item));
        fragment.append(article);
      } else {
        const copy = node('div');
        copy.append(heading, source(item));
        article.append(node('span', 'yl-num', String(index + 1).padStart(2, '0')), copy);
        grid.append(article);
      }
    });
    if (entries.length > 1) fragment.append(grid);
    find('daily-feed').replaceChildren(fragment);
    document.querySelectorAll('[data-news-filter]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.newsFilter === filter));
      button.textContent = button.dataset.newsFilter === 'all' ? word('全部', 'All') : categories[button.dataset.newsFilter]?.[lang() === 'en' ? 1 : 0] || '';
    });
  }
  function dayIndex(date) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Shanghai',year: 'numeric',month: '2-digit',day: '2-digit'}).formatToParts(date).map(part => [part.type, part.value]));
    return Math.floor(Date.UTC(+parts.year, +parts.month - 1, +parts.day) / 86400000);
  }
  function dayStamp(date) {
    return new Date(dayIndex(date) * 86400000).toISOString().slice(0, 10);
  }
  function renderBriefState() {
    document.documentElement.dataset.brief = closed ? 'closed' : 'open';
    const body = find('brief-body'), button = find('brief-toggle');
    if (body) body.hidden = closed;
    if (button) {
      button.hidden = false;
      button.setAttribute('aria-controls', 'brief-body');
      button.setAttribute('aria-expanded', String(!closed));
      button.textContent = closed ? word('展开今日简报', 'Show today’s brief') : word('收起', 'Hide');
    }
  }
  function syncBrief(date, rollover) {
    let saved = null;
    try { saved = window.localStorage.getItem(briefKey); } catch (_) {}
    let mobile = false;
    try { mobile = window.matchMedia('(max-width: 720px)').matches; } catch (_) {}
    // An older close date deliberately opens the next day's edition, including on phones.
    closed = saved === dayStamp(date) || (!rollover && saved === null && mobile);
    renderBriefState();
  }
  function renderSummary() {
    const lunar = find('daily-calendar-lunar')?.textContent || '', term = find('daily-calendar-term')?.textContent || '';
    write('brief-lunar', [lunar, term].filter(Boolean).join(' · '));
    const weather = find('daily-weather'), city = find('daily-city');
    const cityName = city?.selectedOptions?.[0]?.textContent || '';
    const temperature = weather?.querySelector('strong')?.textContent || '';
    const description = weather?.querySelector('span')?.textContent || '';
    write('brief-weather', [cityName, temperature ? [temperature, description].filter(Boolean).join(' ') : weather?.textContent || ''].filter(Boolean).join(' · '));
  }
  function renderDaily(date) {
    if (!content) return;
    const index = dayIndex(date), pick = list => list?.length ? list[((index % list.length) + list.length) % list.length] : null;
    const quote = pick(content.quotes), concept = pick(content.concepts), street = pick(content.street);
    if (quote) {
      find('daily-quote').textContent = text(quote.text);
      const credit = find('daily-quote-source');
      credit.replaceChildren(document.createTextNode(text(quote.author) + ' · '), link(quote.url, text(quote.work) + ' ↗'));
      credit.title = text(quote.translation_note);
    }
    if (concept) {
      find('daily-concept-title').textContent = text(concept.title);
      find('daily-concept-text').textContent = text(concept.text);
      const credit = find('daily-concept-source');
      credit.href = concept.url;
      credit.textContent = concept.source + ' · ' + word('概念来源 ↗', 'Concept reference ↗');
    }
    if (street) {
      find('daily-street-title').textContent = text(street.title);
      find('daily-street-text').textContent = text(street.text);
      const links = [link(street.url, word('文化报道', 'Culture reporting') + ' ↗')];
      if (street.related_url) {
        const related = lang() === 'en' ? street.related_url.replace(/^\/articles\/[^/]+\//, '/en/articles/') : street.related_url;
        links.push(link(related, text(street.related_label) + ' ↗'));
      }
      find('daily-street-links').replaceChildren(...links);
    }
  }
  function refresh(force) {
    const date = new Date(), currentDay = String(dayIndex(date)), currentLanguage = lang();
    if (force || lastDay !== currentDay || lastLanguage !== currentLanguage) {
      if (lastDay && lastDay !== currentDay) syncBrief(date, true);
      write('home-date', new Intl.DateTimeFormat(currentLanguage === 'en' ? 'en-GB' : 'zh-CN', {timeZone: 'Asia/Shanghai',year: 'numeric',month: 'long',day: 'numeric',weekday: 'long'}).format(date));
      renderDaily(date);
      renderFeed(date);
      renderBriefState();
      renderSummary();
      lastDay = currentDay; lastLanguage = currentLanguage;
    }
  }
  const filters = find('daily-filters');
  if (brief?.items?.length && filters) {
    listen(filters, 'click', event => {
      const button = event.target.closest('[data-news-filter]');
      if (!button || !filters.contains(button)) return;
      filter = button.dataset.newsFilter;
      renderFeed();
    });
  }
  listen(find('brief-toggle'), 'click', () => {
    closed = !closed;
    try {
      if (closed) window.localStorage.setItem(briefKey, dayStamp(new Date()));
      else window.localStorage.removeItem(briefKey);
    } catch (_) {}
    renderBriefState();
  });
  const articles = read('home-random-data'), randomButton = find('home-random-button');
  const english = lang() === 'en';
  // English originals keep their established /articles/ URLs; the builder supplies only English pages here.
  const articleLinks = Array.isArray(articles) ? articles.filter(url => typeof url === 'string'
    && (english ? /^\/(?:en\/)?articles\/(?!\/)/ : /^\/articles\/(?!\/)/).test(url)) : [];
  if (randomButton && articleLinks.length) {
    randomButton.hidden = false;
    listen(randomButton, 'click', () => {
      const url = articleLinks[Math.floor(Math.random() * articleLinks.length)];
      if (window.SiteNavigation?.visit) window.SiteNavigation.visit(url);
      else window.location.assign(url);
    });
  }
  if (window.MutationObserver) {
    const observer = new window.MutationObserver(renderSummary);
    for (const id of ['daily-calendar-lunar', 'daily-calendar-term', 'daily-weather', 'daily-city']) {
      const target = find(id);
      if (target) observer.observe(target, {childList: true,subtree: true,characterData: true});
    }
    cleanup.push(() => observer.disconnect());
  }
  listen(find('daily-city'), 'change', renderSummary);
  syncBrief(new Date(), false);
  refresh(true);
  const timer = window.setInterval(() => refresh(false), 60000);
  const unsubscribe = window.SiteI18n?.onChange?.(() => refresh(true));
  window.SiteNavigation?.own?.(() => { window.clearInterval(timer); if (typeof unsubscribe === 'function') unsubscribe(); cleanup.splice(0).reverse().forEach(fn => fn()); });
})();
