// Build first. Uses existing Playwright/Chrome and a fresh, intercepted local origin.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(process.env.WEBSITE_ROOT||path.resolve(__dirname,'..')),site=path.resolve(process.env.WEBSITE_SITE||process.argv[2]||path.join(root,'_site_unified'));
const output=path.resolve(process.argv[3]||path.join(root,'.local-checks/english-v2-20261029/learning-browser-p2'));
const quotes=JSON.parse(fs.readFileSync(path.join(root,'home/brief/english-quotes.json'),'utf8')).quotes;
const modes=['origins','etymology','usage','authors'],compare=(a,b)=>a<b?-1:a>b?1:0;
const orderedQuotes=quotes.slice().sort((a,b)=>a.first_published-b.first_published||compare(a.author_en,b.author_en)||compare(a.id,b.id));
const origin='http://english-learning.test',widths=[1440,1024,768,390,320],epoch=Date.parse('2026-10-29T04:00:00Z');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav'};
const report={startedAt:new Date().toISOString(),quoteCount:quotes.length,checks:[],rounds:[],layouts:[],listeners:[],screenshots:[],pageErrors:[],consoleErrors:[],missing:[],external:[],weatherFixtures:[],notes:['Chrome uses fresh nonpersistent contexts, never an existing user profile.','All site files are served by local request interception. Original external sources are checked as links, never automatically fetched.','The Today weather request is intercepted as a deterministic local fixture. Counts and author/period expectations come from the current shared quotation corpus.']};
let browser;const contexts=[];
function fileFor(href){
  const url=new URL(href,origin);assert.equal(url.origin,origin,'Reading target must stay on the local publication');
  let file=path.resolve(site,'.'+decodeURIComponent(url.pathname)),relative=path.relative(site,file);assert(!relative.startsWith('..')&&!path.isAbsolute(relative),'Reading target escapes publication');
  if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');assert(fs.statSync(file).isFile());return {url,file};
}
function localTarget(href){const {url,file}=fileFor(href);if(url.hash){const id=decodeURIComponent(url.hash.slice(1)),html=fs.readFileSync(file,'utf8');assert(html.includes('id="'+id+'"')||html.includes("id='"+id+"'"),'Missing actual reading anchor: '+href);}return href;}
async function check(name,fn){const started=Date.now();console.log('CHECK '+name);try{const detail=await fn();report.checks.push({name,passed:true,ms:Date.now()-started,detail});console.log('PASS '+name);}catch(error){report.checks.push({name,passed:false,ms:Date.now()-started,error:error.stack});throw error;}}
async function context({width=1440,theme='light',javascript=true,badJSON=false}={}){
  const ctx=await browser.newContext({viewport:{width,height:width<500?844:1000},deviceScaleFactor:1,colorScheme:theme,javaScriptEnabled:javascript});contexts.push(ctx);ctx.setDefaultTimeout(16000);
  if(javascript)await ctx.addInitScript(({theme,epoch})=>{
    try{localStorage.setItem('xieyuqing-blog-theme',theme);}catch(_){}
    const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[epoch]));}static now(){return epoch;}};Math.random=()=>0.371;window.__learningDocumentToken=performance.timeOrigin;
    window.__learningEvents=[];const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,capture=options=>typeof options==='boolean'?options:!!options?.capture;
    EventTarget.prototype.addEventListener=function(type,fn,options){if(fn&&!__learningEvents.some(entry=>entry.active&&entry.target===this&&entry.type===type&&entry.fn===fn&&entry.capture===capture(options)))__learningEvents.push({target:this,type,fn,capture:capture(options),active:true});return add.call(this,type,fn,options);};
    EventTarget.prototype.removeEventListener=function(type,fn,options){for(const entry of __learningEvents)if(entry.active&&entry.target===this&&entry.type===type&&entry.fn===fn&&entry.capture===capture(options))entry.active=false;return remove.call(this,type,fn,options);};
  },{theme,epoch});
  await ctx.route('**/*',async route=>{
    const href=route.request().url();if(/^(?:data|blob):/.test(href))return route.continue();const url=new URL(href);
    if(url.origin==='https://api.open-meteo.com'){report.weatherFixtures.push(href);return route.fulfill({contentType:'application/json',body:JSON.stringify({timezone:url.searchParams.get('timezone')||'Asia/Shanghai',current:{time:'2026-10-29T12:00',temperature_2m:21.4,weather_code:3,apparent_temperature:20.2,relative_humidity_2m:65,wind_speed_10m:12,wind_direction_10m:180,pressure_msl:1015},daily:{time:['2026-10-29'],temperature_2m_max:[25],temperature_2m_min:[18],precipitation_probability_max:[15]}})});}
    if(url.origin!==origin){report.external.push(href);return route.abort();}
    try{const {file}=fileFor(href);let body=fs.readFileSync(file);if(badJSON&&url.pathname==='/english/play/')body=Buffer.from(body.toString('utf8').replace(/(<script[^>]*id="english-quiz-data"[^>]*>)[\s\S]*?(<\/script>)/,'$1{invalid JSON$2'));return route.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body});}
    catch(error){report.missing.push({url:href,error:error.message});return route.fulfill({status:404,body:'Missing local publication file'});}
  });
  ctx.on('page',page=>{page.on('pageerror',error=>report.pageErrors.push(error.stack||error.message));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});});return ctx;
}
async function ready(page,expected){const pathname=expected?new URL(expected,origin).pathname:new URL(page.url()).pathname;await page.waitForFunction(pathname=>window.SiteNavigation&&!SiteNavigation.state().transition&&location.pathname===pathname&&new URL(SiteNavigation.state().rendered).pathname===pathname,pathname);await page.evaluate(()=>document.fonts.ready);}
async function go(page,route){await page.goto(origin+route);await ready(page,route);}
async function clickRoute(page,href){let locator=page.locator('a:visible');let count=await locator.count();for(let i=0;i<count;i++)if(await locator.nth(i).getAttribute('href')===href){await locator.nth(i).click();await ready(page,href);return;}if(href==='/articles/'&&await page.locator('[data-nav-group="articles"] > summary').count()){await page.locator('[data-nav-group="articles"] > summary').click();locator=page.locator('a:visible');count=await locator.count();for(let i=0;i<count;i++)if(await locator.nth(i).getAttribute('href')===href){await locator.nth(i).click();await ready(page,href);return;}}throw new Error('No visible public link to '+href);}
async function screenshot(page,name,fullPage=true){await page.screenshot({path:path.join(output,name),fullPage,animations:'disabled'});report.screenshots.push(name);}
async function noOverflow(page,detail={}){
  const result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,clipped:Array.from(document.querySelectorAll('.ec-quiz-choice,.ec-quiz-explanation,.ec-library-original,.ec-library-translation')).filter(node=>node.getClientRects().length&&(getComputedStyle(node).textOverflow==='ellipsis'||!['none','0'].includes(getComputedStyle(node).webkitLineClamp))).map(node=>node.className)}));
  assert(result.scroll<=result.width+1&&result.body<=result.width+1,JSON.stringify({...detail,...result}));assert.deepEqual(result.clipped,[]);report.layouts.push({...detail,...result});return result;
}
async function pools(page){return page.locator('#english-quiz-data').evaluate(node=>JSON.parse(node.textContent));}
async function quizReady(page){await page.waitForFunction(()=>{const count=document.querySelectorAll('[data-quiz-choice]').length,mode=document.querySelector('[data-english-play]')?.getAttribute('data-quiz-current-mode');return document.querySelector('[data-quiz-ui]')?.hidden===false&&(mode==='usage'?[2,3].includes(count):count===4);});}
async function currentQuestion(page){const game=page.locator('[data-english-play]'),id=await game.getAttribute('data-quiz-question-id'),mode=await game.getAttribute('data-quiz-current-mode'),question=(await pools(page))[mode]?.find(q=>q.id===id);assert(question,'Displayed question must belong to the active mode');return question;}
async function answer(page,question,correct,index=0){
  const options=await page.locator('[data-quiz-choice]').allTextContents();assert.deepEqual(options.slice().sort(),question.choices.slice().sort());
  const value=correct?question.answer:question.choices.find(choice=>choice!==question.answer),choice=page.locator('[data-quiz-choice]').nth(options.indexOf(value));
  await choice.focus();await choice.press(index%2?'Space':'Enter');
  assert.equal(await page.locator('[data-quiz-feedback]').isVisible(),true);assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-quiz-feedback')),true);
  assert.equal(await page.locator('[data-quiz-feedback]').getAttribute('aria-live'),'polite');assert.equal(await page.locator('[data-quiz-feedback] .ec-quiz-explanation').textContent(),question.explanation);
  assert.equal(await page.locator('[data-quiz-choice]:disabled').count(),question.choices.length);
  const links=await page.locator('[data-quiz-feedback] a').evaluateAll(nodes=>nodes.map(node=>({href:node.getAttribute('href'),label:node.textContent,target:node.getAttribute('target'),rel:node.getAttribute('rel')})));
  assert(links.some(link=>link.href===question.reading));localTarget(question.reading);assert(links.some(link=>link.href.startsWith('/english/quotes/')),'Every answer must link to the complete quotation library');
  for(const source of question.sources){const link=links.find(link=>link.href===source.url&&link.label===source.label);assert(link,'Missing exact source link: '+source.url);if(source.url.startsWith('https://')){assert.equal(link.target,'_blank');assert.match(link.rel,/noopener/);assert.match(link.rel,/noreferrer/);}else localTarget(source.url);}
  if(question.translation)assert.equal(await page.locator('[data-quiz-feedback] .ec-quiz-translation').textContent(),question.translation);
  const before=await page.locator('[data-quiz-progress]').textContent();await choice.dispatchEvent('click');await choice.dispatchEvent('click');assert.equal(await page.locator('[data-quiz-progress]').textContent(),before,'Repeated answer events cannot increase the score');
  return value;
}
async function finishRound(page,mode){
  await page.locator('[data-quiz-mode="'+mode+'"]').click();await quizReady(page);const bank=(await pools(page))[mode],seen=new Set(),authors=new Set(),wrong=[];let score=0;
  for(let index=0;index<10;index++){
    const id=await page.locator('[data-english-play]').getAttribute('data-quiz-question-id'),question=bank.find(question=>question.id===id);assert(question);assert(!seen.has(id),'Question repeated within one round');seen.add(id);if(mode==='authors')authors.add(question.answer);
    await page.locator('[data-quiz-next]').dispatchEvent('click');assert.equal(await page.locator('[data-english-play]').getAttribute('data-quiz-question-id'),id,'Unanswered questions cannot be skipped');
    if(question.english)assert.equal(await page.locator('[data-quiz-english]').textContent(),question.english);
    const correct=mode==='etymology'||mode==='authors'&&index%2===0,chosen=await answer(page,question,correct,index);if(correct)score++;else wrong.push({question,chosen});
    assert.match(await page.locator('[data-quiz-progress]').textContent(),new RegExp('答对 '+score+' 题'));
    await page.locator('[data-quiz-next]').focus();await page.locator('[data-quiz-next]').press('Enter');
    if(index<9)assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-quiz-prompt')),true);
  }
  if(mode==='authors')assert.equal(authors.size,Math.min(10,new Set(bank.map(question=>question.answer)).size));
  assert.equal(await page.locator('[data-quiz-results]').isVisible(),true);assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-quiz-results')),true);assert.match(await page.locator('[data-quiz-results] h2').textContent(),new RegExp('答对 '+score+' / 10'));
  assert.equal(await page.locator('.ec-quiz-review > li').count(),wrong.length);
  for(let index=0;index<wrong.length;index++){const item=page.locator('.ec-quiz-review > li').nth(index),{question,chosen}=wrong[index],text=await item.textContent();assert(text.includes(question.explanation)&&text.includes(question.answer)&&text.includes(chosen));assert(await item.locator('a[href="/english/quotes/"]').count()||await item.locator('a').evaluateAll(nodes=>nodes.some(node=>node.getAttribute('href').startsWith('/english/quotes/'))));}
  report.rounds.push({mode,questions:Array.from(seen),authors:authors.size,score,wrong:wrong.length});
  await page.locator('[data-quiz-restart]').click();await quizReady(page);assert.match(await page.locator('[data-quiz-progress]').textContent(),/第 1 \/ 10 题 · 答对 0 题/);assert.equal(await page.locator('[data-english-play]').getAttribute('data-quiz-current-mode'),mode);
}
async function listenerSnapshot(page,label){
  const state=await page.evaluate(()=>{
    const quizControls='[data-quiz-mode],[data-quiz-choices],[data-quiz-next],[data-quiz-restart],[data-quiz-change-mode],[data-quiz-show-translation],[data-quiz-show-hint]';
    const libraryControls='#ec-quote-author,#ec-quote-period,#ec-quote-theme,#ec-quote-more,#ec-quote-random,[data-english-quote-copy],[data-english-quote-filters]';
    const relevant=target=>target instanceof Element&&(target.matches(quizControls)||target.matches(libraryControls));
    const active=__learningEvents.filter(entry=>entry.active);
    return {quiz:active.filter(entry=>entry.target instanceof Element&&entry.target.matches(quizControls)).length,library:active.filter(entry=>entry.target instanceof Element&&entry.target.matches(libraryControls)).length,detached:active.filter(entry=>relevant(entry.target)&&!entry.target.isConnected).length,popstate:active.filter(entry=>entry.target===window&&entry.type==='popstate').length};
  });report.listeners.push({label,...state});assert.equal(state.detached,0,'Leaving a learning page must remove its old element listeners');return state;
}
function filterCase(){
  const periods=Array.from(new Set(quotes.map(q=>String(Math.floor(q.first_published/100)*100))));
  for(const q of quotes){const own=quotes.filter(item=>item.author_zh===q.author_zh),empty=periods.find(period=>!own.some(item=>String(Math.floor(item.first_published/100)*100)===period));if(empty)return {author:q.author_zh,period:String(Math.floor(q.first_published/100)*100),empty};}
  throw new Error('The corpus needs at least one empty author/period combination for acceptance');
}
async function visibleQuoteIDs(page){return page.locator('[data-english-quote-row]:visible').evaluateAll(rows=>rows.map(row=>row.id).sort());}
async function run(){
  fs.mkdirSync(output,{recursive:true});const temporary=path.join(output,'temporary');fs.mkdirSync(temporary,{recursive:true});process.env.TEMP=temporary;process.env.TMP=temporary;process.env.TMPDIR=temporary;
  let playwright;for(const candidate of [process.env.PLAYWRIGHT_MODULE,'playwright',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){try{playwright=require(candidate);break;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}}
  assert(playwright,'Existing Playwright required.');browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':undefined),args:['--disable-gpu','--disable-gpu-compositing'],downloadsPath:path.join(temporary,'downloads'),env:{...process.env,TEMP:temporary,TMP:temporary,TMPDIR:temporary}});
  await check('all four quiz modes complete ten unique questions with correct scoring, source links and review',async()=>{
    const ctx=await context(),page=await ctx.newPage();await go(page,'/english/play/');await quizReady(page);
    assert.equal(await page.locator('[data-english-play]').getAttribute('data-quiz-current-mode'),'origins');
    assert.deepEqual(await page.locator('[data-quiz-mode]').evaluateAll(buttons=>buttons.map(button=>button.getAttribute('data-quiz-mode'))),modes);
    for(const mode of modes)await finishRound(page,mode);await ctx.close();
  });
  await check('native quiz controls have 44px targets and LF poems keep their line breaks',async()=>{
    const ctx=await context({width:390}),page=await ctx.newPage();await go(page,'/english/play/');await quizReady(page);
    for(const box of await page.locator('[data-quiz-choice],[data-quiz-mode]').evaluateAll(nodes=>nodes.map(node=>({height:node.getBoundingClientRect().height,width:node.getBoundingClientRect().width,tag:node.tagName,type:node.type})))){assert(box.height>=44&&box.width>=44,JSON.stringify(box));assert.equal(box.tag,'BUTTON');assert.equal(box.type,'button');}
    assert.match(await page.locator('[data-quiz-english]').evaluate(node=>getComputedStyle(node).whiteSpace),/pre-line|pre-wrap|break-spaces/);await ctx.close();
  });
  await check('quotation library combines author/period filters, shows empty results and restores query state',async()=>{
    const pair=filterCase(),query='?keep=1&author='+encodeURIComponent(pair.author)+'&period='+pair.period,ctx=await context(),page=await ctx.newPage();await go(page,'/english/quotes/?keep=1');
    assert.deepEqual(await visibleQuoteIDs(page),orderedQuotes.slice(0,20).map(q=>'quote-'+q.id).sort());await page.locator('#ec-quote-more').click();assert.deepEqual(await visibleQuoteIDs(page),orderedQuotes.slice(0,40).map(q=>'quote-'+q.id).sort());
    await go(page,'/english/quotes/'+query);
    const expected=orderedQuotes.filter(q=>q.author_zh===pair.author&&String(Math.floor(q.first_published/100)*100)===pair.period).slice(0,20).map(q=>'quote-'+q.id).sort();assert(expected.length);assert.equal(await page.locator('[data-english-quote-row]').count(),quotes.length);assert.deepEqual(await visibleQuoteIDs(page),expected);
    assert.equal(await page.locator('#ec-quote-author').inputValue(),pair.author);assert.equal(await page.locator('#ec-quote-period').inputValue(),pair.period);
    await page.locator('#ec-quote-period').selectOption(pair.empty);assert.equal(await page.locator('#ec-quote-empty').isVisible(),true);assert.deepEqual(await visibleQuoteIDs(page),[]);assert.equal(new URL(page.url()).searchParams.get('keep'),'1');
    await page.reload();await ready(page);assert.equal(await page.locator('#ec-quote-period').inputValue(),pair.empty);assert.equal(await page.locator('#ec-quote-empty').isVisible(),true);
    await page.locator('#ec-quote-period').selectOption(pair.period);assert.deepEqual(await visibleQuoteIDs(page),expected);await ctx.close();return pair;
  });
  await check('without JavaScript the complete quotation corpus and quiz reading alternatives remain readable',async()=>{
    const ctx=await context({javascript:false,width:390}),page=await ctx.newPage();await page.goto(origin+'/english/quotes/?author=ignored&period=ignored');assert.equal(await page.locator('[data-english-quote-row]:visible').count(),quotes.length);assert.equal(await page.locator('[data-english-quote-filters]').isVisible(),false);
    const rows=await page.locator('[data-english-quote-row]').evaluateAll(nodes=>nodes.map(node=>({id:node.id,text:node.querySelector('.ec-library-original').textContent,breaks:node.querySelector('.ec-library-original').querySelectorAll('br').length})));
    for(const row of rows){const q=quotes.find(q=>'quote-'+q.id===row.id);assert(q);assert.equal(row.text,q.text.replace(/\n/g,''));assert.equal(row.breaks,(q.text.match(/\n/g)||[]).length);}
    await page.goto(origin+'/english/play/');assert.equal(await page.locator('[data-quiz-ui]').isVisible(),false);assert.match(await page.locator('main').innerText(),/小测验需要 JavaScript/);assert(await page.locator('noscript a[href="/english/quotes/"]').isVisible());assert(await page.locator('noscript a').count()>=9);await ctx.close();
  });
  await check('Today quotation notes expose the library entry in Chinese and English',async()=>{
    const ctx=await context({width:390}),page=await ctx.newPage();for(const route of ['/today/','/en/today/']){await go(page,route);const link=page.locator('#english-quote-library-link'),details=link.locator('xpath=ancestor::details');if(!await details.evaluate(node=>node.open))await details.locator('summary').press('Enter');assert.equal(await link.isVisible(),true);assert.equal(await link.getAttribute('href'),'/english/quotes/');localTarget(await link.getAttribute('href'));await noOverflow(page,{route,theme:'light'});}await ctx.close();
  });
  await check('bad quiz JSON produces a visible error outside the hidden interactive UI',async()=>{
    const ctx=await context({badJSON:true,width:390}),page=await ctx.newPage();await go(page,'/english/play/');assert.equal(await page.locator('[data-quiz-ui]').isVisible(),false);assert.equal(await page.locator('[data-quiz-error]').isVisible(),true);assert.equal(await page.locator('[data-quiz-error]').evaluate(node=>node.closest('[data-quiz-ui]')===null),true);await screenshot(page,'quiz-bad-json-390.png');await ctx.close();
  });
  await check('SPA reading loops clean quiz/library listeners and history returns without reloading',async()=>{
    const ctx=await context(),page=await ctx.newPage();await go(page,'/english/');const documentToken=await page.evaluate(()=>__learningDocumentToken);let popstate;
    for(let loop=0;loop<3;loop++){
      await clickRoute(page,'/english/play/');await quizReady(page);const quiz=await listenerSnapshot(page,'quiz-'+loop);assert.equal(quiz.quiz,modes.length+6);assert.equal(quiz.library,0);if(popstate===undefined)popstate=quiz.popstate;else assert.equal(quiz.popstate,popstate);
      assert.equal(await page.locator('[data-english-play]').getAttribute('data-quiz-current-mode'),'origins');const q=await currentQuestion(page);
      await answer(page,q,true);const libraryLink=page.locator('[data-quiz-feedback] a:visible');let href;for(const anchor of await libraryLink.all()){const candidate=await anchor.getAttribute('href');if(candidate.startsWith('/english/quotes/')){href=candidate;break;}}assert(href);await clickRoute(page,href);
      const library=await listenerSnapshot(page,'library-'+loop);assert.equal(library.quiz,0);assert.equal(library.library,quotes.length+7);
      await clickRoute(page,'/articles/');const article=await page.locator('main a').evaluateAll(links=>links.map(link=>link.getAttribute('href')).find(href=>href&&href.startsWith('/articles/')&&href.endsWith('.html')&&href.split('/').length>3));assert(article);await clickRoute(page,article);assert((await listenerSnapshot(page,'article-'+loop)).quiz===0);
      await page.goBack();await ready(page,'/articles/');await page.goBack();await ready(page,'/english/quotes/');assert.equal(new URL(page.url()).pathname,'/english/quotes/');assert.equal((await listenerSnapshot(page,'back-library-'+loop)).library,quotes.length+7);
      await clickRoute(page,'/english/');assert.equal(await page.evaluate(()=>__learningDocumentToken),documentToken);
    }await ctx.close();
  });
  await check('five widths and both themes keep quiz, library and learning entrances in normal reading flow',async()=>{
    const pair=filterCase();for(const theme of ['light','dark']){const ctx=await context({theme}),page=await ctx.newPage();for(const width of widths){await page.setViewportSize({width,height:width<500?844:1000});for(const route of ['/english/','/english/play/','/english/quotes/']){
      await go(page,route);await noOverflow(page,{route,theme,width});if(route==='/english/play/'){await quizReady(page);const q=await currentQuestion(page);await answer(page,q,false);await noOverflow(page,{route,theme,width,state:'feedback'});if(width===1440&&theme==='light'||width===390)await screenshot(page,`quiz-${theme}-${width}.png`);}
      if(route==='/english/quotes/'&&width===390){await page.locator('#ec-quote-author').selectOption(pair.author);await page.locator('#ec-quote-period').selectOption(pair.period);await screenshot(page,`library-${theme}-390.png`,false);}
      if(route==='/english/'&&width===390&&theme==='light'){await page.locator('[data-ec-quick]').scrollIntoViewIfNeeded();await screenshot(page,'learning-entries-390.png',false);}
    }}await ctx.close();}return {layouts:report.layouts.length,widths,themes:2};
  });
  await check('no console errors, missing resources or automatic external source requests occur',async()=>{assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.missing,[]);assert.deepEqual(report.external,[]);});
}
run().catch(error=>{report.fatal=error.stack||String(error);console.error(report.fatal);process.exitCode=1;}).finally(async()=>{
  for(const ctx of contexts)await ctx.close().catch(()=>{});await browser?.close();report.finishedAt=new Date().toISOString();report.success=!report.fatal&&report.checks.every(check=>check.passed);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:report.success,checks:report.checks.length,layouts:report.layouts.length,quotes:quotes.length,screenshots:report.screenshots.length,report:path.join(output,'report.json')}));
});
