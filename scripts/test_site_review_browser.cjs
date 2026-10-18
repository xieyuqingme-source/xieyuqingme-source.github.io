'use strict';
// Local, isolated browser acceptance for the 2026 site review. No production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const site = path.resolve(process.argv[2] || path.join(root, '_site_unified'));
const output = path.resolve(process.argv[3] || path.join(root, '.local-checks', 'site-review'));
const origin = 'http://127.0.0.1:48739';
let playwright;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright')].filter(Boolean)) {
  try { playwright = require(candidate); break; } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
}
if (!playwright) throw new Error('Use the existing external Playwright installation.');
const chrome = process.env.CHROME_PATH || path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2' };
const report = { checks: [], screenshots: [], missing: [], pageErrors: [], blockedExternal: [], mockedRequests: [], notes: ['Isolated headless Chrome, nonpersistent browser contexts.', 'Only local generated files are served; all external requests, including comments, are blocked.', 'The accessible-name check supplies empty local mock responses to comment GETs so the real vendored widget can mount; nothing reaches its server.', 'No comment submission, production data writes, or user browser profile access.'] };
let browser;
async function check(name, fn) {
  try { const detail = await fn(); report.checks.push({ name, passed: true, detail }); console.log('PASS ' + name); }
  catch (error) { report.checks.push({ name, passed: false, error: error.stack }); console.error('FAIL ' + name + ': ' + error.message); }
}
async function context(options = {}) {
  const { mockComments = false, ...browserOptions } = options;
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 }, colorScheme: 'light', ...browserOptions });
  await ctx.route('**/*', async route => {
    const url = route.request().url();
    if (/^(data|blob):/.test(url)) return route.continue();
    if (!url.startsWith(origin + '/')) {
      const parsed = new URL(url), method = route.request().method();
      if (mockComments && parsed.origin === 'https://yuliao-comments.vercel.app' && ['GET', 'OPTIONS'].includes(method)) {
        report.mockedRequests.push({method,url});
        const headers = {'access-control-allow-origin':'*','access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'content-type,authorization'};
        if (method === 'OPTIONS') return route.fulfill({status:204,headers,body:''});
        let data = {};
        if (parsed.pathname.endsWith('/comment')) data = parsed.searchParams.get('type') === 'count' ? (parsed.searchParams.get('url') || '').split(',').map(()=>0) : {data:[],count:0,totalPages:0,page:1,pageSize:10};
        if (parsed.pathname.endsWith('/article')) data = (parsed.searchParams.get('path') || '').split(',').map(()=>({time:0}));
        return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify({errno:0,data})});
      }
      report.blockedExternal.push({ method, url }); return route.abort();
    }
    try {
      let target = path.resolve(site, '.' + decodeURIComponent(new URL(url).pathname));
      if (!target.startsWith(site + path.sep) && target !== site) throw new Error('outside');
      if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      return route.fulfill({ status: 200, contentType: mime[path.extname(target)] || 'application/octet-stream', body: fs.readFileSync(target) });
    } catch (_) { report.missing.push(new URL(url).pathname); return route.fulfill({ status: 404, body: 'Missing local resource' }); }
  });
  ctx.on('page', p => p.on('pageerror', e => report.pageErrors.push(e.message)));
  return ctx;
}
function article(fragment) {
  const folder = path.join(site, 'articles', '中文文章');
  const file = fs.readdirSync(folder).find(name => name.includes(fragment) && name.endsWith('.html'));
  assert(file, 'Known public article: ' + fragment);
  return '/articles/' + encodeURIComponent('中文文章') + '/' + encodeURIComponent(file);
}
function articleWithToc() {
  const folder = path.join(site,'articles','中文文章');
  const file=fs.readdirSync(folder).find(name=>name.endsWith('.html')&&fs.readFileSync(path.join(folder,name),'utf8').includes('data-toc-position'));
  assert(file,'At least one public article contains a table of contents');
  return '/articles/'+encodeURIComponent('中文文章')+'/'+encodeURIComponent(file);
}
async function visit(page, route) { await page.goto(origin + route, { waitUntil: 'networkidle' }); }
async function noOverflow(page) {
  const v = await page.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert(v.html <= v.width + 2 && v.body <= v.width + 2, JSON.stringify(v)); return v;
}
async function shot(page, name) { await page.screenshot({ path: path.join(output, name), fullPage: !name.startsWith('table-') && name !== 'article-desktop.png', animations: 'disabled' }); report.screenshots.push(name); }
(async () => {
  fs.mkdirSync(output, { recursive: true });
  browser = await playwright.chromium.launch({ executablePath: chrome, headless: true });
  const ctx = await context(); const page = await ctx.newPage();
  const tomb = article('大葆台'); const table = article('明朝皇帝'); const essay = article('大走理论'); const tocArticle=articleWithToc();
  const routes = ['/', '/projects/', '/about/', '/articles/', '/articles/chinese.html', '/articles/english.html', '/photos/', '/map/', '/game/', '/game/ranking/', tomb, table, essay];
  await check('118 articles retained with unique original titles', async () => {
    await visit(page, '/articles/');
    const titles = await page.locator('.article-title a').allTextContents();
    assert.equal(titles.length, 118); assert.equal(new Set(titles).size, titles.length);
    assert.equal(titles.filter(t => t.includes('当前的就业形势')).length, 2);
    const excerpts = await page.locator('.article-excerpt').allTextContents();
    assert(excerpts.every(t => t.trim() !== '问曰：' && !t.includes('**')));
    return { articles: titles.length };
  });
  await check('search, empty reset, pagination and language links', async () => {
    await visit(page, '/articles/');
    await page.locator('[data-page="next"]').click();
    assert.match(await page.locator('.pagination-position').innerText(), /2\s*\//);
    await page.locator('#article-search').fill('大葆台');
    await page.waitForFunction(() => document.querySelectorAll('.article-card:not([hidden])').length === 1);
    assert.match(await page.locator('.article-card:visible').innerText(), /大葆台/);
    await page.locator('#article-search').fill('NO_MATCH_SYNTHETIC_637');
    await page.locator('.search-empty').waitFor({ state: 'visible' });
    await page.locator('.reset-search').click();
    assert.equal(await page.locator('.article-card:visible').count(), 12);
    assert.equal(await page.locator('.site-nav a[href$="chinese.html"],.site-nav a[href$="english.html"]').count(), 0);
  });
  await check('desktop reading column 720–820px at 1180px', async () => {
    await visit(page, essay);
    const size = await page.locator('#article-content').evaluate(el => ({ width: el.getBoundingClientRect().width, font: getComputedStyle(el).fontSize }));
    assert(size.width >= 720 && size.width <= 820, JSON.stringify(size));
    await shot(page, 'article-desktop.png'); return size;
  });
  await check('desktop table of contents keyboard and position preferences', async () => {
    await visit(page,tocArticle);
    const controls = page.locator('button[data-toc-position]'); assert(await controls.count() >= 3);
    await page.locator('button[data-toc-position="left"]').click();
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('button[data-toc-position="left"]').getAttribute('aria-pressed'), 'true');
    await page.locator('button[data-toc-position="hidden"]').click();
    await page.locator('button[data-toc-position="right"]').click();
    const link = page.locator('.article-toc nav a').first(); await link.focus(); await page.keyboard.press('Enter');
    assert(new URL(page.url()).hash.length > 1);
  });
  await check('article optimized image source and accessible lightbox', async () => {
    await visit(page, tomb);
    const images = page.locator('#article-content img'); assert.equal(await images.count(), 20);
    const attrs = await images.evaluateAll(imgs => imgs.map(i => ({src:i.getAttribute('src'),srcset:i.getAttribute('srcset'),current:i.currentSrc, natural:i.naturalWidth})));
    assert(attrs.every(i => i.srcset && i.src.includes('responsive-images')));
    assert(attrs[0].current.includes('responsive-images'));
    const open = page.locator('#article-content a:has(img)').first(); assert(await open.count());
    await open.focus(); await page.keyboard.press('Enter');
    const dialog = page.locator('dialog[open]'); await dialog.waitFor({ state:'visible' });
    await page.keyboard.press('Escape'); await dialog.waitFor({ state:'hidden' });
    assert(await open.evaluate(el=>document.activeElement===el));
    return { images: attrs.length, first:attrs[0] };
  });
  await check('Waline editor accessible name with external service blocked', async () => {
    const commentCtx=await context({mockComments:true}); const commentPage=await commentCtx.newPage(); await visit(commentPage,tomb);
    const edit = commentPage.locator('#wl-edit'); await edit.waitFor({ state:'attached', timeout:10000 });
    const name = await edit.evaluate(el => el.getAttribute('aria-label') || (el.labels && [...el.labels].map(l=>l.textContent).join(' ')) || el.getAttribute('aria-labelledby'));
    assert(name && name.trim()); await commentCtx.close(); return { name };
  });
  await check('portal project screenshots and browser tool entries', async () => {
    await visit(page, '/projects/');
    assert.equal(await page.locator('.project-card').count(), 5);
    assert.equal(await page.locator('.project-card .project-visual img').count(), 5);
    const sizes = await page.locator('.project-card .project-visual img').evaluateAll(imgs=>imgs.map(i=>({src:i.getAttribute('src'),w:i.naturalWidth,h:i.naturalHeight})));
    assert(sizes.every(i=>i.w>100&&i.h>50));
    assert(await page.locator('main a[href="/map/"]').count()); assert(await page.locator('main a[href="/game/ranking/"]').count());
    for(const img of await page.locator('.project-visual img').all()){ await img.scrollIntoViewIfNeeded(); await img.evaluate(el=>el.decode()); }
    await page.evaluate(()=>{scrollTo(0,0);return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    await shot(page, 'projects-desktop.png'); return sizes;
  });
  for (const width of [1180, 768, 390, 320]) {
    await check('layout, navigation, metadata and focus at ' + width + 'px', async () => {
      await page.setViewportSize({width,height:900}); const measured = [];
      for (const route of routes) {
        await visit(page, route); measured.push({route,...await noOverflow(page)});
        assert.equal(await page.locator('head link[rel="icon"]').count(),1);
        assert.equal(await page.locator('meta[property="og:image"]').count(),1);
        const nav = await page.locator('.site-nav a').evaluateAll(links=>links.map(a=>new URL(a.href).pathname));
        assert.deepEqual(nav,['/','/articles/','/projects/','/photos/','/map/','/game/','/about/']);
        assert.equal(await page.locator('.site-nav a[aria-current="page"]').count(),1);
        await page.keyboard.press('Tab');
        const outline = await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle);
        assert(outline && outline !== 'none',route+' focus ring');
      }
      await visit(page,'/'); await shot(page,'home-'+width+'.png');
      await visit(page,table); await shot(page,'table-'+width+'.png');
      return measured;
    });
  }
  await check('mobile table of contents collapses after section selection', async () => {
    await page.setViewportSize({width:390,height:844}); await visit(page,tocArticle);
    const details=page.locator('.article-toc details'); await details.locator('summary').click();
    await details.locator('nav a').first().click(); assert.equal(await details.getAttribute('open'),null);
  });
  await check('system dark preference and explicit theme choice persist',async()=>{
    const dark = await context({colorScheme:'dark'}); const p=await dark.newPage(); await visit(p,'/');
    assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');
    await p.locator('#theme-toggle').click(); await visit(p,'/articles/');
    assert.equal(await p.locator('html').getAttribute('data-theme'),'light');
    await dark.close();
  });
  await ctx.close(); await browser.close(); browser=null;
  assert.equal(report.missing.length,0,'Missing local assets '+JSON.stringify(report.missing));
  assert.equal(report.pageErrors.length,0,'Page errors '+JSON.stringify(report.pageErrors));
})().catch(error=>{report.fatal=error.stack;console.error(error);}).finally(async()=>{
  if(browser) await browser.close();
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  if(report.fatal||report.checks.some(c=>!c.passed)) process.exitCode=1;
});
