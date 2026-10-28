'use strict';
// Real, isolated Chrome acceptance for the five-block homepage and full daily page.
// Only local generated files are served. Open-Meteo is synthetic; other remote requests are blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = process.env.WEBSITE_ROOT || path.resolve(__dirname, '..');
const site = path.join(root, '_site_unified'), out = process.env.HOME_BROWSER_OUTPUT || path.join(root, '.local-checks/history-20261027');
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
const parisResults = [
  { id: 2988507, name: 'Paris', latitude: 48.85341, longitude: 2.3488, timezone: 'Europe/Paris', country: 'France', country_code: 'FR', admin1: 'Île-de-France' },
  { id: 4717560, name: 'Paris', latitude: 33.66094, longitude: -95.55551, timezone: 'America/Chicago', country: 'United States', country_code: 'US', admin1: 'Texas' }
];
function forecast({ code = 0, temperature = 21.4 } = {}) {
  return { current: { temperature_2m: temperature, weather_code: code, time: '2026-10-27T12:00', apparent_temperature: 19.2, relative_humidity_2m: 67, wind_speed_10m: 18.5, wind_direction_10m: 225, pressure_msl: 1015.8 }, daily: { time: ['2026-10-27'], temperature_2m_max: [34], temperature_2m_min: [15], precipitation_probability_max: [65] } };
}
function assertForecastQuery(value) {
  const url = new URL(value), query = url.searchParams;
  assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(query.get('forecast_days'), '1'); assert.equal(query.get('wind_speed_unit'), 'kmh');
  assert.equal(query.get('temperature_unit'), 'celsius'); assert(query.get('timezone'));
  const fields = query.get('current').split(',');
  for (const field of ['temperature_2m', 'weather_code', 'apparent_temperature', 'relative_humidity_2m', 'wind_speed_10m', 'wind_direction_10m', 'pressure_msl']) assert(fields.includes(field), field);
  for (const field of ['temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max']) assert(query.get('daily').split(',').includes(field), field);
}
async function noAlmanac(page) {
  assert.equal(await page.locator('main [id*="almanac"],main [class*="almanac"]').count(), 0, 'Almanac and fortune content is removed from the DOM');
}
async function clocks(page, language, selected = null) {
  const fixed = [
    { zh: '北京', en: 'Beijing', tz: 'Asia/Shanghai' }, { zh: '吉隆坡', en: 'Kuala Lumpur', tz: 'Asia/Kuala_Lumpur' },
    { zh: '伦敦', en: 'London', tz: 'Europe/London' }, { zh: '纽约', en: 'New York', tz: 'America/New_York' }, { zh: '莫斯科', en: 'Moscow', tz: 'Europe/Moscow' }
  ];
  const expected = selected ? [selected, ...fixed] : [...fixed, { zh: '迪拜', en: 'Dubai', tz: 'Asia/Dubai' }];
  const values = await page.locator('#daily-world-clocks > div').allTextContents();
  assert.equal(values.length, 6); assert.deepEqual(values.map(value => value.split(' · ')[0]), expected.map(place => place[language === 'en' ? 'en' : 'zh']));
  values.forEach((value, index) => { const time = new Intl.DateTimeFormat('en-GB', { timeZone: expected[index].tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(epoch)); assert(value.includes(time), value + ' should show ' + time); });
  return values;
}
async function timeline(page, language, dated = true) {
  const figure = page.locator('figure.today-timeline'), svg = figure.locator('svg.today-timeline-svg');
  assert.equal(await figure.count(), 1); assert.equal(await figure.getAttribute('aria-labelledby'), 'timeline-caption');
  assert.equal(await svg.getAttribute('role'), 'img'); assert.equal(await svg.getAttribute('aria-labelledby'), 'timeline-title timeline-description');
  for (const id of ['timeline-title', 'timeline-description', 'timeline-caption']) assert((await page.locator('#' + id).textContent()).trim());
  assert.deepEqual(await figure.locator('.timeline-labels > *').allTextContents(), language === 'en' ? ['Past', 'Today', 'Future'] : ['过去', '今天', '未来']);
  const geometry = await figure.evaluate(node => { const figure = node.getBoundingClientRect(), title = document.querySelector('.today-intro-copy').getBoundingClientRect(); return { width: innerWidth, x: figure.x, y: figure.y, right: figure.right, bottom: figure.bottom, title: { x: title.x, y: title.y, right: title.right, bottom: title.bottom } }; });
  if (geometry.width >= 768) assert(geometry.x >= geometry.title.right - 1, 'Timeline sits to the right of the title');
  else assert(geometry.y >= geometry.title.bottom - 1, 'Timeline stacks after the title on mobile');
  assert.equal(await svg.locator('animate,animateMotion,animateTransform').count(), 0);
  assert(await svg.evaluate(node => [node, ...node.querySelectorAll('*')].every(item => getComputedStyle(item).animationName === 'none')));
  if (dated) assert((await page.locator('#timeline-date').textContent()).includes('27'));
}
async function context({ width = 1440, theme = 'light', javascript = true, lunarFailure = false, denied = false, seedOld = false, idleUnavailable = false, reducedMotion = 'no-preference', forecastMock = null, searchMock = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, javaScriptEnabled: javascript, reducedMotion });
  ctx.setDefaultTimeout(10000);
  const requests = [], weather = [], searches = [];
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
      const request = { url, ...frame }; weather.push(request);
      const response = forecastMock ? await forecastMock(new URL(url), weather.length - 1, request) : { body: forecast() };
      if (response.delay) await new Promise(resolve => setTimeout(resolve, response.delay));
      try { return await route.fulfill({ status: response.status || 200, contentType: 'application/json', body: JSON.stringify(response.body || {}) }); } catch (_) { return; }
    }
    if (url.startsWith('https://geocoding-api.open-meteo.com/')) {
      const request = { url, ...frame }; searches.push(request);
      const response = searchMock ? await searchMock(new URL(url), searches.length - 1, request) : { body: { results: parisResults } };
      if (response.delay) await new Promise(resolve => setTimeout(resolve, response.delay));
      try { return await route.fulfill({ status: response.status || 200, contentType: 'application/json', body: JSON.stringify(response.body || {}) }); } catch (_) { return; }
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
  return { ctx, requests, weather, searches };
}
async function ready(page) { await page.waitForFunction(() => window.SiteI18n && window.SiteNavigation && !SiteNavigation.state().transition); await page.evaluate(() => document.fonts.ready); }
async function go(page, route) { await page.goto(origin + route); await ready(page); }
async function waitGlance(page, { failed = false } = {}) {
  await page.locator('#earth-canvas').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('#daily-earth')?.dataset.earthReady === 'true');
  if (failed) await page.waitForFunction(() => document.querySelector('#daily-calendar-term')?.textContent.trim());
  else await page.waitForFunction(() => document.querySelector('#daily-calendar-next-term')?.textContent.trim());
  await paint(page);
}
async function waitFull(page) {
  await page.waitForFunction(() => document.querySelector('#daily-calendar-lunar')?.textContent.trim() && document.querySelector('#daily-calendar-term')?.textContent.trim());
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
  assert.equal(await page.locator('footer .footer-links > a').first().innerText(), language === 'en' ? 'Today in history' : '历史中的今天');
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
async function headerStructure(page, language) {
  const prefix = language === 'en' ? '/en' : '';
  const brand = await page.locator('.site-header .brand').innerText();
  assert(brand.includes('谢雨卿') && brand.includes('Xie Yuqing · Carl'), brand);
  const menus = { articles: ['/articles/', '/anthology/'], projects: ['/projects/', '/game/'], map: ['/map/', '/photos/'] };
  for (const [group, paths] of Object.entries(menus)) {
    const container = page.locator('.nav-item[data-nav-group="' + group + '"]');
    assert.equal(await container.locator('summary.nav-entry').count(), 1);
    assert.equal(await container.locator('summary.nav-entry').getAttribute('href'), null);
    assert.equal(await container.locator('summary.nav-entry a').count(), 0);
    assert.deepEqual(await container.locator('.nav-menu a').evaluateAll(nodes => nodes.map(n => n.getAttribute('href'))), paths.map(p => prefix + p));
    if (language === 'zh-CN') assert.deepEqual(await container.locator('.nav-menu a').allTextContents(), { articles: ['我的文章', '古今名作'], projects: ['AI应用', '小游戏'], map: ['我的足迹', '我的照片'] }[group]);
  }
  await noOverflow(page);
}
async function homeStructure(page, language, width) {
  await headerStructure(page, language);
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
  assert.equal(await page.locator('#glance-title > a').getAttribute('href'), prefix + '/today/');
  const cards = page.locator('#brief a.glance-cards');
  assert.equal(await cards.getAttribute('href'), prefix + '/today/');
  assert.equal(await cards.getAttribute('aria-label'), language === 'en' ? 'Today in history: date and solar term' : '历史中的今天：日期与节气');
  assert.equal(await cards.locator('.glance-card').count(), 2);
  assert.equal(await page.locator('#glance-title > a').innerText(), language === 'en' ? 'Today in history' : '历史中的今天');
  assert.equal(await page.title(), '谢雨卿 Xie Yuqing · Carl');
  assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'), '谢雨卿 Xie Yuqing · Carl');
  await noAlmanac(page);
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
  await noAlmanac(page);
  const size = await page.locator('#earth-canvas').boundingBox(); assert(size.width > 80 && size.width <= 145);
}
async function fullContent(page, language, width) {
  await headerStructure(page, language);
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
  assert((await page.locator('#daily-weather').textContent()).includes('21°C'));
  for (const id of ['daily-calendar-lunar', 'daily-calendar-term', 'daily-moon-phase']) assert((await page.locator('#' + id).innerText()).trim(), id);
  await noAlmanac(page);
  await clocks(page, language);
  await timeline(page, language);
  assert.equal(await page.locator('main h1').innerText(), language === 'en' ? 'Today in history' : '历史中的今天');
  assert.equal(await page.title(), language === 'en' ? 'Today in history · Xie Yuqing' : '历史中的今天 · 谢雨卿');
  assert.equal(await page.locator('#city-search-form').count(), 1);
  assert.equal(await page.locator('#city-search-input').getAttribute('type'), 'search');
  assert.equal(await page.locator('#city-search-status').getAttribute('aria-live'), 'polite');
  assert((await page.locator('#daily-weather-details').textContent()).trim());
  assert.equal(await page.locator('#brief-bottom > article').count(), 3 + Number(memes.length > 0));
  assert.equal(await page.locator('#brief-bottom > article > h2').count(), 3 + Number(memes.length > 0));
  assert.equal(await page.locator('#brief-bottom .yl-daily-card').count(), 1);
  assert((await page.locator('#daily-quote-text').textContent()).trim());
  assert.equal(await page.locator('[id^="own-quote"]').count(), 0);
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
      const { ctx, requests, weather, searches } = await context({ width, theme });
      const page = await ctx.newPage(), prefix = language === 'en' ? '/en' : '';
      try {
        await check(`home ${language} ${width} ${theme}`, async () => {
          await go(page, prefix + '/'); const structure = await homeStructure(page, language, width);
          await waitGlance(page); await glanceContent(page, language); await appearance(page, theme, language, false);
          assert.equal(weather.length, 0); assert.equal(searches.length, 0);
          const cache = await page.evaluate(() => window.__round5Storage.filter(item => /weather|home-city/.test(item.key))); assert.deepEqual(cache, []);
          const early = requests.filter(item => /\/vendor\/(?:lunar|d3)|\/home-earth\.js$|\/map-land\.json$/.test(item.pathname) && !item.loaded); assert.deepEqual(early, [], 'Heavy assets wait until the load event');
          const idle = await page.evaluate(() => window.__round5Idle); assert(idle.some(options => options?.timeout === 2000));
          await capture(page, `home-${language}-${width}-${theme}`); return structure;
        });
        await check(`today ${language} ${width} ${theme}`, async () => {
          await clickFull(page, language); const detail = await fullContent(page, language, width); await appearance(page, theme, language, true);
          assert.equal(weather.length, 1, 'Full page alone makes one current+daily weather query');
          assertForecastQuery(weather[0].url); assert.equal(searches.length, 0);
          assert(weather.every(item => /\/(?:en\/)?today\//.test(item.pagePath)));
          await capture(page, `today-${language}-${width}-${theme}`); return detail;
        });
      } finally { report.network.push({ language, width, theme, requests, weather, searches }); await ctx.close(); }
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
        for (const [selector, route] of [['.nav-menu a[href="/articles/"]', '/articles/'], ['.site-header .brand', '/'], ['.nav-entry[href="/about/"]', '/about/']]) {
          if (route === '/articles/') await page.locator('.nav-item[data-nav-group="articles"] summary.nav-entry').click();
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
    for (const language of ['zh-CN', 'en']) await check('lunar failure preserves the date, solar term and globe ' + language, async () => {
      const { ctx, weather } = await context({ width: 390, lunarFailure: true }); try {
        const page = await ctx.newPage(); await go(page, language === 'en' ? '/en/' : '/'); await waitGlance(page, { failed: true });
        await noAlmanac(page); assert.equal((await page.locator('#daily-calendar-next-term').textContent()).trim(), ''); assert((await page.locator('#glance-date').textContent()).includes('27')); assert.equal(weather.length, 0); await noOverflow(page);
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
        await page.locator('#brief a[href="' + prefix + '/today/"]').first().click(); await page.waitForURL(origin + prefix + '/today/'); assert.equal(await page.locator('#daily-feed article').count(), news.length); assert.equal(weather.length, 0); await noAlmanac(page); await timeline(page, language, false); assert.equal(await page.locator('main h1').innerText(), language === 'en' ? 'Today in history' : '历史中的今天'); await noOverflow(page);
      } finally { await ctx.close(); }
    });
    for (const language of ['zh-CN', 'en']) await check('updated biography, site notes and anthology introduction ' + language, async () => {
      const { ctx } = await context({ width: 390 });
      try {
        const page = await ctx.newPage(), prefix = language === 'en' ? '/en' : '', biography = JSON.parse(fs.readFileSync(path.join(root, 'home/about.json'), 'utf8'));
        await go(page, prefix + '/about/');
        assert.deepEqual(await page.locator('.about-bio > p').allTextContents(), biography[language === 'en' ? 'english_bio' : 'chinese_bio']);
        assert.deepEqual(await page.locator('.about-colophon > p').allTextContents(), biography[language === 'en' ? 'english_colophon' : 'chinese_colophon']);
        assert.equal(await page.locator('.about-written-note').count(), 1);
        assert.equal(await page.locator('.about-written-note').innerText(), biography[language === 'en' ? 'english_written_note' : 'written_note']);
        assert((await page.locator('main').innerText()).includes(language === 'en' ? 'Actual date of writing' : '真实写作日期'));
        assert.equal(await page.locator('#site a[href*="github.com"]').count(), 0); await noOverflow(page);
        await capture(page, `about-${language}-390-light`);
        await go(page, prefix + '/anthology/');
        const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'home/locales/anthology.json'), 'utf8'));
        assert.equal(await page.locator('[data-i18n="anthology.tagline"]').textContent(), catalogue[language]['anthology.tagline']);
        assert.equal(await page.locator('meta[name="description"]').getAttribute('content'), catalogue[language]['anthology.description']);
        await noOverflow(page); await capture(page, `anthology-${language}-390-light`);
      } finally { await ctx.close(); }
    });
    for (const language of ['zh-CN', 'en']) for (const javascript of [true, false]) await check(`grouped menu keyboard and linked brief heading ${language} scripts=${javascript}`, async () => {
      const { ctx } = await context({ javascript, width: 390 });
      try {
        const page = await ctx.newPage(), prefix = language === 'en' ? '/en' : '';
        await page.goto(origin + prefix + '/'); if (javascript) await ready(page);
        await headerStructure(page, language);
        for (const group of ['articles', 'projects', 'map']) {
          const menu = page.locator('.nav-item[data-nav-group="' + group + '"] .nav-group'), summary = menu.locator('summary.nav-entry');
          await summary.focus(); await page.keyboard.press('Enter'); assert.equal(await menu.evaluate(n => n.open), true);
          assert.equal(new URL(page.url()).pathname, prefix + '/');
          await page.keyboard.press(javascript ? 'Escape' : 'Space'); assert.equal(await menu.evaluate(n => n.open), false);
          if (javascript) assert.equal(await summary.evaluate(n => document.activeElement === n), true);
          await summary.focus(); await page.keyboard.press('Space'); assert.equal(await menu.evaluate(n => n.open), true);
          await page.keyboard.press('Enter'); assert.equal(await menu.evaluate(n => n.open), false);
        }
        await page.locator('#glance-title > a').focus(); await page.keyboard.press('Enter'); await page.waitForURL(origin + prefix + '/today/');
        if (javascript) { await ready(page); await waitFull(page); }
        assert.equal(await page.locator('#daily-feed article').count(), news.length); await noOverflow(page);
      } finally { await ctx.close(); }
    });
    for (const language of ['zh-CN', 'en']) await check('weather preset, keyboard search and cached custom city ' + language, async () => {
      const { ctx, weather, searches } = await context({ width: 390 });
      try {
        const page = await ctx.newPage(), prefix = language === 'en' ? '/en' : '';
        await go(page, prefix + '/today/'); await waitFull(page);
        await page.locator('#daily-city').selectOption('shanghai');
        await page.waitForFunction(() => document.querySelector('#daily-local-time').textContent.includes(document.documentElement.lang === 'en' ? 'Shanghai' : '上海'));
        await clocks(page, language, { zh: '上海', en: 'Shanghai', tz: 'Asia/Shanghai' });
        await page.locator('#daily-city').selectOption('london');
        await page.waitForFunction(() => document.querySelector('#daily-local-time').textContent.includes(document.documentElement.lang === 'en' ? 'London' : '伦敦'));
        await clocks(page, language);
        const details = await page.locator('#daily-weather-details').innerText();
        for (const pattern of [/19(?:[.,]2)?/, /67/, /18(?:[.,]5)?/, /101[56](?:[.,]8)?/, /hPa/i]) assert(pattern.test(details), details);
        assert(language === 'en' ? /wind/i.test(details) && /pressure/i.test(details) : /风/.test(details) && /气压/.test(details));
        await page.locator('#city-search-input').fill('Paris'); await page.waitForTimeout(120); assert.equal(searches.length, 0, 'Search starts only on submit');
        await page.locator('#city-search-input').press('Enter');
        await page.waitForFunction(() => document.querySelectorAll('#city-search-results li > button').length === 2);
        assert.equal(searches.length, 1);
        const query = new URL(searches[0].url); assert.equal(query.origin + query.pathname, 'https://geocoding-api.open-meteo.com/v1/search');
        assert.equal(query.searchParams.get('name'), 'Paris'); assert.equal(query.searchParams.get('count'), '10'); assert.equal(query.searchParams.get('language'), language === 'en' ? 'en' : 'zh'); assert.equal(query.searchParams.get('format'), 'json');
        const buttons = page.locator('#city-search-results li > button'), resultText = await buttons.first().innerText();
        for (const part of ['Paris', language === 'en' ? 'France' : '法国', 'Europe/Paris']) assert(resultText.includes(part), resultText);
        await noOverflow(page); await capture(page, `history-search-results-${language}-390-light`);
        await buttons.first().focus(); await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('#daily-local-time').textContent.startsWith('Paris'));
        await clocks(page, language, { zh: 'Paris', en: 'Paris', tz: 'Europe/Paris' });
        assert((await page.locator('#daily-city option:checked').innerText()).startsWith('Paris'));
        await page.waitForFunction(() => [...Array(localStorage.length)].map((_, index) => localStorage.key(index)).some(key => key === 'xieyuqing-weather-v3:48.85341|2.34880|Europe/Paris'));
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('xieyuqing-home-city-v2'))); assert.equal(saved.version, 1); assert.equal(saved.city.tz, 'Europe/Paris'); assert.equal(saved.city.lat, 48.85341); assert.equal(saved.city.lon, 2.3488);
        const priorForecasts = weather.length, priorSearches = searches.length, storageStart = await page.evaluate(() => window.__round5Storage.length);
        await page.locator('.site-header .brand').click(); await page.waitForURL(origin + prefix + '/'); await ready(page); await waitGlance(page);
        const homepageReads = await page.evaluate(start => window.__round5Storage.slice(start).filter(item => /weather|home-city/.test(item.key)), storageStart); assert.deepEqual(homepageReads, []);
        assert.equal(weather.length, priorForecasts); assert.equal(searches.length, priorSearches); assert.equal(await page.locator('#city-search-form,#daily-weather').count(), 0);
        await clickFull(page, language); await clocks(page, language, { zh: 'Paris', en: 'Paris', tz: 'Europe/Paris' });
        assert.equal(weather.length, priorForecasts, 'Fresh matching city cache avoids a repeated forecast'); assert.equal(searches.length, priorSearches, 'Reopening a saved city needs no geocoding');
        weather.forEach(item => assertForecastQuery(item.url)); await noOverflow(page); await capture(page, `history-selected-paris-${language}-390-light`);
        return { forecasts: weather.length, searches: searches.length, saved };
      } finally { await ctx.close(); }
    });
    await check('late geocoding and forecast responses cannot overwrite the latest city', async () => {
      const { ctx, weather, searches } = await context({ width: 390,
        searchMock: url => url.searchParams.get('name') === 'Slow' ? { delay: 800, body: { results: [{ ...parisResults[0], id: 1850147, name: 'Tokyo', latitude: 35.6895, longitude: 139.69171, timezone: 'Asia/Tokyo', country: 'Japan', country_code: 'JP' }] } } : { body: { results: parisResults } },
        forecastMock: url => Number(url.searchParams.get('latitude')) === 31.2304 ? { delay: 800, body: forecast({ temperature: 33 }) } : { body: forecast() }
      });
      try {
        const page = await ctx.newPage(); await go(page, '/en/today/'); await waitFull(page);
        const firstSearch = page.waitForRequest(request => request.url().startsWith('https://geocoding-api.open-meteo.com/'));
        await page.locator('#city-search-input').fill('Slow'); await page.locator('#city-search-input').press('Enter'); await firstSearch;
        await page.locator('#city-search-input').fill('Paris'); await page.locator('#city-search-input').press('Enter');
        await page.waitForFunction(() => document.querySelector('#city-search-results')?.textContent.includes('France'));
        await page.waitForTimeout(950); assert(!(await page.locator('#city-search-results').innerText()).includes('Tokyo'));
        const slowForecast = page.waitForRequest(request => request.url().startsWith('https://api.open-meteo.com/')); await page.locator('#daily-city').selectOption('shanghai'); await slowForecast;
        await page.locator('#daily-city').selectOption('london');
        await page.waitForFunction(() => document.querySelector('#daily-local-time').textContent.startsWith('London') && document.querySelector('#daily-weather strong')?.textContent === '21°C');
        await page.waitForTimeout(950); assert.equal(await page.locator('#daily-weather strong').textContent(), '21°C'); await clocks(page, 'en'); await noOverflow(page);
        return { forecasts: weather.length, searches: searches.length };
      } finally { await ctx.close(); }
    });
    for (const language of ['zh-CN', 'en']) await check('search and forecast failures preserve readable calendar and allow recovery ' + language, async () => {
      const { ctx, weather, searches } = await context({ width: 320,
        searchMock: url => url.searchParams.get('name') === 'Empty' ? { body: { results: [] } } : { status: 503, body: {} },
        forecastMock: url => Number(url.searchParams.get('latitude')) === 31.2304 ? { status: 503, body: {} } : { body: forecast() }
      });
      try {
        const page = await ctx.newPage(), prefix = language === 'en' ? '/en' : ''; await go(page, prefix + '/today/'); await waitFull(page);
        await page.locator('#city-search-input').fill('Empty'); await page.locator('#city-search-input').press('Enter');
        await page.waitForFunction(() => /没有|未找到|No (?:cities|results|matching)/i.test(document.querySelector('#city-search-status').textContent)); assert.equal(await page.locator('#city-search-results button').count(), 0);
        await page.locator('#city-search-input').fill('Offline'); await page.locator('#city-search-input').press('Enter');
        await page.waitForFunction(() => /暂|失败|unavailable|try again/i.test(document.querySelector('#city-search-status').textContent)); assert.equal(await page.locator('#city-search-results button').count(), 0);
        await page.locator('#daily-city').selectOption('shanghai'); await page.waitForFunction(() => /暂不可用|unavailable/i.test(document.querySelector('#daily-weather').textContent));
        await clocks(page, language, { zh: '上海', en: 'Shanghai', tz: 'Asia/Shanghai' });
        assert((await page.locator('#daily-calendar-lunar').textContent()).trim()); assert((await page.locator('#daily-calendar-term').textContent()).trim());
        await page.locator('#daily-city').selectOption('london'); await page.waitForFunction(() => document.querySelector('#daily-weather strong')?.textContent === '21°C'); await clocks(page, language);
        await noAlmanac(page); await noOverflow(page); await capture(page, `history-weather-recovery-${language}-320-light`);
        return { forecasts: weather.length, searches: searches.length };
      } finally { await ctx.close(); }
    });
    for (const language of ['zh-CN', 'en']) await check('all supported WMO conditions and current-condition safety hints ' + language, async () => {
      const codes = [0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,97,99]; let activeCode = 0, activeTemperature = 21.4;
      const { ctx, weather } = await context({ forecastMock: () => { const body = forecast({ code: activeCode, temperature: activeTemperature }); body.daily.temperature_2m_max = [22]; body.daily.temperature_2m_min = [12]; body.daily.precipitation_probability_max = [0]; return { body }; } });
      try {
        const page = await ctx.newPage(); await go(page, language === 'en' ? '/en/today/' : '/today/'); await waitFull(page);
        for (const [index, code] of codes.entries()) {
          activeCode = code; activeTemperature = 10 + index;
          const response = page.waitForResponse(item => item.url().startsWith('https://api.open-meteo.com/'));
          await page.evaluate(() => { const keys = [...Array(localStorage.length)].map((_, index) => localStorage.key(index)); for (const key of keys) if (key.startsWith('xieyuqing-weather-')) localStorage.removeItem(key); document.dispatchEvent(new Event('visibilitychange')); });
          await response; await page.waitForFunction(value => document.querySelector('#daily-weather strong')?.textContent === value + '°C', activeTemperature);
          const condition = await page.locator('#daily-weather > span').innerText(), hint = await page.locator('#daily-weather-hint').innerText();
          assert(condition.trim() && !/unknown|未知|暂不可用|unavailable/i.test(condition), code + ': ' + condition);
          const pattern = code <= 3 ? (language === 'en' ? /clear|cloud|overcast/i : /晴|云|阴/) : code <= 48 ? (language === 'en' ? /fog/i : /雾/) : code <= 57 ? (language === 'en' ? /drizzle/i : /毛毛雨/) : code <= 67 ? (language === 'en' ? /rain/i : /雨/) : code <= 77 ? (language === 'en' ? /snow/i : /雪/) : code <= 82 ? (language === 'en' ? /shower|rain/i : /阵雨|雨/) : code <= 86 ? (language === 'en' ? /snow/i : /雪/) : (language === 'en' ? /thunder/i : /雷/);
          assert(pattern.test(condition), code + ': ' + condition);
          if (code > 3) { assert(await page.locator('#daily-weather-hint').isVisible()); assert(language === 'en' ? /visibility|fog|rain|umbrella|snow|slip|ice|icy|thunder|lightning/i.test(hint) : /雾|能见度|雨|伞|雪|滑|冰|雷/.test(hint), code + ': ' + hint); }
          else { assert(await page.locator('#daily-weather-hint').isVisible()); assert(language === 'en' ? /weather|sun/i.test(hint) : /天气|日照|防晒/.test(hint), hint); }
          process.stdout.write('WMO ' + language + ' ' + code + ' passed\n');
        }
        assert.equal(weather.length, codes.length + 1); return { codes };
      } finally { await ctx.close(); }
    });
    for (const language of ['zh-CN', 'en']) await check('reduced motion preserves the static timeline and interactive globe ' + language, async () => {
      const { ctx, weather, searches } = await context({ width: 390, theme: 'dark', reducedMotion: 'reduce' });
      try {
        const page = await ctx.newPage(), prefix = language === 'en' ? '/en' : ''; await go(page, prefix + '/'); await waitGlance(page); await noAlmanac(page); assert.equal(weather.length, 0); assert.equal(searches.length, 0);
        assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
        await clickFull(page, language); await timeline(page, language); await clocks(page, language); await drag(page); await noOverflow(page); await capture(page, `history-reduced-motion-${language}-390-dark`);
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
