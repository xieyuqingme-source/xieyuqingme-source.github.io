// Run with Node's built-in runner: node --test scripts/test_home_daily.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../home/assets/home-daily.js'), 'utf8');
const storageKey = 'xieyuqing-brief-closed';
class Element {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.events = {}; this.attributes = {}; this.hidden = false; this._text = ''; this.classes = new Set(); this.classList = {toggle: (key, on) => on ? this.classes.add(key) : this.classes.delete(key)}; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...nodes) { for (const node of nodes) { if (node.fragment) this.children.push(...node.children); else this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, handler) { this.events[type] = handler; }
  removeEventListener(type, handler) { if (this.events[type] === handler) delete this.events[type]; }
  contains(node) { return this.children.includes(node); }
  closest(selector) { return selector === '[data-news-filter]' && this.dataset.newsFilter ? this : null; }
  querySelector(tag) { return this.children.find(child => child.tagName === tag.toUpperCase()) || null; }
}
function harness({now = '2026-10-25T16:30:00Z', saved = null, mobile = false, denied = false, language = 'zh-CN', edition = '2026-10-26', articles = null, content = null} = {}) {
  let epoch = new Date(now).getTime(), subscription;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [epoch])); } static now() { return epoch; } }
  const ids = ['daily-brief-data', 'daily-content-data', 'home-random-data', 'daily-feed', 'daily-filters', 'daily-brief-notice', 'daily-edition', 'home-date', 'brief-body', 'brief-toggle', 'brief-lunar', 'brief-weather', 'brief-headline', 'daily-calendar-lunar', 'daily-calendar-term', 'daily-weather', 'daily-city', 'home-random-button', 'daily-street-title', 'daily-street-text', 'daily-street-links'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Element()]));
  for (const id of ['brief-toggle', 'home-random-button']) nodes[id].hidden = true;
  const items = Array.from({length: 9}, (_, index) => ({title: {'zh-CN': '标题 ' + index, en: 'Title ' + index}, summary: {'zh-CN': '摘要', en: 'Summary'}, source: 'Source', published: '2026-10-25', categories: [index % 2 ? 'science' : 'culture'], url: 'https://example.test/' + index}));
  nodes['daily-brief-data'].textContent = JSON.stringify({edition_date: edition, notice: {'zh-CN': '说明', en: 'Notice'}, items});
  nodes['daily-content-data'].textContent = JSON.stringify(content);
  nodes['home-random-data'].textContent = JSON.stringify(articles);
  nodes['daily-calendar-lunar'].textContent = '农历九月十七';
  nodes['daily-calendar-term'].textContent = '霜降';
  nodes['daily-city'].selectedOptions = [{textContent: '北京'}];
  const temperature = new Element('strong'), description = new Element('span'), caption = new Element('small');
  temperature.textContent = '12°C'; description.textContent = '多云'; caption.textContent = 'Open-Meteo';
  nodes['daily-weather'].append(temperature, description, caption);
  const filters = ['all', 'science', 'culture'].map(value => { const button = new Element('button'); button.dataset.newsFilter = value; return button; });
  nodes['daily-filters'].append(...filters);
  const root = new Element(), document = {documentElement: {lang: language,dataset: {brief: 'closed'}}, querySelector: () => root, getElementById: id => nodes[id] || null, querySelectorAll: () => filters, createElement: tag => new Element(tag), createTextNode: value => ({textContent: value}), createDocumentFragment: () => Object.assign(new Element(), {fragment: true})};
  const stored = new Map(), intervals = new Map(), owned = [], observers = [], visited = [], assigned = [];
  if (saved !== null) stored.set(storageKey, saved);
  const window = {
    localStorage: {getItem: key => { if (denied) throw new Error('denied'); return stored.get(key) ?? null; },setItem: (key, value) => { if (denied) throw new Error('denied'); stored.set(key, value); },removeItem: key => { if (denied) throw new Error('denied'); stored.delete(key); }},
    matchMedia: () => ({matches: mobile}),
    setInterval: fn => { intervals.set(intervals.size + 1, fn); return intervals.size; },clearInterval: key => intervals.delete(key),
    SiteNavigation: {own: fn => owned.push(fn),visit: url => visited.push(url)},
    SiteI18n: {lang: () => document.documentElement.lang,onChange(fn) { subscription = fn; return () => { subscription = null; }; }},
    location: {assign: url => assigned.push(url)},
    MutationObserver: class { constructor(fn) { this.fn = fn; this.disconnected = false; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
  };
  vm.runInNewContext(source, {document, window, Intl, Date: Clock, Math}, {timeout: 1000});
  return {nodes, root, document, window, stored, intervals, observers, visited, assigned, filters, clickToggle() { nodes['brief-toggle'].events.click(); },tick(instant) { epoch = new Date(instant).getTime(); [...intervals.values()].forEach(fn => fn()); },changeLanguage(value) { document.documentElement.lang = value; subscription?.(); },dispose() { owned.forEach(fn => fn()); }};
}
test('desktop opens without a record, remembers today in Beijing, and restores on a new page scope', () => {
  const h = harness();
  assert.equal(h.nodes['brief-body'].hidden, false);
  assert.equal(h.nodes['brief-toggle'].attributes['aria-expanded'], 'true');
  assert.equal(h.nodes['brief-toggle'].attributes['aria-controls'], 'brief-body');
  assert.equal(h.document.documentElement.dataset.brief, 'open');
  h.clickToggle();
  assert.equal(h.stored.get(storageKey), '2026-10-26');
  assert.equal(h.nodes['brief-body'].hidden, true);
  assert.equal(h.nodes['brief-toggle'].textContent, '展开今日简报');
  assert.equal(harness({saved: h.stored.get(storageKey)}).nodes['brief-body'].hidden, true);
  h.clickToggle(); assert.equal(h.stored.has(storageKey), false);
});
test('phones default closed only without a record; yesterday opens and day rollover reopens', () => {
  assert.equal(harness({mobile: true}).nodes['brief-body'].hidden, true);
  assert.equal(harness({mobile: true,saved: '2026-10-25'}).nodes['brief-body'].hidden, false);
  const h = harness({mobile: true,saved: '2026-10-26'});
  h.tick('2026-10-26T16:00:00Z');
  assert.equal(h.nodes['brief-body'].hidden, false);
  assert.match(h.nodes['home-date'].textContent, /27/);
});
test('denied storage does not prevent toggling or localization', () => {
  const h = harness({denied: true,mobile: true});
  assert.equal(h.nodes['brief-body'].hidden, true);
  assert.doesNotThrow(() => h.clickToggle());
  h.changeLanguage('en');
  assert.equal(h.nodes['brief-toggle'].textContent, 'Hide');
  h.clickToggle();
  assert.equal(h.nodes['brief-toggle'].textContent, 'Show today’s brief');
});
test('news is limited to six, filters retain categories and choose a matching summary headline', () => {
  const h = harness();
  const feed = h.nodes['daily-feed'];
  assert.equal(feed.children.length, 2);
  assert.equal(feed.children[1].children.length, 5);
  h.nodes['daily-filters'].events.click({target: h.filters[1]});
  assert.equal(feed.children[1].children.length, 3);
  assert.equal(h.nodes['brief-headline'].textContent, '标题 1');
  assert.equal(h.filters[1].attributes['aria-pressed'], 'true');
});
test('an edition exactly three days old stays visible, then becomes one line while Earth remains independent', () => {
  const h = harness({edition: '2026-10-23'});
  assert.equal(h.root.classes.has('brief-news-stale'), false);
  assert.equal(h.nodes['daily-edition'].textContent, '新闻更新于 10月23日');
  h.tick('2026-10-26T16:00:00Z');
  assert.equal(h.root.classes.has('brief-news-stale'), true);
  assert.equal(h.nodes['daily-feed'].children.length, 1);
  assert.equal(h.nodes['daily-feed'].textContent, '新闻暂停更新，先看看地球');
  assert.equal(h.nodes['daily-filters'].hidden, true);
  assert.equal(h.nodes['daily-brief-notice'].hidden, true);
  h.changeLanguage('en');
  assert.match(h.nodes['daily-feed'].textContent, /^News updates paused/);
  assert.equal(h.nodes['daily-edition'].textContent, 'News updated 23 October');
});
test('brief summary mirrors existing city and weather without attribution text or a new request', () => {
  const h = harness();
  assert.equal(h.nodes['brief-lunar'].textContent, '农历九月十七 · 霜降');
  assert.equal(h.nodes['brief-weather'].textContent, '北京 · 12°C 多云');
  h.nodes['daily-city'].selectedOptions = [{textContent: 'London'}];
  h.nodes['daily-weather'].children[0].textContent = '9°C';
  h.observers[0].fn();
  assert.equal(h.nodes['brief-weather'].textContent, 'London · 9°C 多云');
  h.dispose();
  assert.equal(h.intervals.size, 0);
  assert.equal(h.observers[0].disconnected, true);
  assert.equal(Object.keys(h.nodes['brief-toggle'].events).length, 0);
});
test('random reading exposes only valid links in the current language and uses site navigation', () => {
  const links = ['/articles/a.html', '/en/articles/b.html', 'https://example.test/', 'javascript:alert(1)', '/articles//unsafe'];
  const zh = harness({articles: links});
  assert.equal(zh.nodes['home-random-button'].hidden, false);
  zh.nodes['home-random-button'].events.click();
  assert.deepEqual(zh.visited, ['/articles/a.html']);
  const en = harness({language: 'en',articles: ['/en/articles/b.html']});
  delete en.window.SiteNavigation.visit;
  en.nodes['home-random-button'].events.click();
  assert.deepEqual(en.assigned, ['/en/articles/b.html']);
  const original = harness({language: 'en',articles: ['/articles/english-original.html']});
  original.nodes['home-random-button'].events.click();
  assert.deepEqual(original.visited, ['/articles/english-original.html']);
  assert.equal(harness({articles: ['https://example.test/']}).nodes['home-random-button'].hidden, true);
});
test('daily street selections keep working source links and the corresponding English article destination', () => {
  const content = {street: [{title: {'zh-CN': '街谈',en: 'Street'},text: {'zh-CN': '文字',en: 'Text'},url: 'https://example.test/source',related_url: '/articles/chinese/example.html',related_label: {'zh-CN': '相关文章',en: 'Related article'}}]};
  const zh = harness({content}), en = harness({language: 'en',content});
  assert.equal(zh.nodes['daily-street-links'].children[0].href, 'https://example.test/source');
  assert.equal(zh.nodes['daily-street-links'].children[1].href, '/articles/chinese/example.html');
  assert.equal(en.nodes['daily-street-links'].children[1].href, '/en/articles/example.html');
  assert.equal(en.nodes['daily-street-links'].children[1].target, undefined);
});
test('own-quote script has no weather endpoint or now-card initialization and still refreshes daily', () => {
  const quoteSource = fs.readFileSync(path.join(__dirname, '../home/assets/home-now.js'), 'utf8');
  assert.doesNotMatch(quoteSource, /fetch|open-meteo|now-card|renderClock/);
  const nodes = {'own-quote': new Element(), 'own-quote-text': new Element(), 'own-quote-source': new Element(), 'own-quotes-data': new Element()};
  nodes['own-quotes-data'].textContent = JSON.stringify([{text: {'zh-CN': '旧文一句'},url: {'zh-CN': '/articles/old.html'},title: {'zh-CN': '旧文'},date: '2024-01-01'}]);
  const document = {documentElement: {lang: 'zh-CN'},getElementById: id => nodes[id],createElement: tag => new Element(tag),createTextNode: value => ({textContent: value})};
  let timer, owned;
  const window = {setInterval: fn => { timer = fn; return 1; },clearInterval: () => { timer = null; },SiteNavigation: {own: fn => { owned = fn; }}};
  vm.runInNewContext(quoteSource, {window, document, Intl, Date}, {timeout: 1000});
  assert.equal(nodes['own-quote-text'].textContent, '旧文一句');
  assert.equal(nodes['own-quote-source'].children[2].href, '/articles/old.html');
  assert.equal(typeof timer, 'function'); owned(); assert.equal(timer, null);
});
