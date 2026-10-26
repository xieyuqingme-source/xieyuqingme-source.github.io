// English archive interactions against the actual script, with a local DOM harness.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const script = fs.readFileSync(path.join(__dirname, '../blog/site.js'), 'utf8');
const themeScript = fs.readFileSync(path.join(__dirname, '../home/assets/portal.js'), 'utf8');
class Node {
  constructor() { this.hidden = true; this.disabled = false; this.value = ''; this.textContent = ''; this.dataset = {}; this.attributes = {}; this.events = {}; this.classList = { toggle() {} }; }
  addEventListener(name, fn) { this.events[name] = fn; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  focus() { this.focused = true; }
  emit(name, event = {}) { this.events[name](event); }
}
function setup(query = '') {
  const controls = new Node(), search = new Node(), year = new Node(), status = new Node(), empty = new Node(), pager = new Node(), previous = new Node(), next = new Node(), position = new Node(), reset = new Node(), theme = new Node(), themeLabel = new Node(), themeMode = new Node(), jumpForm = new Node(), jumpInput = new Node(), jumpButton = new Node(), jumpMessage = new Node();
  year.options = ['all', '2026', '2025', 'unknown'].map(value => ({ value }));
  const cards = Array.from({ length: 27 }, (_, index) => {
    const node = new Node(), card = new Node();
    node.dataset = { topic: index < 14 ? 'Life & reflection' : 'Technology & writing', year: index < 20 ? '2026' : '2025', language: index === 26 ? 'original' : 'translation', search: index === 0 ? 'Special & café <title> 中文原题' : `Article ${index} complete text` };
    node.closest = () => card;
    return { node, card };
  });
  const filters = ['all', 'Life & reflection', 'Technology & writing'].map(value => { const n = new Node(); n.dataset.filter = value; return n; });
  const languageFilters = ['all', 'translation', 'original'].map(value => { const n = new Node(); n.dataset.languageFilter = value; return n; });
  jumpForm.querySelector = () => jumpButton;
  pager.querySelector = selector => ({ '[data-page="prev"]': previous, '[data-page="next"]': next, '.pagination-position': position, '.page-jump': jumpForm, '#article-page': jumpInput, '#page-jump-message': jumpMessage })[selector];
  const archive = new Node();
  archive.querySelector = selector => ({ '.archive-controls': controls, '#article-search': search, '#article-year': year, '.search-status': status, '.search-empty': empty, '.archive-pagination': pager, '.reset-search': reset })[selector];
  archive.querySelectorAll = selector => ({ '[data-filter]': filters, '[data-language-filter]': languageFilters, '.article-card-content': cards.map(c => c.node) })[selector] || [];
  archive.scrollIntoView = () => { archive.scrolled = true; };
  theme.querySelector = selector => ({ '.theme-label': themeLabel, '.theme-mode': themeMode })[selector] || null;
  const document = { documentElement: { lang: 'en', dataset: {} }, events: {}, querySelector: selector => ({ '.archive': archive, '#theme-toggle': theme })[selector] || null, querySelectorAll: () => [], addEventListener(name, fn) { this.events[name] = fn; } };
  const window = { location: new URL('https://site.test/en/articles/' + query), events: {}, addEventListener(name, fn) { this.events[name] = fn; } };
  window.history = { replaceState: (_, __, url) => { window.location = new URL(url); } };
  const stored = new Map();
  const context = { document, window, localStorage: { getItem: k => stored.get(k), setItem: (k, v) => stored.set(k, v), removeItem: k => stored.delete(k) }, URL, URLSearchParams };
  vm.runInNewContext(themeScript, context);
  const themeController = window.SiteTheme;
  vm.runInNewContext(script, context);
  return { controls, search, year, status, empty, pager, previous, next, position, reset, theme, themeLabel, themeMode, themeController, stored, jumpForm, jumpInput, jumpMessage, filters, languageFilters, cards, document, window, visible: () => cards.filter(c => !c.card.hidden) };
}
const checks = [];
const ui = setup();
assert.equal(ui.visible().length, 12);
assert.equal(ui.status.textContent, 'Showing 1–12 of 27');
assert.equal(ui.position.textContent, 'Page 1 / 3');
assert.equal(ui.window.SiteTheme, ui.themeController);
assert.equal(ui.themeLabel.textContent, 'Switch to dark mode');
assert.equal(ui.document.documentElement.dataset.themeMode, 'system');
ui.window.SiteTheme.choose('dark');
assert.equal(ui.themeLabel.textContent, 'Switch to light mode');
assert.equal(ui.theme.attributes['aria-label'], 'Switch to light mode');
assert.equal(ui.document.documentElement.dataset.skin, undefined);
assert.equal(ui.document.documentElement.dataset.theme, 'dark');
assert.equal(ui.stored.get('xieyuqing-blog-theme'), 'dark');
ui.window.SiteTheme.choose('light');
assert.equal(ui.document.documentElement.dataset.theme, 'light');
assert.equal(ui.stored.has('xieyuqing-blog-theme'), false, 'Matching the system again returns to following it.');
checks.push('English archive retains the shared light/dark controller and pagination labels');
const seen = [];
do { seen.push(...ui.visible().map(c => c.node.dataset.search)); if (!ui.next.disabled) ui.next.emit('click'); else break; } while (true);
assert.deepEqual(seen, ui.cards.map(c => c.node.dataset.search));
checks.push('27 originals paginate without translation duplication or omission');
ui.languageFilters[2].emit('click');
assert.equal(ui.visible().length, 1);
assert.equal(ui.visible()[0].node.dataset.language, 'original');
assert.equal(ui.window.location.searchParams.get('language'), 'original');
assert.equal(ui.languageFilters[2].attributes['aria-pressed'], 'true');
assert.equal(ui.pager.hidden, true);
checks.push('Article-language filter uses its own URL state');
ui.reset.emit('click');
assert.equal(ui.window.location.searchParams.has('language'), false);
ui.search.value = 'CAFÉ <title>'; ui.search.emit('input');
assert.equal(ui.visible().length, 1);
assert.equal(ui.status.textContent, 'Showing 1–1 of 1');
checks.push('Special characters and case-insensitive English search');
ui.search.value = 'missing-search'; ui.search.emit('input');
assert.equal(ui.status.textContent, 'No matching articles');
assert.equal(ui.empty.hidden, false);
ui.reset.emit('click');
ui.jumpInput.value = '99'; ui.jumpForm.emit('submit', { preventDefault() {} });
assert.equal(ui.jumpMessage.textContent, 'Enter a whole page number from 1 to 3.');
assert.equal(ui.jumpInput.attributes['aria-invalid'], 'true');
ui.jumpInput.value = '2'; ui.jumpForm.emit('submit', { preventDefault() {} });
assert.equal(ui.position.textContent, 'Page 2 / 3');
checks.push('English empty state and accessible page-jump validation');
const restored = setup('?language=translation&year=2025&page=2');
assert.equal(restored.visible().length, 6);
assert(restored.visible().every(c => c.node.dataset.language === 'translation' && c.node.dataset.year === '2025'));
assert.equal(restored.position.textContent, 'Page 1 / 1');
restored.reset.emit('click');
assert.equal(restored.visible().length, 12);
assert.equal(restored.window.location.pathname, '/en/articles/');
checks.push('Combined filter restore clamps page and reset preserves site language');
console.log(JSON.stringify({ success: true, checks }, null, 2));
