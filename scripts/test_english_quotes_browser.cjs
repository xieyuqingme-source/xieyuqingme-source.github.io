'use strict';
// Installed Chrome and locally intercepted publication files; clipboard is always a fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(process.env.WEBSITE_ROOT||process.cwd());
const site=path.resolve(process.env.WEBSITE_SITE||path.join(root,'_site_unified'));
const out=path.resolve(process.argv[2]||process.env.ENGLISH_CORNER_OUTPUT||path.join(root,'.local-checks/english-v3-20261030/p2-quotes-browser'));
const temporary=path.join(out,'temporary');fs.mkdirSync(temporary,{recursive:true});process.env.TEMP=temporary;process.env.TMP=temporary;process.env.TMPDIR=temporary;
let chromium;
try{({chromium}=require('playwright'));}
catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const original=JSON.parse(fs.readFileSync(path.join(root,'home/brief/english-quotes.json'),'utf8')).quotes;
const compare=(a,b)=>a<b?-1:a>b?1:0;
const quotes=original.slice().sort((a,b)=>a.first_published-b.first_published||compare(a.author_en,b.author_en)||compare(a.id,b.id));
const origin='http://english-quotes-v3.test',library='/english/quotes/',widths=[1440,1024,768,390,320];
const selectors={rows:'[data-english-quote-row]',visible:'[data-english-quote-row]:visible',author:'#ec-quote-author',period:'#ec-quote-period',theme:'#ec-quote-theme',more:'#ec-quote-more',random:'#ec-quote-random'};
const report={startedAt:new Date().toISOString(),quoteCount:quotes.length,checks:[],layouts:[],heights:[],listeners:[],screenshots:[],pageErrors:[],consoleErrors:[],consoleWarnings:[],missing:[],external:[],notes:[
  'Uses the installed Chrome channel with fresh nonpersistent contexts, never a user browser profile.',
  'All public files are served from the local build by request interception. No source website is fetched.',
  'All Clipboard operations use an explicit fixture capturing exact writeText arguments; the actual system Clipboard is never used.'
]};
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.xml':'application/xml','.mp3':'audio/mpeg','.wav':'audio/wav'};
let browser;
async function check(name,fn){
  console.log('CHECK '+name);const start=Date.now();
  try{const detail=await fn();report.checks.push({name,passed:true,ms:Date.now()-start,detail});console.log('PASS '+name);}
  catch(error){report.checks.push({name,passed:false,ms:Date.now()-start,error:error.stack});console.error('FAIL '+name+': '+error.message);}
}
function serve(route,options){return route.fulfill(options).catch(error=>{if(!/Target.*closed|Route is already handled|Invalid InterceptionId|Request.*(?:cancel|abort)/i.test(String(error)))throw error;});}
async function context({width=1440,theme='light',javascript=true}={}){
  const ctx=await browser.newContext({viewport:{width,height:width<500?844:1000},deviceScaleFactor:1,colorScheme:theme,javaScriptEnabled:javascript});ctx.setDefaultTimeout(14000);
  if(javascript)await ctx.addInitScript(({theme})=>{
    try{localStorage.setItem('xieyuqing-blog-theme',theme);}catch(_){}
    window.__qDocumentToken=performance.timeOrigin;window.__qRandom=.99999999;Math.random=()=>window.__qRandom;
    const NativeDate=Date,epoch=Date.parse('2026-10-30T04:00:00Z');window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[epoch]));}static now(){return epoch;}};
    window.__qClipboard={mode:'success',calls:[],pending:[]};
    Object.defineProperty(navigator,'clipboard',{configurable:true,get(){
      const state=window.__qClipboard;if(state.mode==='missing')return undefined;
      if(state.mode==='getter-error')throw new DOMException('Explicit fixture getter failure','SecurityError');
      return{writeText(text){state.calls.push(text);if(state.mode==='failure')return Promise.reject(new DOMException('Explicit fixture rejection','NotAllowedError'));if(state.mode==='pending')return new Promise(resolve=>state.pending.push(resolve));return Promise.resolve();}};
    }});
    window.__qEvents=[];const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,capture=options=>typeof options==='boolean'?options:!!options?.capture;
    EventTarget.prototype.addEventListener=function(type,fn,options){if(fn&&!__qEvents.some(e=>e.active&&e.target===this&&e.type===type&&e.fn===fn&&e.capture===capture(options)))__qEvents.push({target:this,type,fn,capture:capture(options),active:true});return add.call(this,type,fn,options);};
    EventTarget.prototype.removeEventListener=function(type,fn,options){for(const e of __qEvents)if(e.active&&e.target===this&&e.type===type&&e.fn===fn&&e.capture===capture(options))e.active=false;return remove.call(this,type,fn,options);};
  },{theme});
  await ctx.route('**/*',async route=>{
    const url=new URL(route.request().url());if(['data:','blob:'].includes(url.protocol))return route.continue();
    if(url.origin!==origin){report.external.push(url.href);return route.abort();}
    try{let file=path.resolve(site,'.'+decodeURIComponent(url.pathname));assert(file===site||file.startsWith(site+path.sep),'File must stay inside the local build');if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');return serve(route,{contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});}
    catch(error){report.missing.push({url:url.href,error:error.message});return serve(route,{status:404,body:'Missing local publication file'});}
  });
  ctx.on('page',page=>{page.on('pageerror',error=>report.pageErrors.push(error.stack||error.message));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());if(message.type()==='warning')report.consoleWarnings.push(message.text());});});
  return ctx;
}
async function using(options,fn){const ctx=await context(options),page=await ctx.newPage();try{return await fn(page,ctx);}finally{await ctx.close();}}
async function ready(page,route){
  const pathname=new URL(route||page.url(),origin).pathname;
  await page.waitForFunction(pathname=>window.SiteNavigation&&!SiteNavigation.state().transition&&location.pathname===pathname&&new URL(SiteNavigation.state().rendered).pathname===pathname,pathname);
  if(pathname===library)await page.waitForFunction(()=>document.querySelector('[data-english-quote-filters]')?.hidden===false);
  await page.evaluate(()=>document.fonts.ready);
}
async function go(page,route=library){await page.goto(origin+route);await ready(page,route);}
async function ids(page){return page.locator(selectors.visible).evaluateAll(rows=>rows.map(row=>row.id.replace(/^quote-/,'')));}
async function screenshot(page,name){await page.screenshot({path:path.join(out,name),fullPage:false,animations:'disabled'});report.screenshots.push(name);}
async function geometry(page,meta={}){
  const value=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,height:document.documentElement.scrollHeight,
    firstScreen:[...document.querySelectorAll('h1,[data-english-quote-filters],#ec-quote-count,[data-english-quote-row]:not([hidden])')].filter(n=>{const r=n.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;}).map(n=>n.id||n.tagName.toLowerCase()),
    internal:[...document.querySelectorAll('main *')].filter(n=>n.getClientRects().length&&/^(?:auto|scroll)$/.test(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+2).map(n=>n.id||n.className),
    clipped:[...document.querySelectorAll('.ec-library-original,.ec-library-translation')].filter(n=>n.getClientRects().length&&(getComputedStyle(n).textOverflow==='ellipsis'||!['none','0',''].includes(getComputedStyle(n).webkitLineClamp))).map(n=>n.id||n.className),
    controls:[...document.querySelectorAll('.ec-quote-tools select,.ec-quote-tools button,.ec-quote-actions button,#ec-quote-more')].filter(n=>n.getClientRects().length).map(n=>({name:n.id||n.textContent.trim(),width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}))}));
  assert(value.scroll<=value.width+1&&value.body<=value.width+1,JSON.stringify({...meta,...value}));assert.deepEqual(value.internal,[]);assert.deepEqual(value.clipped,[]);
  assert(value.controls.every(control=>control.height>=43.9),'Visible controls keep at least 44px touch height');report.layouts.push({...meta,...value});return value;
}
async function publicLink(page,href){const link=page.locator('a:visible').filter({hasText:/./});for(let i=0;i<await link.count();i++)if(await link.nth(i).getAttribute('href')===href){await link.nth(i).click();await ready(page,href);return;}throw new Error('No visible public link to '+href);}
const expectedCopy=quote=>[quote.text,quote.translation,quote.author_zh+'（'+quote.author_en+'） · '+quote.work_zh].join('\n\n');
async function status(page,id){return page.locator('#quote-'+id+' [data-english-quote-copy-status]').textContent();}

(async()=>{try{
  assert(quotes.length>=200);const html=fs.readFileSync(path.join(site,'english/quotes/index.html'),'utf8');assert(html.includes('id="ec-quote-theme"'),'P2 build artifact must contain the approved theme interface');
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-gpu','--disable-gpu-compositing']});report.browser=browser.version();report.site=site;report.launchArguments=['--disable-background-networking','--disable-gpu','--disable-gpu-compositing'];
  await check('default twenty, another twenty, full corpus and reset remain ordered',()=>using({},async page=>{
    await go(page);assert.deepEqual(await ids(page),quotes.slice(0,20).map(q=>q.id));assert.match(await page.locator('#ec-quote-count').textContent(),new RegExp('20\\s*\\/\\s*'+quotes.length));
    await page.locator(selectors.more).click();assert.deepEqual(await ids(page),quotes.slice(0,40).map(q=>q.id));assert.match(await page.locator('#ec-quote-count').textContent(),new RegExp('40\\s*\\/\\s*'+quotes.length));
    for(let i=0;i<Math.ceil(quotes.length/20)&&await page.locator(selectors.more).isVisible();i++)await page.locator(selectors.more).click();assert.deepEqual(await ids(page),quotes.map(q=>q.id));assert.equal(await page.locator(selectors.more).isVisible(),false);
    await page.locator(selectors.theme).selectOption('learning');assert.deepEqual(await ids(page),quotes.filter(q=>q.themes.includes('learning')).slice(0,20).map(q=>q.id));
    return{default:20,afterMore:40,fullCorpus:quotes.length};
  }));
  await check('theme author and period filters intersect, preserve public URL state and expose empty selections',()=>using({},async page=>{
    await go(page,library+'?from=reader');const quote=quotes.find(q=>q.themes.includes('learning')),period=String(Math.floor(quote.first_published/100)*100);
    await page.locator(selectors.theme).selectOption('learning');await page.locator(selectors.author).selectOption(quote.author_zh);await page.locator(selectors.period).selectOption(period);
    const expected=quotes.filter(q=>q.themes.includes('learning')&&q.author_zh===quote.author_zh&&String(Math.floor(q.first_published/100)*100)===period);
    assert.deepEqual(await ids(page),expected.slice(0,20).map(q=>q.id));let params=new URL(page.url()).searchParams;
    assert.equal(params.get('theme'),'learning');assert.equal(params.get('author'),quote.author_zh);assert.equal(params.get('period'),period);assert.equal(params.get('from'),'reader');
    await screenshot(page,'p2-theme-filter-desktop.png');
    const emptyPeriod=[...new Set(quotes.map(q=>String(Math.floor(q.first_published/100)*100)))].find(p=>!quotes.some(q=>q.author_zh===quote.author_zh&&String(Math.floor(q.first_published/100)*100)===p));assert(emptyPeriod);
    await page.locator(selectors.period).selectOption(emptyPeriod);assert.deepEqual(await ids(page),[]);assert.equal(await page.locator('#ec-quote-empty').isVisible(),true);assert.equal(await page.locator(selectors.random).isDisabled(),true);assert.equal(await page.locator(selectors.more).isVisible(),false);
    await go(page,library+'?author=invalid&period=9999&theme=invalid&from=reader');assert.equal(await page.locator(selectors.author).inputValue(),'all');assert.equal(await page.locator(selectors.period).inputValue(),'all');assert.equal(await page.locator(selectors.theme).inputValue(),'all');params=new URL(page.url()).searchParams;
    assert.equal(params.get('from'),'reader');for(const key of ['author','period','theme'])assert.equal(params.has(key),false);assert.equal((await ids(page)).length,20);
    return{combinedMatches:expected.length,emptyPeriod};
  }));
  await check('random and direct deep links add only their target rather than the previous 190 rows',()=>using({},async page=>{
    await go(page);const last=quotes.at(-1);await page.locator(selectors.random).click();assert.equal(new URL(page.url()).hash,'#quote-'+last.id);assert.equal((await ids(page)).length,21);assert.equal(await page.locator('#quote-'+last.id).isVisible(),true);assert.equal(await page.locator('#quote-'+quotes.at(-2).id).isVisible(),false);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'quote-'+last.id);await page.locator(selectors.more).click();assert.equal((await ids(page)).length,41);assert.deepEqual(await ids(page),[...quotes.slice(0,40).map(q=>q.id),last.id]);
    const deep=quotes[190];await go(page,library+'#quote-'+deep.id);assert.equal((await ids(page)).length,21);assert.equal(await page.locator('#quote-'+deep.id).isVisible(),true);assert.equal(await page.locator('#quote-'+quotes[189].id).isVisible(),false);
    const period=String(Math.floor(deep.first_published/100)*100),differentAuthor=quotes.find(q=>q.author_zh!==deep.author_zh).author_zh;
    await go(page,library+'?author='+encodeURIComponent(differentAuthor)+'&period='+period+'&theme='+deep.themes[0]+'#quote-'+deep.id);assert.equal(await page.locator(selectors.author).inputValue(),'all');assert.equal(await page.locator(selectors.period).inputValue(),period);assert.equal(await page.locator(selectors.theme).inputValue(),deep.themes[0]);assert.equal(await page.locator('#quote-'+deep.id).isVisible(),true);
    return{randomVisible:21,afterMore:41,deepIndex:190,deepVisible:21};
  }));
  await check('copy captures exact original verse translation and author/work, with explicit manual fallback',()=>using({},async page=>{
    const quote=quotes.find((q,index)=>index>=20&&q.text.includes('\n'));assert(quote,'Corpus needs a real reviewed verse-line case');
    for(const mode of ['success','missing','failure','getter-error']){
      await go(page,library+'?copy-fixture='+mode+'#quote-'+quote.id);await page.evaluate(mode=>{__qClipboard.mode=mode;},mode);assert.equal(await status(page,quote.id),'');
      await page.locator('#quote-'+quote.id+' [data-english-quote-copy]').click();
      if(mode==='success'){await page.waitForFunction(()=>window.__qClipboard.calls.length===1);assert.equal((await page.evaluate(()=>__qClipboard.calls))[0],expectedCopy(quote));await page.waitForFunction(id=>document.querySelector('#quote-'+id+' [data-english-quote-copy-status]').textContent.includes('已复制'),quote.id);}
      else{await page.waitForFunction(id=>document.querySelector('#quote-'+id+' [data-english-quote-copy-status]').textContent.includes('手动选中'),quote.id);assert.match(await status(page,quote.id),/手动选中/);assert.equal(await page.evaluate(()=>__qClipboard.calls.length),mode==='failure'?1:0);}
    }
    return{poetry:quote.id,exactBytes:Buffer.byteLength(expectedCopy(quote)),fixtureModes:['success','missing','failure','getter-error'],systemClipboardUsed:false};
  }));
  await check('multiple SPA returns clean old listeners and a pending copy cannot mutate an outgoing page',()=>using({},async page=>{
    await go(page);const token=await page.evaluate(()=>__qDocumentToken),counts=[];
    for(let turn=0;turn<3;turn++){
      const count=await page.evaluate(()=>{const root=document.querySelector('[data-english-quote-library]');window.__qOldRoot=root;window.__qOldStatus=root.querySelector('[data-english-quote-copy-status]');return __qEvents.filter(e=>e.active&&(e.target===root||e.target instanceof Node&&root.contains(e.target))).length;});counts.push(count);assert(count>=quotes.length+5);
      if(turn===0){await page.evaluate(()=>{__qClipboard.mode='pending';});await page.locator(selectors.visible+' [data-english-quote-copy]').first().click();await page.waitForFunction(()=>__qClipboard.pending.length===1);}
      await publicLink(page,'/english/');assert.equal(await page.evaluate(()=>__qDocumentToken),token);
      const old=await page.evaluate(()=>({active:__qEvents.filter(e=>e.active&&(e.target===__qOldRoot||e.target instanceof Node&&__qOldRoot.contains(e.target))).length,hidden:__qOldStatus.hidden,text:__qOldStatus.textContent}));assert.equal(old.active,0);assert.equal(old.hidden,true);assert.equal(old.text,'');
      if(turn===0){await page.evaluate(()=>{__qClipboard.pending.splice(0).forEach(fn=>fn());__qClipboard.mode='success';});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.deepEqual(await page.evaluate(()=>({hidden:__qOldStatus.hidden,text:__qOldStatus.textContent})),{hidden:true,text:''});}
      await publicLink(page,library);assert.equal(await page.evaluate(()=>__qDocumentToken),token);assert.equal((await ids(page)).length,20);await page.locator(selectors.more).click();assert.equal((await ids(page)).length,40);
    }
    assert(counts.every(count=>count===counts[0]),'SPA return must not accumulate handlers');report.listeners.push({route:library,rounds:counts,departedActive:0,pendingCopyGuarded:true});return counts;
  }));
  await check('no JavaScript exposes the complete source-backed corpus with hidden enhancement controls',()=>using({width:390,javascript:false},async page=>{
    await page.goto(origin+library);assert.equal(await page.locator(selectors.rows).count(),quotes.length);assert.equal(await page.locator(selectors.visible).count(),quotes.length);assert.equal(await page.locator('[data-english-quote-filters]').isVisible(),false);assert.equal(await page.locator(selectors.more).isVisible(),false);assert.equal(await page.locator('[data-english-quote-copy]:visible').count(),0);
    const content=await page.locator(selectors.rows).evaluateAll(rows=>{const text=node=>{const copy=node.cloneNode(true);copy.querySelectorAll('br').forEach(br=>br.replaceWith('\n'));return copy.textContent;};return rows.map(row=>({id:row.id.slice(6),text:text(row.querySelector('.ec-library-original')),translation:text(row.querySelector('.ec-library-translation'))}));});
    assert.deepEqual(content,quotes.map(({id,text,translation})=>({id,text,translation})));
    const result=await geometry(page,{javascript:false,width:390});report.heights.push({javascript:false,width:390,height:result.height});await screenshot(page,'p2-nojs-390.png');return{rows:quotes.length,height:result.height};
  }));
  await check('five viewport widths in light and dark keep uncut verse, readable tools and zero horizontal overflow',async()=>{
    for(const theme of ['light','dark'])for(const width of widths)await using({width,theme},async page=>{
      await go(page);assert.equal((await ids(page)).length,20);const result=await geometry(page,{theme,width,javascript:true});report.heights.push({theme,width,height:result.height,firstScreen:result.firstScreen});await screenshot(page,'p2-library-'+theme+'-'+width+'.png');
      await page.locator(selectors.theme).selectOption('learning');assert.deepEqual(await ids(page),quotes.filter(q=>q.themes.includes('learning')).slice(0,20).map(q=>q.id));await geometry(page,{theme,width,filtered:'learning'});
      if(width===390&&theme==='light')await screenshot(page,'p2-theme-filter-mobile.png');
    });return{widths,themes:['light','dark'],combinations:10};
  });
  await check('no page/console errors missing files or external requests',async()=>{
    assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.consoleWarnings,[]);assert.deepEqual(report.missing,[]);assert.deepEqual(report.external,[]);return{pageErrors:0,consoleErrors:0,consoleWarnings:0,missing:0,external:0};
  });
}catch(error){report.pageErrors.push(error.stack||String(error));console.error(error.stack);}finally{
  await browser?.close();report.finishedAt=new Date().toISOString();report.success=report.checks.length===8&&report.checks.every(c=>c.passed)&&!report.pageErrors.length&&!report.consoleErrors.length&&!report.consoleWarnings.length&&!report.missing.length&&!report.external.length;
  fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:report.success,checks:report.checks.length,report:path.join(out,'browser-report.json'),screenshots:report.screenshots.length}));if(!report.success)process.exitCode=1;
}})();
