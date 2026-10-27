'use strict';
// Real, isolated Chrome acceptance for the five-block homepage and full daily page.
// Only local generated files are served. Open-Meteo is synthetic; other remote requests are blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = process.env.WEBSITE_ROOT || path.resolve(__dirname, '..');
const site = path.join(root, '_site_unified'), out = path.join(root, '.local-checks/round5');
const origin = 'http://127.0.0.1:8767', epoch = Date.parse('2026-10-27T04:00:00Z');
const widths = [1440, 1280, 1024, 960, 768, 390, 320];
const latest = fs.readdirSync(path.join(root, 'home/brief/news')).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().at(-1);
const brief = JSON.parse(fs.readFileSync(path.join(root, 'home/brief/news', latest), 'utf8'));
const memes = JSON.parse(fs.readFileSync(path.join(root, 'home/brief/memes.json'), 'utf8')).items;
const photoCatalog = JSON.parse(fs.readFileSync(path.join(root, 'photos/catalog.json'), 'utf8'));
const categories = ['domestic', 'world', 'economy', 'science', 'culture'];
const news = [...brief.items].sort((a, b) => Number(b.priority === 'major') - Number(a.priority === 'major') || categories.indexOf(a.category) - categories.indexOf(b.category));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp4': 'video/mp4' };
const report = { checks: [], screenshots: [], pageErrors: [], missing: [], blockedExternal: [], network: [] };
fs.mkdirSync(out, { recursive: true });
let browser;

async function check(name, fn) {
  process.stdout.write('CHECK ' + name + '\n'); const start = Date.now();
  try { const detail = await fn(); report.checks.push({ name, passed: true, ms: Date.now() - start, detail }); process.stdout.write('PASS ' + name + '\n'); }
  catch (error) { report.checks.push({ name, passed: false, ms: Date.now() - start, error: error.stack }); process.stdout.write('FAIL ' + name + ': ' + error.message + '\n'); }
}
async function context({ width = 1440, theme = 'light', javascript = true, lunarFailure = false, denied = false, seedOld = false, idleUnavailable = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, javaScriptEnabled: javascript });
  ctx.setDefaultTimeout(10000);
  const requests = [], weather = [];
  await ctx.addInitScript(({ epoch, denied, seedOld, origin, idleUnavailable }) => {
    const NativeDate = Date;
    class Clock extends NativeDate { constructor(...args) { super(...(args.length ? args : [epoch])); } static now() { return epoch; } }
    window.Date = Clock;
    window.__round5Loaded = false; window.__round5LoadTime = null; window.__round5Storage = []; window.__round5Idle = [];
    window.addEventListener('load', () => { window.__round5Loaded = true; window.__round5LoadTime = performance.now(); }, { once: true });
    if (seedOld && location.origin === origin) localStorage.setItem('xieyuqing-brief-closed', '2026-10-27');
    for (const name of ['getItem', 'setItem', 'removeItem']) {
      const original = Storage.prototype[name];
      Object.defineProperty(Storage.prototype, name, { configurable: true, value(...args) {
        window.__round5Storage.push({ operation: name, key: String(args[0]) });
        if (denied) throw new Error('Synthetic storage unavailable');
        return Reflect.apply(original, this, args);
      } });
    }
    if (idleUnavailable) window.requestIdleCallback = undefined;
    if (window.requestIdleCallback) {
      const native = window.requestIdleCallback.bind(window);
      window.requestIdleCallback = (fn, options) => { window.__round5Idle.push(options); return native(fn, options); };
    }
  }, { epoch, denied, seedOld, origin, idleUnavailable });
  await ctx.route('**/*', async route => {
    const url = route.request().url(); if (/^(data|blob):/.test(url)) return route.continue();
    let frame = { pagePath: '', loaded: false };
    if (!route.request().isNavigationRequest()) {
      try { frame = await route.request().frame().evaluate(() => ({ pagePath: location.pathname, loaded: Boolean(window.__round5Loaded), elapsedAfterLoad: window.__round5LoadTime === null ? null : performance.now() - window.__round5LoadTime })); } catch (_) {}
    }
    if (url.startsWith('https://api.open-meteo.com/')) {
      weather.push({ url, ...frame });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ current: { temperature_2m: 21.4, weather_code: 0, time: '2026-10-27T12:00' }, daily: { temperature_2m_max: [34], temperature_2m_min: [15], precipitation_probability_max: [65] } }) });
    }
    if (!url.startsWith(origin + '/')) { report.blockedExternal.push(url); return route.abort(); }
    try {
      const pathname = new URL(url).pathname;
      requests.push({ pathname, ...frame });
      if (lunarFailure && /\/vendor\/lunar[^/]*\.js$/.test(pathname)) return route.fulfill({ status: 503, body: 'Synthetic lunar failure' });
      let file = path.resolve(site, '.' + decodeURIComponent(pathname)); assert(file === site || file.startsWith(site + path.sep));
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      return route.fulfill({ contentType: mime[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    } catch (error) { report.missing.push({ url, error: error.message }); return route.fulfill({ status: 404, body: 'Missing local file' }); }
  });
  ctx.on('page', page => page.on('pageerror', error => report.pageErrors.push(error.stack || error.message)));
  return { ctx, requests, weather };
}
async function ready(page) { await page.waitForFunction(() => window.SiteI18n && window.SiteNavigation && !SiteNavigation.state().transition); await page.evaluate(() => document.fonts.ready); }
async function go(page, route) { await page.goto(origin + route); await ready(page); }
async function waitGlance(page, { failed = false } = {}) {
  await page.locator('#earth-canvas').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#daily-earth')?.dataset.earthReady === 'true');
  if (failed) await page.waitForFunction(() => document.querySelector('#glance-almanac-card')?.hidden);
  else await page.waitForFunction(() => document.querySelector('#daily-calendar-next-term')?.textContent.trim());
  await paint(page);
}
async function waitFull(page) {
  await page.waitForFunction(() => document.querySelector('#daily-almanac-directions')?.textContent.trim());
  await page.waitForFunction(() => document.querySelector('#daily-weather')?.textContent.includes('21°C'));
  await page.locator('#earth-canvas').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#daily-earth')?.dataset.earthReady === 'true' && document.querySelector('#daily-moon-phase')?.textContent.trim());
  await paint(page);
}
async function paint(page) {
  await page.waitForFunction(() => { const c = document.querySelector('#earth-canvas'); return c && c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((value, index) => index % 4 === 3 && value > 0); });
}
async function noOverflow(page) {
  const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert(geometry.scrollWidth <= geometry.width + 1, JSON.stringify(geometry)); return geometry;
}
async function appearance(page, theme, language, full) {
  const state = await page.evaluate(() => ({ background: getComputedStyle(document.body).backgroundColor, styles: [...document.querySelectorAll('head link[rel="stylesheet"]')].map(node => new URL(node.href).pathname) }));
  assert.equal(state.background, theme === 'light' ? 'rgb(243, 246, 246)' : 'rgb(15, 24, 29)');
  assert.equal(state.styles.at(-1), '/assets/site-themes.css');
  assert.equal(await page.locator('html').getAttribute('lang'), language);
  const prefix = language === 'en' ? '/en' : '';
  assert.equal(await page.locator('footer .footer-links > a').first().getAttribute('href'), prefix + '/today/');
  assert.equal(await page.locator('footer .footer-note').innerText(), language === 'en' ? 'I’m working hard on a few questions.' : '努力研究一些问题。');
  assert.equal(await page.locator('footer [data-i18n="common.signature.1"]').count(), 0);
  if (!full) {
    assert.equal(await page.locator('.hero-signature').innerText(), language === 'en' ? 'I’m putting my energy into English.' : '我要把精力放到英语上。');
    assert.equal(await page.locator('#home-title').textContent(), language === 'en' ? 'Xie Yuqing' : '谢雨卿');
    assert.equal(await page.locator('.home-avatar').getAttribute('role'), 'img');
    assert.equal(await page.locator('.home-avatar').getAttribute('aria-label'), language === 'en' ? 'Line drawing of Xie Yuqing' : '谢雨卿的简笔头像');
  }
  const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id)); assert.equal(new Set(ids).size, ids.length);
  await noOverflow(page); return state;
}
function latestPhotos() {
  const all = photoCatalog.albums.flatMap(album => album.photos.map(photo => ({ photo, album })));
  all.sort((a, b) => { const x = [a.photo.date || a.album.date, a.photo.time, a.photo.id], y = [b.photo.date || b.album.date, b.photo.time, b.photo.id]; for (let i = 0; i < x.length; i++) { if (x[i] < y[i]) return 1; if (x[i] > y[i]) return -1; } return 0; });
  const seen = new Set(); return all.filter(({ photo }) => seen.has(photo.id) ? false : (seen.add(photo.id), true)).slice(0, 6);
}
async function homeStructure(page, language, width) {
  const prefix = language === 'en' ? '/en' : '';
  const blocks = await page.locator('main > .home-top > section, main > section').evaluateAll(nodes => nodes.map(node => node.classList.contains('home-hero') ? 'hero' : node.id));
  assert.deepEqual(blocks, ['hero', 'brief', 'writing', 'home-photos', 'projects']);
  assert.equal(await page.locator('#brief').getAttribute('data-brief-mode'), 'glance');
  assert(await page.locator('#brief').evaluate(node => node.classList.contains('daily-home') && node.classList.contains('home-glance')));
  assert.equal(await page.locator('.recent-list,#own-quote,#picks,#daily-feed,#daily-meme-card,#daily-quote,#brief-toggle').count(), 0);
  for (const id of ['own-quotes-data', 'daily-brief-data', 'daily-content-data', 'daily-knowledge-data', 'daily-memes-data', 'daily-rules-data', 'daily-holidays-data']) assert.equal(await page.locator('#' + id).count(), 0);
  assert.equal(await page.locator('script[src*="home-now.js"]').count(), 0);
  assert.equal(await page.locator('#writing .section-head a').count(), 0);
  assert.equal(await page.locator('#writing a[href="' + prefix + '/articles/"]').count(), 1);
  assert.equal(await page.locator('#writing a[href="' + prefix + '/anthology/"]').count(), 1);
  assert.equal(await page.locator('#projects .yl-project-grid > article').count(), 2);
  assert.equal(await page.locator('#projects .section-head a[href="' + prefix + '/projects/"]').count(), 1);
  assert.equal(await page.locator('#projects .section-head a[href="' + prefix + '/game/"]').count(), 1);
  const cards = page.locator('#brief a.glance-cards');
  assert.equal(await cards.getAttribute('href'), prefix + '/today/');
  assert.equal(await cards.getAttribute('aria-label'), language === 'en' ? 'Today’s brief: date, solar term and almanac' : '今日简报：日期、节气和黄历');
  assert.equal(await cards.locator('.glance-card').count(), 3);
  assert.equal(await page.locator('#earth-canvas').evaluate(node => Boolean(node.closest('a'))), false);
  const positions = await page.evaluate(() => { const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }; return { hero: box('.home-hero'), brief: box('#brief') }; });
  if (width >= 960) { assert(positions.brief.x >= positions.hero.right - 1); assert(Math.min(positions.hero.bottom, positions.brief.bottom) > Math.max(positions.hero.y, positions.brief.y), 'First-row blocks overlap vertically'); }
  else assert(positions.brief.y >= positions.hero.bottom - 1, 'Narrow layout stacks the briefing below the avatar');
  assert.equal(await page.locator('#home-photos img').count(), 6);
  const actual = await page.locator('#home-photos .home-photo-card').evaluateAll(nodes => nodes.map(node => { const image = node.querySelector('img'); return { src: image.getAttribute('src'), alt: image.alt, loading: image.loading, width: +image.getAttribute('width'), height: +image.getAttribute('height'), href: node.querySelector('a').getAttribute('href') }; }));
  const expected = latestPhotos(); assert.deepEqual(actual.map(item => item.src), expected.map(({ photo }) => photo.thumbnail));
  actual.forEach((item, index) => { assert(item.alt); assert.equal(item.loading, 'lazy'); assert.equal(item.width, expected[index].photo.thumbnail_width); assert.equal(item.height, expected[index].photo.thumbnail_height); assert.equal(item.href, prefix + '/photos/' + expected[index].album.id + '/'); });
  return { blocks, positions };
}
async function glanceContent(page, language) {
  assert.equal((await page.locator('#glance-date').textContent()).trim(), language === 'en' ? 'Tuesday 27 October' : '10月27日 星期二');
  const term = await page.locator('#daily-calendar-term').textContent(), next = await page.locator('#daily-calendar-next-term').textContent();
  assert(language === 'en' ? /day\s+\d+/i.test(term) : /第\s*\d+\s*天/.test(term));
  assert(language === 'en' ? /\d+\s+days until/i.test(next) : /距.+还有\s*\d+\s*天/.test(next));
  assert((await page.locator('#daily-calendar-lunar').textContent()).trim());
  for (const id of ['daily-almanac-yi', 'daily-almanac-ji']) {
    const value = (await page.locator('#' + id).textContent()).trim(); assert.equal(value.split(/\s*·\s*/).length, 3, id + ': ' + value);
    const expected = await page.evaluate(id => { const lunar = Solar.fromYmd(2026, 10, 27).getLunar(); return (id.endsWith('-yi') ? lunar.getDayYi() : lunar.getDayJi()).slice(0, 3).join(' · '); }, id); assert.equal(value, expected);
  }
  const size = await page.locator('#earth-canvas').boundingBox(); assert(size.width > 80 && size.width <= 145);
}
async function fullContent(page, language, width) {
  assert.equal(await page.locator('#brief').getAttribute('data-brief-mode'), 'full');
  assert.equal(await page.locator('#brief-toggle,.brief-bar').count(), 0);
  assert.equal(await page.locator('main h1').count(), 1);
  assert.equal(await page.locator('#daily-feed article').count(), brief.items.length);
  const cards = await page.locator('#daily-feed article').evaluateAll(nodes => nodes.map(node => ({ title: node.querySelector('h3 a')?.textContent, href: node.querySelector('h3 a')?.getAttribute('href'), time: node.querySelector('time')?.getAttribute('datetime'), text: node.textContent })));
  assert.deepEqual(cards.map(card => card.title), news.map(item => item.title[language]));
  assert.deepEqual(cards.map(card => card.href), news.map(item => item.url));
  assert.deepEqual(cards.map(card => card.time), news.map(item => item.published));
  cards.forEach((card, index) => { assert(card.text.includes(news[index].summary[language])); assert(card.text.includes(news[index].source[language])); });
  assert((await page.locator('#daily-edition').textContent()).includes(brief.updated_at.slice(11, 16)));
  for (const id of ['daily-news-title', 'today-heading', 'earth-heading']) assert.equal(await page.locator('#' + id).evaluate(node => node.tagName), 'H2');
  assert.equal(await page.locator('#daily-feed article h3').count(), news.length);
  assert.equal(await page.locator('#daily-almanac details').count(), 0);
  assert((await page.locator('#daily-weather').textContent()).includes('21°C'));
  for (const id of ['daily-almanac-yi', 'daily-almanac-ji', 'daily-almanac-clash', 'daily-almanac-directions', 'daily-moon-phase']) assert((await page.locator('#' + id).innerText()).trim(), id);
  if (language === 'en') { assert.equal(await page.locator('#daily-almanac-pengzu').isVisible(), false); assert((await page.locator('#daily-almanac-directions').textContent()).includes('Joy')); }
  else { assert(await page.locator('#daily-almanac-pengzu').isVisible()); assert((await page.locator('#daily-almanac-pengzu').textContent()).trim()); for (const label of ['喜神', '福神', '财神']) assert((await page.locator('#daily-almanac-directions').textContent()).includes(label)); }
  assert.equal(await page.locator('#daily-world-clocks > div').count(), 4);
  const clocks = await page.locator('#daily-world-clocks').textContent(); for (const city of language === 'en' ? ['Beijing', 'Kuala Lumpur', 'London', 'New York'] : ['北京', '吉隆坡', '伦敦', '纽约']) assert(clocks.includes(city));
  for (const id of ['daily-almanac-yi', 'daily-almanac-ji']) { const expected = await page.evaluate(id => { const lunar = Solar.fromYmd(2026, 10, 27).getLunar(); return (id.endsWith('-yi') ? lunar.getDayYi() : lunar.getDayJi()).join(' · '); }, id); assert.equal(await page.locator('#' + id).textContent(), expected); }
  assert.equal(await page.locator('#brief-bottom > article').count(), 3 + Number(memes.length > 0));
  assert.equal(await page.locator('#brief-bottom > article > h2').count(), 3 + Number(memes.length > 0));
  assert.equal(await page.locator('#brief-bottom #own-quote').count(), 1);
  assert((await page.locator('#own-quote-text').textContent()).trim());
  const issues = await page.evaluate(() => {
    const internal = [], clipped = [];
    for (const node of document.querySelectorAll('*')) {
      const style = getComputedStyle(node), label = node.tagName + (node.id ? '#' + node.id : '') + (node.className && typeof node.className === 'string' ? '.' + node.className.trim().replaceAll(' ', '.') : '');
      if (['auto', 'scroll'].includes(style.overflowY)) internal.push(label);
      if (node.closest('.sr-only')) continue;
      if (['hidden', 'clip'].includes(style.overflowY) && node.scrollHeight > node.clientHeight + 1) clipped.push({ label, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight });
    }
    return { internal, clipped };
  });
  assert.deepEqual(issues.internal, [], 'No internal scrolling at any element'); assert.deepEqual(issues.clipped, [], 'No clipped text');
  const layout = await page.evaluate(() => { const r = selector => { const b = document.querySelector(selector).getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; }; return { news: r('.yl-news'), today: r('.yl-calendar'), earth: r('#daily-earth'), bottom: r('#brief-bottom') }; });
  if (width <= 720) { assert(layout.today.y >= layout.news.bottom - 1); assert(layout.earth.y >= layout.today.bottom - 1); assert(layout.bottom.y >= layout.earth.bottom - 1); }
  else { assert(layout.today.x >= layout.news.right - 1); assert(Math.abs(layout.today.y - layout.news.y) <= 2); }
  return { news: cards.length, layout, issues };
}
async function drag(page) {
  await page.locator('#earth-canvas').scrollIntoViewIfNeeded(); await paint(page);
  const hash = () => page.locator('#earth-canvas').evaluate(canvas => { const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; let value = 2166136261; for (let i = 0; i < data.length; i += 4) value = Math.imul(value ^ data[i], 16777619); return value >>> 0; });
  const before = await hash(), box = await page.locator('#earth-canvas').boundingBox(), url = page.url();
  await page.mouse.move(box.x + box.width * .4, box.y + box.height * .45); await page.mouse.down(); await page.mouse.move(box.x + box.width * .7, box.y + box.height * .55, { steps: 8 }); await page.mouse.up();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const afterDrag = await hash(); assert.notEqual(afterDrag, before, 'Dragging changes the actual rendered globe'); assert.equal(page.url(), url);
  await page.locator('#earth-canvas').focus(); await page.keyboard.press('ArrowRight');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.notEqual(await hash(), afterDrag, 'Keyboard arrows rotate the actual globe too');
}
async function capture(page, name) {
  await page.locator('img').evaluateAll(async images => { for (const image of images) image.loading = 'eager'; await Promise.all(images.map(image => image.decode())); });
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  const file = path.join(out, name + '.png'); await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(file);
}
async function clickFull(page, language) { const route = language === 'en' ? '/en/today/' : '/today/'; await page.locator('#brief a[href="' + route + '"]').first().click(); await page.waitForURL(origin + route, { waitUntil: 'domcontentloaded' }); await ready(page); await waitFull(page); }

(async () => {
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const language of ['zh-CN', 'en']) for (const width of widths) for (const theme of ['light', 'dark']) {
      const { ctx, requests, weather } = await context({ width, theme });
      const page = await ctx.newPage(), prefix = language === 'en' ? '/en' : '';
      try {
        await check(`home ${language} ${width} ${theme}`, async () => {
          await go(page, prefix + '/'); const structure = await homeStructure(page, language, width);
          await waitGlance(page); await glanceContent(page, language); await appearance(page, theme, language, false);
          assert.equal(weather.length, 0);
          const cache = await page.evaluate(() => window.__round5Storage.filter(item => /weather|home-city/.test(item.key))); assert.deepEqual(cache, []);
          const early = requests.filter(item => /\/vendor\/(?:lunar|d3)|\/home-earth\.js$|\/map-land\.json$/.test(item.pathname) && !item.loaded); assert.deepEqual(early, [], 'Heavy assets wait until the load event');
          const idle = await page.evaluate(() => window.__round5Idle); assert(idle.some(options => options?.timeout === 2000));
          await capture(page, `home-${language}-${width}-${theme}`); return structure;
        });
        await check(`today ${language} ${width} ${theme}`, async () => {
          await clickFull(page, language); const detail = await fullContent(page, language, width); await appearance(page, theme, language, true);
          assert.equal(weather.length, 1, 'Full page alone makes one current+daily weather query');
          assert(weather.every(item => /\/(?:en\/)?today\//.test(item.pagePath)));
          await capture(page, `today-${language}-${width}-${theme}`); return detail;
        });
      } finally { report.network.push({ language, width, theme, requests, weather }); await ctx.close(); }
    }
    for (const language of ['zh-CN', 'en']) for (const theme of ['light', 'dark']) await check(`three complete navigation cycles ${language} ${theme}`, async () => {
      const { ctx, requests, weather } = await context({ theme, seedOld: true });
      try {
        const page = await ctx.newPage(), home = language === 'en' ? '/en/' : '/'; await go(page, home); await waitGlance(page); await drag(page);
        assert.equal(await page.evaluate(() => localStorage.getItem('xieyuqing-brief-closed')), null);
        await page.evaluate(() => { window.__round5Document = 'same'; window.__round5Theme = document.querySelector('link[href*="site-themes.css"]'); });
        await clickFull(page, language); await drag(page); const fullBaseline = await page.evaluate(() => SiteNavigation.state());
        await page.goBack(); await page.waitForURL(origin + home); await ready(page); await waitGlance(page); const homeBaseline = await page.evaluate(() => SiteNavigation.state());
        for (let index = 0; index < 3; index++) {
          await clickFull(page, language); await appearance(page, theme, language, true);
          const full = await page.evaluate(() => SiteNavigation.state()); assert.equal(full.scopeListeners, fullBaseline.scopeListeners); assert.equal(full.scopeCleanups, fullBaseline.scopeCleanups);
          await page.goBack(); await page.waitForURL(origin + home); await ready(page); await waitGlance(page); await appearance(page, theme, language, false);
          const current = await page.evaluate(() => SiteNavigation.state()); assert.equal(current.scopeListeners, homeBaseline.scopeListeners); assert.equal(current.scopeCleanups, homeBaseline.scopeCleanups);
        }
        assert.equal(await page.evaluate(() => window.__round5Document), 'same');
        assert.equal(await page.evaluate(() => window.__round5Theme === document.querySelector('link[href*="site-themes.css"]')), true);
        assert.equal(requests.filter(item => item.pathname === '/assets/site-themes.css').length, 1);
        assert(weather.every(item => /\/(?:en\/)?today\//.test(item.pagePath))); return { homeBaseline, fullBaseline, weather: weather.length };
      } finally { await ctx.close(); }
    });
    for (const theme of ['light', 'dark']) await check('shared styles remain stable through article and about links ' + theme, async () => {
      const { ctx, requests } = await context({ theme }); try {
        const page = await ctx.newPage(); await go(page, '/'); await waitGlance(page); await page.evaluate(() => { window.__round5Style = document.querySelector('link[href*="site-themes.css"]'); });
        for (const [selector, route] of [['.nav-entry[href="/articles/"]', '/articles/'], ['.site-header .brand', '/'], ['.nav-entry[href="/about/"]', '/about/']]) {
          await page.locator(selector).click(); await page.waitForURL(origin + route); await ready(page); await appearance(page, theme, 'zh-CN', route !== '/');
          assert.equal(await page.evaluate(() => window.__round5Style === document.querySelector('link[href*="site-themes.css"]')), true);
        }
        assert.equal(requests.filter(item => item.pathname === '/assets/site-themes.css').length, 1);
      } finally { await ctx.close(); }
    });
    await check('idle fallback starts heavy homepage dependencies after the 1.2-second delay', async () => {
      const { ctx, requests, weather } = await context({ idleUnavailable: true }); try {
        const page = await ctx.newPage(); await go(page, '/'); await waitGlance(page);
        const heavy = requests.filter(item => /\/vendor\/(?:lunar|d3)|\/home-earth\.js$|\/map-land\.json$/.test(item.pathname));
        assert(heavy.length >= 4); assert(heavy.every(item => item.loaded && item.elapsedAfterLoad >= 1100), JSON.stringify(heavy)); assert.equal(weather.length, 0);
      } finally { await ctx.close(); }
    });
    for (const language of ['zh-CN', 'en']) await check('full-page language switch pairs the actual route ' + language, async () => {
      const { ctx } = await context(); try {
        const page = await ctx.newPage(); await go(page, language === 'en' ? '/en/today/' : '/today/'); await waitFull(page);
        const destination = language === 'en' ? '/today/' : '/en/today/'; await page.locator('.site-header .site-language-switch').focus(); await page.keyboard.press('Enter'); await page.waitForURL(origin + destination); await ready(page); await waitFull(page);
        assert.equal(await page.locator('html').getAttribute('lang'), language === 'en' ? 'zh-CN' : 'en');
      } finally { await ctx.close(); }
    });
    for (const language of ['zh-CN', 'en']) for (const key of ['Enter', 'Space']) await check(`random article keyboard ${language} ${key}`, async () => {
      const { ctx } = await context(); try {
        const page = await ctx.newPage(); await go(page, language === 'en' ? '/en/' : '/'); const links = await page.locator('#home-random-data').evaluate(node => JSON.parse(node.textContent)); assert(links.length > 0);
        await page.evaluate(() => { Math.random = () => 0; }); await page.locator('#home-random-button').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); assert(await page.locator('#home-random-button').evaluate(node => node === document.activeElement && node.matches(':focus-visible'))); await page.keyboard.press(key); await page.waitForURL(origin + links[0]); await ready(page); assert.equal(await page.locator('html').getAttribute('lang'), language);
      } finally { await ctx.close(); }
    });
    for (const language of ['zh-CN', 'en']) await check('lunar failure preserves date and globe without almanac ' + language, async () => {
      const { ctx, weather } = await context({ width: 390, lunarFailure: true }); try {
        const page = await ctx.newPage(); await go(page, language === 'en' ? '/en/' : '/'); await waitGlance(page, { failed: true });
        assert.equal(await page.locator('#glance-almanac-card').isVisible(), false); assert.equal((await page.locator('#daily-calendar-next-term').textContent()).trim(), ''); assert((await page.locator('#glance-date').textContent()).includes('27')); assert.equal(weather.length, 0); await noOverflow(page);
      } finally { await ctx.close(); }
    });
    await check('storage denied still renders the homepage without weather', async () => {
      const { ctx, weather } = await context({ denied: true, width: 320 }); try { const page = await ctx.newPage(); await go(page, '/'); await waitGlance(page); await glanceContent(page, 'zh-CN'); assert.equal(weather.length, 0); await noOverflow(page); }
      finally { await ctx.close(); }
    });
    for (const language of ['zh-CN', 'en']) await check('no JavaScript preserves accessible links and full news ' + language, async () => {
      const { ctx, weather } = await context({ javascript: false, width: 390 }); try {
        const page = await ctx.newPage(), prefix = language === 'en' ? '/en' : ''; await page.goto(origin + prefix + '/');
        assert.equal(await page.locator('#home-random-button').isVisible(), false); assert.equal(await page.locator('#daily-feed').count(), 0); assert((await page.locator('#brief noscript').textContent()).includes(language === 'en' ? 'Enable JavaScript' : '启用 JavaScript'));
        await page.locator('#brief a[href="' + prefix + '/today/"]').first().click(); await page.waitForURL(origin + prefix + '/today/'); assert.equal(await page.locator('#daily-feed article').count(), news.length); assert.equal(weather.length, 0); await noOverflow(page);
      } finally { await ctx.close(); }
    });
    await check('all generated local resources and page scopes are clean', async () => { assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.missing, []); });
  } catch (error) { report.error = error.stack; }
  finally {
    if (browser) await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    const failed = report.checks.filter(item => !item.passed).length; process.stdout.write(JSON.stringify({ checks: report.checks.length, passed: report.checks.length - failed, failed, errors: report.pageErrors.length, missing: report.missing.length, screenshots: report.screenshots.length, error: report.error }) + '\n');
    if (failed || report.error) process.exitCode = 1;
  }
})();
