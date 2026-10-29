'use strict';
// Installed Chrome, local publication only. External weather is a deterministic fixture.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const root = process.env.WEBSITE_ROOT || path.resolve(__dirname,'..');
const site = path.resolve(process.env.WEBSITE_SITE || path.join(root,'_site_unified'));
const out = path.resolve(process.env.ENGLISH_CORNER_OUTPUT || path.join(root,'.local-checks/english-corner-20261029/browser'));
const temporary = path.join(out,'temporary'); fs.mkdirSync(temporary,{recursive:true});
// Keep Chrome profiles and crash reports away from the user's ordinary browser and C-drive cache.
process.env.TEMP = temporary; process.env.TMP = temporary;
const {chromium} = require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const reading = require('../home/assets/daily-reading.js');
const catalog = JSON.parse(fs.readFileSync(path.join(root,'english-corner/catalog.json'),'utf8'));
const cards = catalog.cards.filter(card=>card.status==='published');
const columns = catalog.columns.map(column=>column.id);
const mistakes = cards.filter(card=>card.column==='mistakes');
const english = JSON.parse(fs.readFileSync(path.join(root,'home/brief/english-quotes.json'),'utf8')).quotes;
const classic = JSON.parse(fs.readFileSync(path.join(root,'home/daily-content.json'),'utf8')).quotes;
const historyItems = JSON.parse(fs.readFileSync(path.join(root,'home/brief/history.json'),'utf8')).items;
const origin = 'http://english-corner.test', epoch = Date.parse('2026-10-29T04:00:00Z'), widths = [1440,1024,768,390,320];
const report = {startedAt:new Date().toISOString(),checks:[],screenshots:[],errors:[],missing:[],external:[],forecastRequests:[],layouts:[],contrasts:[]};
const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.wav':'audio/wav','.mp3':'audio/mpeg','.xml':'application/xml'};
let browser;
async function check(name,fn) {
  console.log('CHECK '+name); const start = Date.now();
  try { const detail = await fn(); report.checks.push({name,passed:true,ms:Date.now()-start,detail}); console.log('PASS '+name); }
  catch(error) { report.checks.push({name,passed:false,ms:Date.now()-start,error:error.stack}); console.error('FAIL '+name+': '+error.message); }
}
function serve(route,options) { return route.fulfill(options).catch(error=>{ if(!/Target.*closed|Route is already handled|Invalid InterceptionId|Request.*(?:cancel|abort)/i.test(String(error))) throw error; }); }
async function context({width=1440,theme='light',skin=null,javascript=true,now=epoch,motion='no-preference'}={}) {
  const ctx = await browser.newContext({viewport:{width,height:1000},colorScheme:theme,javaScriptEnabled:javascript,reducedMotion:motion});
  ctx.setDefaultTimeout(14000);
  if (javascript) await ctx.addInitScript(({now,theme,skin})=>{
    window.__ecNow = now;
    const NativeDate = Date;
    window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [window.__ecNow])); } static now() { return window.__ecNow; } };
    Math.random = ()=>0.371;
    try { localStorage.setItem('xieyuqing-blog-theme',theme); if(skin)localStorage.setItem('xieyuqing-site-skin',skin); } catch(_) {}
    const set = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
    window.__ecIntervals = new Map();
    window.setInterval = (fn,delay,...args)=>{ const id=set(fn,delay,...args);window.__ecIntervals.set(id,{fn,delay,args});return id; };
    window.clearInterval = id=>{window.__ecIntervals.delete(id);clear(id);};
    window.__ecMinute = ()=>{for(const timer of [...window.__ecIntervals.values()])if(timer.delay===60000)timer.fn(...timer.args);};
  },{now,theme,skin});
  await ctx.route('**/*',async route=>{
    const url = new URL(route.request().url());
    if (['data:','blob:'].includes(url.protocol)) return route.continue();
    if (url.origin==='https://api.open-meteo.com') {
      report.forecastRequests.push(url.href);
      return serve(route,{contentType:'application/json',body:JSON.stringify({timezone:url.searchParams.get('timezone')||'Asia/Shanghai',current:{time:'2026-10-29T12:00',temperature_2m:21.4,weather_code:3,apparent_temperature:20.2,relative_humidity_2m:65,wind_speed_10m:12,wind_direction_10m:180,pressure_msl:1015},daily:{time:['2026-10-29'],temperature_2m_max:[25],temperature_2m_min:[18],precipitation_probability_max:[15]}})});
    }
    if (url.origin!==origin) { report.external.push(url.href); return route.abort(); }
    try {
      let file = path.resolve(site,'.'+decodeURIComponent(url.pathname));
      assert(file===site||file.startsWith(site+path.sep),'Path must remain inside local publication');
      if (fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
      return serve(route,{contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
    } catch(error) { report.missing.push({url:url.href,error:error.message});return serve(route,{status:404,body:'Missing local publication file'}); }
  });
  ctx.on('page',page=>page.on('pageerror',error=>report.errors.push(error.stack||error.message)));
  return ctx;
}
async function ready(page) {
  await page.waitForFunction(()=>window.SiteNavigation&&!SiteNavigation.state().transition&&new URL(SiteNavigation.state().rendered).pathname===location.pathname);
  await page.evaluate(()=>document.fonts.ready);
}
async function go(page,route) { await page.goto(origin+route);await ready(page); }
async function publicNavigation(page,language='zh-CN') {
  const entries=page.locator('.site-nav .nav-entry');
  assert.equal(await entries.count(),4);
  for(const label of await entries.allTextContents())assert.doesNotMatch(label,/学英语|英语角|Learn English|English Corner/);
  const links=page.locator('.site-nav [data-nav-group="projects"] .nav-menu>a');
  assert.equal(await links.count(),4);
  assert.equal(await links.nth(2).getAttribute('href'),'/english/');
  assert.equal((await links.nth(2).textContent()).trim(),language==='en'?'Learn English (中文)':'学英语');
  assert.equal(await links.nth(3).getAttribute('href'),'/marx/');
  assert.equal(await page.locator('.site-footer nav a[href="/english/"]').count(),1);
  assert.equal((await page.locator('.site-footer nav a[href="/english/"]').textContent()).trim(),language==='en'?'Learn English (中文)':'学英语');
}
async function noOverflow(page) {
  const geometry = await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
    internal:[...document.querySelectorAll('main *')].filter(node=>node.getClientRects().length&&/^(?:auto|scroll)$/.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight+2).map(node=>node.id||node.className),
    clipped:[...document.querySelectorAll('.ec-row p,.ec-prose p,.ec-summary p,#english-quote-text,#english-quote-translation')].filter(node=>node.getClientRects().length&&(getComputedStyle(node).webkitLineClamp!=='none'||getComputedStyle(node).textOverflow==='ellipsis')).map(node=>node.id||node.className)}));
  assert(geometry.scroll<=geometry.width+1,JSON.stringify(geometry));assert.deepEqual(geometry.internal,[]);assert.deepEqual(geometry.clipped,[]);return geometry;
}
async function quoteState(page) {
  return page.evaluate(()=>{
    const lines=id=>{const node=document.getElementById(id)?.cloneNode(true);if(!node)return undefined;for(const br of node.querySelectorAll('br'))br.replaceWith('\n');return node.textContent;};
    return {id:document.querySelector('#english-quote')?.dataset.quoteId,text:lines('english-quote-text'),
    translation:lines('english-quote-translation'),source:document.querySelector('#english-quote-work')?.textContent,
    href:document.querySelector('#english-quote-work')?.getAttribute('href'),note:document.querySelector('#english-quote-note')?.textContent,
    related:document.querySelector('#english-quote-related')?.getAttribute('href')};});
}
async function assertQuote(page,state) {
  const item=english.find(item=>item.id===state.id);assert(item,'Displayed quote belongs to reviewed corpus');
  assert.equal(state.text,item.text);assert.equal(state.translation,item.translation);assert.equal(state.href,item.url);
  assert(state.source.includes(item.author_zh)&&state.source.includes(item.author_en)&&state.source.includes(item.work_zh)&&state.source.includes(item.locator_zh));
  assert(state.note.includes(item.work_en));
  if(item.translation_source.type==='site')assert.match(state.note,/本站译文.*AI|AI.*本站译文/);
  assert.equal(await page.locator('#english-quote-text').getAttribute('lang'),'en');
  assert.equal(await page.locator('#english-quote-translation').getAttribute('lang'),'zh-CN');
}
async function contrasts(page,selectors) {
  const samples=await page.evaluate(selectors=>{
    const rgb=text=>{const parts=text.match(/[\d.]+/g)?.map(Number);return parts?.length>=3?parts.slice(0,3):null;};
    const luminance=values=>values.map(n=>{const c=n/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[0.2126,0.7152,0.0722][i],0);
    return selectors.map(selector=>{const node=document.querySelector(selector);if(!node||!node.getClientRects().length)return null;const style=getComputedStyle(node);let ancestor=node,bg;
      while(ancestor){const color=getComputedStyle(ancestor).backgroundColor;if(color!=='transparent'&&!/rgba\([^)]*,\s*0\)$/.test(color)){bg=rgb(color);break;}ancestor=ancestor.parentElement;}
      bg=bg||[255,255,255];const fg=rgb(style.color),a=luminance(fg),b=luminance(bg);return {selector,foreground:style.color,background:bg,ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)};}).filter(Boolean);
  },selectors);
  for(const sample of samples)assert(sample.ratio>=4.5,`${sample.selector}: contrast ${sample.ratio}`);
  return samples;
}
async function screenshot(page,name,selector=null,fullPage=true) { const filename=name+'.png';if(selector)await page.locator(selector).screenshot({path:path.join(out,filename)});else await page.screenshot({path:path.join(out,filename),fullPage});report.screenshots.push(filename); }

(async()=>{try {
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu','--disable-gpu-compositing'],downloadsPath:path.join(temporary,'downloads'),env:{...process.env,TEMP:temporary,TMP:temporary}});
  await check('reviewed routes are public, Chinese-first and in the main sitemap',async()=>{
    assert(cards.length>=40);assert(english.length>=200);assert(mistakes.length>=8);
    assert.deepEqual([...columns].sort(),['between','classics','mistakes','myths','words']);
    const xml=fs.readFileSync(path.join(site,'sitemap.xml'),'utf8');
    for(const route of ['/english/','/english/tools/numbers/',...cards.map(c=>'/english/'+c.slug+'/')]){
      assert(fs.existsSync(path.join(site,route,'index.html')),route);assert(xml.includes('https://xieyuqing.me'+route));
    }
    assert(!xml.includes('/en/english/'));assert(!fs.existsSync(path.join(site,'en/english')));
    return {cards:cards.length,quotes:english.length,columns:columns.length,mistakes:mistakes.length,routes:cards.length+2};
  });
  await check('Learn English has exact public metadata, a projects-menu entry and no author self-introduction in cards',async()=>{
    const ctx=await context(),page=await ctx.newPage();try{
      await go(page,'/english/');
      assert.equal(await page.title(),'学英语');
      assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'),'学英语');
      assert.equal(await page.locator('.ec-intro h1').textContent(),'学英语');
      assert.equal(await page.locator('.ec-intro .ec-lead').textContent(),'英语好啊，英语得学，我也想学英语。');
      await publicNavigation(page);
      const projects=page.locator('.site-nav [data-nav-group="projects"]');
      assert(await projects.evaluate(node=>node.classList.contains('is-current')));
      await projects.locator('summary').press('Enter');
      assert(await projects.locator('.nav-menu>a').nth(2).isVisible());
      await projects.locator('summary').press('Enter');
      for(const card of cards){
        await go(page,'/english/'+card.slug+'/');
        const expected=card.title+' · 学英语';
        assert.equal(await page.title(),expected);
        assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'),expected);
        const main=await page.locator('main').textContent();
        assert.doesNotMatch(main,/中国钩子|钩子|本站编写|雨聊英语角|英语角|English Corner/);
        // Literary first-person text and authored teaching examples remain legitimate.
        assert.doesNotMatch(main,/谢雨卿|站长|我的文章|英语专业|补课/);
        await publicNavigation(page);
      }
      await go(page,'/en/today/');await publicNavigation(page,'en');
      return {cards:cards.length,indexTitle:'学英语',primaryEntries:4,projectsPosition:3};
    }finally{await ctx.close();}
  });
  await check('keyboard filters preserve column and difficulty through detail and return links',async()=>{
    const ctx=await context(),page=await ctx.newPage();try{
      await go(page,'/english/');assert.equal(await page.locator('[data-ec-row]:visible').count(),cards.length);
      await page.locator('[data-ec-filter=words]').press('Enter');
      assert.equal(new URL(page.url()).searchParams.get('column'),'words');
      assert.equal(await page.locator('[data-ec-row]:visible').count(),cards.filter(c=>c.column==='words').length);
      const level=String(cards.find(c=>c.column==='words').level);
      await page.locator(`[data-ec-level="${level}"]`).press('Space');
      const expected=cards.filter(c=>c.column==='words'&&String(c.level)===level);
      assert.equal(await page.locator('[data-ec-row]:visible').count(),expected.length);
      const target=page.locator('[data-ec-row]:visible [data-ec-card]').first(),targetHref=await target.getAttribute('href');
      assert.equal(new URL(targetHref,origin).searchParams.get('level'),level);
      await target.press('Enter');await page.waitForURL(url=>url.pathname==='/english/'+expected[0].slug+'/');await ready(page);
      assert.equal(await page.locator('h1').textContent(),expected[0].title);
      await page.locator('[data-ec-return]').first().press('Enter');await page.waitForURL(url=>url.pathname==='/english/');await ready(page);
      assert.equal(new URL(page.url()).searchParams.get('column'),'words');assert.equal(new URL(page.url()).searchParams.get('level'),level);
      assert.equal(await page.locator('[data-ec-row]:visible').count(),expected.length);
      await page.locator('[data-ec-filter=all]').press('Enter');await page.locator('[data-ec-level=all]').press('Enter');
      assert.equal(await page.locator('[data-ec-row]:visible').count(),cards.length);
      await page.locator('[data-ec-column=classics]').press('Enter');assert.equal(new URL(page.url()).searchParams.get('column'),'classics');
      await page.locator('[data-ec-filter=mistakes]').press('Enter');
      assert.equal(new URL(page.url()).searchParams.get('column'),'mistakes');
      assert.equal(await page.locator('[data-ec-row]:visible').count(),mistakes.length);
      for(const row of await page.locator('[data-ec-row]:visible').all())assert.equal(await row.getAttribute('data-column'),'mistakes');
      return {visibleAfterReturn:expected.length,mistakeFilterCount:mistakes.length};
    }finally{await ctx.close();}
  });
  await check('all five card kinds render readable sources and contextual vocabulary',async()=>{
    const ctx=await context({width:390}),page=await ctx.newPage();try{
      for(const column of columns){
        const card=cards.find(c=>c.column===column);await go(page,'/english/'+card.slug+'/');
        assert.equal(await page.locator('h1').textContent(),card.title);assert.equal(await page.locator('main img').count(),0);
        assert.equal(await page.locator('.ec-sources ol a').count(),card.sources.length);
        for(const source of await page.locator('.ec-sources ol a').all()){assert.match(await source.getAttribute('href'),/^https:\/\//);assert.equal(await source.getAttribute('target'),'_blank');assert.match(await source.getAttribute('rel'),/noopener/);}
        if(column==='classics'){assert.equal(await page.locator('.ec-original').getAttribute('lang'),'en');assert(await page.locator('.ec-vocabulary tbody tr').count()>=3);assert((await page.locator('.ec-original').innerText()).length>30);}
        if(column==='myths')assert((await page.locator('.ec-verdict').textContent()).includes(card.verdict));
        assert((await page.locator('.ec-sources').innerText()).includes('AI 辅助'));await noOverflow(page);
      }
    }finally{await ctx.close();}
  });
  await check('all Common Mistakes cards keep four ordered reading sections and one notice of each kind',async()=>{
    const ctx=await context({width:390}),page=await ctx.newPage();try{
      for(const card of mistakes){
        await go(page,'/english/'+card.slug+'/');
        assert.deepEqual(await page.locator('main .ec-prose>.ec-section>h2,main>.ec-sources>h2').allTextContents(),['错句','对句','为什么','来源']);
        assert.equal(await page.locator('main .ec-example-note').count(),1);
        assert.equal(await page.locator('main .ec-prose>.ec-section').first().locator('.ec-example-note').textContent(),'例句为编写的示例。');
        const main=await page.locator('main').textContent();
        assert.equal((main.match(/AI 辅助/g)||[]).length,1);
        assert.equal((main.match(/例句为编写的示例。/g)||[]).length,1);
        assert.deepEqual(await page.locator('.ec-sources ol a').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href'))),card.sources.map(source=>source.url));
        await noOverflow(page);
      }
      await go(page,'/english/bored-boring/');
      assert((await page.locator('.ec-prose').textContent()).includes('这句话未必违反语法'));
      await screenshot(page,'english-mistake-bored-boring-390-light');
      await go(page,'/english/how-do-you-say/');
      assert((await page.locator('.ec-prose').textContent()).includes('口语还可能省略'));
      return {cards:mistakes.length,orderedSections:4,exampleNoticesPerPage:1,aiNoticesPerPage:1};
    }finally{await ctx.close();}
  });
  await check('number examples, exact fixed-point precision and accessible errors work by keyboard',async()=>{
    const ctx=await context({width:390}),page=await ctx.newPage();try{
      await go(page,'/english/tools/numbers/');assert.equal(await page.locator('#english-number-results').getAttribute('aria-live'),'polite');
      for(const [input,expected]of [['14亿','1.4 billion'],['960万','9.6 million'],['8300万','83 million'],['48.6万','486 thousand'],['1.4 billion','1.4 billion']]){
        await page.locator('[data-number-example]').filter({hasText:input}).first().press('Enter');
        const rows=await page.locator('#english-number-results dd').allTextContents();assert.equal(rows[4],expected);assert.equal(await page.locator('#english-number-input').inputValue(),input);
      }
      await page.locator('#english-number-input').fill('9999999999999999.9999');
      await page.waitForFunction(()=>Array.from(document.querySelectorAll('#english-number-results dd:first-of-type .english-number-group b')).map(n=>n.textContent).join('')==='9999999999999999.9999');
      await page.locator('#english-number-input').fill('12345678');
      await page.waitForFunction(()=>document.querySelector('#english-number-results').textContent.includes('1234万5678'));
      const definitions=page.locator('#english-number-results dd');
      assert.deepEqual(await definitions.nth(0).locator('.english-number-group b').allTextContents(),['12','345','678']);
      assert.deepEqual(await definitions.nth(0).locator('.english-number-group small').allTextContents(),['million','thousand','ones']);
      assert.deepEqual(await definitions.nth(1).locator('.english-number-group b').allTextContents(),['1234','5678']);
      assert.deepEqual(await definitions.nth(1).locator('.english-number-group small').allTextContents(),['万','个']);
      assert.equal(await definitions.nth(2).evaluate(node=>{const copy=node.cloneNode(true);copy.querySelectorAll('small').forEach(child=>child.remove());return copy.textContent;}),'1234万5678');
      assert.equal(await definitions.nth(2).locator('small.english-number-approx').textContent(),'约1235万');
      for(const group of await definitions.locator('.english-number-group').all()){
        const sizes=await group.evaluate(node=>({digits:parseFloat(getComputedStyle(node.querySelector('b')).fontSize),label:parseFloat(getComputedStyle(node.querySelector('small')).fontSize)}));
        assert(sizes.label<sizes.digits);
      }
      await noOverflow(page);await screenshot(page,'english-numbers-12345678-390-light','main');
      await page.locator('#english-number-input').fill('１４億');
      await page.waitForFunction(()=>document.querySelector('#english-number-error').textContent.trim());
      assert.equal(await page.locator('#english-number-input').getAttribute('aria-invalid'),'true');
      await page.locator('#english-number-input').fill('１．４ billion');
      await page.waitForFunction(()=>document.querySelector('#english-number-results').textContent.includes('1.4 billion'));
      assert.equal(await page.locator('#english-number-input').getAttribute('aria-invalid'),null);await noOverflow(page);
    }finally{await ctx.close();}
  });
  await check('two full-width quotation pools traverse independently without repeats',async()=>{
    const ctx=await context(),page=await ctx.newPage();try{
      await go(page,'/today/');assert.equal(await page.locator('#brief-bottom .yl-daily-card').count(),2);
      const initialClassic=await page.locator('#daily-quote').getAttribute('data-quote-id');
      let state=await quoteState(page);await assertQuote(page,state);const seenEnglish=new Set([state.id]);
      for(let index=1;index<english.length;index++){await page.locator('#english-quote-button').press(index%2?'Enter':'Space');state=await quoteState(page);assert(!seenEnglish.has(state.id));seenEnglish.add(state.id);await assertQuote(page,state);}
      assert.equal(await page.locator('#daily-quote').getAttribute('data-quote-id'),initialClassic);
      const beforeBoundary=state.id;await page.locator('#english-quote-button').press('Enter');assert.notEqual((await quoteState(page)).id,beforeBoundary);
      const fixedEnglish=await quoteState(page),seenClassic=new Set([initialClassic]);
      for(let index=1;index<classic.length;index++){await page.locator('#daily-quote-button').press('Enter');const id=await page.locator('#daily-quote').getAttribute('data-quote-id');assert(!seenClassic.has(id));seenClassic.add(id);}
      assert.deepEqual(await quoteState(page),fixedEnglish);
      const sizes=await page.locator('#daily-quote-button,#english-quote-button').evaluateAll(nodes=>nodes.map(node=>({font:parseFloat(getComputedStyle(node).fontSize),height:node.getBoundingClientRect().height})));
      assert.deepEqual(sizes[0],sizes[1]);assert(sizes[0].font<=14&&sizes[0].height<=44);
      for(const selector of ['#daily-quotation-card','#english-quotation-card'])assert(await page.locator(selector).evaluate(node=>Math.abs(node.getBoundingClientRect().width-node.closest('.today-reading').getBoundingClientRect().width)<1));
      return {english:seenEnglish.size,classic:seenClassic.size,buttons:sizes};
    }finally{await ctx.close();}
  });
  await check('a real multiline poem keeps explicit line breaks after the change-quotation button',async()=>{
    const poem=english.find(item=>item.text.includes('\n'));
    assert(poem,'The reviewed corpus must contain an actual multiline poem.');
    const ctx=await context({width:390}),page=await ctx.newPage();try{
      await go(page,'/today/');
      let changed=0,state;
      do{await page.locator('#english-quote-button').press('Enter');changed++;state=await quoteState(page);}while(state.id!==poem.id&&changed<english.length*2);
      assert.equal(state.id,poem.id);assert(changed>0,'Exercise the JavaScript change button rather than only the server opening quote.');
      await assertQuote(page,state);
      for(const [selector,expected]of [['#english-quote-text',poem.text],['#english-quote-translation',poem.translation]]){
        const rendering=await page.locator(selector).evaluate(node=>({text:node.textContent,whiteSpace:getComputedStyle(node).whiteSpace}));
        assert.equal(rendering.text,expected);assert.equal(rendering.whiteSpace,'pre-line');
        if(expected.includes('\n'))assert.equal(rendering.text.split('\n').length,expected.split('\n').length);
      }
      await noOverflow(page);await screenshot(page,'reading-poem-zh-390-light','.today-reading');
      return {id:poem.id,lines:poem.text.split('\n').length,buttonChanges:changed};
    }finally{await ctx.close();}
  });
  await check('language navigation retains both current quotations and their remaining shuffle order',async()=>{
    const ctx=await context(),page=await ctx.newPage();try{
      const day=reading.dayNumber(new Date(epoch)),englishDeck=reading.createDeck(english.length,day,()=>0.371),classicDeck=reading.createDeck(classic.length,day,()=>0.371);
      await go(page,'/today/');
      await page.locator('#english-quote-button').click();englishDeck.next();await page.locator('#daily-quote-button').click();classicDeck.next();
      const englishBefore=await quoteState(page),classicBefore=await page.locator('#daily-quote').getAttribute('data-quote-id');
      assert.equal(englishBefore.id,english[englishDeck.current()].id);assert.equal(classicBefore,classic[classicDeck.current()].id);
      await page.locator('.header-tools .site-language-switch').click();await page.waitForURL(url=>url.pathname==='/en/today/');await ready(page);
      assert.deepEqual(await quoteState(page),englishBefore);assert.equal(await page.locator('#daily-quote').getAttribute('data-quote-id'),classicBefore);
      assert.equal(await page.locator('#english-quotation-title').textContent(),'English quotations');
      assert.equal(await page.locator('#english-quote-button').getAttribute('aria-label'),'Another quote · English quotations');
      assert.equal(await page.locator('#english-quotation-card a[href="/english/"]').textContent(),'Learn English (in Chinese) →');
      await page.locator('#english-quote-button').click();englishDeck.next();assert.equal((await quoteState(page)).id,english[englishDeck.current()].id);
      await page.locator('#daily-quote-button').click();classicDeck.next();assert.equal(await page.locator('#daily-quote').getAttribute('data-quote-id'),classic[classicDeck.current()].id);
      await page.locator('.header-tools .site-language-switch').click();await page.waitForURL(url=>url.pathname==='/today/');await ready(page);
      assert.equal((await quoteState(page)).id,english[englishDeck.current()].id);
      const keys=await page.evaluate(()=>[...Object.keys(localStorage),...Object.keys(sessionStorage)]);assert(!keys.some(key=>/quotation|quote|daily-reading/i.test(key)));return {languageRoundTrips:2};
    }finally{await ctx.close();}
  });
  await check('minute checks preserve manual choices and only Beijing midnight resets both pools',async()=>{
    const ctx=await context({now:Date.parse('2026-10-29T15:59:00Z')}),page=await ctx.newPage();try{
      await go(page,'/today/');await page.locator('#english-quote-button').click();await page.locator('#daily-quote-button').click();
      const before=await quoteState(page),classicBefore=await page.locator('#daily-quote').getAttribute('data-quote-id');
      await page.evaluate(()=>{window.__ecNow=Date.parse('2026-10-29T15:59:45Z');window.__ecMinute();});
      assert.deepEqual(await quoteState(page),before);assert.equal(await page.locator('#daily-quote').getAttribute('data-quote-id'),classicBefore);
      await page.evaluate(()=>{window.__ecNow=Date.parse('2026-10-29T16:01:00Z');window.__ecMinute();});
      const day=reading.dayNumber(new Date('2026-10-29T16:01:00Z'));
      assert.equal((await quoteState(page)).id,english[day%english.length].id);assert.equal(await page.locator('#daily-quote').getAttribute('data-quote-id'),classic[day%classic.length].id);
      assert.equal(await page.locator('#today-title').textContent(),'2026年10月30日');
    }finally{await ctx.close();}
  });
  await check('without JavaScript the whole directory, classic, number table and two daily quotations remain readable',async()=>{
    const ctx=await context({width:320,javascript:false}),page=await ctx.newPage();try{
      await page.goto(origin+'/english/');assert.equal(await page.locator('[data-ec-row]:visible').count(),cards.length);assert.equal(await page.locator('[data-ec-filters]').isVisible(),false);
      for(const column of columns)assert.equal(await page.locator(`[data-ec-column="${column}"]`).getAttribute('href'),'#column-'+column);
      await noOverflow(page);await page.goto(origin+'/english/'+cards.find(c=>c.column==='classics').slug+'/');assert((await page.locator('.ec-original').innerText()).length>30);assert(await page.locator('.ec-vocabulary').isVisible());await noOverflow(page);
      await page.goto(origin+'/english/'+mistakes[0].slug+'/');
      assert.deepEqual(await page.locator('main .ec-prose>.ec-section>h2,main>.ec-sources>h2').allTextContents(),['错句','对句','为什么','来源']);
      assert.equal(await page.locator('main .ec-example-note').count(),1);await noOverflow(page);
      await page.goto(origin+'/english/tools/numbers/');assert((await page.locator('noscript').innerText()).includes('转换需要 JavaScript'));assert.equal(await page.locator('main table tbody tr').count(),6);await noOverflow(page);
      let first;
      for(const route of ['/today/','/en/today/']){await page.goto(origin+route);const state=await quoteState(page);await assertQuote(page,state);if(first)assert.deepEqual(state,first);else first=state;assert.equal(await page.locator('#english-quote-button').isVisible(),false);assert.equal(await page.locator('#daily-quote-button').isVisible(),false);await noOverflow(page);}
    }finally{await ctx.close();}
  });
  await check('progressive round trips clean old filters, number debounce and quotation page listeners',async()=>{
    const ctx=await context(),page=await ctx.newPage();try{
      await go(page,'/english/');const baseline=await page.evaluate(()=>SiteNavigation.state());
      for(let index=0;index<3;index++){
        await page.evaluate(()=>SiteNavigation.visit('/english/tools/numbers/'));await ready(page);
        await page.locator('#english-number-input').fill('1.2345万');
        await page.evaluate(()=>{window.__ecOldInput=document.querySelector('#english-number-input');return SiteNavigation.visit('/today/');});await ready(page);
        await page.locator('#english-quote-button').click();
        await page.evaluate(()=>{window.__ecOldQuote=document.querySelector('#english-quote-button');return SiteNavigation.visit('/english/');});await ready(page);
        await page.evaluate(()=>{window.__ecOldInput.value='5亿';window.__ecOldInput.dispatchEvent(new Event('input'));window.__ecOldQuote.click();window.__ecMinute();});
        assert.equal(await page.locator('#english-number-results,#english-quote').count(),0);
        const state=await page.evaluate(()=>SiteNavigation.state());assert.equal(state.scopeListeners,baseline.scopeListeners);assert.equal(state.scopeCleanups,baseline.scopeCleanups);
      }
      return {roundTrips:3,listeners:baseline.scopeListeners,cleanups:baseline.scopeCleanups};
    }finally{await ctx.close();}
  });
  await check('history starts with the earliest three events and its single line remains continuous when expanded',async()=>{
    let measured=0;
    const expected=historyItems.filter(item=>item.month_day==='10-29').sort((a,b)=>a.year-b.year);
    assert(expected.length>3);
    for(const width of [1440,390])for(const language of ['zh-CN','en']){
      const ctx=await context({width}),page=await ctx.newPage();try{
        await go(page,(language==='en'?'/en':'')+'/today/');
        const timeline=page.locator('#daily-history-list .history-timeline');
        assert.equal(await timeline.count(),1);
        assert.deepEqual(await timeline.locator('.history-item:visible .history-year').allTextContents(),expected.slice(0,3).map(item=>String(item.year)));
        const before=await timeline.boundingBox();
        await timeline.locator('.history-more>summary').press('Enter');
        assert.deepEqual(await timeline.locator('.history-item:visible .history-year').allTextContents(),expected.map(item=>String(item.year)));
        const geometry=await timeline.evaluate(node=>{
          const box=node.getBoundingClientRect(),line=getComputedStyle(node,':before'),items=[...node.querySelectorAll('.history-item')];
          const dots=items.map(item=>{const r=item.getBoundingClientRect(),s=getComputedStyle(item,':before');return {x:r.x+parseFloat(s.left)+parseFloat(s.width)/2,y:r.y+parseFloat(s.top)+parseFloat(s.height)/2,after:getComputedStyle(item,':after').display};});
          return {height:box.height,lineHeight:parseFloat(line.height),lineTop:box.y+parseFloat(line.top),lineBottom:box.y+parseFloat(line.top)+parseFloat(line.height),lineX:box.x+parseFloat(line.left)+parseFloat(line.width)/2,lineWidth:parseFloat(line.width),dots};
        });
        assert(geometry.height>before.height);assert.equal(geometry.lineWidth,1);assert(geometry.lineHeight>0);
        assert(geometry.lineTop<=geometry.dots[0].y&&geometry.lineBottom>=geometry.dots.at(-1).y);
        for(const dot of geometry.dots){assert(Math.abs(dot.x-geometry.lineX)<1);assert.equal(dot.after,'none');}
        await noOverflow(page);
        await screenshot(page,`history-continuous-${language}-${width}`,'#today-history');measured++;
      }finally{await ctx.close();}
    }
    return {measured,events:expected.length,earliest:expected[0].year};
  });
  await check('five widths and the two current themes keep every new page readable and the header within the viewport',async()=>{
    const routes=['/english/',...columns.map(column=>'/english/'+cards.find(c=>c.column===column).slug+'/'),'/english/tools/numbers/','/today/','/en/today/'];
    let layouts=0;
    for(const width of widths)for(const theme of ['light','dark']){
      console.log(`  layout ${width}px ${theme}`);const ctx=await context({width,theme}),page=await ctx.newPage();try{
        for(const route of routes){await go(page,route);await noOverflow(page);assert.equal(await page.locator('html').getAttribute('data-theme'),theme);assert.equal(await page.locator('html').getAttribute('data-skin'),null);
          await publicNavigation(page,route.startsWith('/en/')?'en':'zh-CN');
          if(route.startsWith('/english/'))assert.equal(await page.locator('.site-language-switch').count(),0);
          if(route==='/english/'){
            assert.equal(await page.locator('.ec-columns [data-ec-column]:visible').count(),5);
            const bounds=await page.locator('.ec-columns [data-ec-column]').evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {left:box.left,right:box.right,width:box.width,heading:node.querySelector('h2').textContent};}));
            for(const box of bounds)assert(box.width>0&&box.left>=-1&&box.right<=width+1,JSON.stringify(box));
            assert(bounds.some(box=>box.heading==='别说错'));
          }
          const samples=await contrasts(page,route.endsWith('/today/')?['#english-quote-translation','.yl-quote-source','.quote-change']:['.ec-lead','.ec-meta','.ec-row p','.ec-sources']);
          report.contrasts.push({route,width,theme,samples});report.layouts.push({route,width,theme});layouts++;
          if(width===1440&&theme==='light'&&route==='/today/')await screenshot(page,'reading-zh-1440-light','.today-reading');
          if(width===390&&route==='/english/'&&theme==='light')await screenshot(page,'english-index-390-light');
          if([320,390].includes(width)&&route==='/english/'&&theme==='light')await screenshot(page,`english-index-${width}-fold-light`,null,false);
          if(width===320&&route==='/english/'+mistakes[0].slug+'/'&&theme==='dark')await screenshot(page,'english-mistake-320-dark');
          if(width===390&&route==='/english/'+cards.find(c=>c.column==='classics').slug+'/'&&theme==='dark')await screenshot(page,'english-classic-390-dark');
        }
      }finally{await ctx.close();}
    }
    return {layouts,widths,themes:2,routes:routes.length};
  });
  await check('obsolete skin preferences do not restore a removed theme system',async()=>{
    for(const skin of ['emerald','sea']){
      const ctx=await context({width:390,skin,theme:'dark'}),page=await ctx.newPage();try{
        await go(page,'/english/');assert.equal(await page.locator('html').getAttribute('data-skin'),null);
        assert.deepEqual(await page.evaluate(()=>SiteTheme.state()),{mode:'dark',theme:'dark'});await noOverflow(page);
      }finally{await ctx.close();}
    }
  });
  await check('reduced motion keeps the word passport static and all reading in page flow',async()=>{
    const ctx=await context({width:390,motion:'reduce'}),page=await ctx.newPage();try{
      const card=cards.find(c=>c.column==='words'&&c.journey?.length);await go(page,'/english/'+card.slug+'/');
      assert(await page.locator('.ec-stamp').count()>0);for(const stamp of await page.locator('.ec-stamp').all())assert.equal(await stamp.evaluate(node=>getComputedStyle(node).transform),'none');
      assert.equal(await page.evaluate(()=>document.getAnimations().filter(animation=>animation.playState==='running').length),0);await noOverflow(page);
    }finally{await ctx.close();}
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);assert.deepEqual(report.missing,[]);
}catch(error){report.errors.push(error.stack);console.error(error.stack);}
finally{await browser?.close();report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));const failed=report.checks.filter(check=>!check.passed).length;console.log(JSON.stringify({checks:report.checks.length,passed:report.checks.length-failed,failed,errors:report.errors.length,missing:report.missing.length,external:report.external.length,report:path.join(out,'browser-report.json')}));if(failed||report.errors.length||report.missing.length||report.external.length)process.exitCode=1;}})();
