// Run against a built site in fresh contexts. No user profiles or remote services.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const override=process.env.MAP_LABEL_ASSETS,baseline=process.env.MAP_LABEL_EXPECT_DUPLICATE==='1',origin='http://127.0.0.1:48794';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'};
const report={checks:[],pageErrors:[],externalRequests:[],missing:[],mode:baseline?'before reproduction':'fixed regression',syntheticStorageOnly:true};
const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
let browser;
async function check(name,fn){const t=Date.now();try{const detail=await fn();report.checks.push({name,passed:true,ms:Date.now()-t,detail});console.log('PASS '+name);}catch(error){report.checks.push({name,passed:false,error:error.stack});throw error;}}
async function open(language='en',theme='light',mobile=false){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},colorScheme:theme,hasTouch:mobile,isMobile:mobile,acceptDownloads:true});
 await context.addInitScript(({theme})=>localStorage.setItem('xieyuqing-blog-theme',theme),{theme});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(/^(blob|data):$/.test(u.protocol))return route.continue();
  if(u.origin!==origin){report.externalRequests.push(u.href);return route.abort();}
  let file=path.resolve(site,decodeURIComponent(u.pathname).replace(/^\//,''));
  if(!file.startsWith(site+path.sep))return route.fulfill({status:403,body:''});
  if(override&&/^\/assets\/map\.(js|css)$/.test(u.pathname))file=path.join(override,path.basename(u.pathname));
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){if(u.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});report.missing.push(u.pathname);return route.fulfill({status:404,body:''});}
  return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.goto(origin+(language==='en'?'/en/map/':'/map/'));await page.waitForFunction(()=>window.FootprintsMap?.assetsReady());
 return {page,context};
}
function marker(page,city){return page.locator('.map-marker').filter({has:page.locator('.map-hover-label').filter({hasText:new RegExp('^'+city.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?: ≈)?$')})}).first();}
async function point(node){return node.locator('.map-dot').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});}
async function visibleLabel(node,page){const key=await node.getAttribute('data-city-key');return page.locator('.map-city-label').filter({has:page.locator('text')}).evaluateAll((nodes,key)=>nodes.filter(n=>n.dataset.cityKey===key).length,key);}
async function state(node,page){return {label:await visibleLabel(node,page),hover:await node.locator('.map-hover-label').evaluate(n=>getComputedStyle(n).display),hovered:await node.evaluate(n=>n.matches(':hover')),nativeTitles:await node.locator('title').count(),marked:await node.evaluate(n=>n.classList.contains('has-city-label'))};}
async function crop(page,node,name){const p=await point(node),v=page.viewportSize();await page.screenshot({path:path.join(out,name),clip:{x:Math.max(0,Math.min(v.width-320,p.x-130)),y:Math.max(0,Math.min(v.height-180,p.y-100)),width:320,height:180}});}
async function publicMap(page){await page.locator('#map-view').selectOption('china');await page.locator('#map-labels').check();await page.locator('#map-expand').click();await page.locator('#map-zoom-in').click();}
const record=(city,index,lat,lon)=>({id:'test-'+index,start:'2024-01-'+String(index+1).padStart(2,'0'),end:'',city,region:'Synthetic test',country:'Test',lat,lon,title:'Synthetic '+city,description:'Isolated regression fixture',album:'',certainty:'confirmed',stayType:'visit',groupId:'synthetic',sequence:index});
async function imported(page,records){await page.locator('#mode-visitor').click();await page.locator('.import-panel').evaluate(n=>n.open=true);await page.locator('#import-text').fill(JSON.stringify({version:1,title:'Synthetic map',records}));await page.locator('#import-apply').click();await page.locator('#map-labels').check();}
async function download(page,id,name){const wait=page.waitForEvent('download');await page.locator(id).click();const d=await wait;await d.saveAs(path.join(out,name));assert.equal(await d.failure(),null);return fs.readFileSync(path.join(out,name));}
(async()=>{try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
 if(baseline){
  await check('before: Wuhan has both persistent and hover names',async()=>{const{page,context}=await open();await publicMap(page);const n=marker(page,'Wuhan');const p=await point(n);await page.mouse.move(p.x,p.y);const s=await state(n,page);assert.equal(s.label,1);assert.equal(s.hovered,true);assert.notEqual(s.hover,'none');assert.equal(s.nativeTitles,1);await crop(page,n,'before-wuhan-overlap.png');await context.close();return s;});
 }else{
  for(const language of ['zh-CN','en'])for(const theme of ['light','dark'])await check(language+' '+theme+': one Wuhan label, pointer/focus and stable hover',async()=>{
   const{page,context}=await open(language,theme);await publicMap(page);const city=language==='en'?'Wuhan':'武汉',n=marker(page,city),p=await point(n);
   await page.mouse.move(p.x,p.y);const s=await state(n,page);assert.equal(s.label,1);assert.equal(s.marked,true);assert.equal(s.hover,'none');assert.equal(s.hovered,true);assert.equal(s.nativeTitles,0);assert.match(await n.getAttribute('aria-label'),new RegExp(city));
   await page.evaluate(()=>{window.__labels=[...document.querySelector('#map-label-layer').children];window.__labelMutations=0;new MutationObserver(m=>window.__labelMutations+=m.length).observe(document.querySelector('#map-label-layer'),{childList:true,subtree:true,attributes:true});});
   for(let i=0;i<4;i++){await page.mouse.move(5,5);await page.mouse.move(p.x,p.y);assert.equal((await state(n,page)).hover,'none');}
   assert.equal(await page.evaluate(()=>__labelMutations),0);assert.equal(await page.evaluate(()=>__labels.every((n,i)=>n===document.querySelector('#map-label-layer').children[i])),true);
   await n.focus();assert.equal((await state(n,page)).hover,'none');
   const font=await page.locator('.map-city-label').evaluateAll((nodes,key)=>getComputedStyle(nodes.find(n=>n.dataset.cityKey===key).querySelector('text')).fontWeight,await n.getAttribute('data-city-key'));assert.equal(font,'600');
   await crop(page,n,'after-'+language+'-'+theme+'.png');await context.close();return {...s,fontWeight:font};
  });
  await check('labels off/on, repeat, zoom and same-page language changes',async()=>{
   const{page,context}=await open();await publicMap(page);
   for(let i=0;i<3;i++){
    await page.locator('#map-labels').uncheck();let n=marker(page,'Wuhan');await n.focus();assert.equal((await state(n,page)).label,0);assert.notEqual((await state(n,page)).hover,'none');assert.equal((await state(n,page)).marked,false);
    await page.mouse.move(5,5);await n.evaluate(el=>el.blur());assert.equal((await state(n,page)).hover,'none');
    await page.locator('#map-labels').check();n=marker(page,'Wuhan');await n.focus();assert.equal((await state(n,page)).hover,'none');
   }
   await page.locator('#map-zoom-out').click();await page.locator('#map-zoom-in').click();
   for(const language of ['zh-CN','en']){await page.evaluate(l=>SiteI18n.setLanguage(l),language);const n=marker(page,language==='en'?'Wuhan':'武汉');await n.focus();const s=await state(n,page);assert.equal(s.marked,s.label===1);if(s.label)assert.equal(s.hover,'none');else assert.notEqual(s.hover,'none');}
   await context.close();return{repeatedTogglePairs:3,languages:['zh-CN','en']};
  });
  await check('collision-omitted names retain pointer/focus identification and details',async()=>{
   const{page,context}=await open();await imported(page,Array.from({length:12},(_,i)=>record('Collision city '+i,i,30.5928,114.3055)));await page.locator('#map-view').selectOption('china');await page.locator('#map-expand').click();
   const all=page.locator('.map-marker'),count=await all.count(),placed=await page.locator('.map-city-label').count();assert.ok(placed>0&&placed<count);
   const hidden=page.locator('.map-marker:not(.has-city-label)').last();await hidden.focus();assert.notEqual((await state(hidden,page)).hover,'none');assert.equal((await state(hidden,page)).label,0);assert.ok(await hidden.getAttribute('aria-label'));
   await hidden.press('Enter');assert.equal(await page.locator('#detail-dialog').evaluate(n=>n.open),true);await page.locator('#detail-close').click();
   await hidden.evaluate(n=>n.blur());const p=await point(hidden);await page.mouse.move(p.x,p.y);assert.equal((await state(hidden,page)).hovered,true,JSON.stringify({state:await state(hidden,page),point:p,viewport:page.viewportSize(),hit:await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,200),p)}));assert.notEqual((await state(hidden,page)).hover,'none');
   await context.close();return{markers:count,placed,omitted:count-placed};
  });
  await check('narrow touch tap and keyboard city details remain available',async()=>{
   const{page,context}=await open('zh-CN','dark',true);await page.locator('#map-view').selectOption('china');await page.locator('#map-labels').check();await page.locator('#map-expand').tap();await page.locator('#map-zoom-in').tap();
   const n=marker(page,'武汉');await n.locator('.map-dot').tap();assert.equal(await page.locator('dialog[open]').count(),1);await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);await context.close();return{width:390,emulatedTouch:true};
  });
  await check('SVG/PNG/JSON/Markdown downloads stay clean and hover-independent',async()=>{
   const{page,context}=await open();await imported(page,[record('Wuhan',0,30.5928,114.3055),record('Beijing',1,39.9042,116.4074),record('Shanghai',2,31.2304,121.4737)]);
   await page.locator('#map-view').selectOption('china');
   const raw=await page.evaluate(()=>JSON.stringify(FootprintsMap.document()));
   const before=await page.evaluate(()=>FootprintsMap.exportSvg().text());
   const n=marker(page,'Wuhan');await n.focus();const after=await page.evaluate(()=>FootprintsMap.exportSvg().text());assert.equal(after,before);
   const svg=await download(page,'#export-svg','map-labels.svg');assert.equal(svg.toString('utf8'),before);assert.ok(!before.includes('map-hover-label'));assert.ok(!before.includes('has-city-label'));assert.ok(!before.includes('data-export-title'));assert.match(before,/font:600 /);
   const titleCount=await page.evaluate(text=>new DOMParser().parseFromString(text,'image/svg+xml').querySelectorAll('.map-marker > title').length,before);assert.equal(titleCount,3);
   const png=await download(page,'#export-png','map-labels.png');assert.equal(png.subarray(1,4).toString(),'PNG');
   const json=await download(page,'#export-json','map-labels.json');assert.deepEqual(JSON.parse(json),JSON.parse(raw));
   const md=await download(page,'#export-markdown','map-labels.md');assert.equal(await page.evaluate(text=>JSON.stringify(FootprintsModel.parse(text)),md.toString('utf8')),raw);
   assert.equal(await page.evaluate(()=>JSON.stringify(FootprintsMap.document())),raw);await context.close();return{svgSha256:digest(svg),pngSha256:digest(png),jsonSha256:digest(json),markdownSha256:digest(md),exportMarkerTitles:titleCount};
  });
 }
 await check('local-only requests and no runtime errors',async()=>{assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.missing,[]);return{blockedExternal:report.externalRequests.length};});report.success=true;
}catch(error){report.success=false;report.error=error.stack;process.exitCode=1;}finally{if(browser)await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:report.success,checks:report.checks.length,report:path.join(out,'report.json')}));}})();
