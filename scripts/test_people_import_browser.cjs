'use strict';
// Isolated acceptance with synthetic biographies; no network history lookup or real storage.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = process.env.WEBSITE_ROOT || path.resolve(__dirname,'..'), site = process.env.WEBSITE_SITE || path.join(root,'_site_unified');
const output = process.env.PEOPLE_IMPORT_OUTPUT || path.join(root,'.local-checks/improvements-20261027/people-import');
fs.mkdirSync(output,{recursive:true});
const origin = 'http://people-map.test', storageKey = 'xieyuqing-footprints-v1';
const report = {checks:[],errors:[],external:[],missing:[],personRequests:[]};
const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.wav':'audio/wav','.md':'text/markdown; charset=utf-8'};
const reference = {label:'Institutional biography with a long but readable source title for small screens',url:'https://museum.example.org/biography?edition=complete&chapter=life#timeline'};
const record = (id,language,overrides={}) => ({id,start:'2020-01',end:'2020-01',city:language==='en'?'Beijing':'北京',region:language==='en'?'Beijing':'北京',country:language==='en'?'China':'中国',lat:39.9042,lon:116.4074,title:language==='en'?'A verified city stay':'核对过的城市停留',description:language==='en'?'Original English biography.':'已核对的人物正文。',album:'',certainty:'confirmed',references:[reference],...overrides});
const entry = (id,count) => ({id,label:{'zh-CN':id==='alpha'?'甲人物':id==='beta'?'乙人物':'无效资料',en:id==='alpha'?'Person Alpha':id==='beta'?'Person Beta':'Invalid source'},coverage:{'zh-CN':'本地合成测试，仅核对城市；未知日期留空。',en:'Local synthetic test; verified cities only, unknown dates remain blank.'},record_count:count,document_url:'/assets/footprints-people/'+id+'.json',markdown:'/assets/footprints-people/'+id+'.md'});
const manifest = {version:1,people:[entry('alpha',2),entry('beta',1),entry('invalid',1)]};
const bundle = id => ({version:1,id,documents:Object.fromEntries(['zh-CN','en'].map(language=>[language,{version:1,title:language==='en'?'Person footprints':'人物足迹',records:id==='alpha'?[record('person-alpha-unknown',language,{start:'',end:'',certainty:'approximate',sequence:0}),record('person-alpha-known',language,{sequence:1})]:[record('person-'+id+'-one',language,{sequence:0,...(id==='invalid'?{references:[{label:'Unsafe',url:'https://localhost/source'}]}:{})})]}])),sources:[reference]});
const saved = {version:1,title:'Saved sentinel',records:[record('saved-only','en')]};
let browser, context, page, delayed = false;
const documentText = () => page.evaluate(()=>JSON.stringify(FootprintsMap.document()));
async function ready(){await page.waitForFunction(()=>window.FootprintsMap?.assetsReady()&&!window.SiteNavigation?.state().transition);}
async function edit(){if(!await page.evaluate(()=>FootprintsMap.canEdit()))await page.locator('#map-maker-toggle').press('Enter');}
async function panel(){await edit();if(!await page.locator('#people-import-panel').evaluate(n=>n.open))await page.locator('#people-import-panel>summary').press('Enter');}
async function settled(){await page.waitForFunction(()=>document.querySelector('#people-status')?.getAttribute('aria-busy')==='false');}
async function choose(id){await page.locator('#people-choice').selectOption(id);}
async function importDocument(value){const panel=page.locator('.import-panel:has(#import-text)');if(!await panel.evaluate(n=>n.open))await panel.locator('summary').click();await page.locator('#import-text').fill(JSON.stringify(value));await page.locator('#import-apply').click();}
async function check(name,action){try{await action();report.checks.push({name,passed:true});console.log('PASS '+name);}catch(error){report.checks.push({name,passed:false,error:error.stack});console.error('FAIL '+name+': '+error.message);}}
(async()=>{try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(({storageKey,saved})=>{
    if(!sessionStorage.getItem('people-test-seeded')){localStorage.setItem(storageKey,JSON.stringify(saved));sessionStorage.setItem('people-test-seeded','1');}
    window.__peopleAborts=0;const native=window.fetch.bind(window);
    window.fetch=(input,options)=>{if(String(input).includes('/assets/footprints-people/'))options?.signal?.addEventListener('abort',()=>window.__peopleAborts++);return native(input,options);};
  },{storageKey,saved});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(['blob:','data:'].includes(url.protocol))return route.continue();
    if(url.origin!==origin){report.external.push(url.href);return route.abort();}
    const match=url.pathname.match(/^\/assets\/footprints-people\/(alpha|beta|invalid)\.json$/);
    if(match){report.personRequests.push(match[1]);if(delayed&&match[1]==='beta')await new Promise(resolve=>setTimeout(resolve,750));try{return await route.fulfill({contentType:'application/json',body:JSON.stringify(bundle(match[1]))});}catch(_){return;}}
    let file=path.resolve(site,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(path.resolve(site)+path.sep))return route.fulfill({status:403,body:'Forbidden'});
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)){report.missing.push(url.pathname);return route.fulfill({status:404,body:'Missing'});}
    let body=fs.readFileSync(file);
    if(path.extname(file)==='.html'&&url.pathname.includes('/game/footprints/'))body=Buffer.from(body.toString('utf8').replace(/(<script id="footprints-people-data"[^>]*>)[\s\S]*?(<\/script>)/,'$1'+JSON.stringify(manifest)+'$2'));
    return route.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body});
  });
  page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.stack));page.on('dialog',dialog=>dialog.accept());
  await check('maker starts empty and never reads a person document before an explicit action',async()=>{
    await page.goto(origin+'/game/footprints/');await ready();
    assert.equal(JSON.parse(await documentText()).records.length,0);assert.equal(report.personRequests.length,0);
    assert.equal(await page.locator('#people-import-panel').isVisible(),false);
    await panel();await choose('alpha');assert.equal(report.personRequests.length,0);
    assert.match(await page.locator('#people-coverage').innerText(),/2.*未知日期/);
    assert.equal(await page.locator('#people-markdown').getAttribute('href'),'/assets/footprints-people/alpha.md');
  });
  await check('native keyboard preview shows records and collapsed sources while preserving map and draft bytes',async()=>{
    const before=await documentText(),camera=await page.evaluate(()=>JSON.stringify(FootprintsMap.camera()));
    await page.locator('#people-preview').press('Enter');await settled();
    assert.equal(report.personRequests.filter(id=>id==='alpha').length,1);
    assert.equal(await page.locator('#people-preview-list>li').count(),2);
    assert.match(await page.locator('#people-preview-list').innerText(),/日期待确认/);
    assert.match(await page.locator('#people-preview-list>li').first().innerText(),/日期待确认/);
    assert.match(await page.locator('#people-preview-list>li').nth(1).innerText(),/2020-01/);
    assert.equal(await page.locator('#people-provenance').evaluate(n=>n.open),false);
    assert.equal(await page.locator('#people-source-list a').getAttribute('href'),reference.url);
    assert.equal(await documentText(),before);assert.equal(await page.evaluate(()=>JSON.stringify(FootprintsMap.camera())),camera);
  });
  await check('merge keeps existing records and title, stays unsaved, is idempotent and can be undone',async()=>{
    await importDocument({version:1,title:'Keep this custom title',records:[record('existing-guest','zh-CN',{references:[reference]})]});
    const before=await documentText(),stored=await page.evaluate(key=>localStorage.getItem(key),storageKey);
    await page.locator('#people-import').press('Space');await settled();
    const merged=JSON.parse(await documentText());assert.equal(merged.title,'Keep this custom title');assert.equal(merged.records.length,3);assert.equal(merged.records[0].id,'existing-guest');
    assert.deepEqual(merged.records[1].references,[reference]);assert.equal(await page.evaluate(key=>localStorage.getItem(key),storageKey),stored);
    await page.locator('#people-import').click();await settled();assert.deepEqual(JSON.parse(await documentText()),merged);
    assert.match(await page.locator('#people-status').innerText(),/跳过相同记录 2/);
    await page.locator('#undo-data').click();assert.equal(await documentText(),before);
    assert.equal(report.personRequests.filter(id=>id==='alpha').length,1);
  });
  await check('record source details start closed and references never enter SVG or video captions',async()=>{
    await page.locator('#people-import').click();await settled();
    await page.locator('#timeline-list li').filter({hasText:'核对过的城市停留'}).first().locator('button').first().click();
    assert.equal(await page.locator('#record-provenance').isVisible(),true);assert.equal(await page.locator('#record-provenance').evaluate(n=>n.open),false);
    assert.equal(await page.locator('#record-reference-list a').getAttribute('href'),reference.url);
    await page.locator('#detail-close').click();
    const result=await page.evaluate(async()=>({svg:await FootprintsMap.exportSvg().text(),json:FootprintsModel.json(FootprintsMap.document()),markdown:FootprintsModel.markdown(FootprintsMap.document()),pages:FootprintsJourney.plan(FootprintsMap.records()).segments.map(segment=>segment.pageText)}));
    assert(result.json.includes(reference.url));assert(result.markdown.includes(reference.url));assert(!result.svg.includes(reference.url));assert(!result.svg.includes(reference.label));
    assert(result.pages.some(text=>text.includes('已核对的人物正文。')));for(const text of result.pages){assert(!text.includes(reference.url));assert(!text.includes(reference.label));}
  });
  await check('invalid references and conflicting IDs fail atomically without losing draft or saved data',async()=>{
    const before=await documentText();await choose('invalid');await page.locator('#people-import').click();await settled();assert.equal(await documentText(),before);assert.match(await page.locator('#people-status').innerText(),/未导入/);
    await page.locator('#clear-data').click();await importDocument({version:1,title:'Conflicting draft',records:[record('person-alpha-known','zh-CN',{title:'Different record'})]});
    const conflict=await documentText();await choose('alpha');await page.locator('#people-import').click();await settled();assert.equal(await documentText(),conflict);assert.match(await page.locator('#people-status').innerText(),/冲突/);
    assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).title,storageKey),'Saved sentinel');
  });
  await check('switching people aborts a late preview and never overwrites the newly selected summary',async()=>{
    delayed=true;await choose('beta');await page.locator('#people-preview').click();await page.waitForFunction(()=>document.querySelector('#people-status').getAttribute('aria-busy')==='true');
    await choose('alpha');await page.waitForTimeout(900);await settled();
    assert.equal(await page.locator('#people-choice').inputValue(),'alpha');assert.equal(await page.locator('#people-preview-list').isVisible(),false);assert.match(await page.locator('#people-coverage').innerText(),/甲人物/);
    assert(await page.evaluate(()=>window.__peopleAborts)>0);
  });
  await check('English import is captured at click time and later language switches preserve user records',async()=>{
    await page.locator('#clear-data').click();await page.locator('.header-tools .site-language-switch').click();
    assert.equal(await page.locator('html').getAttribute('lang'),'en');await choose('alpha');await page.locator('#people-import').click();await settled();
    const before=await documentText();assert.equal(JSON.parse(before).records[0].description,'Original English biography.');
    await page.locator('#people-preview').click();await settled();assert.equal(await page.locator('#people-provenance').evaluate(n=>n.open),false);
    await page.screenshot({path:path.join(output,'people-import-en-1440.png'),fullPage:true});
    await page.setViewportSize({width:390,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:path.join(output,'people-import-en-390.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});
    await page.locator('.header-tools .site-language-switch').click();assert.equal(await documentText(),before);
  });
  await check('mobile sources wrap without overflow and leaving cancels a pending person request',async()=>{
    await page.setViewportSize({width:390,height:900});await choose('alpha');await page.locator('#people-preview').click();await settled();await page.locator('#people-provenance>summary').click();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,'people-import-390.png'),fullPage:true});
    await choose('beta');await page.locator('#people-preview').click();await page.waitForTimeout(50);
    const prior=await page.evaluate(()=>window.__peopleAborts);await page.evaluate(()=>SiteNavigation.visit('/map/'));await ready();await page.waitForTimeout(900);
    assert(await page.evaluate(()=>window.__peopleAborts)>prior);assert.equal(await page.locator('main').getAttribute('data-map-scope'),'public');
    assert.equal(await page.locator('#people-import-panel').isVisible(),false);
  });
  assert.equal(report.errors.length,0,'page errors: '+report.errors.join('; '));assert.equal(report.external.length,0,'unexpected external request');
}catch(error){report.errors.push(error.stack);console.error(error);}finally{
  await browser?.close();fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.checks.filter(item=>item.passed).length,failed:report.checks.filter(item=>!item.passed).length,errors:report.errors.length,report:path.join(output,'browser-report.json')}));
  if(report.errors.length||report.checks.some(item=>!item.passed))process.exitCode=1;
}})();
