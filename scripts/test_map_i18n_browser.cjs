// Focused, isolated map localization acceptance. No external requests or uploads.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
let playwright;
for (const candidate of [process.env.PLAYWRIGHT_MODULE,'playwright',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
 try { playwright=require(candidate);break; } catch(error) { if(error.code!=='MODULE_NOT_FOUND')throw error; }
}
if(!playwright)throw new Error('Use the existing Playwright runtime; set PLAYWRIGHT_MODULE if needed.');
const {chromium}=playwright;
const site=path.resolve(process.argv[2]),evidence=path.resolve(process.argv[3]||path.join(os.tmpdir(),'map-i18n-evidence'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.md':'text/markdown; charset=utf-8'};
const report={checks:[],pageErrors:[],externalRequests:[],missing:[]};
const chinese=/[\u3400-\u9fff]/u;
const longTitle='A deliberately long English heading about a remarkable journey through unfamiliar cities and memories';
const record=(o={})=>({id:'synthetic-base',start:'2020',end:'2030',city:'London',region:'England',country:'United Kingdom',lat:51.5,lon:-.1,title:'自定义标题',description:'访客正文 <b>原样保留</b>\nSecond line.',album:'',certainty:'confirmed',stayType:'base',baseReturn:true,groupId:'base',sequence:0,...o});
async function main(){
 const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.protocol==='data:'||url.protocol==='blob:')return route.continue();
   if(url.origin!=='http://map.test'){report.externalRequests.push(url.href);return route.abort();}
   let file=path.resolve(site,decodeURIComponent(url.pathname).replace(/^\//,''));
   if(!file.startsWith(site+path.sep))return route.fulfill({status:403,body:'Forbidden'});
   if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
   if(!fs.existsSync(file)){report.missing.push(url.pathname);return route.fulfill({status:404,body:'Not found'});}
   return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  async function check(name,action){await action();report.checks.push(name);console.log('PASS '+name);}
  await page.goto('http://map.test/en/map/?keep=1#main');await page.waitForFunction(()=>window.FootprintsMap?.assetsReady());
  await check('English initial author UI, city filters, descriptions and accessibility',async()=>{
   assert.equal(await page.locator('h1').innerText(),'Maps and Footprints');
   assert.equal(await page.locator('#map-title').innerText(),"Xie Yuqing's Footprints");
   assert.equal(chinese.test(await page.locator('#city-filters').innerText()),false);
   assert.match(await page.locator('#timeline-list').innerText(),/Born in Xiushui Town/);
   assert.equal(await page.locator('#record-close').getAttribute('aria-label'),'Close editor without saving');
   assert.equal(await page.locator('#map-svg-title').count(),1);
   assert.equal(chinese.test(await page.locator('#map-summary').innerText()),false);
  });
  const publisher=await page.evaluate(()=>JSON.stringify(FootprintsMap.document()));
  await check('In-place switching retains URL suffix and camera without mutating author facts',async()=>{
   await page.locator('#map-zoom-in').click();const before=await page.evaluate(()=>FootprintsMap.camera());
   await page.locator('.site-language-switch').click();
   assert.match(page.url(),/\/map\/\?keep=1#main$/);assert.deepEqual(await page.evaluate(()=>FootprintsMap.camera()),before);
   assert.equal(await page.locator('h1').innerText(),'地图与足迹');assert.equal(await page.evaluate(()=>JSON.stringify(FootprintsMap.document())),publisher);
   await page.evaluate(()=>SiteI18n.setLanguage('en'));assert.equal(await page.locator('h1').innerText(),'Maps and Footprints');
  });
  await page.locator('#mode-visitor').click();await page.locator('.import-panel').evaluate(node=>node.open=true);
  await check('English import validation and exact visitor data preservation',async()=>{
   await page.locator('#import-text').fill('{broken');await page.locator('#import-apply').click();assert.match(await page.locator('#map-status').innerText(),/Not imported: Invalid JSON/);
   const doc={version:1,title:longTitle,records:[record(),record({id:'synthetic-trip',start:'2024-01-01',end:'2024-01-03',city:'Paris',region:'Île-de-France',country:'France',lat:48.85,lon:2.35,title:'第二段经历',description:'原始访客内容',stayType:'visit',baseReturn:undefined,groupId:'trip',sequence:1})]};
   await page.locator('#import-text').fill(JSON.stringify(doc));await page.locator('#import-apply').click();
   assert.deepEqual(await page.evaluate(()=>FootprintsMap.document()),JSON.parse(JSON.stringify(doc)));
   assert.match(await page.locator('#timeline-list').innerText(),/自定义标题/);
  });
  const visitor=await page.evaluate(()=>JSON.stringify(FootprintsMap.document()));
  await check('Unsaved open editor, focus, imported text and storage survive language changes',async()=>{
   await page.locator('#add-record').click();await page.locator('#record-title').fill('未保存的输入');await page.locator('#record-description').fill('输入中\nDo not lose this.');await page.locator('#record-description').focus();
   await page.evaluate(()=>SiteI18n.setLanguage('zh-CN'));
   assert.equal(await page.locator('#record-description').inputValue(),'输入中\nDo not lose this.');assert.equal(await page.evaluate(()=>document.activeElement.id),'record-description');
   assert.equal(await page.locator('#record-dialog').evaluate(n=>n.open),true);assert.equal(await page.evaluate(()=>JSON.stringify(FootprintsMap.document())),visitor);
   assert.equal(await page.evaluate(()=>localStorage.getItem('xieyuqing-footprints-v1')),null);
   await page.evaluate(()=>SiteI18n.setLanguage('en'));assert.equal(await page.locator('#record-title').inputValue(),'未保存的输入');await page.locator('#record-cancel').click();
  });
  await check('Canceled draft clear is English and leaves draft untouched',async()=>{
   let dialogText='';page.once('dialog',async dialog=>{dialogText=dialog.message();await dialog.dismiss();});await page.locator('#clear-data').click();
   assert.match(dialogText,/Clear the current visitor draft/);assert.equal(await page.evaluate(()=>JSON.stringify(FootprintsMap.document())),visitor);
   assert.match(await page.locator('#map-status').innerText(),/^Canceled\./);
  });
  await check('English dictionary selection remains valid after switching before save',async()=>{
   await page.locator('#add-record').click();await page.locator('#city-choice').selectOption('0');
   assert.equal(await page.locator('#record-city').inputValue(),'Beijing');
   await page.locator('#record-title').fill('Dictionary cross-language check');
   await page.locator('#record-start').fill('2025-05');await page.locator('#record-end').fill('2025-06');
   await page.evaluate(()=>SiteI18n.setLanguage('zh-CN'));assert.equal(await page.locator('#record-city').inputValue(),'Beijing');
   await page.locator('#record-save').click();assert.equal(await page.locator('#record-dialog').evaluate(n=>n.open),false);
   const added=await page.evaluate(()=>FootprintsMap.document().records.at(-1));assert.equal(added.city,'Beijing');assert.equal(added.lat,39.9042);assert.equal(added.lon,116.4074);
   await page.locator('#undo-data').click();assert.equal(await page.evaluate(()=>JSON.stringify(FootprintsMap.document())),visitor);
   await page.evaluate(()=>SiteI18n.setLanguage('en'));
  });
  await check('English recovery Markdown retains every visitor field and raw description',async()=>{
   const result=await page.evaluate(()=>{const doc=FootprintsMap.document(),md=FootprintsModel.markdown(doc);return {md,parsed:FootprintsModel.parse(md),source:doc};});
   assert.deepEqual(result.parsed,result.source);assert.match(result.md,/Dates may use YYYY/);assert.match(result.md,/访客正文/);
  });
  await check('Active video keeps its initial subtitle language while UI changes',async()=>{
   await page.evaluate(()=>{
    window.__texts=[];window.__draws=[];const ctx=document.getElementById('video-canvas').getContext('2d'),fill=ctx.fillText.bind(ctx);ctx.fillText=(text,...args)=>{window.__texts.push(String(text));const metrics=ctx.measureText(String(text));window.__draws.push({text:String(text),args,font:ctx.font,width:metrics.width,top:args[1]-metrics.actualBoundingBoxAscent,bottom:args[1]+metrics.actualBoundingBoxDescent});return fill(text,...args);};
   });
   await page.locator('#video-generate').click();
   try { await page.waitForFunction(()=>FootprintsVideoUI.getState().busy,{},{timeout:10000}); }
   catch(error) { throw new Error(JSON.stringify(await page.evaluate(()=>({state:FootprintsVideoUI.getState(),status:document.getElementById('map-status').textContent,progress:document.getElementById('playback-progress').textContent,fonts:document.fonts.status,ready:FootprintsMap.assetsReady(),capability:document.getElementById('video-capability').textContent})))+' '+error.message); }
   const camera=await page.evaluate(()=>FootprintsMap.camera());await page.evaluate(()=>SiteI18n.setLanguage('zh-CN'));
   assert.equal(await page.evaluate(()=>FootprintsVideoUI.getState().busy),true);assert.deepEqual(await page.evaluate(()=>FootprintsMap.camera()),camera);
   await page.waitForFunction(()=>FootprintsVideoUI.getState().ready,{},{timeout:45000});
   await page.waitForFunction(()=>document.getElementById('video-preview').readyState>=1&&document.getElementById('video-preview').duration>0,{},{timeout:10000});
   const texts=await page.evaluate(()=>window.__texts);assert(texts.some(text=>text==='Return to London'));assert(!texts.some(text=>text.includes('返回')));
   assert(texts.some(text=>text.includes('cities')&&text.includes('experiences')));assert(!texts.some(text=>text.includes('座城市')));
   assert.equal(await page.locator('#video-download').getAttribute('download'),'footprints.webm');
  });
  await check('Decoded outro uses natural-width word-wrapped title with clear footer spacing',async()=>{
   const layout=await page.evaluate(title=>{const c=document.getElementById('video-canvas').getContext('2d');return FootprintsVideoUI.layoutOutroTitle(title,(text,size)=>{c.font=`bold ${size}px sans-serif`;return c.measureText(text).width;});},longTitle);
   assert.equal(layout.lines.length,2);assert(layout.fontSize>=44&&layout.fontSize<=60);
   const draws=await page.evaluate(()=>window.__draws);
   const headings=draws.filter(draw=>draw.font.startsWith('bold')&&draw.args[1]>=818);
   assert(headings.length>0);assert(headings.every(draw=>draw.args.length===2&&draw.width<=1152),'title fillText must use natural glyph width with no maxWidth argument');
   assert.equal(new Set(headings.map(draw=>draw.args[1])).size,2);
   const count=draws.find(draw=>draw.args[1]===740&&draw.text.includes('cities'));
   const closing=draws.find(draw=>draw.text==='Every journey leaves a connected trail');assert(count&&closing);
   assert(Math.min(...headings.map(draw=>draw.top))>count.bottom+6);
   assert(Math.max(...headings.map(draw=>draw.bottom))<closing.top-6);
   assert(closing.bottom<958);
   assert.equal(await page.evaluate(()=>FootprintsMap.document().title),longTitle);
   const png=await page.evaluate(async()=>{const video=document.getElementById('video-preview');video.pause();await new Promise(resolve=>{video.addEventListener('seeked',resolve,{once:true});video.currentTime=Math.max(0,video.duration-.25);});await new Promise(requestAnimationFrame);const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);return canvas.toDataURL('image/png').split(',')[1];});
   fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'video-outro-readable.png'),Buffer.from(png,'base64'));report.outroLayout=layout;
  });
  await check('Generated preview and editable draft survive another in-place switch',async()=>{
   const src=await page.locator('#video-preview').getAttribute('src');const state=await page.evaluate(()=>FootprintsVideoUI.getState());
   await page.evaluate(()=>SiteI18n.setLanguage('en'));
   assert.equal(await page.locator('#video-preview').getAttribute('src'),src);assert.equal(await page.locator('#video-preview').isVisible(),true);assert.equal(await page.evaluate(()=>FootprintsVideoUI.getState().ready),state.ready);
   assert.equal(await page.evaluate(()=>JSON.stringify(FootprintsMap.document())),visitor);
   assert.match(await page.locator('#video-download').innerText(),/Download/);
  });
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.externalRequests,[]);
  fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'map-i18n-browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.checks.length,pageErrors:report.pageErrors,externalRequests:report.externalRequests,missing:report.missing}));
 }finally{await browser.close();}
}
main().catch(error=>{fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'map-i18n-browser.json'),JSON.stringify({...report,error:error.stack},null,2)+'\n');console.error(error);process.exitCode=1;});
