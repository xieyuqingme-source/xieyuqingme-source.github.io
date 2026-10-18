'use strict';
// Isolated local Chrome emulation. Native CDP touch input, never a user profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const site = path.resolve(process.argv[2] || path.join(root, '_site_unified'));
const output = path.resolve(process.argv[3] || path.join(root, '.local-checks/mobile-reading-photos/after'));
const baseline = process.argv.includes('--baseline');
const testPattern = process.env.READING_MOBILE_MATCH ? new RegExp(process.env.READING_MOBILE_MATCH) : null;
const origin = 'http://127.0.0.1:48743';
const playwright = require(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const chrome = process.env.CHROME_PATH || path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe');
const report = { phase: baseline ? 'before' : 'after', checks: [], screenshots: [], measurements: [], errors: [], missing: [], requests: [], notes: [
  'Fresh headless Chrome; nonpersistent mobile contexts; generated local files only; all remote services blocked.',
  'CDP Input.dispatchTouchEvent drives taps and 14-step swipes through one persistent session per page, with realistic timing.',
  'Device viewport/DPR/orientation are emulated; this is not a physical iOS/Android device or a real operating-system keyboard.',
  'Keyboard occlusion is approximated only by reducing viewport height while an input has focus. Safe-area CSS and reduced motion are inspected separately; nonzero hardware notch insets are not emulated.'
] };
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.json':'application/json' };
const devices = [
  { name:'320-portrait',width:320,height:568,dpr:2 },{name:'360-portrait',width:360,height:740,dpr:3},
  {name:'390-portrait',width:390,height:844,dpr:3},{name:'430-portrait',width:430,height:932,dpr:3},
  {name:'568-landscape',width:568,height:320,dpr:2},{name:'740-landscape',width:740,height:360,dpr:3},
  {name:'844-landscape',width:844,height:390,dpr:3},{name:'932-landscape',width:932,height:430,dpr:3}
];
const catalog = JSON.parse(fs.readFileSync(path.join(root,'photos/catalog.json'),'utf8'));
const album = catalog.albums.find(a => a.photos.length > 1);
assert(album, 'An existing public album must contain more than one photo');
const albumRoute = '/photos/' + album.id + '/';
const articleFolder=path.join(site,'articles/中文文章');
function article(fragment) {
  const name=fs.readdirSync(articleFolder).find(n=>n.endsWith('.html')&&n.includes(fragment));
  assert(name,'Known existing article: '+fragment); return '/articles/'+encodeURIComponent('中文文章')+'/'+encodeURIComponent(name);
}
const tomb=article('大葆台'),tableArticle=article('明朝皇帝');
const tocName=fs.readdirSync(articleFolder).find(n=>n.endsWith('.html')&&fs.readFileSync(path.join(articleFolder,n),'utf8').includes('data-toc-position'));
const tocArticle='/articles/'+encodeURIComponent('中文文章')+'/'+encodeURIComponent(tocName);
const longName=fs.readdirSync(articleFolder).filter(n=>n.endsWith('.html')).sort((a,b)=>b.length-a.length)[0];
const longArticle='/articles/'+encodeURIComponent('中文文章')+'/'+encodeURIComponent(longName);
let browser;
const sessions=new Map(), contexts=[];
let contactId=1;
async function check(name,fn) { if(testPattern&&!testPattern.test(name))return; const start=Date.now(); try {const detail=await fn(); report.checks.push({name,passed:true,ms:Date.now()-start,detail}); console.log('PASS '+name);}catch(e){report.checks.push({name,passed:false,ms:Date.now()-start,error:e.stack});console.error('FAIL '+name+': '+e.message);} }
async function context(device,extra={}) {
  const {mockComments=false,...browserExtra}=extra;
  const ctx=await browser.newContext({viewport:{width:device.width,height:device.height},deviceScaleFactor:device.dpr,isMobile:true,hasTouch:true,colorScheme:'light',...browserExtra}); contexts.push(ctx);
  if(process.env.READING_TOUCH_TRACE)await ctx.addInitScript(()=>{window.__readingTouchTrace=[];for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchend','click'])document.addEventListener(type,e=>{window.__readingTouchTrace.push({type,target:e.target.className,trusted:e.isTrusted,pointer:e.pointerType,x:e.clientX,y:e.clientY,position:document.querySelector('.photo-position')?.textContent,scroll:document.querySelector('#photo-viewer')?.scrollTop,time:performance.now()});},true);});
  await ctx.route('**/*',async route=>{
    const url=route.request().url(); if(/^(data|blob):/.test(url))return route.continue();
    if(!url.startsWith(origin+'/')){
      const remote=new URL(url),method=route.request().method();
      const backend=new URL(JSON.parse(fs.readFileSync(path.join(root,'blog/waline.json'),'utf8')).serverURL).origin;
      if(mockComments&&remote.origin===backend&&['GET','OPTIONS'].includes(method)){
        report.mockedCommentRequests ||= [];report.mockedCommentRequests.push({method,path:remote.pathname});
        const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'content-type,authorization'};
        if(method==='OPTIONS')return route.fulfill({status:204,headers,body:''});
        let data={};if(remote.pathname.endsWith('/comment'))data=remote.searchParams.get('type')==='count'?(remote.searchParams.get('url')||'').split(',').map(()=>0):{data:[],count:0,totalPages:0,page:1,pageSize:10};if(remote.pathname.endsWith('/article'))data=(remote.searchParams.get('path')||'').split(',').map(()=>({time:0}));
        return route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify({errno:0,data})});
      }return route.abort();
    }
    try {let file=path.resolve(site,'.'+decodeURIComponent(new URL(url).pathname));const relative=path.relative(site,file);if(relative.startsWith('..')||path.isAbsolute(relative)||relative.split(path.sep).some(p=>p.startsWith('.')))throw Error('outside');if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');report.requests.push(new URL(url).pathname);return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});}
    catch(e){if(new URL(url).pathname==='/favicon.ico')return route.fulfill({status:204,body:''});report.missing.push(new URL(url).pathname);return route.fulfill({status:404,body:'Missing local file'});}
  });
  ctx.on('page',p=>p.on('pageerror',e=>report.errors.push(e.message)));
  return ctx;
}
async function visit(page,route){await page.goto(origin+route,{waitUntil:'networkidle'});}
async function shot(page,name){await page.screenshot({path:path.join(output,name),fullPage:false,animations:'disabled'});report.screenshots.push(name);}
async function geometry(page,route,device){
  const m=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scale:visualViewport.scale,html:document.documentElement.scrollWidth,body:document.body.scrollWidth,main:document.querySelector('main').getBoundingClientRect().width,heading:document.querySelector('main h1')?.getBoundingClientRect().toJSON(),reading:document.querySelector('#article-content')?.getBoundingClientRect().width}));
  report.measurements.push({kind:'layout',route,device:device.name,...m});assert(m.html<=m.width+2&&m.body<=m.width+2,'Horizontal overflow '+JSON.stringify(m));assert.equal(m.dpr,device.dpr);return m;
}
async function session(page){if(!sessions.has(page)){const s=await page.context().newCDPSession(page);await s.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});sessions.set(page,s);}return sessions.get(page);}
async function resizeTouch(page,width,height){await page.setViewportSize({width,height});const s=await session(page);const before=await page.evaluate(()=>({points:navigator.maxTouchPoints,coarse:matchMedia('(pointer:coarse)').matches}));await s.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});const after=await page.evaluate(()=>({points:navigator.maxTouchPoints,coarse:matchMedia('(pointer:coarse)').matches}));assert(after.points>0&&after.coarse);report.touchResize ||= [];report.touchResize.push({width,height,before,after});}
async function tap(page,selector){
  const e=page.locator(selector).first();await e.scrollIntoViewIfNeeded();
  // Layout visibility alone does not account for a sticky modal header or an
  // unfinished smooth scroll. Establish a stable, exposed target before touch.
  await e.evaluate(n=>{n.__readingTouchSettle=null;const b=n.getBoundingClientRect(),h=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);if(!(h===n||n.contains(h)))n.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});});
  await page.waitForFunction(selector=>{const n=document.querySelector(selector),b=n.getBoundingClientRect(),h=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2),v=visualViewport;const key=[b.x,b.y,b.width,b.height,scrollY,document.querySelector('#photo-viewer')?.scrollTop,v.offsetTop,v.offsetLeft,v.scale].join('|');const s=n.__readingTouchSettle ||= {key:null,same:0,frames:0,changes:0};s.frames++;if(s.key===key)s.same++;else{s.key=key;s.same=0;s.changes++;}return s.same>=3&&(h===n||n.contains(h));},selector,{polling:'raf',timeout:5000});
  const b=await e.boundingBox();assert(b&&b.height&&b.width,selector+' visible');const s=await session(page);
  const diagnostic=await e.evaluate(n=>{const b=n.getBoundingClientRect(),h=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return{hit:h?.className,exposed:h===n||n.contains(h),position:document.querySelector('.photo-position')?.textContent,scroll:document.querySelector('#photo-viewer')?.scrollTop,settled:n.__readingTouchSettle,visualViewport:{x:visualViewport.offsetLeft,y:visualViewport.offsetTop,scale:visualViewport.scale}};});assert(diagnostic.exposed,selector+' center is exposed');
  const id=contactId++;await s.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id}]});await page.waitForTimeout(60);await s.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(350);
  if(process.env.READING_TOUCH_TRACE){report.touchTaps ||= [];report.touchTaps.push({selector,box:b,before:diagnostic,after:await page.evaluate(()=>({position:document.querySelector('.photo-position')?.textContent,scroll:document.querySelector('#photo-viewer')?.scrollTop,events:window.__readingTouchTrace?.slice(-10)}))});}
}
async function swipe(page,from,to){const s=await session(page),id=contactId++;await s.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id}]});for(let i=1;i<=14;i++){await page.waitForTimeout(12);await s.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/14,y:from.y+(to.y-from.y)*i/14,id}]});}await s.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(350);}
async function photoPosition(page,index){await page.waitForFunction(({index,count})=>document.querySelector('.photo-position').textContent===`${index+1} / ${count}`,{index,count:album.photos.length},{timeout:2500});}
async function targets(page,selector,device){const boxes=await page.locator(selector).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&!n.disabled).map(n=>{const b=n.getBoundingClientRect();return{text:(n.getAttribute('aria-label')||n.textContent||n.id).trim().slice(0,45),tag:n.tagName,width:b.width,height:b.height};}));report.measurements.push({kind:'targets',device:device.name,selector,boxes});if(!baseline)assert(boxes.every(b=>b.width>=44&&b.height>=44),'Touch targets below 44px: '+JSON.stringify(boxes.filter(b=>b.width<44||b.height<44)));return boxes;}
async function viewerBox(page,selector){return page.locator(selector).evaluate(n=>{const b=n.getBoundingClientRect();return{...b.toJSON(),scrollHeight:n.scrollHeight,clientHeight:n.clientHeight,overflow:getComputedStyle(n).overflowY};});}
async function runDevice(device){
  const ctx=await context(device),page=await ctx.newPage();
  await check(device.name+' article navigation touch targets and center hit testing',async()=>{await visit(page,'/articles/');await targets(page,'.site-nav a,.brand,#theme-toggle',device);const hits=await page.locator('.site-nav a,.brand,#theme-toggle').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const b=n.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return{text:n.textContent.trim(),hit:hit===n||n.contains(hit)};}));assert(hits.every(h=>h.hit));return hits;});
  await check(device.name+' route widths, DPR, long title',async()=>{for(const route of ['/articles/','/articles/english.html',longArticle,tableArticle,'/photos/',albumRoute]){await visit(page,route);await geometry(page,route,device);}await visit(page,'/articles/');await page.locator('#archive-heading').scrollIntoViewIfNeeded();await page.evaluate(()=>scrollBy(0,-30));await shot(page,device.name+'-archive.png');return{routes:6};});
  await check(device.name+' archive touch controls and keyboard viewport simulation',async()=>{
    await visit(page,'/articles/');await targets(page,'.language-filters a,.filter-button,.archive-pagination button:not(:disabled),.page-jump input,#article-year',device);
    await tap(page,'[data-page="next"]');assert.match(await page.locator('.pagination-position').innerText(),/^2\s*\//);
    await tap(page,'#article-search');assert(await page.locator('#article-search').evaluate(n=>n===document.activeElement));
    await resizeTouch(page,device.width,Math.min(300,device.height));
    await page.locator('#article-search').fill('大葆台');await page.waitForFunction(()=>document.querySelectorAll('.article-card:not([hidden])').length===1);
    await page.locator('#article-search').scrollIntoViewIfNeeded();const box=await page.locator('#article-search').boundingBox();assert(box.y>=0&&box.y+box.height<=Math.min(300,device.height)+1);
    assert.equal(await page.locator('#article-search').evaluate(n=>getComputedStyle(n).fontSize),'16px');
    await shot(page,device.name+'-search-keyboard-simulation.png');
    await page.locator('#article-search').fill('NO_MATCH_SYNTHETIC_1847');await tap(page,'.reset-search');assert.equal(await page.locator('.article-card:visible').count(),12);
    await resizeTouch(page,device.width,device.height);await tap(page,'#article-page');await page.locator('#article-page').fill('2');await page.keyboard.press('Enter');assert.match(await page.locator('.pagination-position').innerText(),/^2\s*\//);
    return{keyboard:'viewport-height simulation only',shrunkenHeight:Math.min(300,device.height)};
  });
  await check(device.name+' compact TOC native tap and focus',async()=>{await visit(page,tocArticle);assert.equal(await page.locator('.article-toc details').getAttribute('open'),null);await targets(page,'.article-toc summary',device);await tap(page,'.article-toc summary');assert(await page.locator('.article-toc details').evaluate(n=>n.open));await tap(page,'.article-toc nav a');assert(!(await page.locator('.article-toc details').evaluate(n=>n.open)));assert(await page.evaluate(()=>/^H[234]$/.test(document.activeElement.tagName)));assert(new URL(page.url()).hash);return{hash:new URL(page.url()).hash};});
  await check(device.name+' wide table native horizontal swipe keeps document width',async()=>{
    await visit(page,tableArticle);const table=page.locator('#article-content table').first();await table.scrollIntoViewIfNeeded();await page.evaluate(()=>scrollBy(0,-90));const b=await table.boundingBox();const y=Math.min(device.height-30,Math.max(70,b.y+Math.min(b.height,device.height-130)/2));
    const before=await table.evaluate(n=>({left:n.scrollLeft,client:n.clientWidth,scroll:n.scrollWidth}));assert(before.scroll>before.client);
    await swipe(page,{x:b.x+b.width*.8,y},{x:b.x+b.width*.2,y});const after=await table.evaluate(n=>({left:n.scrollLeft,client:n.clientWidth,scroll:n.scrollWidth}));assert(after.left>before.left+10,'Native horizontal table swipe must move its scrollLeft');await geometry(page,tableArticle,device);await shot(page,device.name+'-table.png');return{before,after};
  });
  await check(device.name+' article image touch viewer, body scroll and close',async()=>{
    await visit(page,tomb);const image=page.locator('#article-content img').first();await image.scrollIntoViewIfNeeded();await image.evaluate(n=>n.decode());await tap(page,'.article-image-link');await page.locator('#article-image-viewer[open]').waitFor();await page.locator('#article-image-viewer img').evaluate(n=>n.decode());
    await targets(page,'.image-viewer-actions a,.image-viewer-actions button',device);const b=await viewerBox(page,'#article-image-viewer');assert(b.x>=-1&&b.right<=device.width+1&&b.y>=-1&&b.bottom<=device.height+1,'Viewer must fit viewport '+JSON.stringify(b));
    const previous=await page.evaluate(()=>scrollY);const picture=await page.locator('#article-image-viewer img').boundingBox();await swipe(page,{x:picture.x+picture.width*.5,y:picture.y+picture.height*.8},{x:picture.x+picture.width*.5,y:picture.y+picture.height*.2});const after=await page.evaluate(()=>scrollY);report.measurements.push({kind:'article-viewer-scroll',device:device.name,before:previous,after});if(!baseline)assert.equal(after,previous,'Article background must remain stationary while modal open');
    await shot(page,device.name+'-article-viewer.png');await tap(page,'.image-viewer-actions button');assert(!(await page.locator('#article-image-viewer').evaluate(n=>n.open)));assert(await page.locator('.article-image-link').first().evaluate(n=>n===document.activeElement));if(!baseline)assert.equal(await page.evaluate(()=>scrollY),previous,'Closing restores the same document position');return{box:b,backgroundScroll:{before:previous,after}};
  });
  await check(device.name+' photo native touch next, horizontal swipe, vertical story scroll and close',async()=>{
    await visit(page,albumRoute);await tap(page,'[data-photo-open]');await page.locator('#photo-viewer[open]').waitFor();await page.locator('.photo-large').evaluate(n=>n.decode());await targets(page,'.photo-close,.photo-previous,.photo-next',device);
    const bounds=await viewerBox(page,'#photo-viewer');assert(bounds.x>=-1&&bounds.right<=device.width+1&&bounds.y>=-1&&bounds.bottom<=device.height+1);
    await tap(page,'.photo-next');await photoPosition(page,1);await tap(page,'.photo-previous');await photoPosition(page,0);
    const img=await page.locator('.photo-large').boundingBox();assert(img.height>0,'Photo remains visible in landscape');await swipe(page,{x:img.x+img.width*.8,y:img.y+img.height*.3},{x:img.x+img.width*.2,y:img.y+img.height*.3});await photoPosition(page,1);
    if(!baseline&&device.name.includes('landscape'))assert(img.height>=140,'Short landscape must retain a useful image height');
    await shot(page,device.name+'-photo-viewer-before-vertical-scroll.png');await tap(page,'.photo-previous');await photoPosition(page,0);const indexBefore=await page.locator('.photo-position').innerText();const bodyBefore=await page.evaluate(()=>scrollY);const imageBox=await page.locator('.photo-large').boundingBox();await swipe(page,{x:imageBox.x+imageBox.width*.5,y:imageBox.y+imageBox.height*.8},{x:imageBox.x+imageBox.width*.5,y:imageBox.y+imageBox.height*.2});assert.equal(await page.locator('.photo-position').innerText(),indexBefore,'Vertical gesture must not change photo');assert.equal(await page.evaluate(()=>scrollY),bodyBefore,'Photo background locked');
    await shot(page,device.name+'-photo-viewer.png');await tap(page,'.photo-close');await page.locator('#photo-viewer').waitFor({state:'hidden'});await page.waitForFunction(()=>!history.state?.photoLightbox);assert(await page.locator('[data-photo-open]').first().evaluate(n=>n===document.activeElement));return{bounds,image:img,...(process.env.READING_TOUCH_TRACE?{events:await page.evaluate(()=>window.__readingTouchTrace)}:{})};
  });
  await ctx.close();
}
(async()=>{fs.mkdirSync(output,{recursive:true});try{
  browser=await playwright.chromium.launch({executablePath:chrome,headless:true});
  for(const device of devices)await runDevice(device);
  await check('320 portrait longest existing photo story native vertical scroll and content integrity',async()=>{
    const selected=catalog.albums.flatMap(a=>a.photos.map((p,index)=>({album:a,index,photo:p}))).sort((a,b)=>b.photo.caption.length-a.photo.caption.length)[0];
    const ctx=await context(devices[0]),page=await ctx.newPage();await visit(page,'/photos/'+selected.album.id+'/');await tap(page,`[data-photo-index="${selected.index}"]`);await page.locator('.photo-large').evaluate(n=>n.decode());
    assert.equal(await page.locator('#photo-viewer-caption').textContent(),selected.photo.caption);
    const before=await page.locator('#photo-viewer').evaluate(n=>({scroll:n.scrollTop,height:n.clientHeight,total:n.scrollHeight}));
    const position=await page.locator('.photo-position').innerText();for(let i=0;i<6;i++){await swipe(page,{x:160,y:480},{x:160,y:130});const done=await page.locator('#photo-viewer').evaluate(n=>n.scrollTop+n.clientHeight>=n.scrollHeight-2);if(done)break;}
    const after=await page.locator('#photo-viewer').evaluate(n=>({scroll:n.scrollTop,height:n.clientHeight,total:n.scrollHeight}));assert(after.scroll>before.scroll,'Native vertical swipe must scroll long photo story');assert.equal(await page.locator('.photo-position').innerText(),position);
    const end=await page.locator('#photo-viewer-caption').evaluate(n=>{const t=n.lastChild,r=document.createRange();r.setStart(t,t.length-1);r.setEnd(t,t.length);return r.getBoundingClientRect().toJSON();});assert(end.y>=0&&end.bottom<=568,'Final story character reachable by native vertical scroll');
    await shot(page,'320-portrait-longest-photo-story-bottom.png');await tap(page,'.photo-close');assert(await page.locator(`[data-photo-index="${selected.index}"]`).evaluate(n=>n===document.activeElement));await ctx.close();return{captionCharacters:selected.photo.caption.length,before,after,lastCharacter:end};
  });
  await check('article viewer keyboard Escape restores overflow and native original link fallback remains usable',async()=>{
    const ctx=await context(devices[2]),page=await ctx.newPage();await visit(page,tomb);const link=page.locator('.article-image-link').first();await link.focus();const before=await page.evaluate(()=>({y:scrollY,root:document.documentElement.style.overflow,body:document.body.style.overflow}));await page.keyboard.press('Enter');await page.locator('#article-image-viewer[open]').waitFor();await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.querySelector('#article-image-viewer').contains(document.activeElement)));await page.keyboard.press('Escape');assert(await link.evaluate(n=>n===document.activeElement));const after=await page.evaluate(()=>({y:scrollY,root:document.documentElement.style.overflow,body:document.body.style.overflow}));assert.deepEqual(after,before);
    await page.addInitScript(()=>{HTMLDialogElement.prototype.showModal=undefined;});await visit(page,tomb);const href=await page.locator('.article-image-link').first().getAttribute('href');await tap(page,'.article-image-link');assert.equal(new URL(page.url()).pathname,new URL(href,origin).pathname);await ctx.close();return{restored:after,unsupportedDialog:'original native link navigates to unchanged source image'};
  });
  for(const device of [devices[0],devices[2],devices[6]])await check(device.name+' Waline real client input size and keyboard viewport simulation with local empty GET mocks',async()=>{
    const ctx=await context(device,{mockComments:true}),page=await ctx.newPage();await visit(page,tomb);await page.locator('#wl-edit').waitFor({state:'attached'});
    const inputs=await page.locator('#waline .wl-header input,#wl-edit').evaluateAll(nodes=>nodes.map(n=>({id:n.id,font:getComputedStyle(n).fontSize,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,name:n.getAttribute('aria-label')||[...n.labels].map(l=>l.textContent).join(' ')})));
    report.measurements.push({kind:'waline-inputs',device:device.name,inputs});if(!baseline){assert(inputs.every(i=>parseFloat(i.font)>=16),'All comment text fields must be at least 16 CSS pixels: '+JSON.stringify(inputs));assert(inputs.every(i=>i.width>=100),'All comment text fields must retain practical typing width: '+JSON.stringify(inputs));}
    await tap(page,'#wl-edit');await resizeTouch(page,device.width,300);await page.locator('#wl-edit').scrollIntoViewIfNeeded();await shot(page,device.name+'-comment-keyboard-simulation.png');
    await page.locator('#wl-edit').fill('Local unsent keyboard viewport test');await page.locator('#wl-edit').fill('');
    const box=await page.locator('#wl-edit').boundingBox();assert(box.y>=-1&&box.y+box.height<=301,'Comment field remains visible in reduced viewport');
    assert(inputs.find(i=>i.id==='wl-edit').name.trim());await ctx.close();return{inputs,keyboard:'viewport-height simulation only; no submit'};
  });
  await check('reduced motion, focus outline and safe area declarations',async()=>{
    const ctx=await context(devices[2],{reducedMotion:'reduce'}),page=await ctx.newPage();await visit(page,'/articles/');const search=page.locator('#article-search');await search.focus();const detail=await search.evaluate(n=>({outline:getComputedStyle(n).outlineStyle,htmlScroll:getComputedStyle(document.documentElement).scrollBehavior}));assert.notEqual(detail.outline,'none');assert.equal(detail.htmlScroll,'auto');
    await visit(page,albumRoute);await tap(page,'[data-photo-open]');const transition=await page.locator('.photo-open img').first().evaluate(n=>getComputedStyle(n).transitionDuration);assert.equal(transition,'0s');
    const blogCss=fs.readFileSync(path.join(root,'blog/style.css'),'utf8'),photoCss=fs.readFileSync(path.join(root,'home/assets/photos.css'),'utf8');if(!baseline){assert(blogCss.includes('safe-area-inset-bottom'));assert(photoCss.includes('safe-area-inset-bottom'));}await ctx.close();return{...detail,photoTransition:transition};
  });
  await check('local resources and JS errors',async()=>{assert.deepEqual([...new Set(report.missing)],[]);assert.deepEqual([...new Set(report.errors)],[]);return{localRequests:report.requests.length};});
}catch(e){report.fatal=e.stack;console.error(e.stack);}finally{
  for(const s of sessions.values())await s.detach().catch(()=>{});for(const c of contexts)await c.close().catch(()=>{});if(browser)await browser.close();report.requests=[...new Set(report.requests)];report.passed=!report.fatal&&report.checks.every(c=>c.passed);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,failed:report.checks.filter(c=>!c.passed).map(c=>c.name),report:path.join(output,'report.json')}));if(!report.passed)process.exitCode=1;
}})();
