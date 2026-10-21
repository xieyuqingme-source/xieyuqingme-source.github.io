'use strict';
// Independent synthetic-only acceptance tests. No personal data or D: writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { fileInfo, decodeVideo } = require('./map_video_probe.cjs');
const playwright = require(path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright'));
const site = path.resolve(process.argv[2] || path.join(__dirname, '..', '_site_unified'));
const output = path.resolve(process.argv[3] || path.join(__dirname, '..', '.local-checks', 'map-generator'));
const origin = 'http://127.0.0.1:48739';
const report = { startedAt: new Date().toISOString(), site, checks: [], downloads: [], requests: [], external: [], pageErrors: [], consoleErrors: [], screenshots: [], notes: ['Fresh Windows Chrome, synthetic publisher and visitor records only, all external requests blocked.', '390x844 touch checks emulate a phone; Safari/Firefox/physical device testing is outside this harness.', 'Actual generated video bytes are decoded and sought through a same-origin Blob; native download failures and Blob recovery are reported explicitly.', 'The 800ms video intro has no unlocked cities, route, avatar or caption. Cities and route progress persist after each arrival.', 'Natural Earth public-domain credit stays on the page; exported PNG/SVG omit framework fine print while preserving current user date and description.'] };
let browser;
const contexts = [];
const rec = (id, city, lat, lon, description, extra = {}) => ({ id, start: '2020-01', end: '2020-02', city, region: '', country: '中国', lat, lon, title: city, description, album: '', certainty: 'confirmed', ...extra });
const records = [rec('qa-birth', '绵阳', 31.4675, 104.6796, '第一幕：测试出生原文。', { start: '2000-10', end: '2000-10' }), rec('qa-school', '海盐', 30.5255, 120.9457, '第二幕：测试小学原文。', { start: '2001', end: '2013-06' }), rec('qa-study', '北京', 39.9042, 116.4074, '第三幕：测试大学原文。', { start: '2020-09', end: '2025-10' }), rec('qa-grad', '吉隆坡', 3.139, 101.6869, '第四幕：测试研究生原文。', { start: '2026-04-29', end: '', ongoing: true })];
const data = { version: 1, title: '合成足迹视频验收', records };
const mine = { version: 1, title: '合成站主足迹', records: [rec('qa-publisher', '上海', 31.2304, 121.4737, '仅用于验收的合成站主内容。')] };
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
function resource(url) {
  const relative = decodeURIComponent(new URL(url).pathname).replace(/^[/\\]+/, '');
  let file = path.resolve(site, relative), within = path.relative(site, file);
  assert(!within.startsWith('..') && !path.isAbsolute(within) && !within.split(/[\\/]/).some(part => part.startsWith('.')));
  if (relative === 'favicon.ico' && !fs.existsSync(file)) return { status: 204, body: '' };
  if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  let body = fs.readFileSync(file);
  if (relative === 'map/' || relative === 'map/index.html') body = Buffer.from(body.toString('utf8').replace(/(<script\b[^>]*\bid=["']footprints-data["'][^>]*>)[\s\S]*?(<\/script>)/, (_, open, close) => open + JSON.stringify(mine) + close));
  return { status: 200, contentType: mime[path.extname(file)] || 'application/octet-stream', body };
}
async function check(name, action) { if (process.env.QA_FILTER && !name.includes(process.env.QA_FILTER)) return; const started = Date.now(); try { const detail = await action(); report.checks.push({ name, passed: true, ms: Date.now() - started, detail }); console.log('PASS ' + name); } catch (error) { report.checks.push({ name, passed: false, ms: Date.now() - started, error: error.stack }); console.error('FAIL ' + name + ': ' + error.message); } }
async function context(mobile = false, init) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile, acceptDownloads: true }); contexts.push(ctx);
  await ctx.addInitScript(() => {
    try { localStorage.setItem('xieyuqing-blog-theme', 'light'); } catch (_) {} window.__qaTracks = []; window.__qaForbiddenCapture = 0; window.__qaCreatedUrls = []; window.__qaRevokedUrls = []; window.__qaTexts = [];
    const capture = HTMLCanvasElement.prototype.captureStream;
    HTMLCanvasElement.prototype.captureStream = function (...args) { const stream = capture.apply(this, args); __qaTracks.push(...stream.getTracks()); return stream; };
    if (navigator.mediaDevices) for (const name of ['getUserMedia', 'getDisplayMedia']) navigator.mediaDevices[name] = () => { __qaForbiddenCapture++; throw new Error('No capture permission allowed'); };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL); URL.createObjectURL = blob => { const url = create(blob); __qaCreatedUrls.push({ url, type: blob.type, size: blob.size }); return url; }; URL.revokeObjectURL = url => { __qaRevokedUrls.push(url); return revoke(url); };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) { if (this.canvas.id === 'video-canvas') { __qaTexts.push({ text: String(text), x, y, maxWidth, width: this.canvas.width, height: this.canvas.height, font: this.font }); if (__qaTexts.length > 100000) __qaTexts.splice(0, 10000); } return fillText.apply(this, arguments); };
  });
  if (init) await ctx.addInitScript(init);
  await ctx.route('**/*', async route => { const url = route.request().url(); if (/^(blob|data):/.test(url)) return route.continue(); report.requests.push({ method: route.request().method(), url }); if (!url.startsWith(origin + '/')) { report.external.push(url); return route.abort(); } try { return await route.fulfill(resource(url)); } catch (error) { return route.fulfill({ status: 404, body: 'Missing generated fixture resource' }); } });
  ctx.on('page', page => { page.on('pageerror', error => report.pageErrors.push(error.message)); page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); }); page.on('dialog', dialog => dialog.dismiss()); });
  return ctx;
}
async function click(page, selector) { return page.qaMobile ? page.locator(selector).tap() : page.locator(selector).click(); }
async function visit(page) { await page.goto(origin + '/map/', { waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.FootprintsVideoUI); await page.waitForFunction(() => FootprintsMap.assetsReady()); }
async function importData(page, source = data) { await click(page, '#mode-visitor'); const panel = page.locator('.import-panel'); if (!(await panel.evaluate(node => node.open))) await panel.locator('summary').click(); await page.locator('#import-text').fill(typeof source === 'string' ? source : JSON.stringify(source)); await click(page, '#import-apply'); }
async function state(page) { return page.evaluate(() => ({ api: FootprintsVideoUI.getState(), progress: document.querySelector('#video-progress').value, status: document.querySelector('#playback-progress').textContent, current: document.querySelector('#playback-current').textContent, download: { hidden: document.querySelector('#video-download').hidden, href: document.querySelector('#video-download').href, name: document.querySelector('#video-download').download }, tracks: __qaTracks.map(track => ({ kind: track.kind, readyState: track.readyState })), forbiddenCapture: __qaForbiddenCapture })); }
async function plan(page) { return page.evaluate(() => FootprintsVideoUI.getPlan()); }
async function noOverflow(page) { const r = await page.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth })); assert(r.html <= r.width + 2 && r.body <= r.width + 2, JSON.stringify(r)); return r; }
async function shot(page, name) { await page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled' }); report.screenshots.push(name); }
async function download(page, selector, file) {
  const [item] = await Promise.all([page.waitForEvent('download'), click(page, selector)]);
  let bytes, nativeFailure = await item.failure();
  if (!nativeFailure) bytes = fs.readFileSync(await item.path());
  else {
    // The independent minimal5byte Blob download is also cancelled by this
    // headless WindowsChrome build, for Documents and Temp and CDP allow.
    // Retain the exact Blob addressed by the actual download event for media
    // analysis; do not present this recovery as successful native disk download.
    const encoded = await page.evaluate(async url => { const blob = await (await fetch(url)).blob(), raw = new Uint8Array(await blob.arrayBuffer()); let binary = ''; for (let i = 0; i < raw.length; i += 8192) binary += String.fromCharCode(...raw.subarray(i, i + 8192)); return btoa(binary); }, item.url());
    bytes = Buffer.from(encoded, 'base64');
  }
  fs.writeFileSync(path.join(output, file || item.suggestedFilename()), bytes);
  report.downloads.push({ name: item.suggestedFilename(), localFile: file || item.suggestedFilename(), bytes: bytes.length, nativeFailure, blobRecoveredForAnalysis: !!nativeFailure });
  return { bytes, filename: item.suggestedFilename(), nativeFailure };
}
async function ready(page) { await page.waitForFunction(() => { const link = document.querySelector('#video-download'); return !link.hidden && link.getAttribute('href') && link.getAttribute('href').startsWith('blob:'); }, null, { timeout: 120000 }); }
async function waitIdle(page) { await page.waitForFunction(() => !document.querySelector('#video-generate').disabled, null, { timeout: 15000 }); }
async function generate(page) { await click(page, '#video-generate'); await ready(page); return state(page); }
async function saveJson(page) { return JSON.parse((await download(page, '#export-json', 'latest-footprints.json')).bytes.toString('utf8')); }


async function mapSnapshot(page) {
  return page.evaluate(async () => {
    const raw = await FootprintsMap.exportSvg().text(), hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return { camera: FootprintsMap.camera(), svgHash: Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join(''), data: JSON.stringify(FootprintsMap.document()), caption: document.querySelector('#playback-current').textContent, selection: document.querySelector('#clear-city').hidden };
  });
}
async function run() {
  fs.mkdirSync(output, { recursive: true });
  browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  report.browserVersion = browser.version(); report.notes = ['Synthetic records only. External requests blocked. Export and seeking must preserve the editable map.', 'New files use unique test names, never the user Downloads video.', 'Frames are decoded and sampled; this harness does not claim continuous human viewing.'];
  const ctx = await context(), page = await ctx.newPage(); page.setDefaultTimeout(15000);
  await visit(page); await importData(page); await page.locator('#map-view').selectOption('fit'); await page.locator('#map-labels').setChecked(true); await page.locator('#video-pace').selectOption('brisk');
  let frozen, before, saved;
  await check('camera options, readable layout, full text and outro plan', async () => {
    assert.deepEqual(await page.locator('#video-camera option').evaluateAll(nodes => nodes.map(n => n.value)), ['follow', 'fixed']);
    assert.equal(await page.locator('#video-camera').inputValue(), 'follow'); await noOverflow(page);
    frozen = await plan(page); assert.equal(frozen.introMs, 1400); assert.equal(frozen.outroMs, 6200); assert.equal(frozen.outroZoomMs, 3600);
    assert.deepEqual(frozen.scenes.map(x => x.description), records.map(x => x.description));
    before = await mapSnapshot(page); await shot(page, 'generator-desktop-ready.png'); return { durationMs: frozen.durationMs, sceneCount: frozen.scenes.length };
  });
  await check('actual follow export, active camera, silent encoding, captions and map isolation', async () => {
    await click(page, '#video-generate');
    await page.waitForFunction(() => document.querySelector('#video-canvas').dataset.phase === 'intro');
    assert.deepEqual(await mapSnapshot(page), before);
    for (const id of ['map-view','map-route','video-pace','video-camera','avatar-file']) assert(await page.locator('#'+id).isDisabled());
    await page.waitForFunction(() => document.querySelector('#video-canvas').dataset.phase === 'travel');
    const movingCamera = await page.locator('#video-canvas').getAttribute('data-camera');
    assert.deepEqual(await mapSnapshot(page), before); await ready(page);
    assert.deepEqual(await mapSnapshot(page), before);
    const finish = await state(page); assert.equal(finish.progress, 1); assert.equal(finish.forbiddenCapture, 0); assert(finish.tracks.every(x => x.kind === 'video' && x.readyState === 'ended'));
    const text = await page.evaluate(() => __qaTexts); for (const record of records) assert(text.some(x => x.text.includes(record.description)));
    assert(text.some(x => x.font === '60px sans-serif' || x.font === 'bold 60px sans-serif')); assert(text.some(x => x.font === '42px sans-serif'));
    assert(text.every(x => x.y >= 0 && x.y <= 960));
    saved = await download(page, '#video-download', 'map-generator-follow-20261021.webm');
    report.followVideo = { ...fileInfo(saved.bytes, saved.filename), movingCamera, planDurationMs: frozen.durationMs };
    report.followVideo.decoded = await decodeVideo(ctx, origin + '/__qa-follow/' + saved.filename, saved.bytes, output, 'map-generator-follow-20261021.webm', frozen.segments.map(s => (s.startMs+s.durationMs*.5)/1000));
    assert.equal(report.followVideo.decoded.width, 1280); assert.equal(report.followVideo.decoded.height, 960);
    assert(Math.abs(report.followVideo.decoded.measuredDuration-frozen.durationMs/1000)<.25);
    assert.notEqual(movingCamera, await page.locator('#video-canvas').getAttribute('data-camera'));
    await shot(page, 'generator-complete.png'); return report.followVideo;
  });
  await check('native preview seeking and playing do not alter map or static exports', async () => {
    for (const time of [frozen.segments.find(s=>s.phase==='travel').startMs/1000+.3, frozen.durationMs/1000-1]) {
      await page.locator('#video-preview').evaluate(async (video,time)=>{const seeked=new Promise(r=>video.addEventListener('seeked',r,{once:true}));video.currentTime=time;await seeked;video.pause();},time);
      assert.deepEqual(await mapSnapshot(page), before);
    }
    await page.locator('#video-preview').evaluate(async video=>{await video.play();video.pause();}); assert.deepEqual(await mapSnapshot(page), before);
  });
  await check('cancel, repeat export, revoked URLs and fixed camera preserve original map', async () => {
    const oldUrl=(await state(page)).download.href;
    await click(page,'#video-generate'); await page.waitForTimeout(400); await click(page,'#video-cancel'); await waitIdle(page);
    assert.deepEqual(await mapSnapshot(page),before); assert((await state(page)).tracks.every(t=>t.readyState==='ended'));
    assert(await page.evaluate(url=>__qaRevokedUrls.includes(url),oldUrl));
    await visit(page);
    const base=rec('qa-base','北京',39.9042,116.4074,'合成居住记录',{start:'2020-01-01',end:'2022-12-31',stayType:'base',sequence:0});
    const visitRecord=rec('qa-visit','成都',30.5728,104.0668,'测试外出说明',{start:'2021-02-11',end:'2021-02-12',stayType:'visit',sequence:1});
    await importData(page,{version:1,title:'合成返程验收',records:[base,visitRecord]}); await page.locator('#video-camera').selectOption('fixed'); await page.locator('#video-pace').selectOption('brisk');
    const snapshot=await mapSnapshot(page), p=await plan(page); assert.equal(p.scenes.at(-1).frameworkLabel,'返回北京'); assert.equal(p.scenes.at(-1).dateLabel,'2021-02-12');
    await generate(page); assert.deepEqual(await mapSnapshot(page),snapshot);
    const texts=await page.evaluate(()=>__qaTexts.map(x=>x.text)); assert(texts.includes('返回北京')); assert(texts.every(x=>!/长期居住地|返回日期未指定|返回日暂定/.test(x)));
    const video=await download(page,'#video-download','map-generator-fixed-return-20261021.webm'); report.fixedVideo={...fileInfo(video.bytes,video.filename),planDurationMs:p.durationMs};
    report.fixedVideo.decoded=await decodeVideo(ctx,origin+'/__qa-fixed/'+video.filename,video.bytes,output,'map-generator-fixed-return-20261021.webm',p.segments.filter(s=>s.phase==='stay'||s.phase==='outro').map(s=>(s.startMs+s.durationMs*.5)/1000));
    return report.fixedVideo;
  });
  await check('long descriptions remain complete and two-line pages fit the new caption area', async () => {
    await visit(page); const description='这是必须完整保留的测试说明。'.repeat(12)+'\n'+'LONG-ENGLISH-WORD'.repeat(8)+'\nEND';
    await importData(page,{version:1,title:'长说明',records:[rec('qa-long','北京',39.9,116.4,description)]});
    const p=await plan(page), pages=p.segments.filter(s=>s.phase==='stay').map(s=>s.pageText); assert.equal(pages.join(''),description); assert(pages.length>1);
    const rows=await page.evaluate(pages=>{const ctx=document.createElement('canvas').getContext('2d');ctx.font='44px sans-serif';return pages.map(text=>{const lines=[];let line='';for(const char of Array.from(text)){if(char==='\n'){lines.push(line);line='';}else if(line&&ctx.measureText(line+char).width>1152){lines.push(line);line=char;}else line+=char;}if(line)lines.push(line);return lines.length;});},pages);
    assert(rows.every(x=>x<=2)); return {pages:pages.length,maxLines:Math.max(...rows)};
  });
  await check('mobile layout, language-sized controls, dark theme and normal map remain usable', async () => {
    const phone=await ctx.newPage();await phone.setViewportSize({width:390,height:844});await visit(phone);await importData(phone);await noOverflow(phone);
    await phone.locator('#video-camera').selectOption('fixed');await phone.locator('#video-camera').selectOption('follow');
    await phone.locator('#map-zoom-in').click(); const camera=await phone.evaluate(()=>FootprintsMap.camera());assert(camera.zoom>1);await shot(phone,'generator-mobile.png');
    await phone.locator('#theme-toggle').click();await noOverflow(phone);await shot(phone,'generator-mobile-dark.png');await phone.close();
  });
  assert.equal(report.external.length,0);assert.equal(report.pageErrors.length,0,JSON.stringify(report.pageErrors));
}
run().catch(error=>{report.fatal=error.stack;process.exitCode=1;}).finally(async()=>{for(const ctx of contexts)await ctx.close().catch(()=>{});if(browser)await browser.close();report.finishedAt=new Date().toISOString();report.passed=report.checks.every(x=>x.passed)&&!report.fatal;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.map(x=>({name:x.name,passed:x.passed,error:x.error})),fatal:report.fatal,output},null,2));if(!report.passed)process.exitCode=1;});
