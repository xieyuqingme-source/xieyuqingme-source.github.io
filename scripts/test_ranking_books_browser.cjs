// Optional acceptance: build first, then run with existing Playwright and Chrome.
// Only isolated headless contexts and intercepted local publication files are used.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),site=path.resolve(process.argv[2]||path.join(root,'_site_unified'));
const output=path.resolve(process.argv[3]||path.join(root,'.local-checks/english-v2-20261029/ranking-browser'));
const origin='http://ranking-books.test',widths=[1440,1024,768,390,320];
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const report={startedAt:new Date().toISOString(),checks:[],layouts:[],wordChecks:[],screenshots:[],downloads:[],exports:[],pageErrors:[],externalRequests:[],missing:[],dialogs:[],notes:['Fresh, nonpersistent Chrome contexts; no user profile or existing user IndexedDB is opened.','All HTTP requests are intercepted from the local built publication.','PNG checks require a successful native download, twenty decoded source paintings, twenty native drawImage calls, and final PNG pixels matching the source painting pixels actually rendered by Canvas.']};
let browser,Model;
const contexts=[];
function resource(url){
  const pathname=decodeURIComponent(new URL(url).pathname),file=path.resolve(site,'.'+pathname),relative=path.relative(site,file);
  assert(!relative.startsWith('..')&&!path.isAbsolute(relative)&&!relative.split(/[\\/]/).some(part=>part.startsWith('.')),'Path outside local publication');
  let target=file;if(fs.statSync(target).isDirectory())target=path.join(target,'index.html');
  return {contentType:mime[path.extname(target)]||'application/octet-stream',body:fs.readFileSync(target)};
}
const hook=`
window.__qaSaves=0;window.__qaLastSaved=null;window.__qaDocumentToken=Math.random();window.__qaExports=[];
const __qaCreateStore=RankingStorage.createStore;
RankingStorage.createStore=function(...args){
 const store=__qaCreateStore(...args),save=store.save.bind(store),load=store.load.bind(store);window.__qaStore=store;
 store.load=async()=>{await window.__qaSeedReady;return load();};
 store.save=async state=>{const snapshot=RankingModel.serialize(state);await save(state);window.__qaLastSaved=JSON.parse(snapshot);window.__qaSaves++;};
 return store;
};
const __qaDraw=CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
 const result=__qaDraw.call(this,image,...args);
 if(window.__qaActiveExport&&image instanceof HTMLImageElement){
  const transform=this.getTransform(),samples=[];
  if(args.length===8)for(const fx of [.2,.5,.8])for(const fy of [.2,.5,.8]){
   const x=Math.round(args[4]*transform.a+transform.e)+Math.floor(args[6]*transform.a*fx),y=Math.round(args[5]*transform.d+transform.f)+Math.floor(args[7]*transform.d*fy);
   samples.push({x,y,rgba:Array.from(this.getImageData(x,y,1,1).data)});
  }
  window.__qaActiveExport.draws.push({src:new URL(image.currentSrc||image.src,location.href).pathname,width:image.naturalWidth,height:image.naturalHeight,args,samples});
 }
 return result;
};
const __qaExport=RankingExport.exportRanking;
RankingExport.exportRanking=async function(state,options){
 const record={input:RankingModel.serialize(state),draws:[]};window.__qaActiveExport=record;
 try{const result=await __qaExport(state,options);record.result=result;window.__qaExports.push(record);return result;}
 finally{window.__qaActiveExport=null;}
};
`;
async function check(name,fn){
  const start=Date.now();console.log('CHECK '+name);
  try{const detail=await fn();report.checks.push({name,passed:true,ms:Date.now()-start,detail});console.log('PASS '+name);}
  catch(error){report.checks.push({name,passed:false,ms:Date.now()-start,error:error.stack});throw error;}
}
async function context({theme='light',width=1440,language='zh-CN',seed}={}){
  const ctx=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1,colorScheme:theme,acceptDownloads:true});contexts.push(ctx);ctx.setDefaultTimeout(18000);
  await ctx.addInitScript(({theme,seed})=>{
    try{localStorage.setItem('xieyuqing-blog-theme',theme);}catch(_){}
    window.__qaSeedReady=seed===undefined||location.origin==='null'?Promise.resolve():new Promise((resolve,reject)=>{
      const request=indexedDB.open('xieyuqing-ranking-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('rankings');request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,tx=db.transaction('rankings','readwrite');tx.objectStore('rankings').put(seed,'current');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
    });
  },{theme,seed});
  await ctx.route('**/*',async route=>{
    const url=route.request().url();if(/^(?:data|blob):/.test(url))return route.continue();
    if(!url.startsWith(origin+'/')){report.externalRequests.push(url);return route.abort();}
    try{const response=resource(url);if(new URL(url).pathname==='/assets/ranking.js')response.body=Buffer.from(hook+response.body.toString('utf8'));return route.fulfill(response);}
    catch(error){report.missing.push({url,error:error.message});return route.fulfill({status:404,body:'Missing local publication file'});}
  });
  const page=await ctx.newPage();page.on('pageerror',error=>report.pageErrors.push(error.stack||error.message));
  page.on('dialog',async dialog=>{report.dialogs.push(dialog.message());await dialog.accept();});
  await page.goto(origin+(language==='en'?'/en/game/ranking/':'/game/ranking/'));
  await page.waitForFunction(()=>document.querySelector('#ranking-app')?.hidden===false&&window.__qaStore);
  await page.evaluate(()=>document.fonts.ready);return {page,ctx};
}
async function savedAfter(page,before,templateId){
  await page.waitForFunction(({before,templateId})=>window.__qaSaves>before&&window.__qaLastSaved?.templateId===templateId,{before,templateId});
  return page.evaluate(()=>window.__qaLastSaved);
}
async function editing(page,wanted=true){
  const isEditing=await page.locator('body').evaluate(body=>!body.classList.contains('presentation'));
  if(isEditing!==wanted)await page.locator('#presentation-toggle').click();
  await page.waitForFunction(wanted=>!document.body.classList.contains('presentation')===wanted,wanted);
}
async function template(page,id){
  if(await page.locator('#ranking-template').inputValue()===id)return;
  const before=await page.evaluate(()=>__qaSaves);await page.locator('#ranking-template').selectOption(id);
  await page.waitForFunction(id=>document.body.dataset.rankingTemplate===id,id);await savedAfter(page,before,id);
}
async function title(page,text,id){
  await editing(page);const before=await page.evaluate(()=>__qaSaves);await page.locator('#ranking-title').fill(text);return savedAfter(page,before,id);
}
async function actionSave(page,selector,id){const before=await page.evaluate(()=>__qaSaves);await page.locator(selector).click();return savedAfter(page,before,id);}
async function records(page){return page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('xieyuqing-ranking-v1',1);request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('rankings','readonly'),values={};for(const key of ['current','template:food','template:sport','template:book']){const get=tx.objectStore('rankings').get(key);get.onsuccess=()=>{values[key]=get.result??null;};}tx.oncomplete=()=>{db.close();resolve(values);};tx.onerror=()=>reject(tx.error);};
}));}
async function decoded(page){return page.locator('#ranking-board img').evaluateAll(async images=>{
  for(const image of images)image.loading='eager';await Promise.all(images.map(image=>image.decode()));
  return images.map(image=>({src:new URL(image.currentSrc).pathname,width:image.naturalWidth,height:image.naturalHeight,alt:image.alt}));
});}
async function screenshot(page,name){await decoded(page);await page.screenshot({path:path.join(output,name),fullPage:true,animations:'disabled'});report.screenshots.push(name);}
async function presentationNotes(page,id){
  assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('presentation')),true);
  assert.equal(await page.locator('#template-note').isVisible(),id==='book',id+' presentation disclaimer visibility');
  assert.equal(await page.locator('#book-reading-link').isVisible(),id==='book',id+' presentation learning-link visibility');
  if(id==='book')assert.equal(await page.locator('#candidate-pool').isVisible(),false,'An empty book pool should not occupy a blank panel');
}
async function wholeBookWords(page,detail){
  const words=await page.evaluate(()=>[
    {id:'book-book-alice-in-wonderland',word:'Wonderland'},
    {id:'book-book-frankenstein',word:'Frankenstein'}
  ].map(({id,word})=>{
    const element=document.querySelector('.rank-card[data-item-id="'+id+'"] .card-name');
    if(!element)return {id,word,error:'Missing book label'};
    const text=element.textContent,index=text.indexOf(word);if(index<0)return {id,word,error:'Missing expected word',text};
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),nodes=[];let node,offset=0;
    while((node=walker.nextNode())){nodes.push({node,start:offset,end:offset+node.textContent.length});offset+=node.textContent.length;}
    const start=nodes.find(part=>part.start<=index&&part.end>index),end=nodes.find(part=>part.start<index+word.length&&part.end>=index+word.length);
    const range=document.createRange();range.setStart(start.node,index-start.start);range.setEnd(end.node,index+word.length-end.start);
    const rects=Array.from(range.getClientRects()).filter(rect=>rect.width>.1&&rect.height>.1).map(rect=>({x:rect.x,y:rect.y,width:rect.width,height:rect.height}));
    return {id,word,text,labelWidth:element.getBoundingClientRect().width,rects,lineTops:Array.from(new Set(rects.map(rect=>Math.round(rect.y*2)/2)))};
  }));
  report.wordChecks.push({...detail,words});
  if(words.some(word=>word.error||word.lineTops.length!==1)){
    const name='books-word-wrap-failure-'+report.wordChecks.length+'.png';await page.screenshot({path:path.join(output,name),fullPage:true});report.screenshots.push(name);
  }
  for(const word of words){assert.equal(word.error,undefined,JSON.stringify(word));assert.equal(word.lineTops.length,1,'The complete word must stay on one line: '+JSON.stringify({...detail,...word}));}
}
async function geometry(page,detail){
  const result=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,template:document.body.dataset.rankingTemplate,skin:document.body.dataset.rankingSkin,mode:document.body.classList.contains('presentation')?'presentation':'editing',cards:document.querySelectorAll('#ranking-board .rank-card').length}));
  assert(result.documentWidth<=result.width+1,JSON.stringify(result));assert(result.bodyWidth<=result.width+1,JSON.stringify(result));assert.equal(result.cards,20);report.layouts.push({...detail,...result});
  if(result.mode==='presentation')await presentationNotes(page,'book');
  if(result.width===390)await wholeBookWords(page,{...detail,...result});return result;
}
async function png(page,name){
  await editing(page);const before=await records(page),exportCount=await page.evaluate(()=>__qaExports.length);
  const promise=page.waitForEvent('download');await page.locator('#png-export').click();const download=await promise;
  assert.equal(await download.failure(),null,'Native PNG download must complete');const filename=path.join(output,name);await download.saveAs(filename);
  const data=fs.readFileSync(filename);assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(data.subarray(12,16).toString(),'IHDR');assert(data.length>20000,'PNG should contain twenty real paintings');
  await page.waitForFunction(count=>__qaExports.length>count,exportCount);
  const evidence=await page.evaluate(async()=>{
    const entry=__qaExports.at(-1),{blob,width,height,scale}=entry.result,paintings=[];
    const pngURL=URL.createObjectURL(blob),image=new Image();image.src=pngURL;await image.decode();
    const output=document.createElement('canvas');output.width=width;output.height=height;const ctx=output.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    try{
      for(const draw of entry.draws){
        if(draw.args.length!==8)throw new Error('Unexpected book source rectangle in the PNG');
        const source=draw.src,state=JSON.parse(entry.input),item=Object.values(state.items).find(item=>RankingModel.BUILTIN_ART[item.art]?.photo===source);
        let error=0,max=0,samples=0;
        for(const point of draw.samples){
          const actual=ctx.getImageData(point.x,point.y,1,1).data,wanted=point.rgba;
          for(let channel=0;channel<3;channel++){const difference=Math.abs(actual[channel]-wanted[channel]);error+=difference;max=Math.max(max,difference);samples++;}
        }
        paintings.push({id:item?.id,source,meanError:error/samples,maxError:max,colours:new Set(draw.samples.map(point=>point.rgba.join(','))).size});
      }
      return {width,height,scale,draws:entry.draws,paintings};
    }finally{URL.revokeObjectURL(pngURL);}
  });
  const expected=Object.values(Model.BOOK_ART).map(art=>art.photo).sort();
  assert.deepEqual(evidence.draws.map(draw=>draw.src).sort(),expected);assert.equal(evidence.paintings.length,20);
  for(const painting of evidence.paintings)assert(painting.meanError<=4&&painting.maxError<=12&&painting.colours>=3,JSON.stringify(painting));
  assert.equal(data.readUInt32BE(16),evidence.width);assert.equal(data.readUInt32BE(20),evidence.height);assert.deepEqual(await records(page),before,'PNG never modifies current or another template archive');
  report.downloads.push(name);report.exports.push({name,bytes:data.length,...evidence});
}
async function run(){
  fs.mkdirSync(output,{recursive:true});const temporary=path.join(output,'temporary');fs.mkdirSync(temporary,{recursive:true});process.env.TEMP=temporary;process.env.TMP=temporary;
  let playwright;for(const candidate of [process.env.PLAYWRIGHT_MODULE,'playwright',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){try{playwright=require(candidate);break;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}}
  assert(playwright,'Existing Playwright required; set PLAYWRIGHT_MODULE.');Model=require(path.join(site,'assets/ranking-model.js'));assert.equal(Object.keys(Model.BOOK_ART).length,20,'Build the completed book assets first');
  browser=await playwright.chromium.launch({headless:true,downloadsPath:path.join(output,'native-downloads'),executablePath:process.env.CHROME_PATH||(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':undefined)});
  const {page,ctx}=await context();
  await check('book, food and sports retain independent editable drafts',async()=>{
    assert.deepEqual(await page.locator('#ranking-template option').evaluateAll(options=>options.map(option=>option.value)),['food','sport','book']);
    await presentationNotes(page,'food');await title(page,'P1 保留的美食','food');await template(page,'sport');await presentationNotes(page,'sport');await title(page,'P1 保留的运动','sport');
    await template(page,'book');await presentationNotes(page,'book');await title(page,'P1 名著阅读草稿','book');
    let count=await page.evaluate(()=>__qaSaves);await page.locator('#ranking-skin').selectOption('tech');await savedAfter(page,count,'book');
    count=await page.evaluate(()=>__qaSaves);await page.locator('#text-name').fill('P1 自选作品');await page.locator('#add-text-form button').click();await savedAfter(page,count,'book');
    const before=await records(page);assert.equal(JSON.parse(before['template:book']).pool.length,1);
    await template(page,'food');assert.equal(await page.locator('#display-title').textContent(),'P1 保留的美食');
    await template(page,'sport');assert.equal(await page.locator('#display-title').textContent(),'P1 保留的运动');
    await template(page,'book');assert.equal(await page.locator('#display-title').textContent(),'P1 名著阅读草稿');assert.equal(await page.locator('#candidate-pool .card-name').textContent(),'P1 自选作品');
    const after=await records(page);for(const key of ['template:food','template:sport','template:book'])assert.equal(after[key],before[key]);
  });
  await check('reset affects only books, preserves its skin and supports undo',async()=>{
    const before=await records(page),draft=JSON.parse(before.current);assert.equal(draft.skin,'tech');
    const reset=await actionSave(page,'#reset-ranking','book');assert.equal(reset.title,'名著从夯到拉');assert.equal(Object.keys(reset.items).length,20);assert.equal(reset.skin,'tech');
    const resetRecords=await records(page);for(const key of ['template:food','template:sport'])assert.equal(resetRecords[key],before[key]);
    const undo=await actionSave(page,'#undo-clear','book');assert.deepEqual(undo,draft);
    await actionSave(page,'#reset-ranking','book');assert.match(await page.locator('#template-note').textContent(),/只是娱乐，不是文学评价/);
  });
  await check('all twenty published paintings decode and expose the specified Chinese scene alternatives',async()=>{
    await presentationNotes(page,'book');
    const images=await decoded(page);assert.equal(images.length,20);
    assert.deepEqual(images.map(image=>image.src).sort(),Object.values(Model.BOOK_ART).map(art=>art.photo).sort());
    for(const image of images){assert(image.width>=256&&image.height>=256,JSON.stringify(image));const art=Object.values(Model.BOOK_ART).find(art=>art.photo===image.src);assert.equal(image.alt,art.alt_zh);}
    return images;
  });
  await check('English book names and scene alternatives switch in place without rewriting archives',async()=>{
    const before=await records(page),token=await page.evaluate(()=>__qaDocumentToken),saves=await page.evaluate(()=>__qaSaves);
    await page.evaluate(()=>SiteI18n.setLanguage('en'));assert.equal(await page.locator('#display-title').textContent(),'Classic Books: Rank It Your Way');
    const shown=await page.locator('#ranking-board .rank-card').evaluateAll(cards=>cards.map(card=>({id:card.dataset.itemId,name:card.querySelector('.card-name').textContent,alt:card.querySelector('img').alt})));
    for(const item of shown){const art=Model.BOOK_ART[item.id.slice('book-'.length)];assert.equal(item.name,art.name.split(' · ').slice(1).join(' · '));assert.equal(item.alt,art.alt_en);}
    assert.match(await page.locator('#template-note').textContent(),/Just for fun, not a literary assessment/);
    assert.equal(await page.locator('#book-reading-link a').getAttribute('href'),'/english/');
    await page.evaluate(()=>SiteI18n.setLanguage('zh-CN'));assert.equal(await page.evaluate(()=>__qaDocumentToken),token);assert.equal(await page.evaluate(()=>__qaSaves),saves);assert.deepEqual(await records(page),before);
  });
  await check('both skins download PNGs containing each of the twenty real paintings',async()=>{
    for(const skin of ['classic','tech']){await editing(page);const count=await page.evaluate(()=>__qaSaves);if(await page.locator('#ranking-skin').inputValue()!==skin){await page.locator('#ranking-skin').selectOption(skin);await savedAfter(page,count,'book');}await png(page,'books-'+skin+'.png');}
  });
  await check('old v2 JSON imports preserve the separately saved books template',async()=>{
    const before=await records(page),old=Model.createDefaultState('food');old.version=2;delete old.templateId;old.title='P1 v2 导入的自定义标题';old.items['food-sichuan-hotpot'].name='P1 旧备份名称';
    const count=await page.evaluate(()=>__qaSaves);await page.locator('#json-file').setInputFiles({name:'books-test-legacy-v2.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});
    const restored=await savedAfter(page,count,'food');assert.equal(restored.title,old.title);assert.equal(restored.items['food-sichuan-hotpot'].name,'P1 旧备份名称');assert.equal((await records(page))['template:book'],before['template:book']);
    await template(page,'book');assert.equal(await page.locator('#ranking-board .rank-card').count(),20);
  });await ctx.close();
  for(const version of [1,2])await check('legacy v'+version+' initial reads and language changes preserve original bytes',async()=>{
    const old=Model.createDefaultState('food');old.title='P1 旧版原件';old.version=version;delete old.templateId;if(version===1){delete old.skin;Object.values(old.items).forEach(item=>{delete item.crop;});}
    const seed=JSON.stringify(old),{page,ctx}=await context({seed,language:'en'});assert.equal(await page.locator('#display-title').textContent(),'P1 旧版原件');
    for(const language of ['zh-CN','en'])await page.evaluate(language=>SiteI18n.setLanguage(language),language);
    assert.equal((await records(page)).current,seed);assert.equal(await page.evaluate(()=>__qaSaves),0);await ctx.close();
  });
  await check('five widths, both themes and both skins have no page overflow in presentation or editing',async()=>{
    for(const theme of ['light','dark']){
      const {page,ctx}=await context({theme});await template(page,'book');
      for(const skin of ['classic','tech']){
        await editing(page);if(await page.locator('#ranking-skin').inputValue()!==skin){const count=await page.evaluate(()=>__qaSaves);await page.locator('#ranking-skin').selectOption(skin);await savedAfter(page,count,'book');}
        for(const width of widths){await page.setViewportSize({width,height:width<500?844:1000});await editing(page);await geometry(page,{theme});await editing(page,false);await geometry(page,{theme});
          if(width===1440||width===390)await screenshot(page,`books-${theme}-${skin}-${width}.png`);
        }
      }await ctx.close();
    }
    return {layouts:report.layouts.length,screenshots:report.screenshots.length};
  });
  await check('English long book names also fit 390px in both skins',async()=>{
    const {page,ctx}=await context({language:'en',width:390});await template(page,'book');
    for(const skin of ['classic','tech']){await editing(page);if(await page.locator('#ranking-skin').inputValue()!==skin){const count=await page.evaluate(()=>__qaSaves);await page.locator('#ranking-skin').selectOption(skin);await savedAfter(page,count,'book');}await geometry(page,{theme:'light',language:'en'});await editing(page,false);await geometry(page,{theme:'light',language:'en'});await screenshot(page,'books-en-'+skin+'-390.png');}
    await ctx.close();
  });
  await check('acceptance uses only complete local assets without browser exceptions',async()=>{assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.externalRequests,[]);assert.deepEqual(report.missing,[]);});
}
run().catch(error=>{report.fatal=error.stack||String(error);console.error(report.fatal);process.exitCode=1;}).finally(async()=>{
  for(const ctx of contexts)await ctx.close().catch(()=>{});if(browser)await browser.close();report.finishedAt=new Date().toISOString();report.success=!report.fatal&&report.checks.every(check=>check.passed);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:report.success,checks:report.checks.length,layouts:report.layouts.length,screenshots:report.screenshots.length,report:path.join(output,'report.json')}));
});
