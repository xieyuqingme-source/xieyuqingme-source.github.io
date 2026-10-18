'use strict';
// Local Chrome touch emulation, including real CDP touch input. No personal data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
let playwright;
for(const candidate of [process.env.PLAYWRIGHT_MODULE,'playwright',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){try{playwright=require(candidate);break;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}}
if(!playwright)throw new Error('Use the existing Playwright runtime; set PLAYWRIGHT_MODULE if needed.');
const site = path.resolve(process.argv[2] || path.join(__dirname, '..', '_site_unified'));
const output = path.resolve(process.argv[3] || path.join(__dirname, '..', '.local-checks/map-mobile'));
const before = process.argv.includes('--before');
const origin = 'http://127.0.0.1:48749';
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.json':'application/json', '.woff2':'font/woff2' };
const synthetic = { version:1, title:'合成手机地图验收', records:[
  { id:'qa-a',start:'2020',end:'2021',city:'北京',region:'北京',country:'中国',lat:39.9042,lon:116.4074,title:'合成经历甲',description:'仅用于本机触屏验收。',album:'',certainty:'confirmed' },
  { id:'qa-b',start:'2022',end:'2023',city:'成都',region:'四川',country:'中国',lat:30.5728,lon:104.0668,title:'合成经历乙',description:'手机地图操作和导出测试。',album:'',certainty:'confirmed' }
] };
const report = { startedAt:new Date().toISOString(), phase:before?'before':'after', site, checks:[], findings:[], screenshots:[], external:[], errors:[], consoleErrors:[], missing:[], notes:['Fresh independent headless Chrome; isolated nonpersistent contexts, local route interception and synthetic map data only.','CDP Input.dispatchTouchEvent exercises browser scrolling, dragging and pinch input; this is emulation, not physical-device or iOS testing.','A shortened layout viewport approximates reduced space while editing; it does not emulate a real operating-system keyboard.'] };
let browser;
const specs = [
  {width:320,height:760,dpr:2},{width:360,height:780,dpr:3},{width:390,height:844,dpr:3},{width:430,height:932,dpr:3},
  {width:760,height:320,dpr:2},{width:780,height:360,dpr:3},{width:844,height:390,dpr:3},{width:932,height:430,dpr:3}
];
function resource(url) {
  const relative = decodeURIComponent(new URL(url).pathname).replace(/^[/\\]+/,'');
  let file = path.resolve(site,relative); const within = path.relative(site,file);
  assert(!within.startsWith('..')&&!path.isAbsolute(within)&&!within.split(/[\\/]/).some(p=>p.startsWith('.')));
  if (fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
  let body=fs.readFileSync(file);
  if(relative==='map/'||relative==='map/index.html') body=Buffer.from(body.toString('utf8').replace(/(<script\b[^>]*\bid=["']footprints-data["'][^>]*>)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(synthetic)+b));
  return {status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body};
}
async function context(spec,init) {
  const ctx=await browser.newContext({viewport:{width:spec.width,height:spec.height},deviceScaleFactor:spec.dpr,isMobile:true,hasTouch:true,acceptDownloads:true});
  await ctx.route('**/*', async route=>{
    const url=route.request().url(); if(/^(blob|data):/.test(url)) return route.continue();
    if(!url.startsWith(origin+'/')) { report.external.push(url); return route.abort(); }
    try{return await route.fulfill(resource(url));}catch(error){report.missing.push(new URL(url).pathname); return route.fulfill({status:404,body:'Missing local fixture'});}
  });
  if(init) await ctx.addInitScript(init);
  const page=await ctx.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',entry=>{if(entry.type()==='error')report.consoleErrors.push(entry.text());});
  return {ctx,page,cdp:await ctx.newCDPSession(page)};
}
async function visit(page) { await page.goto(origin+'/map/',{waitUntil:'networkidle'}); await page.waitForFunction(()=>window.FootprintsMap&&FootprintsMap.assetsReady()); }
async function screenshot(page,name) { await page.screenshot({path:path.join(output,name),fullPage:true,animations:'disabled'}); report.screenshots.push(name); }
async function check(name, action) { if(process.env.QA_FILTER&&!name.includes(process.env.QA_FILTER))return; try { const detail=await action(); report.checks.push({name,passed:true,detail}); console.log('PASS '+name); } catch(error) {report.checks.push({name,passed:false,error:error.stack});console.error('FAIL '+name+': '+error.message);} }
async function swipe(cdp,a,b) {
  const point=p=>({x:p.x,y:p.y,id:1,radiusX:2,radiusY:2,force:1});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(a)]});
  for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point({x:a.x+(b.x-a.x)*i/10,y:a.y+(b.y-a.y)*i/10})]});await new Promise(r=>setTimeout(r,20));}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
async function pinch(cdp,center) {
  const points=d=>[{x:center.x-d,y:center.y,id:1,radiusX:2,radiusY:2,force:1},{x:center.x+d,y:center.y,id:2,radiusX:2,radiusY:2,force:1}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(30)});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(30+i*5)});await new Promise(r=>setTimeout(r,24));}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
async function geometry(page) { return page.evaluate(()=>({width:innerWidth,height:innerHeight,html:document.documentElement.scrollWidth,body:document.body.scrollWidth,dpr:devicePixelRatio,overflow:getComputedStyle(document.body).overflow})); }
async function main() {
  fs.mkdirSync(output,{recursive:true}); browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'}); report.browserVersion=browser.version();
  for(const spec of specs) await check(`${spec.width}x${spec.height}@${spec.dpr}: touch scrolling, controls, form and expanded map`,async()=>{
    const {ctx,page,cdp}=await context(spec), key=`${spec.width}x${spec.height}`;
    try {
      await visit(page); const size=await geometry(page); assert(size.html<=size.width+2&&size.body<=size.width+2,'No horizontal overflow');
      const targets=await page.locator('#map-zoom-in,#map-zoom-out,#map-expand,#map-add-here,#map-download-image,#map-labels,#map-route').evaluateAll(nodes=>nodes.map(n=>{const t=n.type==='checkbox'?n.closest('label'):n;const r=t.getBoundingClientRect();return {id:n.id,width:r.width,height:r.height};}));
      const small=targets.filter(t=>t.height<43.5); if(small.length)report.findings.push({viewport:key,kind:'small-touch-targets',targets:small});
      await page.evaluate(()=>{const r=document.querySelector('#map-canvas').getBoundingClientRect();scrollTo(0,scrollY+r.top-20);});
      await page.waitForTimeout(120); const rect=await page.locator('#map-canvas').boundingBox();
      const a={x:rect.x+rect.width*.6,y:Math.min(spec.height-40,rect.y+rect.height-20)}, b={x:a.x,y:Math.max(rect.y+15,a.y-125)};
      const initial=await page.evaluate(()=>({scroll:scrollY,camera:FootprintsMap.camera(),touchAction:getComputedStyle(document.querySelector('#footprints-map')).touchAction}));
      await swipe(cdp,a,b); await page.waitForTimeout(250);
      const scrolled=await page.evaluate(()=>({scroll:scrollY,camera:FootprintsMap.camera()}));
      const delta=scrolled.scroll-initial.scroll;
      if(delta<30||JSON.stringify(scrolled.camera)!==JSON.stringify(initial.camera))report.findings.push({viewport:key,kind:'page-swipe-changes-map',scrollDelta:delta,initial,after:scrolled});
      await screenshot(page,`${key}-page-swipe.png`);
      if(!before){assert(delta>30,'Single-finger swipe starting over inline map scrolls the page');assert.deepEqual(scrolled.camera,initial.camera,'Page swipe does not pan the inline map');assert.equal(small.length,0,'Primary touch targets are at least 44px tall');}
      if(!before){await page.locator('#footprints-map .map-hit').first().tap();await page.locator('#detail-dialog[open]').waitFor();await page.locator('#detail-close').tap();}
      await page.locator('#map-add-here').tap(); await page.locator('#record-dialog[open]').waitFor();
      const originalViewport=page.viewportSize(); await page.setViewportSize({width:spec.width,height:Math.min(spec.height,320)});
      await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
      const shortTouch=await page.evaluate(()=>({coarse:matchMedia('(any-pointer: coarse)').matches,points:navigator.maxTouchPoints,dpr:devicePixelRatio}));assert(shortTouch.coarse&&shortTouch.points>0,'Short viewport keeps touch emulation active');
      await page.locator('#record-city').tap(); await page.locator('#record-city').fill('未保存的合成城市');
      await page.locator('#record-description').tap(); await page.locator('#record-description').fill('键盘缩短可用视口的合成说明。');
      await page.locator('#record-cancel').scrollIntoViewIfNeeded();
      const cancel=await page.locator('#record-cancel').boundingBox();if(!before)assert(cancel.height>=43.5); assert(cancel.y>=0&&cancel.y+cancel.height<=Math.min(spec.height,320)+1,'Cancel remains reachable in shortened viewport');
      await screenshot(page,`${key}-short-form.png`); await page.locator('#record-cancel').tap(); assert.equal(await page.locator('#record-dialog').isVisible(),false);
      await page.setViewportSize(originalViewport);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
      await page.locator('#map-labels').tap(); assert(await page.locator('#map-label-layer .map-city-label').count()>0); await page.locator('#map-labels').tap();
      await page.locator('#map-expand').tap(); await page.locator('#map-expanded-close').waitFor({state:'visible'});
      const close=await page.locator('#map-expanded-close').boundingBox();if(!before)assert(close.height>=43.5); assert(close.x>=0&&close.y>=0&&close.x+close.width<=spec.width&&close.y+close.height<=spec.height,'Expanded map close button remains in viewport');
      await page.locator('#map-zoom-in').scrollIntoViewIfNeeded(); await page.locator('#map-zoom-in').tap();
      const beforePinch=await page.evaluate(()=>FootprintsMap.camera().zoom);
      await page.locator('#footprints-map').scrollIntoViewIfNeeded();
      const expanded=await page.locator('#footprints-map').boundingBox(); const center={x:expanded.x+expanded.width*.5,y:Math.min(spec.height-50,Math.max(100,expanded.y+expanded.height*.5))};
      await pinch(cdp,center); const afterPinch=await page.evaluate(()=>FootprintsMap.camera().zoom);
      assert(afterPinch>beforePinch,'Two-finger CDP pinch zooms the expanded map');
      if(!before){
        await page.locator('#map-expanded-tools').tap();
        const panel=page.locator('.map-canvas-panel');
        assert(await panel.evaluate(n=>n.scrollTop>0),'Tools shortcut scrolls inside expanded panel');
        await panel.evaluate(n=>{n.scrollTop=n.scrollHeight;});
        const sticky=await page.locator('#map-expanded-close').boundingBox();
        assert(sticky.y>=0&&sticky.y+sticky.height<=spec.height,'Exit remains reachable after scrolling tools to the bottom');
        await screenshot(page,`${key}-expanded-tools.png`);
      }
      await page.locator('#map-expanded-close').tap(); assert.equal(await page.locator('#map-expand').getAttribute('aria-expanded'),'false');
      await page.locator('#map-download-image').scrollIntoViewIfNeeded(); const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#map-download-image').tap()]); assert.equal(download.suggestedFilename(),'footprints.png');
      const location=await download.path(); const bytes=fs.readFileSync(location); assert.equal(bytes.subarray(1,4).toString(),'PNG');
      return {size,targets,scrollDelta:delta,shortTouch,shortFormCancel:cancel,expandedClose:close,pinch:{before:beforePinch,after:afterPinch},pngBytes:bytes.length};
    } finally {await ctx.close();}
  });
  await check('inline native page pinch zoom is preserved without changing the map camera',async()=>{
    const {ctx,page,cdp}=await context(specs[2]);
    try{await visit(page);await page.evaluate(()=>{const r=document.querySelector('#map-canvas').getBoundingClientRect();scrollTo(0,scrollY+r.top-40);});const box=await page.locator('#map-canvas').boundingBox(),center={x:box.x+box.width*.5,y:box.y+box.height*.5};const initial=await page.evaluate(()=>({scale:visualViewport.scale,camera:FootprintsMap.camera()}));await pinch(cdp,center);await page.waitForTimeout(200);const after=await page.evaluate(()=>({scale:visualViewport.scale,camera:FootprintsMap.camera()}));assert(after.scale>initial.scale,'Native browser page zoom remains available over inline map');assert.deepEqual(after.camera,initial.camera);return {initial,after};}finally{await ctx.close();}
  });
  await check('expanded scroll: background stays still and exit restores the entry position',async()=>{
    const {ctx,page,cdp}=await context(specs[2]);
    try{await visit(page);await page.locator('#map-expand').scrollIntoViewIfNeeded();const entry=await page.evaluate(()=>({x:scrollX,y:scrollY}));await page.screenshot({path:path.join(output,'expanded-entry-viewport.png')});report.screenshots.push('expanded-entry-viewport.png');await page.locator('#map-expand').tap();const opened=await page.evaluate(()=>({x:scrollX,y:scrollY}));await page.locator('#map-expanded-tools').tap();await page.locator('.map-canvas-panel').evaluate(n=>{n.scrollTop=n.scrollHeight;});const during=await page.evaluate(()=>({x:scrollX,y:scrollY}));await page.locator('#map-expanded-close').tap();const exited=await page.evaluate(()=>({x:scrollX,y:scrollY}));await page.screenshot({path:path.join(output,'expanded-exit-viewport.png')});report.screenshots.push('expanded-exit-viewport.png');if(JSON.stringify(entry)!==JSON.stringify(exited))report.findings.push({kind:'expanded-exit-loses-page-position',entry,opened,during,exited});if(!before){assert.deepEqual(during,opened);assert.deepEqual(exited,entry);}return {entry,opened,during,exited};}finally{await ctx.close();}
  });
  await check('export API degradation: unavailable PNG encoder and video recorder explain alternatives',async()=>{
    const {ctx,page}=await context(specs[2],()=>{HTMLCanvasElement.prototype.toBlob=function(callback){callback(null);};Object.defineProperty(window,'MediaRecorder',{configurable:true,value:undefined});});
    try{await visit(page);assert(await page.locator('#video-generate').isDisabled());await page.locator('#map-download-image').tap();await page.waitForFunction(()=>document.querySelector('#map-status').dataset.error==='true');assert.match(await page.locator('#map-status').textContent(),/SVG/);const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-svg').tap()]);assert.equal(download.suggestedFilename(),'footprints.svg');return {status:await page.locator('#map-status').textContent()};}finally{await ctx.close();}
  });
  await check('unsupported codec disables video and leaves static SVG export available',async()=>{
    const {ctx,page}=await context(specs[2],()=>{MediaRecorder.isTypeSupported=()=>false;});
    try{await visit(page);assert(await page.locator('#video-generate').isDisabled());assert.match(await page.locator('#video-capability').textContent(),/SVG/);const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-svg').tap()]);assert.equal(download.suggestedFilename(),'footprints.svg');return {message:await page.locator('#video-capability').textContent()};}finally{await ctx.close();}
  });
  await check('unavailable video canvas disables recording with a usable static fallback',async()=>{
    const {ctx,page}=await context(specs[2],()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(...args){return this.id==='video-canvas'?null:original.apply(this,args);};});
    try{await visit(page);const disabled=await page.locator('#video-generate').isDisabled(),text=await page.locator('#video-capability').textContent();if(!disabled)report.findings.push({kind:'null-video-context-leaves-enabled-button',text});if(!before){assert(disabled);assert.match(text,/SVG/);}const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export-svg').tap()]);assert.equal(download.suggestedFilename(),'footprints.svg');return {disabled,text};}finally{await ctx.close();}
  });
  assert.deepEqual(report.external,[]);if(!before)assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.missing,[]);
}
(async()=>{try{await main();}catch(error){report.fatalError=error.stack;console.error(error.stack);}finally{if(browser)await browser.close();report.passed=!report.fatalError&&report.checks.every(c=>c.passed);report.finishedAt=new Date().toISOString();fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,findings:report.findings.length,report:path.join(output,'report.json')}));if(!report.passed)process.exitCode=1;}})();
