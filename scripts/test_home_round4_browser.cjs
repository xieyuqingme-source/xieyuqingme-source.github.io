'use strict';
// Focused browser acceptance for signatures, stable styles, dated news and lazy briefing assets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const base = require('./test_home_round3_browser.cjs');
const { root, origin, brief, context, go, ready, expanded, noOverflow } = base;
const out = path.join(root, '.local-checks/home-round4');
const knowledge = JSON.parse(fs.readFileSync(path.join(root, 'home/brief/knowledge.json'), 'utf8'));
const memes = JSON.parse(fs.readFileSync(path.join(root, 'home/brief/memes.json'), 'utf8'));
const content = JSON.parse(fs.readFileSync(path.join(root, 'home/daily-content.json'), 'utf8'));
const result = { checks: [], screenshots: [], pageErrors: base.report.pageErrors, missing: base.report.missing };
const priority = { domestic: 0, world: 1, economy: 2, science: 3, culture: 4 };
const sorted = [...brief.items].sort((a, b) => (a.priority === 'major' ? 0 : 1) - (b.priority === 'major' ? 0 : 1) || (a.priority === 'major' && b.priority === 'major' ? 0 : priority[a.category] - priority[b.category]));
fs.mkdirSync(out, { recursive: true });
let browser;

async function check(name, action) {
  const start = Date.now();
  process.stdout.write('CHECK ' + name + '\n');
  try { const detail = await action(); result.checks.push({ name, passed: true, ms: Date.now() - start, detail }); process.stdout.write('PASS ' + name + '\n'); }
  catch (error) { result.checks.push({ name, passed: false, ms: Date.now() - start, error: error.stack }); process.stdout.write('FAIL ' + name + ': ' + error.message + '\n'); }
}
async function frames(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function capture(page, name) {
  const images = await page.locator('img').evaluateAll(async nodes => {
    for (const image of nodes) image.loading = 'eager';
    return Promise.all(nodes.map(async image => { await image.decode(); return { src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight }; }));
  });
  assert(images.every(image => image.width > 0 && image.height > 0), 'Every captured local image decodes');
  const file = path.join(out, name + '.png'); await page.screenshot({ path: file, fullPage: true }); result.screenshots.push(file);
}
async function styleState(page, theme) {
  const state = await page.evaluate(() => ({ background: getComputedStyle(document.body).backgroundColor, styles: [...document.querySelectorAll('head link[rel="stylesheet"]')].map(node => new URL(node.href).pathname), skin: document.documentElement.dataset.skin, theme: document.documentElement.dataset.theme, sameThemeLink: document.querySelector('link[href*="site-themes.css"]') === window.__round4ThemeLink }));
  assert.equal(state.styles.at(-1), '/assets/site-themes.css', JSON.stringify(state.styles));
  assert.equal(state.sameThemeLink, true, 'The original stylesheet node is retained');
  assert.equal(state.background, theme === 'light' ? 'rgb(243, 246, 246)' : 'rgb(15, 24, 29)');
  assert.equal(state.theme, theme);
  const english = (await page.locator('html').getAttribute('lang')) === 'en';
  assert.equal(await page.locator('footer .footer-note').innerText(), english ? 'I’m working hard on a few questions.' : '努力研究一些问题。');
  assert.equal(await page.locator('footer [data-i18n="common.signature.1"]').count(), 0);
  await noOverflow(page); return state;
}
function lazyRequests(paths) { return paths.filter(value => /(?:\/vendor\/d3-|\/home-earth\.js|\/vendor\/lunar-|\/map-land\.json)/.test(value)); }

(async () => {
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true }); base.setBrowser(browser);
    for (const theme of ['light', 'dark']) await check('styles retain target order and background through links ' + theme, async () => {
      const { ctx, localRequests } = await context({ theme });
      try {
        const page = await ctx.newPage(); await go(page, '/');
        await page.waitForFunction(() => window.Solar && window.Lunar);
        await page.evaluate(() => { window.__round4Document = 'retained'; window.__round4ThemeLink = document.querySelector('link[href*="site-themes.css"]'); });
        const stages = [{ route: '/', state: await styleState(page, theme) }];
        for (const [selector, route] of [['.nav-entry[href="/articles/"]', '/articles/'], ['.site-header .brand', '/'], ['.nav-entry[href="/about/"]', '/about/']]) {
          await page.locator(selector).click(); await page.waitForURL(origin + route); await ready(page);
          stages.push({ route, state: await styleState(page, theme) });
        }
        assert.equal(await page.evaluate(() => window.__round4Document), 'retained', 'All clicks use progressive navigation');
        const leaked = await page.evaluate(() => ['Solar', 'Lunar', 'I18n', 'HolidayUtil', 'LunarUtil', 'SolarUtil', 'HomeAstronomy', 'HomeEarth', 'd3'].filter(key => window[key] !== undefined));
        assert.deepEqual(leaked, [], 'Page-owned lunar and globe globals are removed on leaving home');
        const themes = localRequests.filter(value => value === '/assets/site-themes.css');
        assert.equal(themes.length, 1, 'Existing theme link moves without a second request');
        await capture(page, 'style-navigation-' + theme); return stages;
      } finally { await ctx.close(); }
    });
    for (const language of ['zh-CN', 'en']) for (const width of [1440, 390]) await check(`brief cards and exact sources ${language} ${width}`, async () => {
      const { ctx } = await context({ width });
      try {
        const page = await ctx.newPage(); await go(page, language === 'en' ? '/en/' : '/');
        if (width <= 720) await page.locator('#brief-toggle').click(); await expanded(page, true);
        assert.equal(await page.locator('.hero-signature [data-i18n]').count(), 1);
        assert.equal(await page.locator('.hero-signature [data-i18n="common.signature.1"]').count(), 1);
        assert.equal(await page.locator('footer [data-i18n="common.signature.2"]').count(), 1);
        assert.equal(await page.locator('footer [data-i18n="common.signature.1"]').count(), 0);
        assert.equal(await page.locator('#odds,#daily-filters,[data-news-filter]').count(), 0);
        assert.equal(await page.locator('#daily-feed article').count(), 6);
        const cards = await page.locator('#daily-feed article').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, title: node.querySelector('h2 a,h3 a')?.textContent, url: node.querySelector('h2 a,h3 a')?.getAttribute('href'), time: node.querySelector('time')?.getAttribute('datetime'), labels: [...node.querySelectorAll('.news-category')].map(label => label.textContent) })));
        assert.deepEqual(cards.map(card => card.title), sorted.map(item => item.title[language]));
        assert.deepEqual(cards.map(card => card.url), sorted.map(item => item.url));
        assert.deepEqual(cards.map(card => card.time), sorted.map(item => item.published));
        for (let index = 0; index < cards.length; index++) {
          assert(cards[index].text.includes(sorted[index].summary[language])); assert(cards[index].text.includes(sorted[index].source[language]));
          assert.equal(cards[index].labels.length, 1);
          if (sorted[index].priority === 'major') assert(cards[index].text.includes(language === 'en' ? 'Major' : '要闻'));
        }
        assert.equal(sorted[0].id, 'lula-reelected-brazil'); assert.equal(sorted[1].id, 'vucic-concedes-serbia');
        assert((await page.locator('#daily-edition').textContent()).includes(language === 'en' ? '27 October' : '10月27日'));
        assert((await page.locator('#daily-edition').textContent()).includes('09:50'));
        const frost = knowledge.items.find(item => item.id === 'frosts-descent'); assert(frost);
        assert.equal(await page.locator('#daily-concept-title').textContent(), frost.title[language]);
        assert.equal(await page.locator('#daily-concept-text').textContent(), frost.text[language]);
        assert.equal(await page.locator('#daily-concept-source').getAttribute('href'), frost.url);
        const latest = [...memes.items].sort((a, b) => a.added.localeCompare(b.added)).at(-1); assert(latest);
        assert.equal(await page.locator('#daily-street-title').textContent(), typeof latest.term === 'string' ? latest.term : latest.term[language]);
        assert.equal(await page.locator('#daily-street-text').textContent(), latest.meaning[language]);
        assert((await page.locator('#daily-meme-added').textContent()).includes(language === 'en' ? '26 October' : '10月26日'));
        assert.equal(await page.locator('#daily-street-links a').first().getAttribute('href'), latest.url);
        for (const field of ['origin', 'example', 'why']) assert.equal(await page.locator('#daily-meme-' + field + ':visible').count(), 0);
        const quote = await page.locator('#daily-quote').textContent(); assert(content.quotes.some(item => item.text[language] === quote));
        const nesting = await page.evaluate(() => ['daily-concept-title', 'daily-street-title', 'daily-quote'].every(id => document.querySelector('#brief-body').contains(document.getElementById(id)))); assert(nesting);
        await page.locator('#earth-canvas').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector('#daily-moon-phase')?.textContent.trim() && /London|伦敦/.test(document.querySelector('#daily-world-clocks')?.textContent || ''));
        assert.equal(await page.locator('#daily-world-clocks > div').count(), 4);
        const clocks = await page.locator('#daily-world-clocks').textContent();
        for (const name of language === 'en' ? ['Beijing', 'Kuala Lumpur', 'London', 'New York'] : ['北京', '吉隆坡', '伦敦', '纽约']) assert(clocks.includes(name));
        const geometry = await page.evaluate(() => {
          const box = selector => { const node = document.querySelector(selector), r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height }; };
          return { body: box('#brief-body'), top: box('#brief-body > .yl-today'), news: box('.yl-news'), today: box('.yl-calendar'), earth: box('#daily-earth'), bottom: box('#brief-body > .yl-bottomline') };
        });
        assert(geometry.bottom.y >= geometry.top.bottom - 1, 'Bottom cards follow the two-column area');
        if (width > 720) {
          assert(geometry.body.height <= 762);
          assert(geometry.news.right <= geometry.today.x + 1, 'News and Today occupy separate desktop columns');
        } else {
          assert(geometry.today.y >= geometry.news.bottom - 1, 'Phone news precedes Today');
          assert(geometry.earth.y >= geometry.today.bottom - 1, 'Phone Today precedes Earth');
        }
        await noOverflow(page); await capture(page, `brief-${language}-${width}`); return { news: cards.length, knowledge: frost.id, meme: latest.id };
      } finally { await ctx.close(); }
    });
    await check('collapsed phone requests no lunar or globe dependencies; expansion waits for visibility', async () => {
      const { ctx, localRequests, weather } = await context({ width: 390 });
      try {
        const page = await ctx.newPage(); await page.setViewportSize({ width: 390, height: 320 }); await go(page, '/'); await expanded(page, false); await frames(page);
        assert.deepEqual(lazyRequests(localRequests), []);
        await page.locator('#brief-toggle').click(); await expanded(page, true);
        await page.waitForFunction(() => document.querySelector('#daily-calendar-cycle')?.textContent.trim());
        assert(localRequests.some(value => /\/vendor\/lunar-/.test(value)), 'Lunar library loads after expansion');
        assert.equal(localRequests.filter(value => /\/vendor\/d3-|\/home-earth\.js/.test(value)).length, 0, 'Earth stays unloaded while off screen');
        await page.locator('#earth-canvas').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => window.d3 && document.querySelector('#daily-earth')?.dataset.earthReady === 'true');
        assert.equal(localRequests.filter(value => /\/vendor\/d3-/.test(value)).length, 1);
        assert.equal(localRequests.filter(value => /\/home-earth\.js/.test(value)).length, 1);
        assert.equal(weather.length, 1, 'Calendar, bar and globe share one weather query');
        assert((await page.locator('#daily-calendar-cycle').textContent()).trim());
        assert((await page.locator('#daily-calendar-term').textContent()).includes('霜降'));
        assert((await page.locator('#daily-almanac-yi').textContent()).trim()); assert((await page.locator('#daily-almanac-ji').textContent()).trim());
        await page.locator('#daily-almanac details summary').focus(); await page.keyboard.press('Enter');
        assert(await page.locator('#daily-almanac details').evaluate(node => node.open));
        await noOverflow(page); return { localRequests, weatherQueries: weather.length };
      } finally { await ctx.close(); }
    });
    await check('late lunar response cannot attach to the next page scope', async () => {
      const { ctx } = await context();
      let release, requested = false;
      const gate = new Promise(resolve => { release = resolve; });
      await ctx.route(/\/assets\/vendor\/lunar[^/]+\.js(?:\?|$)/, async route => { requested = true; await gate; try { await route.fallback(); } catch (_) {} });
      try {
        const page = await ctx.newPage(); await page.goto(origin + '/', { waitUntil: 'domcontentloaded' }); await ready(page);
        await page.waitForFunction(() => !!document.querySelector('script[data-home-scope][src*="lunar"]'));
        assert(requested);
        await page.locator('.nav-entry[href="/about/"]').click(); await page.waitForURL(origin + '/about/', { waitUntil: 'domcontentloaded' }); await ready(page);
        const before = await page.evaluate(() => SiteNavigation.state()); release(); await frames(page);
        assert.equal(await page.locator('#brief').count(), 0);
        assert.equal(await page.evaluate(() => typeof window.Lunar), 'undefined');
        const after = await page.evaluate(() => SiteNavigation.state());
        assert.equal(after.scopeListeners, before.scopeListeners); assert.equal(after.scopeCleanups, before.scopeCleanups);
        return { before, after };
      } finally { release(); await ctx.close(); }
    });
    for (const language of ['zh-CN', 'en']) await check('yesterday and stale labels ' + language, async () => {
      const { ctx } = await context({ epoch: Date.parse('2026-10-28T04:00:00Z') });
      try { const page = await ctx.newPage(); await go(page, language === 'en' ? '/en/' : '/'); assert.equal(await page.locator('#daily-news-title').textContent(), language === 'en' ? 'Yesterday’s news' : '昨日要闻'); assert.equal(await page.locator('#daily-feed article').count(), 6); }
      finally { await ctx.close(); }
    });
    await check('all page scripts and local assets complete without errors', async () => { assert.deepEqual(result.pageErrors, []); assert.deepEqual(result.missing, []); });
  } catch (error) { result.error = error.stack; }
  finally {
    if (browser) await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(result, null, 2));
    const failed = result.checks.filter(check => !check.passed).length; process.stdout.write(JSON.stringify({ checks: result.checks.length, passed: result.checks.length - failed, failed, errors: result.pageErrors.length, missing: result.missing.length, screenshots: result.screenshots.length, error: result.error }) + '\n');
    if (failed || result.error) process.exitCode = 1;
  }
})();
