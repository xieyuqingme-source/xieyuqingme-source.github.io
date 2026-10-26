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
  let filter = 'all', lastDay = '', lastLanguage = '';
  function node(tag, className, value) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (value !== undefined) result.textContent = value;
    return result;
  }
  function link(url, value) {
    const result = node('a', '', value);
    // Content is validated during the build; keep the DOM boundary explicit too.
    if (/^https:\/\//.test(url || '') || /^\/articles\//.test(url || '')) result.href = url;
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
  function renderFeed() {
    if (!brief?.items?.length || !find('daily-feed')) return;
    const entries = brief.items.filter(item => filter === 'all' || item.categories.includes(filter));
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
    find('daily-brief-notice').textContent = text(brief.notice);
    find('daily-edition').textContent = word('选读样刊 · ', 'Reading sample · ') + brief.edition_date.replaceAll('-', '.');
    document.querySelectorAll('[data-news-filter]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.newsFilter === filter));
      button.textContent = button.dataset.newsFilter === 'all' ? word('全部', 'All') : categories[button.dataset.newsFilter]?.[lang() === 'en' ? 1 : 0] || '';
    });
  }
  function dayIndex(date) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Shanghai',year: 'numeric',month: '2-digit',day: '2-digit'}).formatToParts(date).map(part => [part.type, part.value]));
    return Math.floor(Date.UTC(+parts.year, +parts.month - 1, +parts.day) / 86400000);
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
      find('home-date').textContent = new Intl.DateTimeFormat(currentLanguage === 'en' ? 'en-GB' : 'zh-CN', {timeZone: 'Asia/Shanghai',year: 'numeric',month: 'long',day: 'numeric',weekday: 'long'}).format(date);
      renderDaily(date);
      renderFeed();
      lastDay = currentDay; lastLanguage = currentLanguage;
    }
  }
  const filters = find('daily-filters');
  if (brief?.items?.length && filters) {
    filters.hidden = false;
    filters.addEventListener('click', event => {
      const button = event.target.closest('[data-news-filter]');
      if (!button || !filters.contains(button)) return;
      filter = button.dataset.newsFilter;
      renderFeed();
    });
  }
  refresh(true);
  const timer = window.setInterval(() => refresh(false), 60000);
  const unsubscribe = window.SiteI18n?.onChange?.(() => refresh(true));
  window.SiteNavigation?.own?.(() => { window.clearInterval(timer); if (typeof unsubscribe === 'function') unsubscribe(); });
})();
