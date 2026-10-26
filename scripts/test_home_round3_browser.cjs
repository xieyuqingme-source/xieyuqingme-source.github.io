'use strict';
// Isolated acceptance checks for the homepage's third content/structure revision.
// Only generated local files and synthetic weather responses are supplied.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = process.env.WEBSITE_ROOT || path.resolve(__dirname, '..');
const site = path.join(root, '_site_unified');
const out = path.join(root, '.local-checks/home-round3');
const origin = 'http://127.0.0.1:8767';
const key = 'xieyuqing-brief-closed', today = '2026-10-26';
const now = Date.parse('2026-10-26T04:00:00Z');
const about = JSON.parse(fs.readFileSync(path.join(root, 'home/about.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'photos/catalog.json'), 'utf8'));
const brief = JSON.parse(fs.readFileSync(path.join(root, 'home/daily-brief.json'), 'utf8'));
const signatures = {
  'zh-CN': ['我要把精力放到英语上。', '努力研究一些问题。'],
  en: ['I’m putting my energy into English.', 'I’m working hard on a few questions.']
};
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp4': 'video/mp4' };
const report = { checks: [], pageErrors: [], missing: [], external: [], screenshots: [] };
fs.mkdirSync(out, { recursive: true });
let browser;

async function check(name, action) {
  const start = Date.now();
  process.stdout.write('CHECK ' + name + '\n');
  try {
    const detail = await action();
    report.checks.push({ name, passed: true, ms: Date.now() - start, detail });
    process.stdout.write('PASS ' + name + '\n');
  } catch (error) {
    report.checks.push({ name, passed: false, ms: Date.now() - start, error: error.stack });
    process.stdout.write('FAIL ' + name + ': ' + error.message + '\n');
  }
}

async function context({ width = 1440, theme = 'light', saved, denied = false, javaScriptEnabled = true, edition, epoch = now, extraNews = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, javaScriptEnabled });
  ctx.setDefaultTimeout(7000);
  const weather = [];
  await ctx.addInitScript(({ epoch, saved, denied, key, origin }) => {
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [epoch])); }
      static now() { return epoch; }
    }
    window.Date = FixedDate;
    if (denied) {
      for (const name of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, name, { configurable: true, value() { throw new Error('Synthetic storage unavailable'); } });
    } else if (saved !== undefined && location.origin === origin) {
      // Seed once per context so subsequent refreshes exercise real persistence.
      if (!sessionStorage.getItem('round3-seeded')) {
        if (saved === null) localStorage.removeItem(key); else localStorage.setItem(key, saved);
        sessionStorage.setItem('round3-seeded', 'yes');
      }
    }
  }, { epoch, saved, denied, key, origin });
  await ctx.route('**/*', async route => {
    const url = route.request().url();
    if (/^(blob|data):/.test(url)) return route.continue();
    if (url.startsWith('https://api.open-meteo.com/')) {
      weather.push(url);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ current: { temperature_2m: 21.4, weather_code: 0, time: '2026-10-26T12:00' } }) });
    }
    if (!url.startsWith(origin + '/')) { report.external.push(url); return route.abort(); }
    try {
      let file = path.resolve(site, '.' + decodeURIComponent(new URL(url).pathname));
      assert(file === site || file.startsWith(site + path.sep), 'Local path boundary');
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      let body = fs.readFileSync(file);
      if (path.extname(file) === '.html' && (edition || extraNews)) {
        let html = body.toString('utf8');
        html = html.replace(/(<script\b[^>]*id="daily-brief-data"[^>]*>)([\s\S]*?)(<\/script>)/, (_, open, json, close) => {
          const data = JSON.parse(json);
          if (edition) data.edition_date = edition;
          if (extraNews) for (let i = data.items.length; i < 9; i++) data.items.push({ ...data.items[0], id: 'synthetic-extra-' + i, title: { 'zh-CN': '测试新闻 ' + i, en: 'Synthetic news ' + i } });
          return open + JSON.stringify(data).replaceAll('<', '\\u003c') + close;
        });
        body = Buffer.from(html);
      }
      return route.fulfill({ contentType: mime[path.extname(file)] || 'application/octet-stream', body });
    } catch (error) {
      report.missing.push({ url, error: error.message });
      return route.fulfill({ status: 404, body: 'Missing local file' });
    }
  });
  ctx.on('page', page => page.on('pageerror', error => report.pageErrors.push(error.stack || error.message)));
  return { ctx, weather };
}

async function ready(page) {
  await page.waitForFunction(() => window.SiteI18n && window.SiteNavigation && !SiteNavigation.state().transition);
  await page.evaluate(() => document.fonts.ready);
  if (await page.locator('#brief-toggle').count()) await page.waitForFunction(() => !document.querySelector('#brief-toggle').hidden);
}

async function go(page, route) { await page.goto(origin + route); await ready(page); }
async function expanded(page, value) {
  assert.equal(await page.locator('#brief-toggle').getAttribute('aria-controls'), 'brief-body');
  assert.equal(await page.locator('#brief-toggle').getAttribute('aria-expanded'), String(value));
  assert.equal(await page.locator('#brief-body').isVisible(), value);
}
async function screenshot(page, name) {
  await page.locator('main img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
  const file = path.join(out, name + '.png');
  await page.screenshot({ path: file, fullPage: true });
  report.screenshots.push(file);
}
async function noOverflow(page) {
  const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert(geometry.scrollWidth <= geometry.width + 1, JSON.stringify(geometry));
  return geometry;
}

function latestPhotos() {
  const all = catalog.albums.flatMap(album => album.photos.map(photo => ({ photo, album })));
  all.sort((a, b) => {
    const x = [a.photo.date || a.album.date, a.photo.time, a.photo.id];
    const y = [b.photo.date || b.album.date, b.photo.time, b.photo.id];
    for (let i = 0; i < x.length; i++) { if (x[i] < y[i]) return 1; if (x[i] > y[i]) return -1; }
    return 0;
  });
  const seen = new Set();
  return all.filter(({ photo }) => seen.has(photo.id) ? false : (seen.add(photo.id), true)).slice(0, 6);
}

async function homeContent(page, language, width) {
  assert.equal(await page.locator('#home-title').textContent(), language === 'en' ? 'Xie Yuqing' : '谢雨卿');
  assert.equal(await page.locator('#now').count(), 0);
  assert.equal(await page.locator('.home-hero a,.home-hero button').count(), 0);
  const order = await page.locator('main > section').evaluateAll(nodes => nodes.map(node => node.classList.contains('home-hero') ? 'hero' : node.classList.contains('home-quote') ? 'quote' : node.id));
  assert.deepEqual(order, ['hero', 'brief', 'writing', 'home-photos', 'quote', 'picks', 'projects', 'odds']);
  for (let i = 0; i < 2; i++) {
    assert.equal(await page.locator('.hero-signature [data-i18n="common.signature.' + (i + 1) + '"]').textContent(), signatures[language][i]);
    assert.equal(await page.locator('footer [data-i18n="common.signature.' + (i + 1) + '"]').textContent(), signatures[language][i]);
  }
  const avatar = page.locator('.home-avatar');
  assert.equal(await avatar.getAttribute('role'), 'img');
  assert.equal(await avatar.getAttribute('aria-label'), language === 'en' ? 'Line drawing of Xie Yuqing' : '谢雨卿的简笔头像');
  const size = await avatar.boundingBox();
  assert.equal(size.width, width <= 720 ? 72 : 96);
  assert.equal(size.height, size.width);
  const mask = await avatar.evaluate(node => getComputedStyle(node, '::before').maskImage);
  assert(mask.includes('avatar-line.svg'), 'SVG mask is loaded');
  assert.equal(await page.locator('#route').count(), 0);
  assert.equal(await page.locator('#home-photos img').count(), 6);
  const photos = await page.locator('#home-photos .home-photo-card').evaluateAll(nodes => nodes.map(node => {
    const image = node.querySelector('img');
    return { src: image.getAttribute('src'), width: image.getAttribute('width'), height: image.getAttribute('height'), alt: image.getAttribute('alt'), loading: image.loading, href: node.querySelector('a').getAttribute('href'), caption: node.querySelector('figcaption').textContent };
  }));
  const expected = latestPhotos();
  assert.deepEqual(photos.map(photo => photo.src), expected.map(({ photo }) => photo.thumbnail));
  for (let i = 0; i < photos.length; i++) {
    assert.equal(photos[i].href, (language === 'en' ? '/en' : '') + '/photos/' + expected[i].album.id + '/');
    assert.equal(Number(photos[i].width), expected[i].photo.thumbnail_width);
    assert.equal(Number(photos[i].height), expected[i].photo.thumbnail_height);
    assert(photos[i].alt.trim()); assert(photos[i].caption.includes(' · ')); assert.equal(photos[i].loading, 'lazy');
  }
  if (width === 390) assert(await page.locator('.home-photo-grid').evaluate(node => node.scrollWidth > node.clientWidth && getComputedStyle(node).overflowX === 'auto'));
  return { order, photos: photos.length, avatar: size };
}

async function aboutContent(page, language) {
  const bio = language === 'en' ? about.english_bio : about.chinese_bio;
  assert.deepEqual(await page.locator('.about-bio > p').allTextContents(), bio);
  assert.deepEqual(await page.locator('.about-colophon > p').allTextContents(), language === 'en' ? about.english_colophon : about.chinese_colophon);
  assert.equal(await page.locator('.about-written-note').textContent(), language === 'en' ? about.english_written_note : about.written_note);
  assert.equal(await page.locator('.about-story hr').count(), 1);
  assert.equal(await page.locator('.about-english').count(), 0);
  assert.equal(await page.locator('#route .route-line li').count(), 6);
  assert(await page.locator('#route .route-photo img').isVisible());
  assert(await page.locator('.about-contact a[href^="mailto:"]').count());
  if (language === 'zh-CN') assert((await page.locator('.about-bio').textContent()).includes('遗嘱'));
  const ordered = await page.evaluate(() => {
    const story = document.querySelector('.about-profile'), route = document.querySelector('#route'), notes = document.querySelector('#site');
    return Boolean(story.compareDocumentPosition(route) & Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(route.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  assert(ordered, 'biography, places and site notes appear in order');
}

(async () => {
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const language of ['zh-CN', 'en']) for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
      const prefix = language === 'en' ? '/en' : '';
      await check(`home ${language} ${width} ${theme}`, async () => {
        const { ctx, weather } = await context({ width, theme });
        try {
          const page = await ctx.newPage(); await go(page, prefix + '/');
          assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
          await expanded(page, width > 720); await noOverflow(page);
          const detail = await homeContent(page, language, width);
          if (width <= 720) await page.locator('#brief-toggle').click();
          await expanded(page, true); await noOverflow(page);
          assert(await page.locator('#earth-canvas').isVisible());
          assert(await page.locator('#daily-feed article').count() <= 6);
          if (width > 720) assert((await page.locator('#brief-body').boundingBox()).height <= 642);
          assert((await page.locator('#home-date').textContent()).includes('2026'));
          assert((await page.locator('#daily-edition').textContent()).includes(language === 'en' ? '26 October' : '10月26日'));
          await page.waitForFunction(() => document.querySelector('#brief-weather').textContent.includes('21°C'));
          assert.equal(weather.length, 1, 'Summary reuses one weather request');
          await screenshot(page, `home-${language}-${width}-${theme}`);
          return detail;
        } finally { await ctx.close(); }
      });
      await check(`about ${language} ${width} ${theme}`, async () => {
        const { ctx } = await context({ width, theme });
        try { const page = await ctx.newPage(); await go(page, prefix + '/about/'); await aboutContent(page, language); await noOverflow(page); await screenshot(page, `about-${language}-${width}-${theme}`); }
        finally { await ctx.close(); }
      });
    }
    await check('keyboard toggle, same-day refresh and removed key', async () => {
      const { ctx } = await context();
      try {
        const page = await ctx.newPage(); await go(page, '/');
        await page.locator('#brief-toggle').focus(); await page.keyboard.press('Enter'); await expanded(page, false);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), key), today);
        await page.reload(); await ready(page); await expanded(page, false);
        await page.locator('#brief-toggle').press('Space'); await expanded(page, true);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
        await page.locator('#brief-toggle').click(); await page.evaluate(key => localStorage.removeItem(key), key);
        await page.reload(); await ready(page); await expanded(page, true);
      } finally { await ctx.close(); }
    });
    for (const width of [1440, 390]) await check('previous-day key automatically opens at ' + width, async () => {
      const { ctx } = await context({ width, saved: '2026-10-25' });
      try { const page = await ctx.newPage(); await go(page, '/'); await expanded(page, true); }
      finally { await ctx.close(); }
    });
    await check('storage unavailable permits opening and closing', async () => {
      const { ctx } = await context({ denied: true });
      try { const page = await ctx.newPage(); await go(page, '/'); await expanded(page, true); await page.locator('#brief-toggle').click(); await expanded(page, false); await page.locator('#brief-toggle').click(); await expanded(page, true); }
      finally { await ctx.close(); }
    });
    for (const language of ['zh-CN', 'en']) await check('stale news pauses while Earth stays visible ' + language, async () => {
      const { ctx } = await context({ edition: '2026-10-22' });
      try {
        const page = await ctx.newPage(); await go(page, language === 'en' ? '/en/' : '/');
        await expanded(page, true); assert.equal(await page.locator('#daily-feed article').count(), 0);
        assert(await page.locator('#daily-feed .yl-news-paused').isVisible());
        assert.equal(await page.locator('#daily-feed').textContent(), language === 'en' ? 'News updates paused; take a look at Earth' : '新闻暂停更新，先看看地球');
        assert.equal(await page.locator('#daily-filters').isVisible(), false);
        assert(await page.locator('#earth-canvas').isVisible()); await noOverflow(page);
      } finally { await ctx.close(); }
    });
    await check('fresh news is capped at six and categories remain usable', async () => {
      const { ctx } = await context({ extraNews: true });
      try {
        const page = await ctx.newPage(); await go(page, '/');
        assert.equal(await page.locator('#daily-feed article').count(), 6);
        await page.locator('[data-news-filter="science"]').focus(); await page.keyboard.press('Enter');
        assert.equal(await page.locator('[data-news-filter="science"]').getAttribute('aria-pressed'), 'true');
        const urls = await page.locator('#daily-feed h2 a,#daily-feed h3 a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
        assert.deepEqual(urls, brief.items.filter(item => item.categories.includes('science')).slice(0, 6).map(item => item.url));
        await page.locator('[data-news-filter="all"]').click(); assert.equal(await page.locator('#daily-feed article').count(), 6);
      } finally { await ctx.close(); }
    });
    for (const language of ['zh-CN', 'en']) await check('random article opens a real ' + language + ' page', async () => {
      const { ctx } = await context();
      try {
        const page = await ctx.newPage(); await go(page, language === 'en' ? '/en/' : '/');
        const links = await page.locator('#home-random-data').evaluate(node => JSON.parse(node.textContent));
        assert(links.length > 5); await page.evaluate(() => { Math.random = () => 0; });
        await page.locator('#home-random-button').focus(); await page.keyboard.press('Enter');
        await page.waitForURL(origin + links[0]); await ready(page);
        assert.equal(await page.locator('html').getAttribute('lang'), language);
        return { url: page.url(), choices: links.length };
      } finally { await ctx.close(); }
    });
    for (const language of ['zh-CN', 'en']) await check('no JavaScript retains expanded brief and readable news ' + language, async () => {
      const { ctx } = await context({ width: 390, javaScriptEnabled: false });
      try {
        const page = await ctx.newPage(); await page.goto(origin + (language === 'en' ? '/en/' : '/'));
        assert(await page.locator('#brief-body').isVisible()); assert.equal(await page.locator('#brief-toggle').isVisible(), false);
        assert.equal(await page.locator('#home-random-button').isVisible(), false);
        const count = await page.locator('#daily-feed article').count(); assert(count > 0 && count <= 6);
        assert((await page.locator('#daily-feed a[href^="https://"]').count()) > 0); await noOverflow(page);
      } finally { await ctx.close(); }
    });
    await check('progressive return synchronizes state and installs one toggle handler', async () => {
      const { ctx } = await context();
      try {
        const page = await ctx.newPage(); await go(page, '/'); await page.evaluate(() => { window.__round3Marker = 'same-document'; });
        await page.locator('#brief-toggle').click(); await expanded(page, false);
        const initial = await page.evaluate(() => SiteNavigation.state());
        for (let i = 0; i < 3; i++) {
          await page.locator('.nav-entry[href="/about/"]').click(); await page.waitForURL(origin + '/about/'); await ready(page);
          await page.locator('.site-header .brand').click(); await page.waitForURL(origin + '/'); await ready(page); await expanded(page, false);
        }
        assert.equal(await page.evaluate(() => window.__round3Marker), 'same-document');
        const final = await page.evaluate(() => SiteNavigation.state());
        assert.equal(final.scopeListeners, initial.scopeListeners); assert.equal(final.scopeCleanups, initial.scopeCleanups);
        await page.locator('#brief-toggle').click(); await expanded(page, true);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
        return { initial, final };
      } finally { await ctx.close(); }
    });
    await check('supplied SVG decodes and renders as a standalone preview', async () => {
      const { ctx } = await context();
      try {
        const page = await ctx.newPage(); await page.goto(origin + '/');
        await page.setContent('<!doctype html><style>body{margin:0}#avatar-card{box-sizing:border-box;width:300px;height:300px;padding:20px;background:#fff;color:#183d34;display:grid;place-items:center}img{width:260px;height:260px;object-fit:contain}</style><div id="avatar-card"><img src="' + origin + '/assets/avatar-line.svg" alt="谢雨卿的简笔头像"></div>');
        const decoded = await page.locator('img').evaluate(async image => { await image.decode(); return { width: image.naturalWidth, height: image.naturalHeight }; });
        assert(decoded.width > 0 && decoded.height > 0);
        const file = path.join(out, 'avatar-preview.png'); await page.locator('#avatar-card').screenshot({ path: file }); report.screenshots.push(file);
        return decoded;
      } finally { await ctx.close(); }
    });
    await check('no uncaught page errors or missing local assets', async () => { assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.missing, []); });
  } catch (error) { report.error = error.stack; }
  finally {
    if (browser) await browser.close();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    const failed = report.checks.filter(item => !item.passed).length;
    process.stdout.write(JSON.stringify({ checks: report.checks.length, passed: report.checks.length - failed, failed, errors: report.pageErrors.length, missing: report.missing.length, screenshots: report.screenshots.length, error: report.error }) + '\n');
    if (failed || report.error) process.exitCode = 1;
  }
})();
