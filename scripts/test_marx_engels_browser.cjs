'use strict';
// Installed Chrome; every website response comes from the local publication.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), os=require('node:os'),crypto=require('node:crypto');
const root=path.resolve(process.env.WEBSITE_ROOT||path.join(__dirname,'..'));
const site=path.resolve(process.env.WEBSITE_SITE||path.join(root,'_site_unified'));
const out=path.resolve(process.env.MARX_BROWSER_OUTPUT||path.join(root,'.local-checks/marx-engels-v3-20261030/browser'));
const temp=path.join(out,'temporary');fs.mkdirSync(temp,{recursive:true});process.env.TEMP=process.env.TMP=temp;
const {chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'marx-engels/catalog.json'),'utf8'));
const cards=catalog.cards.filter(card=>card.status==='published');
const capital=JSON.parse(fs.readFileSync(path.join(root,'marx-engels/capital.json'),'utf8')).volumes;
const topicData=Object.fromEntries(['commune','late-engels','mba'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(root,'marx-engels/topics',name+'.json'),'utf8'))]));
const quoteMappings=JSON.parse(fs.readFileSync(path.join(root,'marx-engels/quote-works.json'),'utf8')).items;
const citations=JSON.parse(fs.readFileSync(path.join(root,'marx-engels/citations.json'),'utf8')).items;
const lifeEvents=JSON.parse(fs.readFileSync(path.join(root,'marx-engels/life.json'),'utf8')).events;
const selectedLetters=JSON.parse(fs.readFileSync(path.join(root,'marx-engels/letters.json'),'utf8')).letters;
const reader=require('../home/assets/marx.js');
const origin='http://read-marx.test',epoch=Date.parse('2026-10-29T04:00:00Z'),widths=[1440,1024,768,390,320];
const reviewedFiles=['scripts/test_marx_engels_browser.cjs','marx-engels/catalog.json','marx-engels/capital.json','marx-engels/quiz.json',...['commune','late-engels','mba'].map(name=>'marx-engels/topics/'+name+'.json')];
const report={startedAt:new Date().toISOString(),checks:[],layouts:[],heights:[],screenshots:[],contrasts:[],errors:[],consoleErrors:[],missing:[],external:[],weatherFixtures:0,fixtureDate:new Date(epoch).toISOString(),sourceHashes:Object.fromEntries(reviewedFiles.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]))};
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.wav':'audio/wav','.mp3':'audio/mpeg'};
let browser;
async function check(name,fn){
  console.log('CHECK '+name);const start=Date.now();
  try{const detail=await fn();report.checks.push({name,passed:true,ms:Date.now()-start,detail});console.log('PASS '+name);}
  catch(error){report.checks.push({name,passed:false,ms:Date.now()-start,error:error.stack});console.error('FAIL '+name+': '+error.message);}
}
async function fulfill(route,options){try{return await route.fulfill(options);}catch(error){if(!/Target.*closed|Route is already handled|Invalid InterceptionId|Request.*(?:cancel|abort)/i.test(String(error)))throw error;}}
async function context({width=1440,theme='light',javascript=true,now=epoch,motion='no-preference'}={}){
  const ctx=await browser.newContext({viewport:{width,height:1000},colorScheme:theme,javaScriptEnabled:javascript,reducedMotion:motion,serviceWorkers:'block'});
  ctx.setDefaultTimeout(15000);
  if(javascript)await ctx.addInitScript(({now,theme})=>{
    window.__meNow=now;const NativeDate=Date;
    window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[window.__meNow]));}static now(){return window.__meNow;}};
    Math.random=()=>0.371;try{localStorage.setItem('xieyuqing-blog-theme',theme);}catch(_){}
    const set=window.setInterval.bind(window),clear=window.clearInterval.bind(window);window.__meIntervals=new Map();
    window.setInterval=(fn,delay,...args)=>{const id=set(fn,delay,...args);window.__meIntervals.set(id,{fn,delay,args});return id;};
    window.clearInterval=id=>{window.__meIntervals.delete(id);clear(id);};
    window.__meMinute=()=>{for(const timer of [...window.__meIntervals.values()])if(timer.delay===60000)timer.fn(...timer.args);};
  },{now,theme});
  await ctx.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(['data:','blob:'].includes(url.protocol))return route.continue();
    if(url.origin==='https://api.open-meteo.com'){
      report.weatherFixtures++;
      return fulfill(route,{contentType:'application/json',body:JSON.stringify({timezone:'Asia/Kuala_Lumpur',current:{time:'2026-10-29T12:00',temperature_2m:21.4,weather_code:3,apparent_temperature:20.2,relative_humidity_2m:65,wind_speed_10m:12,wind_direction_10m:180,pressure_msl:1015},daily:{time:['2026-10-29'],temperature_2m_max:[25],temperature_2m_min:[18],precipitation_probability_max:[15]}})});
    }
    if(url.origin!==origin){report.external.push(url.href);return route.abort();}
    try{
      let file=path.resolve(site,'.'+decodeURIComponent(url.pathname));
      assert(file===site||file.startsWith(site+path.sep),'A local response must stay inside the publication');
      if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
      return fulfill(route,{contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
    }catch(error){report.missing.push({url:url.href,error:error.message});return fulfill(route,{status:404,body:'Missing local publication file'});}
  });
  ctx.on('page',page=>{page.on('pageerror',error=>report.errors.push(error.stack||error.message));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});});
  return ctx;
}
async function ready(page){
  await page.waitForFunction(()=>window.SiteNavigation&&!SiteNavigation.state().transition&&new URL(SiteNavigation.state().rendered).pathname===location.pathname);
  // Navigation completion and script mounting are distinct lifecycle events.
  // Wait for the real controller signal, including after an SPA return.
  await page.waitForFunction(()=>{
    const root=document.querySelector('[data-marx-engels]');
    if(!root)return true;
    if(root.dataset.meMounted!=='true')return false;
    return !root.querySelector('[data-me-quiz],[data-me-quotes-data],[data-me-life-filters],[data-me-letters-data]')||root.dataset.mePlayMounted==='true';
  });
  await page.evaluate(()=>document.fonts.ready);
}
async function go(page,route){await page.goto(origin+route);await ready(page);}
async function using(options,fn){const ctx=await context(options);try{return await fn(await ctx.newPage(),ctx);}finally{await ctx.close();}}
async function screenshot(page,name,fullPage=true){const file=path.join(out,name+'.png');await page.screenshot({path:file,fullPage});report.screenshots.push(file);}

function contentRoute(item,kind){
  if(kind==='guides')return `/marx/capital/${item.volume}/ch${String(item.chapter).padStart(2,'0')}/`;
  if(kind==='parts')return `/marx/capital/${item.volume}/part${item.part}/`;
  return kind==='works'?`/marx/works/${item.slug}/`:`/marx/${item.slug}/`;
}
function allReadingRoutes(){
  const routes=['/marx/','/marx/cards/','/marx/sources/','/marx/qa/','/marx/wenji/','/marx/capital/','/marx/capital/english/','/marx/capital/routes/',
    ...Array.from({length:10},(_,i)=>`/marx/wenji/${i+1}/`),...capital.map(volume=>`/marx/capital/${volume.no}/`),
    '/marx/lab/','/marx/lab/value-form/','/marx/lab/working-day/','/marx/lab/reproduction/','/marx/play/','/marx/quotes/','/marx/life/','/marx/life/letters/','/marx/topics/','/marx/topics/china/',
    ...Object.keys(topicData).map(name=>`/marx/topics/${name}/`),'/today/','/en/today/'];
  for(const kind of ['cards','works','guides','parts'])for(const item of catalog[kind]||[])if(item.status==='published')routes.push(contentRoute(item,kind));
  return [...new Set(routes)];
}
async function geometry(page){
  const result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
    internal:[...document.querySelectorAll('.me-main *')].filter(n=>n.getClientRects().length&&/^(auto|scroll)$/.test(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+2).map(n=>n.className||n.id),
    clipped:[...document.querySelectorAll('.me-prose p,.me-citation blockquote,.me-row p,.me-daily p')].filter(n=>n.getClientRects().length&&(getComputedStyle(n).webkitLineClamp!=='none'||/hidden|clip/.test(getComputedStyle(n).overflowY))&&n.scrollHeight>n.clientHeight+2).map(n=>n.className||n.id)}));
  assert(result.scroll<=result.width+1,'Horizontal overflow: '+JSON.stringify(result));assert.deepEqual(result.internal,[]);assert.deepEqual(result.clipped,[]);return result;
}
async function contrasts(page,route,theme,width){
  const values=await page.evaluate(()=>{
    const rgba=value=>{const n=value.match(/[\d.]+/g)?.map(Number)||[];return n.length>=3?[...n.slice(0,3),n[3]??1]:[0,0,0,0];};
    const blend=(a,b)=>a.slice(0,3).map((c,i)=>c*a[3]+b[i]*(1-a[3]));
    const luminosity=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    function bg(node){let chain=[];for(let n=node;n;n=n.parentElement)chain.unshift(rgba(getComputedStyle(n).backgroundColor));return chain.reduce((b,a)=>blend(a,b),[255,255,255]);}
    return [...document.querySelectorAll('.me-main a,.me-meta,.me-basis,.me-editorial,.me-volume,.me-swap,#marx-reading-entry')].filter(n=>n.getClientRects().length&&n.textContent.trim()).map(n=>{
      const style=getComputedStyle(n),back=bg(n),front=blend(rgba(style.color),back);const a=luminosity(front),b=luminosity(back);
      return {text:n.textContent.trim().slice(0,65),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),size:parseFloat(style.fontSize),weight:parseInt(style.fontWeight)||400};
    });
  });
  for(const value of values){const large=value.size>=24||value.size>=18.66&&value.weight>=700;assert(value.ratio+0.01>=(large?3:4.5),'Contrast '+JSON.stringify({route,theme,width,...value}));}
  report.contrasts.push({route,theme,width,count:values.length,minimum:Math.min(...values.map(v=>v.ratio))});
}

(async()=>{try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});report.browser=browser.version();
  await check('Chinese-only shell, complete bookcase and original source pointers',()=>using({},async page=>{
    await go(page,'/marx/');assert.equal((await page.locator('h1').textContent()).trim(),'读马恩');
    assert.equal(await page.locator('.me-bookcase>.me-spine').count(),10);assert.equal(await page.locator('.site-language-switch').count(),0);
    const featured=page.locator('[data-me-featured]'),groups=page.locator('[data-me-featured-group]');
    assert.equal(await featured.count(),catalog.columns.reduce((total,column)=>total+Math.min(2,cards.filter(card=>card.column===column.id).length),0));
    assert.equal(await groups.count(),catalog.columns.length);
    for(let index=0;index<catalog.columns.length;index++){
      const column=catalog.columns[index],group=groups.nth(index),expected=cards.filter(card=>card.column===column.id).slice(0,2);
      assert.equal((await group.locator('h2').textContent()).trim(),column.title);
      assert.deepEqual(await group.locator('[data-me-featured] h3 a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),expected.map(card=>'/marx/'+card.slug+'/'));
      assert.deepEqual(await group.locator('[data-me-featured] h3 a').allTextContents(),expected.map(card=>card.title));
      assert.deepEqual(await group.locator('[data-me-featured]>p:not(.me-meta)').allTextContents(),expected.map(card=>card.summary));
      assert.equal(await group.locator('.me-column-more a').getAttribute('href'),'/marx/cards/?column='+column.id);
    }
    assert.match(await page.locator('main a[href="/marx/cards/"]').textContent(),new RegExp('看全部 '+cards.length+' 张卡片'));
    assert.equal(await page.locator('[data-me-next]').isVisible(),true);
    await go(page,'/marx/cards/');assert.equal(await page.locator('[data-me-row]').count(),cards.length);
    for(const route of ['/marx/wenji/10/','/marx/capital/1/','/marx/capital/english/']){
      await go(page,route);for(const anchor of await page.locator('main a[href^="https://www.marxists.org/"]').all()){
        assert.equal(await anchor.getAttribute('target'),'_blank');assert.match(await anchor.getAttribute('rel'),/noopener/);
      }
    }
    assert.equal(await page.locator('.me-comparison tbody tr').count(),25);
  }));
  await check('keyboard filters, query parameters and returning to the same directory',()=>using({width:390},async page=>{
    await go(page,'/marx/?branch=economics&level=2');
    assert.equal(new URL(page.url()).pathname,'/marx/cards/');
    const expected=cards.filter(card=>card.branch.includes('economics')&&card.level===2).length;
    assert.equal(await page.locator('[data-me-row]:visible').count(),expected);
    const allLevels=page.locator('[data-me-level="all"]');await allLevels.focus();await allLevels.press('Space');
    assert.equal(new URL(page.url()).searchParams.get('branch'),'economics');assert.equal(new URL(page.url()).searchParams.get('level'),null);
    const target=page.locator('[data-me-row]:visible [data-me-card-link]').first();assert.match(await target.getAttribute('href'),/branch=economics/);
    await target.click();await ready(page);await page.locator('[data-me-return]').click();await ready(page);
    assert.equal(new URL(page.url()).searchParams.get('branch'),'economics');assert.equal(new URL(page.url()).hash,'#directory');
    assert.equal(await page.locator('[data-me-row]:visible').count(),cards.filter(c=>c.branch.includes('economics')).length);
    await page.locator('[data-me-column="myths"]').focus();await page.locator('[data-me-column="myths"]').press('Space');
    assert.equal(new URL(page.url()).searchParams.get('column'),'myths');
    assert.equal(await page.locator('[data-me-row]:visible').count(),cards.filter(c=>c.branch.includes('economics')&&c.column==='myths').length);
    await page.reload();await ready(page);assert.equal(await page.locator('[data-me-column="myths"]').getAttribute('aria-pressed'),'true');
    const historyBefore=await page.evaluate(()=>history.length);
    await page.evaluate(()=>window.SiteNavigation.visit('/marx/?branch=economics&level=1&column=myths#directory'));await ready(page);
    const redirected=new URL(page.url());assert.equal(redirected.pathname,'/marx/cards/');assert.equal(redirected.searchParams.get('branch'),'economics');assert.equal(redirected.searchParams.get('level'),'1');assert.equal(redirected.searchParams.get('column'),'myths');assert.equal(redirected.hash,'#directory');
    assert.equal(await page.evaluate(()=>history.length),historyBefore+1);
    assert.equal(await page.locator('[data-me-row]:visible').count(),cards.filter(c=>c.branch.includes('economics')&&c.level===1&&c.column==='myths').length);
    await geometry(page);
  }));
  await check('daily card traverses the pool and resets only at Beijing midnight',()=>using({},async page=>{
    await go(page,'/marx/');const button=page.locator('[data-me-next]'),current=()=>page.locator('[data-me-daily]').getAttribute('data-slug');
    const first=await current(),seen=[first];
    assert.equal(first,cards[reader.daySeed('2026-10-29')%cards.length].slug);
    for(let i=1;i<cards.length;i++){await button.click();seen.push(await current());}
    assert.equal(new Set(seen).size,cards.length);assert.deepEqual(new Set(seen),new Set(cards.map(c=>c.slug)));
    await button.focus();await button.press('Enter');const selected=await current();assert.notEqual(selected,seen.at(-1));
    await page.evaluate(()=>window.__meMinute());assert.equal(await current(),selected);
    await page.evaluate(()=>{window.__meNow=Date.parse('2026-10-29T16:00:00Z');window.__meMinute();});
    assert.equal(await current(),cards[reader.daySeed('2026-10-30')%cards.length].slug);
    assert.equal((await page.locator('[data-me-daily-date]').textContent()).trim(),'2026-10-30 · 北京时间');
    await geometry(page);
  }));
  await check('SPA entry and exit remove the reading timer and do not double-mount controls',()=>using({},async page=>{
    await go(page,'/marx/');const timers=()=>page.evaluate(()=>[...window.__meIntervals.values()].filter(t=>t.delay===60000).length);
    await page.locator('[data-me-next]').waitFor({state:'visible'});
    assert.equal(await timers(),1);
    for(let i=0;i<3;i++){
      await page.locator('[data-me-daily-title]').click();await ready(page);assert.equal(await timers(),0);
      await page.locator('[data-me-return]').click();await ready(page);assert.equal(new URL(page.url()).pathname,'/marx/cards/');assert.equal(await timers(),0);
      await page.locator('.me-breadcrumb a[href="/marx/"]').click();await ready(page);await page.locator('[data-me-next]').waitFor({state:'visible'});assert.equal(await timers(),1);
      assert.equal(await page.locator('[data-me-next]').count(),1);
      const before=await page.locator('[data-me-daily]').getAttribute('data-slug');await page.locator('[data-me-next]').click();
      assert.notEqual(await page.locator('[data-me-daily]').getAttribute('data-slug'),before);
    }
  }));
  await check('header, footer, projects and both Today entries; quotation handoff stays intact',()=>using({},async page=>{
    for(const language of ['zh-CN','en']){
      const prefix=language==='en'?'/en':'';await go(page,prefix+'/projects/');
      assert.equal(await page.locator('.site-nav .nav-entry').count(),4);
      await page.locator('.site-nav [data-nav-group="projects"]>details>summary').press('Enter');
      const entries=page.locator('.site-nav [data-nav-group="projects"] .nav-menu>a');
      assert.deepEqual(await entries.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href'))),[prefix+'/today/','/world/','/english/','/marx/',prefix+'/projects/',prefix+'/game/']);
      assert.equal(await page.locator('main a.section-entry[href="/marx/"]').count(),1);
      assert.equal(await page.locator('.site-footer nav a[href="/marx/"]').count(),1);
      await go(page,prefix+'/today/');const entry=page.locator('#marx-reading-entry');
      assert.equal(await entry.getAttribute('href'),'/marx/');assert.equal((await entry.textContent()).trim(),language==='en'?'Read Marx & Engels (in Chinese) →':'去读马恩 →');
    }
    await go(page,'/today/');await page.locator('#daily-quote-button').click();await page.locator('#english-quote-button').click();
    const state=await page.evaluate(()=>({classic:document.querySelector('#daily-quote').dataset.quoteId,english:document.querySelector('#english-quote').dataset.quoteId}));
    await page.locator('.site-language-switch').click();await ready(page);assert.equal(new URL(page.url()).pathname,'/en/today/');
    assert.deepEqual(await page.evaluate(()=>({classic:document.querySelector('#daily-quote').dataset.quoteId,english:document.querySelector('#english-quote').dataset.quoteId})),state);
    assert.equal((await page.locator('#marx-reading-entry').textContent()).trim(),'Read Marx & Engels (in Chinese) →');
  }));
  await check('Chinese and English footer signatures place the water-drop mark before the name',()=>using({width:390},async page=>{
    for(const route of ['/','/en/']){
      await go(page,route);
      const brand=page.locator('.site-footer .footer-brand');assert.equal(await brand.count(),1);
      const elements=await brand.evaluate(node=>[...node.children].map(child=>({tag:child.tagName,text:child.textContent.trim(),alt:child.getAttribute('alt')})));
      assert.deepEqual(elements.map(element=>element.tag),['IMG','SPAN']);
      assert.equal(elements[1].text,'谢雨卿');assert.equal(elements[0].alt,'');
      const mark=brand.locator('img');await mark.evaluate(image=>image.decode());assert((await mark.evaluate(image=>image.naturalWidth))>0);
    }
  }));
  await check('without JavaScript, directories, chapter guides, sources and native menus remain usable',()=>using({width:320,javascript:false},async page=>{
    for(const route of ['/marx/','/marx/cards/','/marx/wenji/10/','/marx/capital/1/','/marx/capital/1/ch01/','/marx/works/manifesto/','/marx/commodity/','/marx/sources/']){
      await page.goto(origin+route);assert.equal(await page.locator('h1').count(),1);await geometry(page);
      if(route==='/marx/'){assert.equal(await page.locator('[data-me-next]').isVisible(),false);assert.equal(await page.locator('[data-me-filters]').count(),0);assert.equal(await page.locator('[data-me-featured]:visible').count(),catalog.columns.reduce((total,column)=>total+Math.min(2,cards.filter(card=>card.column===column.id).length),0));}
      if(route==='/marx/cards/'){assert.equal(await page.locator('[data-me-row]:visible').count(),cards.length);assert.equal(await page.locator('[data-me-filters]').isVisible(),false);}
      if(route==='/marx/wenji/10/'){
        assert.equal(await page.locator('.me-letters li').count(),280);
        for(const decade of await page.locator('.me-decade').all())if(await decade.getAttribute('open')===null){await decade.locator(':scope>summary').focus();await decade.locator(':scope>summary').press('Enter');}
        assert.equal(await page.locator('.me-letters li:visible').count(),280);
      }
    }
    await screenshot(page,'marx-sources-320-no-js');
  }));
  await check('the added works-menu destination fits on a narrow screen in either language',()=>using({width:320},async page=>{
    for(const prefix of ['', '/en']){
      await go(page,prefix+'/projects/');const menu=page.locator('.site-nav [data-nav-group="projects"]');
      await menu.locator('summary').focus();await menu.locator('summary').press('Enter');
      const target=menu.locator('a[href="/marx/"]');assert.equal(await target.isVisible(),true);await geometry(page);
      await target.click();await ready(page);assert.equal(new URL(page.url()).pathname,'/marx/');
      assert.equal((await page.locator('h1').textContent()).trim(),'读马恩');assert.equal(await page.locator('.site-language-switch').count(),0);await geometry(page);
      await page.locator('.site-nav a[href="/about/"]').click();await ready(page);assert.equal(await page.locator('.site-language-switch').count(),1);
      const works=page.locator('.site-nav [data-nav-group="projects"]');await works.locator('summary').click();
      await works.locator('a[href="/english/"]').click();await ready(page);assert.equal(await page.locator('.site-language-switch').count(),0);
      await page.locator('.site-nav a[href="/about/"]').click();await ready(page);assert.equal(await page.locator('.site-language-switch').count(),1);
    }
  }));
  await check('three laboratories accept keyboard input and preserve original-number fallbacks',()=>using({width:390},async page=>{
    await go(page,'/marx/lab/value-form/');
    assert.equal(await page.locator('[data-lab-step]:visible').count(),1);
    for(let step=1;step<4;step++){
      await page.locator('[data-lab-next]').focus();await page.locator('[data-lab-next]').press('Enter');
      assert.equal((await page.locator('[data-lab-position]').textContent()).trim(),`第${step+1}步，共4步`);
      assert.equal(await page.evaluate(()=>document.activeElement.matches('[data-lab-step] h2')),true);
    }
    assert.equal(await page.locator('[data-lab-next]').isDisabled(),true);
    await go(page,'/marx/lab/working-day/');
    const total=page.locator('input[name="total"]'),necessary=page.locator('input[name="necessary"]');
    await total.focus();await total.press('ArrowRight');assert.equal(await total.inputValue(),'12.5');
    for(const [preset,result] of [['7','约16.7%'],['9','50%'],['12','100%']]){
      await page.locator(`[data-lab-preset="${preset}"]`).click();assert.match(await page.locator('[data-lab-result]').textContent(),new RegExp(result.replace('.','\\.')));
    }
    await necessary.focus();await necessary.press('Home');assert.match(await page.locator('[data-lab-result]').textContent(),/大于0/);
    await screenshot(page,'v2-working-day-390-viewport');
    await go(page,'/marx/lab/reproduction/');
    const inputs=page.locator('[data-lab-reproduction] input'),result=page.locator('[data-lab-result]');
    assert.match(await result.textContent(),/合计9,000/);
    await inputs.nth(2).fill('1001');assert.match(await result.textContent(),/不相等/);
    await inputs.nth(1).fill('0');assert.match(await result.textContent(),/未定义/);
    await inputs.first().fill('-1');assert.match(await result.textContent(),/有限非负数/);
    await page.locator('[data-lab-reset]').focus();await page.locator('[data-lab-reset]').press('Enter');
    assert.deepEqual(await inputs.evaluateAll(nodes=>nodes.map(n=>Number(n.value))),[4000,1000,1000,2000,500,500]);
    assert.match(await result.textContent(),/数值交换条件相等/);await geometry(page);
    await screenshot(page,'v2-reproduction-390-light');
  }));
  await check('ten part guides and eight third-volume chapter guides retain their original structure and own-volume navigation',()=>using({width:1440},async page=>{
    const parts=(catalog.parts||[]).filter(item=>item.status==='published');assert.equal(parts.length,10);
    const expectedHeadings=['一句话','这一篇在全书中的位置','各章怎么读','关键概念','常见误读','原文片段','英文对应'];
    for(const item of parts){
      await go(page,contentRoute(item,'parts'));
      assert.deepEqual((await page.locator('.me-prose>section>h2').allTextContents()).map(value=>value.trim()),expectedHeadings);
      const part=capital.find(volume=>volume.no===item.volume).parts.find(part=>part.no===item.part);
      const section=page.locator('.me-prose>section').filter({has:page.getByRole('heading',{name:'各章怎么读',exact:true})});
      const originals=section.locator(':scope > ol.me-toc > li > h3 > a');
      assert.deepEqual(await originals.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href'))),part.chapters.map(chapter=>chapter.mia));
      assert.deepEqual((await originals.allTextContents()).map(value=>value.replace(/\s*↗\s*$/,'').trim()),part.chapters.map(chapter=>'第'+chapter.no+'章 · '+chapter.title));
      assert.deepEqual(await section.locator(':scope > ol.me-toc > li > p:first-of-type').allTextContents(),item.chapter_notes.map(note=>note.text));
      const english=page.locator('.me-prose>section').filter({has:page.getByRole('heading',{name:'英文对应',exact:true})});
      assert.deepEqual(await english.locator('li[lang="en"]>a').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href'))),part.chapters.flatMap(chapter=>(chapter.en||[]).map(row=>row.url)));
      assert.deepEqual(await page.locator('figure.me-citation').evaluateAll(nodes=>nodes.map(node=>node.dataset.citation)),item.citations);
      assert.equal(await page.locator(`main a[href="/marx/capital/${item.volume}/#part-${item.part}"]`).count(),1);
      if(item.volume===2&&item.part===1){await screenshot(page,'v3-capital-2-part1-1440-light');await screenshot(page,'v3-capital-2-part1-1440-light-viewport',false);}
      await geometry(page);
    }
    const chapters=catalog.guides.filter(item=>item.status==='published'&&item.volume===3);assert.deepEqual(chapters.map(item=>item.chapter).sort((a,b)=>a-b),[9,13,14,15,23,25,27,48]);
    for(const item of chapters){
      await go(page,contentRoute(item,'guides'));
      assert.equal(await page.locator(`main a[href="/marx/capital/3/#ch${String(item.chapter).padStart(2,'0')}"]`).count(),1);
      assert.equal(await page.locator('main a[href="/marx/capital/english/"]').count(),0);
      const chapter=capital[2].parts.flatMap(part=>part.chapters).find(chapter=>chapter.no===item.chapter);
      assert.equal(await page.locator(`main a[href="${chapter.mia}"]`).count()>=1,true);await geometry(page);
    }
    for(const volume of capital.slice(1)){
      await go(page,`/marx/capital/${volume.no}/`);
      const actual=await page.locator('main a').evaluateAll(nodes=>nodes.filter(node=>node.textContent.trim()==='本篇导读 →').map(node=>node.getAttribute('href')));
      assert.deepEqual(actual,parts.filter(item=>item.volume===volume.no).map(item=>contentRoute(item,'parts')));
    }
  }));
  await check('three new topics keep every reviewed item, citation, index anchor and primary source',()=>using({width:390},async page=>{
    await go(page,'/marx/topics/');for(const name of Object.keys(topicData))assert.equal(await page.locator(`main a[href="/marx/topics/${name}/"]`).count(),1);
    for(const [name,topic] of Object.entries(topicData)){
      await go(page,`/marx/topics/${name}/`);assert.equal((await page.locator('h1').textContent()).trim(),topic.title);
      assert.deepEqual(await page.locator('nav[aria-label="本页专题"] a').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href'))),topic.sections.map(section=>'#'+section.id));
      for(const section of topic.sections){
        const rendered=page.locator('#'+section.id);assert.equal(await rendered.count(),1);
        for(const item of section.items){
          const article=page.locator('#'+item.id);assert.equal(await article.count(),1);
          assert.equal((await article.locator(':scope>h3').textContent()).trim(),item.title);
          assert.equal((await article.locator(':scope>p').first().textContent()).trim(),item.text);
          assert.equal(await article.locator(`a[href="${item.source.url}"]`).count()>=1,true);
          assert.deepEqual(await article.locator('figure.me-citation').evaluateAll(nodes=>nodes.map(node=>node.dataset.citation)),item.citations);
          for(const route of item.related)assert.equal(await article.locator(`a[href="${route}"]`).count()>=1,true);
        }
      }
      assert.match(await page.locator('main').innerText(),/AI辅助/);await geometry(page);
      if(name==='late-engels')await screenshot(page,'v3-late-engels-390-light');
    }
  }));
  await check('expanded evidence cards and eight bookshelf cards have complete reader sections and directory entries',()=>using({width:390},async page=>{
    const myths=cards.filter(card=>card.column==='myths'),shelf=cards.filter(card=>card.column==='shelf');
    assert(myths.length>=14,'At least six evidence cards must be added to the original eight');assert(shelf.length>=8);
    for(const [column,items,headings] of [['myths',myths,['流行说法','证据','结论']],['shelf',shelf,['典故','马恩怎样用','可以接着读']]]){
      await go(page,'/marx/cards/?column='+column);assert.equal(await page.locator('[data-me-row]:visible').count(),items.length);
      for(const item of items){
        await go(page,contentRoute(item,'cards'));
        assert.deepEqual((await page.locator('.me-prose>section>h2').allTextContents()).map(value=>value.trim()),headings);
        assert.deepEqual(await page.locator('figure.me-citation').evaluateAll(nodes=>nodes.map(node=>node.dataset.citation)),item.citations);
        for(const id of item.citations){const source=citations.find(citation=>citation.id===id);assert(source);assert.equal(await page.locator(`main a[href="${source.url}"]`).count()>=1,true);}
        if(column==='myths')assert.equal((await page.locator('.me-verdict').textContent()).trim(),item.verdict);
        assert.equal(new URL(await page.locator('main a[data-me-return]').getAttribute('href'),page.url()).href,new URL('/marx/cards/#directory',page.url()).href);await geometry(page);
      }
    }
  }));
  await check('all three quiz modes complete ten distinct questions, explain answers and review mistakes',()=>using({width:390},async page=>{
    await go(page,'/marx/play/');
    const pools=JSON.parse(await page.locator('[data-me-quiz-data]').textContent());
    assert(pools.myth.length>=32,'The completed third edition must have at least 32 true/false questions');
    assert.deepEqual(new Set(pools.myth.map(question=>question.answer)),new Set(['真','假','存疑','部分正确','张冠李戴']));
    assert(pools.myth.filter(question=>['存疑','部分正确','张冠李戴'].includes(question.answer)).length>=8);
    for(const card of cards.filter(card=>card.column==='myths'))assert(pools.myth.filter(question=>question.reading==='/marx/'+card.slug+'/').length>=2,'Every evidence card needs at least two questions: '+card.slug);
    for(const mode of ['source','author','myth']){
      await page.locator(`[data-quiz-mode="${mode}"]`).focus();await page.locator(`[data-quiz-mode="${mode}"]`).press('Enter');
      const seen=[];
      for(let i=0;i<10;i++){
        const id=await page.locator('[data-me-quiz] form').getAttribute('data-question-id');seen.push(id);
        const question=pools[mode].find(q=>q.id===id);assert(question);
        const choices=await page.locator('[data-me-quiz] form label').allTextContents();
        const correct=i%3===0;
        const choice=choices.findIndex(c=>correct?c.trim()===question.answer:c.trim()!==question.answer);assert(choice>=0);
        const input=page.locator('[data-me-quiz] form input').nth(choice);await input.focus();await input.press('Space');
        await page.locator('[data-me-quiz] form button').press('Enter');
        const explanation=page.locator('[data-me-quiz-explanation]');assert.equal(await explanation.isVisible(),true);
        assert.equal(await explanation.getAttribute('aria-live'),'polite');assert.equal(await explanation.evaluate(n=>n===document.activeElement),true);
        assert.equal(await explanation.locator('a').count(),2);
        assert.equal(await explanation.locator('a').nth(0).getAttribute('href'),question.source);assert.equal(await explanation.locator('a').nth(1).getAttribute('href'),question.reading);
        const feedback=await explanation.locator('strong').textContent();
        assert(feedback.startsWith(correct?'答对了。':'答错了。你选的是'));
        const marked=await page.locator('[data-me-quiz] form [data-me-choice]').allTextContents();
        assert.equal(marked.filter(text=>text.includes('✓')).length,1);
        assert.equal(marked.filter(text=>text.includes('✗')).length,correct?0:1);
        assert.equal(await page.locator('[data-me-quiz] form input:enabled').count(),0);
        if(mode==='source'){
          assert(question.explanation.length<=60);assert(!/电子录入|字符|CID|已核字段/.test(question.explanation));
          const version=explanation.locator('details');assert.equal(await version.locator('summary').textContent(),'版本说明');assert.equal(await version.getAttribute('open'),null);
        }
        if(mode==='source'&&i===1)await screenshot(page,'v3-quiz-wrong-390-light');
        await page.locator('[data-quiz-next]').focus();await page.locator('[data-quiz-next]').press('Enter');
      }
      assert.equal(new Set(seen).size,10);assert.match(await page.locator('[data-me-quiz] form').textContent(),/本轮答对 4 \/ 10/);
      const review=page.locator('[data-me-wrong-review]');assert.equal(await review.count(),6);
      for(const detail of await review.all()){
        assert.match(await detail.textContent(),/你的答案：/);assert.match(await detail.textContent(),/正确答案：/);
      }
      await page.locator('[data-quiz-restart]').click();assert.match(await page.locator('[data-me-quiz] form h2').textContent(),/第1 \/ 10题/);
    }
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>/marx|quiz|score/i.test(k)).length),0);
    await geometry(page);
  }));
  await check('quotation and letter decks traverse every item before repeating',()=>using({width:390},async page=>{
    await go(page,'/marx/quotes/');
    const groups=JSON.parse(await page.locator('[data-me-quotes-data]').textContent());
    assert.equal(groups.reduce((sum,pool)=>sum+pool.length,0),250);
    assert.equal(await page.locator('[data-me-quote-group]').count(),groups.length);
    const workData=new Map();for(const row of quoteMappings){const current=workData.get(row.work)||{year:Infinity,count:0};current.year=Math.min(current.year,row.year??Infinity);current.count++;workData.set(row.work,current);}
    const ordered=[...workData].sort((a,b)=>a[1].year-b[1].year||b[1].count-a[1].count||(a[0]<b[0]?-1:a[0]>b[0]?1:0));
    assert.deepEqual((await page.locator('[data-me-quote-group] h2').allTextContents()).map(value=>value.trim()),ordered.map(([work])=>work));
    assert.equal(await page.locator('nav[aria-label="著作索引"] a').count(),ordered.length);
    for(const anchor of await page.locator('nav[aria-label="著作索引"] a').all())assert(await anchor.evaluate(link=>Boolean(document.getElementById(new URL(link.href).hash.slice(1)))));
    const index=groups.findIndex(pool=>pool.length>2),row=page.locator('[data-me-quote-group]').nth(index),seen=[];
    for(let i=0;i<groups[index].length;i++){
      seen.push(await row.getAttribute('data-quote-id'));if(i+1<groups[index].length)await row.locator('[data-me-quote-next]').click();
    }
    assert.equal(new Set(seen).size,groups[index].length);await geometry(page);
    await go(page,'/marx/life/letters/');
    const letters=JSON.parse(await page.locator('[data-me-letters-data]').textContent()),nos=[];
    for(let i=0;i<letters.length;i++){
      nos.push(await page.locator('[data-me-letter]').getAttribute('data-letter-no'));if(i+1<letters.length)await page.locator('[data-me-letter-next]').click();
    }
    assert.equal(new Set(nos).size,letters.length);assert.equal(letters.length,selectedLetters.length);
    assert.deepEqual(new Set(nos.map(Number)),new Set(selectedLetters.map(row=>row.no)));await geometry(page);
  }));
  await check('life filters preserve URL precision and clean up across SPA transitions',()=>using({width:320},async page=>{
    await go(page,'/marx/life/?person=engels');
    const visible=await page.locator('[data-me-event]:visible').evaluateAll(nodes=>nodes.map(n=>n.dataset.person));
    assert(visible.every(p=>p==='engels'||p==='both'));assert(visible.length>0);
    await page.locator('[data-me-person="both"]').focus();await page.locator('[data-me-person="both"]').press('Space');
    assert.equal(new URL(page.url()).searchParams.get('person'),'both');
    assert((await page.locator('[data-me-event]:visible').evaluateAll(nodes=>nodes.map(n=>n.dataset.person))).every(p=>p==='both'));
    await page.locator('[data-me-person="engels"]').click();
    await page.locator('[data-me-tag="书信"]').focus();await page.locator('[data-me-tag="书信"]').press('Space');
    assert.equal(new URL(page.url()).searchParams.get('person'),'engels');assert.equal(new URL(page.url()).searchParams.get('tag'),'书信');
    const expected=lifeEvents.filter(event=>(event.people==='engels'||event.people==='both')&&event.tags.includes('书信')).map(event=>event.id);
    assert(expected.length>0);
    assert.deepEqual(await page.locator('[data-me-event]').evaluateAll(nodes=>nodes.filter(n=>!n.hidden).map(n=>n.id)),expected);
    await page.reload();await ready(page);assert.equal(await page.locator('[data-me-tag="书信"]').getAttribute('aria-pressed'),'true');
    assert.deepEqual(await page.locator('[data-me-event]').evaluateAll(nodes=>nodes.filter(n=>!n.hidden).map(n=>n.id)),expected);
    await page.locator('[data-me-tag="all"]').click();await page.locator('[data-me-person="both"]').click();
    await page.reload();await ready(page);assert.equal(await page.locator('[data-me-person="both"]').getAttribute('aria-pressed'),'true');
    for(let cycle=0;cycle<3;cycle++){
      await page.locator('a[href="/marx/life/letters/"]').click();await ready(page);assert.equal(await page.locator('[data-me-letter-next]').count(),1);
      await page.locator('.me-breadcrumb a[href="/marx/"]').click();await ready(page);
      await page.locator('.me-other-ways a[href="/marx/life/"]').click();await ready(page);
      assert.equal(await page.locator('[data-me-life-filters]').count(),1);await page.locator('[data-me-person="marx"]').click();
      assert.equal(new URL(page.url()).searchParams.get('person'),'marx');
    }
    await geometry(page);
  }));
  await check('period and letter indexes reveal collapsed targets before scrolling and retain native keyboard controls',()=>using({width:375},async page=>{
    await go(page,'/marx/life/');
    const links=page.locator('nav[aria-label="生平时期"] a'),last=links.last(),hash=await last.getAttribute('href');
    await last.focus();await last.press('Enter');
    await page.waitForFunction(hash=>{const target=document.getElementById(hash.slice(1));return target?.open&&[...document.querySelectorAll('[data-me-life-period]')].filter(period=>period.open).length===1;},hash);
    await page.waitForFunction(hash=>document.getElementById(hash.slice(1)).getBoundingClientRect().top<150,hash);
    await page.setViewportSize({width:1440,height:1000});await page.waitForFunction(()=>[...document.querySelectorAll('[data-me-life-period]')].every(period=>period.open));
    await page.setViewportSize({width:375,height:1000});await page.waitForFunction(()=>[...document.querySelectorAll('[data-me-life-period]')].filter(period=>period.open).length===1);
    await go(page,'/marx/wenji/10/');
    const year=page.locator('nav[aria-label="书信年份"] a[href="#year-1871"]');await year.focus();await year.press('Enter');
    assert.equal(await page.locator('#year-1871').evaluate(node=>node.closest('details').open),true);
    const summary=page.locator('.me-decade').filter({has:page.locator('#year-1871')}).locator(':scope>summary');
    await summary.focus();await summary.press('Enter');assert.equal(await summary.evaluate(node=>node.parentElement.open),false);
    await summary.press('Enter');assert.equal(await summary.evaluate(node=>node.parentElement.open),true);await geometry(page);
  }));
  await check('second-edition content stays readable without JavaScript',()=>using({width:320,javascript:false},async page=>{
    for(const route of ['/marx/lab/value-form/','/marx/lab/working-day/','/marx/lab/reproduction/','/marx/play/','/marx/quotes/','/marx/life/','/marx/life/letters/','/marx/topics/china/','/marx/between-labour-power/']){
      await page.goto(origin+route);assert.equal(await page.locator('h1').count(),1);await geometry(page);
      if(route.endsWith('value-form/'))assert.equal(await page.locator('[data-lab-step]:visible').count(),4);
      if(route.endsWith('working-day/'))assert.equal(await page.locator('table tbody tr').count(),3);
      if(route==='/marx/life/'){
        const periods=page.locator('[data-me-life-period]');assert(await periods.count()>=4);
        assert.equal(await periods.first().getAttribute('open'),'');
        for(const period of await periods.all())if(await period.getAttribute('open')===null){await period.locator(':scope > summary').focus();await period.locator(':scope > summary').press('Enter');}
        assert.equal(await page.locator('[data-me-event]:visible').count(),lifeEvents.length);
      }
      if(route.endsWith('letters/')){await page.locator('.me-reading details > summary').click();assert.equal(await page.locator('details li').count(),selectedLetters.length);}
      if(route==='/marx/quotes/')assert.equal(await page.locator('[data-me-quote-group]').count(),40);
      if(route.endsWith('china/'))assert.equal(await page.locator('li[id^="v02-"]').count(),12);
      if(route==='/marx/play/')assert.equal(await page.locator('[data-me-quiz-controls]').isVisible(),false);
    }
  }));
  await check('third-edition part, chapter, topic and bookshelf reading remains available without JavaScript',()=>using({width:320,javascript:false},async page=>{
    const shelf=cards.find(card=>card.column==='shelf');assert(shelf);
    const routes=['/marx/capital/2/part1/','/marx/capital/3/part7/','/marx/capital/3/ch23/',...Object.keys(topicData).map(name=>'/marx/topics/'+name+'/'),contentRoute(shelf,'cards')];
    for(const route of routes){
      await page.goto(origin+route);assert.equal(await page.locator('h1').count(),1);assert((await page.locator('main').innerText()).trim().length>400);await geometry(page);
      assert.equal(await page.locator('main a[href^="https://www.marxists.org/"]').count()>0,true);
    }
  }));
  await check('mobile home and collapsed biography stay within the reading-height targets',()=>using({width:375},async page=>{
    for(const [route,limit] of [['/marx/',7000],['/marx/life/',6000]]){
      await go(page,route);await geometry(page);
      const height=await page.evaluate(()=>document.documentElement.scrollHeight);report.heights.push({route,width:375,height,limit});assert(height<=limit,`${route} height ${height} exceeds ${limit}`);
      if(route==='/marx/life/'){
        const periods=page.locator('[data-me-life-period]');assert.equal(await periods.evaluateAll(nodes=>nodes.filter(n=>n.open).length),1);
        const second=periods.nth(1);await second.locator(':scope > summary').focus();await second.locator(':scope > summary').press('Enter');assert.equal(await second.getAttribute('open'),'');
        await second.locator(':scope > summary').press('Enter');assert.equal(await second.getAttribute('open'),null);
        await periods.first().locator(':scope>summary').focus();await periods.first().locator(':scope>summary').press('Enter');
        await page.waitForFunction(()=>document.querySelector('[data-me-life-period]')?.open&&[...document.querySelectorAll('[data-me-life-period]')].filter(period=>period.open).length===1);
      }
      await screenshot(page,route==='/marx/'?'v3-home-375-light':'v3-life-collapsed-375-light');
    }
  }));
  await check('the reviewed Engels anniversary renders in Chinese and English Today',()=>using({width:390,now:Date.parse('2026-11-28T04:00:00Z')},async page=>{
    await go(page,'/today/');assert.match(await page.locator('#daily-history-list').textContent(),/恩格斯/);
    await page.locator('#today-history').scrollIntoViewIfNeeded();
    const file=path.join(out,'v2-today-history-390-light.png');await page.screenshot({path:file});report.screenshots.push(file);
    await page.locator('.site-language-switch').click();await ready(page);assert.match(await page.locator('#daily-history-list').textContent(),/Engels/);
  }));

  await check('two themes and all required widths, with no overflow, clipped reading or inner scroll area',async()=>{
    const routes=allReadingRoutes();report.routeCoverage=routes;
    for(const theme of ['light','dark'])for(const width of widths){
      await using({width,theme},async page=>{
        for(const route of routes){
          await go(page,route);assert.equal(await page.locator('html').getAttribute('data-theme'),theme);await geometry(page);await contrasts(page,route,theme,width);
          report.layouts.push({route,theme,width});
          if(route==='/marx/'&&[1440,390,320].includes(width))await screenshot(page,`marx-home-${width}-${theme}`);
          if(route==='/marx/'&&[1440,390,320].includes(width)){const file=path.join(out,`marx-home-${width}-${theme}-viewport.png`);await page.screenshot({path:file});report.screenshots.push(file);}
          if(width===390&&theme==='light'&&['/marx/capital/english/','/marx/capital/1/ch01/','/marx/commodity/','/marx/human-essence/','/marx/wenji/10/'].includes(route))await screenshot(page,route.replace(/^\//,'').replaceAll('/','-')+'390-light');
          if(width===1440&&theme==='light'&&route==='/today/'){await page.locator('#daily-quotation-card').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'today-marx-entry-1440.png')});report.screenshots.push(path.join(out,'today-marx-entry-1440.png'));}
        }
      });
    }
    return {routes:routes.length,widths,themes:2,layouts:report.layouts.length};
  });
  await check('reduced motion leaves the reading page static',()=>using({width:390,theme:'dark',motion:'reduce'},async page=>{
    await go(page,'/marx/');assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0);await geometry(page);
  }));
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.missing,[]);assert.deepEqual(report.external,[]);
}catch(error){report.errors.push(error.stack||error.message);console.error(error.stack);}
finally{
  await browser?.close();report.finishedAt=new Date().toISOString();
  const failed=report.checks.filter(c=>!c.passed).length;report.success=!(failed||report.errors.length||report.consoleErrors.length||report.missing.length||report.external.length);fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({checks:report.checks.length,passed:report.checks.length-failed,failed,layouts:report.layouts.length,errors:report.errors.length,consoleErrors:report.consoleErrors.length,missing:report.missing.length,external:report.external.length,report:path.join(out,'browser-report.json')}));
  if(failed||report.errors.length||report.consoleErrors.length||report.missing.length||report.external.length)process.exitCode=1;
}})();
