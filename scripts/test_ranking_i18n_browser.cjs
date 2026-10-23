// Independent headless contexts only; all requests are intercepted local fixtures.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
let playwright;
for(const candidate of [process.env.PLAYWRIGHT_MODULE,'playwright',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){
 try{playwright=require(candidate);break;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
}
if(!playwright)throw new Error('Existing Playwright required; set PLAYWRIGHT_MODULE.');
const root=path.resolve(process.env.GAME_SOURCE_ROOT||path.join(__dirname,'..'));
const fixture=path.resolve(process.argv[2]||path.join(root,'.local-checks/ranking-i18n-fixture'));
const evidence=path.resolve(process.argv[3]||path.join(root,'.local-checks/ranking-i18n'));
fs.mkdirSync(evidence,{recursive:true});
const origin='http://127.0.0.1:48793';
const report={checks:[],pageErrors:[],externalRequests:[],screenshots:[],notes:['Fresh nonpersistent browser contexts; no real user saves, browser profiles, production server or external service accessed.','Local assets are supplied by request interception. Failure injection affects test-only store instances.']};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const hook=`
window.__saveAttempts=[];window.__failSave=false;window.__documentToken=Math.random();
const __createStore=window.RankingStorage.createStore;
window.RankingStorage.createStore=function(...args){
 const store=__createStore(...args),save=store.save.bind(store),load=store.load.bind(store);window.__testStore=store;
 store.save=function(state){window.__saveAttempts.push(JSON.parse(JSON.stringify(state)));return window.__failSave?Promise.reject(new window.RankingStorage.StorageError('quota','浏览器本地存储空间不足，本次修改尚未自动保存。请先导出 JSON 备份，再减少图片。')):save(state);};
 if(typeof window.__seedJson==='string'){
  store.load=async()=>{
   await new Promise((resolve,reject)=>{const request=indexedDB.open('xieyuqing-ranking-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('rankings');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('rankings','readwrite');tx.objectStore('rankings').put(window.__seedJson,'current');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
   store.load=load;return load();
  };
 }
 window.__readSaved=load;return store;
};`;
let browser;
async function check(name,fn){if(process.env.GAME_I18N_TEST_MATCH&&!new RegExp(process.env.GAME_I18N_TEST_MATCH).test(name))return;const started=Date.now();try{await fn();report.checks.push({name,passed:true,ms:Date.now()-started});console.log('PASS '+name);}catch(error){report.checks.push({name,passed:false,error:error.stack});throw error;}}
async function pageFor(route='/en/game/ranking/?qa=1#keep',options={}){
 const {seed,...browserOptions}=options;
 const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true,...browserOptions});
 if(seed!==undefined)await context.addInitScript(value=>{window.__seedJson=value;},seed);
 await context.route('**/*',async route=>{
  const url=route.request().url();if(!url.startsWith(origin+'/')){if(/^(blob|data):/.test(url))return route.continue();report.externalRequests.push(url);return route.abort();}
  const pathname=decodeURIComponent(new URL(url).pathname);let target;
  if(pathname.startsWith('/assets/'))target=path.join(root,'home',pathname.slice(1));
  else target=path.join(fixture,pathname.replace(/^\//,''),'index.html');
  try{let body=fs.readFileSync(target);if(pathname==='/assets/ranking.js')body=Buffer.from(hook+body.toString('utf8'));return route.fulfill({status:200,contentType:mime[path.extname(target)]||'application/octet-stream',body});}
  catch(error){return route.fulfill({status:pathname==='/favicon.ico'?204:404,body:''});}
 });
 const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));
 await page.goto(origin+route);if(route.includes('ranking'))await page.waitForFunction(()=>document.querySelector('#ranking-app')?.hidden===false);
 return {page,context};
}
async function switchTo(page,language){await page.evaluate(lang=>SiteI18n.setLanguage(lang),language);assert.equal(await page.locator('html').getAttribute('lang'),language);}
async function saved(page){await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='Saved on this device');return page.evaluate(()=>__readSaved());}
async function editFirst(page){await page.locator('.card-main').first().press('Enter');await page.waitForFunction(()=>document.querySelector('#item-dialog').open&&!document.querySelector('#item-save').disabled);}
async function confirm(page,accept,action){const promise=page.waitForEvent('dialog'),actionPromise=action();const dialog=await promise;assert.ok(!/[\u4e00-\u9fff]/.test(dialog.message()),dialog.message());await (accept?dialog.accept():dialog.dismiss());await actionPromise;}
async function rawRecord(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('xieyuqing-ranking-v1',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('rankings','readonly'),request=tx.objectStore('rankings').get('current');request.onsuccess=()=>{const value=request.result;tx.oncomplete=()=>{db.close();resolve(value);};};request.onerror=()=>reject(request.error);};}));}
(async()=>{
 try{
  const downloads=path.join(evidence,'native-downloads');fs.mkdirSync(downloads,{recursive:true});
  browser=await playwright.chromium.launch({headless:true,downloadsPath:downloads,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const {page,context}=await pageFor();
  await check('English initial UI and repeated language switches do not reload or write a save',async()=>{
   assert.equal(await page.locator('#display-title').textContent(),'Food: Rank It Your Way');
   assert.equal(await page.locator('.card-name').first().textContent(),'Sichuan hot pot');
   const before=await page.evaluate(()=>({token:__documentToken,saves:__saveAttempts.length,html:document.querySelector('.rank-card')}));
   await page.evaluate(()=>window.__firstCard=document.querySelector('.rank-card'));
   for(const lang of ['zh-CN','en','zh-CN','en'])await switchTo(page,lang);
   assert.equal(await page.evaluate(()=>__saveAttempts.length),before.saves);
   assert.equal(await page.evaluate(()=>__documentToken),before.token);
   assert.equal(await page.evaluate(()=>window.__firstCard===document.querySelector('.rank-card')),true);
   assert.match(page.url(),/\/en\/game\/ranking\/\?qa=1#keep$/);
   assert.equal(await page.locator('.ranking-return').getAttribute('href'),'/en/game/');
  });
  await check('open picture draft, name, tier, focus and crop survive switches; Cancel saves nothing',async()=>{
   await editFirst(page);await page.locator('#item-name').fill('自定义草稿🙂');await page.locator('#item-target').selectOption('row-1');
   await page.locator('#crop-zoom').fill('2');await page.locator('#crop-zoom').dispatchEvent('input');
   await page.locator('#item-name').focus();await page.evaluate(()=>document.querySelector('#item-name').setSelectionRange(1,3));
   const before=await page.evaluate(()=>({value:document.querySelector('#item-name').value,start:document.querySelector('#item-name').selectionStart,end:document.querySelector('#item-name').selectionEnd,zoom:document.querySelector('#crop-zoom').value,picture:document.querySelector('#crop-preview').toDataURL(),saves:__saveAttempts.length}));
   for(const lang of ['zh-CN','en','zh-CN','en'])await switchTo(page,lang);
   assert.equal(await page.locator('#item-dialog').evaluate(el=>el.open),true);assert.equal(await page.locator('#item-target').inputValue(),'row-1');
   const after=await page.evaluate(()=>({value:document.querySelector('#item-name').value,start:document.querySelector('#item-name').selectionStart,end:document.querySelector('#item-name').selectionEnd,zoom:document.querySelector('#crop-zoom').value,picture:document.querySelector('#crop-preview').toDataURL(),saves:__saveAttempts.length}));
   assert.deepEqual(after,before);assert.equal(await page.evaluate(()=>document.activeElement.id),'item-name');
   await page.locator('#item-cancel').click();assert.equal(await page.evaluate(()=>__saveAttempts.length),before.saves);
   assert.equal(await page.locator('.card-name').first().textContent(),'Sichuan hot pot');
  });
  await check('unchanged English default name saves its original Chinese text; custom Chinese stays custom',async()=>{
   await editFirst(page);assert.equal(await page.locator('#item-name').inputValue(),'Sichuan hot pot');await page.locator('#item-save').click();
   let state=await saved(page);assert.equal(state.items['food-sichuan-hotpot'].name,'四川火锅');assert.equal(await page.locator('.card-name').first().textContent(),'Sichuan hot pot');
   await editFirst(page);await page.locator('#item-name').fill('自定义中文名称');await page.locator('#item-save').click();state=await saved(page);
   assert.equal(state.items['food-sichuan-hotpot'].name,'自定义中文名称');for(const lang of ['zh-CN','en'])await switchTo(page,lang);assert.equal(await page.locator('.card-name').first().textContent(),'自定义中文名称');
   await page.locator('#presentation-toggle').click();await page.locator('#text-name').fill('四川火锅');await page.locator('#add-text-form button').click();state=await saved(page);
   const custom=Object.values(state.items).find(item=>item.name==='四川火锅'&&item.id!=='food-sichuan-hotpot');assert.ok(custom);assert.equal(await page.locator('#candidate-pool .card-name').last().textContent(),'四川火锅');
  });
  await check('autosave failure remains visible across languages and a later save recovers all edits',async()=>{
   await page.evaluate(()=>{__failSave=true;});await page.locator('#text-name').fill('失败后仍保留');await page.locator('#add-text-form button').click();
   await page.waitForFunction(()=>document.querySelector('#save-status').dataset.failed==='true');assert.match(await page.locator('#tool-message').textContent(),/storage is full/);
   await switchTo(page,'zh-CN');assert.match(await page.locator('#tool-message').textContent(),/存储空间不足/);await switchTo(page,'en');assert.match(await page.locator('#tool-message').textContent(),/storage is full/);
   assert.ok((await page.locator('#candidate-pool').textContent()).includes('失败后仍保留'));
   await page.evaluate(()=>{__failSave=false;});await page.locator('#text-name').fill('恢复保存');await page.locator('#add-text-form button').click();
   const state=await saved(page);assert.ok(Object.values(state.items).some(item=>item.name==='失败后仍保留'));assert.ok(Object.values(state.items).some(item=>item.name==='恢复保存'));
  });
  await check('cancel reset and switch preserve saves; accepted switch and language changes preserve Undo',async()=>{
   const before=await page.evaluate(()=>__readSaved());
   await confirm(page,false,()=>page.locator('#reset-ranking').click({noWaitAfter:true}));
   await confirm(page,false,()=>page.locator('#ranking-template').selectOption('sport'));
   assert.deepEqual(await page.evaluate(()=>__readSaved()),before);assert.equal(await page.locator('#ranking-template').inputValue(),'food');
   await confirm(page,true,()=>page.locator('#ranking-template').selectOption('sport'));await page.waitForFunction(()=>document.body.dataset.rankingTemplate==='sport');await saved(page);
   await switchTo(page,'zh-CN');await switchTo(page,'en');assert.equal(await page.locator('#undo-clear').textContent(),'Undo template switch');await page.locator('#undo-clear').click();
   const restored=await saved(page);assert.deepEqual(restored,before);
  });
  await check('zoom, board-only and both skin states survive language switching',async()=>{
   await page.locator('#view-zoom-in').click();const zoom=await page.locator('#view-zoom-value').textContent();await page.locator('#view-board-only').click();
   await switchTo(page,'zh-CN');await switchTo(page,'en');assert.equal(await page.locator('#view-zoom-value').textContent(),zoom);assert.equal(await page.locator('#view-board-only').getAttribute('aria-pressed'),'true');
   await page.locator('#view-board-only').click();await page.locator('#presentation-toggle').click();await page.locator('#ranking-skin').selectOption('tech');await saved(page);await switchTo(page,'zh-CN');await switchTo(page,'en');assert.equal(await page.locator('body').getAttribute('data-ranking-skin'),'tech');
   await page.evaluate(()=>Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false}));await page.locator('#view-fullscreen').click();assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('view-fallback')),true);
   await switchTo(page,'zh-CN');await switchTo(page,'en');assert.equal(await page.locator('#view-fullscreen').textContent(),'Exit expanded view');assert.equal(await page.locator('#view-zoom-value').textContent(),zoom);await page.locator('#view-fullscreen').click();await page.locator('#presentation-toggle').click();
  });
  await check('JSON backup preserves raw data; English PNG downloads without altering save data',async()=>{
   const state=await page.evaluate(()=>__readSaved());
   await page.locator('.backup-panel summary').click();
   const [jsonDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#json-export').click()]);const jsonPath=await jsonDownload.path();assert.deepEqual(JSON.parse(fs.readFileSync(jsonPath,'utf8')),state);
   const plan=await page.evaluate(state=>RankingExport.planLayout(state),state);assert.equal(plan.title.lines.join(''),'Food: Rank It Your Way');assert.equal(plan.rows[0].name,'Awesome');assert.ok(plan.rows[0].cards.some(card=>card.lines.join('')==='自定义中文名称'));
   const [pngDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#png-export').click()]);const png=fs.readFileSync(await pngDownload.path());assert.equal(png.subarray(1,4).toString(),'PNG');assert.ok(png.length>1000);
   assert.deepEqual(await page.evaluate(()=>__readSaved()),state);assert.match(await page.locator('#tool-message').textContent(),/PNG ready/);
  });
  await page.screenshot({path:path.join(evidence,'ranking-english.png'),fullPage:true});report.screenshots.push('ranking-english.png');
  await context.close();
  await check('legacy v2 save reads and language changes never rewrite its bytes or custom Chinese',async()=>{
   const M=require(path.join(root,'home/assets/ranking-model.js')),legacy=M.createDefaultState();legacy.version=2;delete legacy.templateId;legacy.title='旧存档自定义标题';legacy.rows[0].name='旧存档等级';legacy.items['food-sichuan-hotpot'].name='旧存档自定义项目';const seed=JSON.stringify(legacy);
   const {page,context}=await pageFor('/en/game/ranking/',{seed});assert.equal(await page.locator('#display-title').textContent(),'旧存档自定义标题');assert.equal(await page.locator('.card-name').first().textContent(),'旧存档自定义项目');
   for(const lang of ['zh-CN','en','zh-CN','en'])await switchTo(page,lang);assert.equal(await rawRecord(page),seed);assert.equal(await page.evaluate(()=>__saveAttempts.length),0);await context.close();
  });
  await check('corrupt original stays protected through language switches, edits and reset cancellation',async()=>{
   const seed='test-only damaged JSON';const {page,context}=await pageFor('/en/game/ranking/',{seed});assert.match(await page.locator('#tool-message').textContent(),/original record is preserved/);
   await switchTo(page,'zh-CN');await switchTo(page,'en');await page.locator('#presentation-toggle').click();await page.locator('#text-name').fill('受保护的内存草稿');await page.locator('#add-text-form button').click();await page.waitForFunction(()=>document.querySelector('#save-status').dataset.failed==='true');
   assert.equal(await rawRecord(page),seed);assert.equal(await page.evaluate(()=>__saveAttempts.length),0);await confirm(page,false,()=>page.locator('#reset-ranking').click());assert.equal(await rawRecord(page),seed);
   await confirm(page,true,()=>page.locator('#reset-ranking').click());await saved(page);assert.notEqual(await rawRecord(page),seed);await context.close();
  });
  await check('English phone layout retains an open unsaved edit across language changes',async()=>{
   const {page,context}=await pageFor('/en/game/ranking/',{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);await page.locator('#presentation-toggle').click();await page.locator('.card-main').first().click();await page.waitForFunction(()=>document.querySelector('#item-dialog').open&&!document.querySelector('#item-save').disabled);
   await page.locator('#item-name').fill('手机草稿');for(const lang of ['zh-CN','en'])await switchTo(page,lang);assert.equal(await page.locator('#item-name').inputValue(),'手机草稿');await page.locator('#item-cancel').click();assert.equal(await page.evaluate(()=>__saveAttempts.length),0);
   await page.screenshot({path:path.join(evidence,'ranking-english-phone.png'),fullPage:true});report.screenshots.push('ranking-english-phone.png');await context.close();
  });
  await check('English games landing has no Chinese UI and switches in place',async()=>{
   const {page,context}=await pageFor('/en/game/');const bodyText=await page.locator('body').innerText(),languageLabel=await page.locator('.site-language-switch').innerText();assert.equal(languageLabel,'中文');assert.ok(!/[\u4e00-\u9fff]/.test(bodyText.replace(languageLabel,'')),bodyText);assert.equal(await page.locator('.game-start').getAttribute('href'),'/en/game/ranking/');
   await page.evaluate(()=>window.__samePageToken=42);await page.locator('.site-language-switch').click();assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');await page.locator('.site-language-switch').click();assert.equal(await page.evaluate(()=>__samePageToken),42);
   await page.screenshot({path:path.join(evidence,'games-english.png'),fullPage:true});report.screenshots.push('games-english.png');await context.close();
  });
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.externalRequests,[]);
 }catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
 finally{if(browser)await browser.close();fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');}
})();
