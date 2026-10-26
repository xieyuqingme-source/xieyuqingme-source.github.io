// Runtime regression uses the production script and verifies navigation/storage boundaries.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'home/assets/site-i18n.js'), 'utf8');
const common = JSON.parse(fs.readFileSync(path.join(root, 'home/locales/common.json'), 'utf8'));

function harness(options = {}) {
  const listeners = {}, docEvents = {}, pushes = [], assigned = [], writes = [];
  const state = { gallery: { photo: 'sample', opened: true }, map: [2, 3, 5] };
  const location = { pathname: options.path || '/map/', search: '?view=terrain&filter=A%26B', hash: '#record-2', assign: value => assigned.push(value) };
  const catalogues = { ...common, page: { route: options.route || '/map/', switchMode: options.mode || 'history', titles: { 'zh-CN': '地图', en: 'Map' }, descriptions: { 'zh-CN': '足迹', en: 'Footprints' } } };
  const bootstrap = { textContent: JSON.stringify(catalogues) };
  const elements = options.elements || [];
  const canonical = { value: 'https://example.test/map/', getAttribute: () => canonical.value, setAttribute: (_, value) => { canonical.value = value; } };
  const document = {
    documentElement: { lang: options.lang || 'zh-CN' }, readyState: 'complete', title: '',
    querySelector: selector => selector === '#site-i18n-data' ? bootstrap : selector === 'link[rel="canonical"]' ? canonical : null,
    querySelectorAll: selector => selector === '[data-i18n]' ? elements : selector === '.site-header a[href], .site-footer a[href], [data-i18n-link]' ? (options.chrome || []) : [],
    addEventListener: (name, callback) => { docEvents[name] = callback; }
  };
  const history = { state, pushState(saved, _, target) { assert.equal(saved, state); pushes.push(target); location.pathname = target.split(/[?#]/)[0]; }, replaceState(saved, _, target) { assert.equal(saved, state); pushes.push(target); location.pathname = target.split(/[?#]/)[0]; } };
  const storage = { setItem(key, value) { if (options.storageDenied) throw new Error('Denied'); writes.push([key, value]); }, getItem() { throw new Error('Should never use preference to force redirect'); } };
  const window = { location, history, localStorage: storage, addEventListener: (name, callback) => { listeners[name] = callback; }, dispatchEvent: event => { listeners[event.type]?.(event); } };
  vm.runInNewContext(source, { document, window, URL, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, console });
  return { api: window.SiteI18n, document, location, canonical, history, state, pushes, assigned, writes, pop(path) { location.pathname = path; listeners.popstate(); }, click(link, extra = {}) { let prevented = false; docEvents.click({ defaultPrevented: false, button: 0, target: { closest: () => link }, preventDefault() { prevented = true; }, ...extra }); return prevented; } };
}

test('feature routes map both ways while queries, fragments and original article paths are intact', () => {
  const { api } = harness();
  for (const route of ['/', '/about/', '/projects/', '/photos/sample/', '/map/', '/game/ranking/', '/anthology/sample/', '/articles/']) {
    const en = api.localizedPath(route + '?a=1%262#reading', 'en');
    assert.equal(en, '/en' + route + '?a=1%262#reading');
    assert.equal(api.localizedPath(en, 'zh-CN'), route + '?a=1%262#reading');
  }
  for (const route of ['/articles/中文文章/a/', '/en/articles/translation/', '/photos/images/a.jpg', '/map/data.json', '/assets/a.js', 'https://example.test/map/', '//example.test/map/', '#x', 'mailto:a@b.test']) {
    assert.equal(api.localizedPath(route, 'en'), route);
    assert.equal(api.localizedPath(route, 'zh-CN'), route);
  }
  assert.equal(api.localizedPath('/articles/index.html', 'en'), '/en/articles/');
  assert.throws(() => api.localizedPath('/map/', 'fr'), /Unknown/);
});

test('explicit document/URL language wins without reading saved preference or redirecting', () => {
  const en = harness({ path: '/en/map/', lang: 'en' });
  assert.equal(en.api.lang(), 'en'); assert.deepEqual(en.assigned, []); assert.deepEqual(en.writes, []);
  const original = harness({ path: '/articles/English%20Articles/original/', lang: 'en', route: '/articles/English%20Articles/original/', mode: 'navigate' });
  assert.equal(original.api.lang(), 'en'); assert.deepEqual(original.assigned, []);
});

test('switch and history preserve app state, query, fragment and write only the new preference', () => {
  const ui = harness(); const changes = [];
  const unsubscribe = ui.api.onChange((language, detail) => changes.push([language, detail.source]));
  assert.equal(ui.api.setLanguage('en'), true);
  assert.equal(ui.document.documentElement.lang, 'en');
  assert.equal(ui.document.title, 'Map');
  assert.equal(ui.canonical.value, 'https://example.test/en/map/');
  assert.deepEqual(ui.pushes, ['/en/map/?view=terrain&filter=A%26B#record-2']);
  assert.equal(ui.history.state, ui.state);
  assert.deepEqual(ui.state, { gallery: { photo: 'sample', opened: true }, map: [2, 3, 5] });
  assert.deepEqual(ui.writes, [['xieyuqing-site-language', 'en']]);
  ui.api.setLanguage('en'); assert.equal(ui.pushes.length, 1); assert.equal(changes.length, 1);
  ui.pop('/map/index.html'); assert.equal(ui.api.lang(), 'zh-CN');
  assert.deepEqual(changes, [['en', 'switch'], ['zh-CN', 'history']]);
  unsubscribe(); ui.pop('/en/map/'); assert.equal(changes.length, 2);
});

test('static content pages navigate to the real counterpart; no invented article URL', () => {
  const ui = harness({ route: '/about/', mode: 'navigate' });
  assert.equal(ui.api.setLanguage('en'), false);
  assert.deepEqual(ui.assigned, ['/en/about/?view=terrain&filter=A%26B#record-2']);
  assert.equal(ui.document.documentElement.lang, 'zh-CN');
  const article = harness({ route: '/articles/中文文章/a/', mode: 'navigate' });
  article.api.setLanguage('en', { href: '/en/articles/a/' });
  assert.deepEqual(article.assigned, ['/en/articles/a/?view=terrain&filter=A%26B#record-2']);
});

test('translation interpolation is plain text and never treats replacement syntax as code/markup', () => {
  const { api } = harness();
  api.register('test', { 'zh-CN': { greeting: '你好 {name} / {count}', 'test.existing': '{name}' }, en: { greeting: 'Hello {name} / {count}' } });
  assert.equal(api.t('test.greeting', { name: '<img onerror=alert(1)> $&', count: 2 }), '你好 <img onerror=alert(1)> $& / 2');
  assert.equal(api.t('missing', {}, 'A {unknown}'), 'A {unknown}');
  assert.equal(api.t('test.existing', { name: 'kept' }), 'kept');
});

test('apply never replaces controls or editable user data', () => {
  const element = (tag, children = [], editable = false) => ({ tagName: tag, children, isContentEditable: editable, textContent: 'draft', getAttribute: () => 'common.nav.map', setAttribute() {} });
  const span = element('SPAN'), input = element('INPUT'), parent = element('DIV', [{}]), editable = element('DIV', [], true);
  harness({ elements: [span, input, parent, editable] });
  assert.equal(span.textContent, '足迹');
  for (const el of [input, parent, editable]) assert.equal(el.textContent, 'draft');
});

test('denied preference storage does not prevent in-session changes', () => {
  const ui = harness({ storageDenied: true });
  assert.doesNotThrow(() => ui.api.setLanguage('en'));
  assert.equal(ui.api.lang(), 'en'); assert.equal(ui.pushes.length, 1);
});

test('modified clicks keep normal browser navigation and do not mutate language', () => {
  const ui = harness();
  const link = { getAttribute: name => name === 'data-site-language-switch' ? 'en' : '/en/map/', hasAttribute: () => false };
  for (const extra of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }, { defaultPrevented: true }]) assert.equal(ui.click(link, extra), false);
  assert.equal(ui.pushes.length, 0);
  assert.equal(ui.click(link), true); assert.equal(ui.api.lang(), 'en');
});

test('live theme labels follow display language without changing saved theme', () => {
  const code = fs.readFileSync(path.join(root, 'home/assets/portal.js'), 'utf8');
  const label = { textContent: '' }, status = { textContent: '' }, attrs = {}, writes = [];
  let current = 'zh-CN', listener;
  const button = { querySelector: selector => selector === '.theme-label' ? label : status, setAttribute: (key,value) => { attrs[key]=value; } };
  const document = { documentElement: { lang: current, dataset: {} }, addEventListener() {}, querySelectorAll: () => [], querySelector: selector => selector === '#theme-toggle' ? button : null };
  const window = { SiteI18n: { lang: () => current, t: key => common[current][key], onChange: fn => { listener=fn; } }, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  vm.runInNewContext(code,{document,window,localStorage:{getItem:key=> key === 'xieyuqing-blog-theme' ? 'dark' : 'sea',setItem:(...args)=>writes.push(args)}});
  assert.equal(label.textContent,'切换到浅色'); assert.equal(attrs['aria-label'],'切换到浅色'); assert.equal(document.documentElement.dataset.theme,'dark');
  assert.equal(document.documentElement.dataset.skin, undefined);
  current='en'; listener();
  assert.equal(label.textContent,'Switch to light mode'); assert.equal(attrs['aria-label'],'Switch to light mode'); assert.equal(attrs['data-theme'],'dark');
  assert.equal(document.documentElement.dataset.theme,'dark'); assert.deepEqual(writes,[]);
});

test('an explicit archive link for an unpaired original is not rewritten as a language counterpart', () => {
  const attrs = { href: '/articles/', 'data-preserve-language-link': '' };
  const link = { matches: selector => selector.includes('[data-preserve-language-link]'), getAttribute: name => attrs[name], setAttribute: (name,value) => { attrs[name]=value; }, textContent: '中文目录' };
  harness({ path: '/articles/English%20Articles/original.html', lang: 'en', route: '/articles/English%20Articles/original.html', mode: 'navigate', chrome: [link] });
  assert.equal(attrs.href,'/articles/'); assert.equal(link.textContent,'中文目录');
});
