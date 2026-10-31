'use strict';
// Installed Chrome against a local publication. Interact through rendered controls;
// the emitted public JSON is the answer oracle, never a replacement game model.
// Usage: node scripts/test_english_quiz_browser.cjs [output-directory]
// WEBSITE_ROOT defaults to cwd; WEBSITE_SITE defaults to _site_unified.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=path.resolve(process.env.WEBSITE_ROOT||process.cwd());
const site=path.resolve(process.env.WEBSITE_SITE||path.join(root,'_site_unified'));
const out=path.resolve(process.argv[2]||path.join(root,'.local-checks/english-v3-20261030/p2-quiz-browser'));
const origin='http://english-quiz.test',modes=['origins','etymology','usage','authors'],widths=[1440,1024,768,390,320];
const report={startedAt:new Date().toISOString(),browserChannel:'chrome',checks:[],errors:[],consoleErrors:[],missing:[],external:[],screenshots:[],layouts:[],rounds:[]};
let browser;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const config=JSON.parse(fs.readFileSync(path.join(root,'english-corner/quiz.json'),'utf8'));
const cards=JSON.parse(fs.readFileSync(path.join(root,'english-corner/catalog.json'),'utf8')).cards;
const corpus=JSON.parse(fs.readFileSync(path.join(root,'home/brief/english-quotes.json'),'utf8')).quotes;
const quotesById=new Map(corpus.map(q=>[q.id,q]));
const familiar=new Set(config.warmup_quotes.map(id=>{const q=quotesById.get(id);assert(q,'Warm-up references a real shared quotation');return q.author_zh+'（'+q.author_en+'）';}));
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.wav':'audio/wav','.mp3':'audio/mpeg','.xml':'application/xml','.ico':'image/x-icon'};
const navigationLoads=new WeakMap();
function preflight(){
 const html=fs.readFileSync(path.join(site,'english/play/index.html'),'utf8');
 for(const marker of ['data-quiz-mode="usage"','data-quiz-show-hint','data-quiz-change-mode'])assert(html.includes(marker),'Refuse a stale publication: '+marker);
 const match=html.match(/<script\b[^>]*id="english-quiz-data"[^>]*>([\s\S]*?)<\/script>/i);assert(match,'Published public quiz data exists');
 const pools=JSON.parse(match[1]);assert.deepEqual(new Set(Object.keys(pools)),new Set(modes));
 assert(pools.authors.filter(q=>q.warmup).length>=3,'Published author warm-ups exist');
 const assets={};for(const name of ['english-play.js','english-corner.css']){
  const emitted=fs.readFileSync(path.join(site,'assets',name),'utf8'),authored=fs.readFileSync(path.join(root,'home/assets',name),'utf8');
  assert(emitted.replace(/\r\n/g,'\n').includes(authored.replace(/\r\n/g,'\n')),'Publication must include the complete current authored asset, allowing the build page-scope wrapper: '+name);assets[name]={sourceSha256:hash(authored),publishedSha256:hash(emitted)};
 }report.publication={htmlSha256:hash(html),assets,pools:Object.fromEntries(modes.map(mode=>[mode,pools[mode].length]))};
}
async function check(name,fn){console.log('CHECK '+name);const start=Date.now();try{const detail=await fn();report.checks.push({name,passed:true,ms:Date.now()-start,detail});console.log('PASS '+name);}catch(error){report.checks.push({name,passed:false,ms:Date.now()-start,error:error.stack});console.error('FAIL '+name+': '+error.message);}}
async function fulfill(route,options){try{return await route.fulfill(options);}catch(error){if(!/Target.*closed|Route is already handled|Invalid InterceptionId|Request.*(?:cancel|abort)/i.test(String(error)))throw error;}}
async function context({width=1440,theme='light',javascript=true}={}){
 const ctx=await browser.newContext({viewport:{width,height:1000},colorScheme:theme,reducedMotion:'reduce',javaScriptEnabled:javascript});ctx.setDefaultTimeout(14000);
 if(javascript)await ctx.addInitScript(theme=>{try{localStorage.setItem('xieyuqing-blog-theme',theme);}catch(_){}},theme);
 ctx.on('page',page=>{
  navigationLoads.set(page,0);page.on('pageerror',error=>report.errors.push(error.stack||error.message));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
  page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame()&&request.resourceType()==='document')navigationLoads.set(page,navigationLoads.get(page)+1);});
 });
 await ctx.route('**/*',async route=>{
  const url=new URL(route.request().url());if(['data:','blob:'].includes(url.protocol))return route.continue();
  if(url.origin!==origin){report.external.push(url.href);return route.abort();}
  try{let file=path.resolve(site,'.'+decodeURIComponent(url.pathname));assert(file===site||file.startsWith(site+path.sep),'Local route stays in publication');if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');return fulfill(route,{contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});}
  catch(error){report.missing.push({url:url.href,error:error.message});return fulfill(route,{status:404,body:'Missing local publication file'});}
 });return ctx;
}
async function using(options,fn){const ctx=await context(options),page=await ctx.newPage();try{return await fn(page,ctx);}catch(error){try{await screenshot(page,'failure-'+(report.checks.length+1)+'-'+report.screenshots.length);}catch(_){}throw error;}finally{await ctx.close();}}
async function ready(page,expected=new URL(page.url()).pathname){await page.waitForFunction(expected=>window.SiteNavigation&&!SiteNavigation.state().transition&&location.pathname===expected&&new URL(SiteNavigation.state().rendered).pathname===expected,expected);await page.evaluate(()=>document.fonts.ready);}
async function openQuiz(page){await page.goto(origin+'/english/play/');await ready(page);await page.locator('[data-quiz-ui]').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('[data-english-play]')?.dataset.quizCurrentMode);assert.equal(await page.locator('[data-quiz-error]').isVisible(),false);}
async function payload(page){return JSON.parse(await page.locator('#english-quiz-data').textContent());}
async function activeMode(page){return page.locator('[data-english-play]').getAttribute('data-quiz-current-mode');}
async function selectedQuestion(page,pools,mode){const id=await page.locator('[data-english-play]').getAttribute('data-quiz-question-id'),q=pools[mode].find(q=>q.id===id);assert(q,'Displayed question belongs to its public pool');assert.equal(await page.locator('[data-quiz-prompt]').textContent(),q.text);assert.deepEqual((await page.locator('[data-quiz-choice]').allTextContents()).slice().sort(),q.choices.slice().sort());return q;}
async function progress(page,index,score){assert.equal((await page.locator('[data-quiz-progress]').textContent()).trim(),`第 ${index} / 10 题 · 答对 ${score} 题`);}
async function focusIs(page,selector){assert(await page.evaluate(selector=>document.activeElement?.matches(selector),selector),'Keyboard focus should be on '+selector);}
async function screenshot(page,name,selector=null){const filename=name+'.png';if(selector)await page.locator(selector).screenshot({path:path.join(out,filename)});else await page.screenshot({path:path.join(out,filename),fullPage:true});report.screenshots.push(filename);}
async function noOverflow(page,detail={}){
 const g=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
  internal:[...document.querySelectorAll('main *')].filter(n=>n.getClientRects().length&&/^(?:auto|scroll)$/.test(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+2).map(n=>n.id||n.className),
  clipped:[...document.querySelectorAll('[data-quiz-prompt],[data-quiz-english],.ec-quiz-explanation,[data-quiz-preview-hint],[data-quiz-preview-translation]')].filter(n=>n.getClientRects().length&&(getComputedStyle(n).webkitLineClamp!=='none'||getComputedStyle(n).textOverflow==='ellipsis')).map(n=>n.id||n.className)}));
 assert(g.scroll<=g.width+1,JSON.stringify(g));assert.deepEqual(g.internal,[]);assert.deepEqual(g.clipped,[]);report.layouts.push({...detail,...g});return g;
}
async function readableContrast(page){
 const samples=await page.evaluate(()=>{
  const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number),l=v=>v.map(n=>{const c=n/255;return c<=0.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
  return ['[data-quiz-prompt]','[data-quiz-english]','[data-quiz-preview-hint]','[data-quiz-preview-translation]','.ec-quiz-choice'].map(selector=>{
   const n=document.querySelector(selector);if(!n||!n.getClientRects().length)return null;const color=getComputedStyle(n).color;let a=n,bg=[255,255,255];
   while(a){const value=getComputedStyle(a).backgroundColor;if(value!=='transparent'&&!/rgba\([^)]*,\s*0\)$/.test(value)){bg=rgb(value);break;}a=a.parentElement;}
   const x=l(rgb(color)),y=l(bg);return{selector,ratio:(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  }).filter(Boolean);
 });for(const s of samples)assert(s.ratio>=4.5,JSON.stringify(s));return samples;
}
async function sourceFeedback(page,q){
 const feedback=page.locator('[data-quiz-feedback]');assert(await feedback.isVisible());assert.equal((await feedback.locator('.ec-quiz-explanation').textContent()).trim(),q.explanation);
 assert.equal(await feedback.getByRole('link',{name:'查看出处与延伸阅读 →',exact:true}).getAttribute('href'),q.reading);
 const links=feedback.locator('.ec-quiz-sources a');assert.equal(await links.count(),q.sources.length);
 for(let i=0;i<q.sources.length;i++){const link=links.nth(i),s=q.sources[i];assert.equal(await link.textContent(),s.label);assert.equal(await link.getAttribute('href'),s.url);assert.equal(await link.getAttribute('target'),'_blank');assert.match(await link.getAttribute('rel'),/noopener/);}
 if(q.mode==='usage'){
  assert(q.choices.length===2||q.choices.length===3);const c=cards.find(c=>'/english/'+c.slug+'/'===q.reading);assert(c&&c.column==='mistakes');
  for(const s of q.sources)assert(c.sources.some(source=>source.url===s.url),'Usage source belongs to the actual linked mistake card');
 }
 if(q.mode==='authors')assert.equal((await feedback.locator('.ec-quiz-translation').textContent()).trim(),q.translation.trim());
}
async function solveRound(page,ctx,pools,mode,{wrongAt=-1,help=false,shot=false,openReading=false}={}){
 let score=0;const ids=[],firstAuthors=[];
 for(let i=0;i<10;i++){
  await progress(page,i+1,score);const q=await selectedQuestion(page,pools,mode);assert(!ids.includes(q.id),'No repeats inside a round');ids.push(q.id);
  if(mode==='authors'){
   if(i<3){assert(q.warmup);assert(config.warmup_quotes.includes(q.id.replace(/^author-/,'')));firstAuthors.push(q.answer);}
   assert(q.choices.filter(a=>a!==q.answer).some(a=>familiar.has(a)),'At least one familiar real author distractor');
   for(const label of q.choices)assert(corpus.some(c=>c.author_zh+'（'+c.author_en+'）'===label),'Every author choice comes from the real shared corpus');
   assert.equal(await page.locator('[data-quiz-preview-translation]').isVisible(),false);assert.equal(await page.locator('[data-quiz-preview-hint]').isVisible(),false);
   if(help&&i===0){
    const before=await page.locator('[data-quiz-progress]').textContent();await page.getByRole('button',{name:'看中文',exact:true}).click();await page.getByRole('button',{name:'给个提示',exact:true}).click();
    assert.equal((await page.locator('[data-quiz-preview-translation]').textContent()).trim(),q.translation.trim());assert.equal(await page.locator('[data-quiz-preview-hint]').textContent(),q.hint);
    assert.equal(await page.locator('[data-quiz-progress]').textContent(),before);assert.equal(await page.locator('[data-quiz-next]').isVisible(),false);
    for(const attr of['translation','hint'])assert.equal(await page.locator('[data-quiz-show-'+attr+']').getAttribute('aria-expanded'),'true');
    if(shot)await screenshot(page,'authors-help-desktop');
   }
  }else assert.equal(await page.locator('[data-quiz-assistance]').isVisible(),false);
  const answer=i===wrongAt?q.choices.find(choice=>choice!==q.answer):q.answer;
  await page.locator('[data-quiz-choices]').getByRole('button',{name:answer,exact:true}).click();if(i!==wrongAt)score++;
  assert.equal(await page.locator('[data-quiz-choice]:enabled').count(),0);await sourceFeedback(page,q);await focusIs(page,'[data-quiz-feedback]');await progress(page,i+1,score);
  if(openReading&&i===0){
   const nextPage=ctx.waitForEvent('page');await page.locator('[data-quiz-feedback]').getByRole('link',{name:'查看出处与延伸阅读 →',exact:true}).click({modifiers:['Control']});const tab=await nextPage;await tab.bringToFront();
   try{await tab.waitForURL(origin+q.reading,{waitUntil:'domcontentloaded'});await ready(tab);}catch(error){report.readingTabFailure={url:tab.url(),observed:await tab.evaluate(()=>({readyState:document.readyState,h1:document.querySelector('h1')?.textContent,navigation:window.SiteNavigation?.state()}))};await screenshot(tab,'usage-reading-tab-failure');throw error;}
   assert.equal(new URL(tab.url()).pathname,q.reading);assert.equal((await tab.locator('h1').textContent()).trim(),cards.find(c=>'/english/'+c.slug+'/'===q.reading).title);await tab.close();await page.bringToFront();
  }
  await page.getByRole('button',{name:i===9?'查看成绩':'下一题',exact:true}).click();if(i!==9)await focusIs(page,'[data-quiz-prompt]');
 }
 if(mode==='authors')assert.equal(new Set(firstAuthors).size,3,'Three different warm-up authors');
 const results=page.locator('[data-quiz-results]');assert(await results.isVisible());assert.equal((await results.locator('h2').textContent()).trim(),`本轮答对 ${score} / 10 题`);await focusIs(page,'[data-quiz-results]');
 assert.equal(await results.locator('.ec-quiz-review>li').count(),wrongAt<0?0:1);
 if(wrongAt>=0)assert((await results.textContent()).includes('第 '+(wrongAt+1)+' 题'));
 assert.equal(await results.locator('.ec-quiz-aid-review').count(),help?1:0);if(help){assert.match(await results.locator('.ec-quiz-aid-review').textContent(),/第 1 题.*看过中文.*用过作品提示/);assert.match(await results.textContent(),/不扣分/);}
 report.rounds.push({mode,ids,score,help,firstAuthors});return{ids,score};
}

(async()=>{try{
 preflight();fs.mkdirSync(out,{recursive:true});const temporary=path.join(out,'temporary');fs.mkdirSync(temporary,{recursive:true});process.env.TEMP=temporary;process.env.TMP=temporary;process.env.TMPDIR=temporary;
 let chromium;try{({chromium}=require('playwright'));report.playwrightResolution='node-module';}catch(_){({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));report.playwrightResolution='generic-codex-runtime-fallback';}
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-gpu','--disable-gpu-compositing']});report.browser=browser.version();report.launchArguments=['--disable-background-networking','--disable-gpu','--disable-gpu-compositing'];
 await check('default language origins and four visible modes',async()=>using({},async page=>{
  await openQuiz(page);assert.equal(await activeMode(page),'origins');assert.deepEqual(await page.locator('[data-quiz-mode]').evaluateAll(nodes=>nodes.map(n=>n.dataset.quizMode)),modes);
  assert.equal(await page.locator('[data-quiz-mode]:enabled').count(),4);await progress(page,1,0);assert.equal(await page.locator('[data-quiz-assistance]').isVisible(),false);
 }));
 for(const mode of modes)await check(mode+': two ten-question rounds, scoring, unique draws, restart and change mode',async()=>using({},async(page,ctx)=>{
  await openQuiz(page);const pools=await payload(page);await page.locator('[data-quiz-mode="'+mode+'"]').click();
  await solveRound(page,ctx,pools,mode,{wrongAt:mode==='authors'?1:0,help:mode==='authors',shot:mode==='authors',openReading:mode==='usage'});
  await page.getByRole('button',{name:'再来一轮',exact:true}).click();assert.equal(await activeMode(page),mode);await progress(page,1,0);assert.equal(await page.locator('.ec-quiz-aid-review').count(),0);
  if(mode==='authors'){assert.equal(await page.locator('[data-quiz-preview-hint]').textContent(),'');assert.equal(await page.getByRole('button',{name:'给个提示',exact:true}).isEnabled(),true);}
  await solveRound(page,ctx,pools,mode);await page.getByRole('button',{name:'换一种玩法',exact:true}).click();assert.equal(await activeMode(page),modes[(modes.indexOf(mode)+1)%modes.length]);await progress(page,1,0);
  assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage).filter(key=>/quiz/i.test(key))),[]);return{rounds:2,questions:20};
 }));
 await check('keyboard, native focus, small assistance buttons and aria relationships',async()=>using({width:390},async page=>{
  await openQuiz(page);const pools=await payload(page),button=page.locator('[data-quiz-mode="authors"]');await button.focus();await button.press('Enter');await focusIs(page,'[data-quiz-prompt]');
  await page.keyboard.press('Tab');await focusIs(page,'[data-quiz-show-translation]');await page.keyboard.press('Enter');assert(await page.locator('[data-quiz-preview-translation]').isVisible());
  const hint=page.getByRole('button',{name:'给个提示',exact:true});assert.equal(await hint.getAttribute('aria-controls'),'quiz-preview-hint');await hint.focus();await hint.press('Space');assert(await page.locator('[data-quiz-preview-hint]').isVisible());
  await page.keyboard.press('Tab');await focusIs(page,'[data-quiz-choice]');await page.keyboard.press('Enter');await focusIs(page,'[data-quiz-feedback]');
  await page.getByRole('button',{name:'下一题',exact:true}).focus();await page.keyboard.press('Enter');await focusIs(page,'[data-quiz-prompt]');assert.equal(await page.locator('[data-quiz-preview-hint]').isVisible(),false);assert.equal(await page.locator('[data-quiz-show-hint]').getAttribute('aria-expanded'),'false');
  await selectedQuestion(page,pools,'authors');const style=await hint.evaluate(n=>({font:parseFloat(getComputedStyle(n).fontSize),border:getComputedStyle(n).borderTopWidth,height:n.getBoundingClientRect().height}));assert(style.font<=14&&style.height>=44&&style.border==='0px',JSON.stringify(style));return style;
 }));
 await check('JavaScript off: complete card fallback and usable library/reading links',async()=>{
  const expected=new Set(config.questions.map(q=>'/english/'+q.card+'/'));
  for(const width of[1440,320])await using({width,javascript:false},async page=>{
   await page.goto(origin+'/english/play/');assert.equal(await page.locator('[data-quiz-ui]').isVisible(),false);assert.match(await page.locator('noscript').textContent(),/可以先读这些卡片/);
   assert.deepEqual(new Set(await page.locator('noscript ul a').evaluateAll(links=>links.map(a=>a.getAttribute('href')))),expected);assert.equal(await page.locator('noscript a[href="/english/quotes/"]').count(),1);await noOverflow(page,{width,javascript:false});
   const first=page.locator('noscript ul a').first(),href=await first.getAttribute('href');await first.click();await page.waitForURL(origin+href);assert.equal((await page.locator('h1').textContent()).trim(),cards.find(c=>'/english/'+c.slug+'/'===href).title);
  });return{fallbackCards:expected.size,widths:[1440,320]};
 });
 await check('five widths and two themes with all modes and expanded help/feedback',async()=>{
  for(const width of widths)for(const theme of['light','dark'])await using({width,theme},async page=>{
   await openQuiz(page);assert.equal(await page.locator('html').getAttribute('data-theme'),theme);const pools=await payload(page);
   for(const mode of modes){await page.locator('[data-quiz-mode="'+mode+'"]').click();await selectedQuestion(page,pools,mode);await noOverflow(page,{width,theme,mode,state:'question'});}
   await page.getByRole('button',{name:'看中文',exact:true}).click();await page.getByRole('button',{name:'给个提示',exact:true}).click();await noOverflow(page,{width,theme,mode:'authors',state:'help'});const contrast=await readableContrast(page);report.layouts.push({width,theme,contrast});
   if(width===320&&theme==='light')await screenshot(page,'authors-help-mobile-320');if(width===390&&theme==='dark')await screenshot(page,'authors-help-mobile-dark');
   const q=await selectedQuestion(page,pools,'authors');await page.locator('[data-quiz-choices]').getByRole('button',{name:q.answer,exact:true}).click();await noOverflow(page,{width,theme,mode:'authors',state:'feedback'});
  });return{widths,themes:['light','dark']};
 });
 await check('SPA repeated reading/quiz navigation leaves one live interface and resets help',async()=>using({},async page=>{
  await openQuiz(page);const initial=navigationLoads.get(page),scope=await page.evaluate(()=>SiteNavigation.state());
  for(let i=0;i<3;i++){
   await page.locator('.ec-breadcrumb a[href="/english/"]').click();await ready(page,'/english/');assert.equal(new URL(page.url()).pathname,'/english/');await page.locator('main a[href="/english/play/"]').first().click();await ready(page,'/english/play/');await page.locator('[data-quiz-ui]').waitFor({state:'visible'});
   assert.equal(await page.locator('[data-english-play]').count(),1);assert.equal(await activeMode(page),'origins');await progress(page,1,0);const current=await page.evaluate(()=>SiteNavigation.state());assert.equal(current.scopeListeners,scope.scopeListeners);assert.equal(current.scopeCleanups,scope.scopeCleanups);const pools=await payload(page);
   await page.locator('[data-quiz-mode="usage"]').click();const q=await selectedQuestion(page,pools,'usage');await page.locator('[data-quiz-choices]').getByRole('button',{name:q.answer,exact:true}).click();await progress(page,1,1);await page.getByRole('button',{name:'下一题',exact:true}).click();await progress(page,2,1);
   await page.locator('[data-quiz-mode="authors"]').click();assert.equal(await page.locator('[data-quiz-preview-hint]').isVisible(),false);await page.getByRole('button',{name:'给个提示',exact:true}).click();assert(await page.locator('[data-quiz-preview-hint]').isVisible());
  }assert.equal(navigationLoads.get(page),initial,'These are SPA changes, not fresh document loads');return{cycles:3,documentLoads:initial};
 }));
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.missing,[]);assert.deepEqual(report.external,[]);
}catch(error){report.errors.push(error.stack||error.message);console.error(error.stack);}finally{
 await browser?.close();report.finishedAt=new Date().toISOString();report.success=report.checks.length>0&&report.checks.every(c=>c.passed)&&!report.errors.length&&!report.consoleErrors.length&&!report.missing.length&&!report.external.length;
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:report.success,checks:report.checks.length,report:path.join(out,'browser-report.json')}));if(!report.success)process.exitCode=1;
}})();
