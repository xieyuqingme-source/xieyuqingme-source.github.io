'use strict';
// Installed Chrome; every website response comes from the local publication.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const root=path.resolve(process.env.WEBSITE_ROOT||path.join(__dirname,'..'));
const site=path.resolve(process.env.WEBSITE_SITE||path.join(root,'_site_unified'));
const out=path.resolve(process.env.MARX_BROWSER_OUTPUT||path.join(root,'.local-checks/marx-engels-20261029/browser'));
const temp=path.join(out,'temporary');fs.mkdirSync(temp,{recursive:true});process.env.TEMP=process.env.TMP=temp;
const {chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'marx-engels/catalog.json'),'utf8'));
const cards=catalog.cards.filter(card=>card.status==='published');
const reader=require('../home/assets/marx.js');
const origin='http://read-marx.test',epoch=Date.parse('2026-10-29T04:00:00Z'),widths=[1440,1024,768,390,320];
const report={startedAt:new Date().toISOString(),checks:[],layouts:[],screenshots:[],contrasts:[],errors:[],consoleErrors:[],missing:[],external:[],weatherFixtures:0};
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
async function ready(page){await page.waitForFunction(()=>window.SiteNavigation&&!SiteNavigation.state().transition&&new URL(SiteNavigation.state().rendered).pathname===location.pathname);await page.evaluate(()=>document.fonts.ready);}
async function go(page,route){await page.goto(origin+route);await ready(page);}
async function using(options,fn){const ctx=await context(options);try{return await fn(await ctx.newPage(),ctx);}finally{await ctx.close();}}
async function screenshot(page,name){const file=path.join(out,name+'.png');await page.screenshot({path:file,fullPage:true});report.screenshots.push(file);}
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
    assert.equal(await page.locator('[data-me-row]').count(),28);assert.equal(await page.locator('[data-me-next]').isVisible(),true);
    for(const route of ['/marx/wenji/10/','/marx/capital/1/','/marx/capital/english/']){
      await go(page,route);for(const anchor of await page.locator('main a[href^="https://www.marxists.org/"]').all()){
        assert.equal(await anchor.getAttribute('target'),'_blank');assert.match(await anchor.getAttribute('rel'),/noopener/);
      }
    }
    assert.equal(await page.locator('.me-comparison tbody tr').count(),25);
  }));
  await check('keyboard filters, query parameters and returning to the same directory',()=>using({width:390},async page=>{
    await go(page,'/marx/?branch=economics&level=2');
    const expected=cards.filter(card=>card.branch.includes('economics')&&card.level===2).length;
    assert.equal(await page.locator('[data-me-row]:visible').count(),expected);
    const allLevels=page.locator('[data-me-level="all"]');await allLevels.focus();await allLevels.press('Space');
    assert.equal(new URL(page.url()).searchParams.get('branch'),'economics');assert.equal(new URL(page.url()).searchParams.get('level'),null);
    const target=page.locator('[data-me-row]:visible [data-me-card-link]').first();assert.match(await target.getAttribute('href'),/branch=economics/);
    await target.click();await ready(page);await page.locator('[data-me-return]').click();await ready(page);
    assert.equal(new URL(page.url()).searchParams.get('branch'),'economics');assert.equal(new URL(page.url()).hash,'#directory');
    assert.equal(await page.locator('[data-me-row]:visible').count(),cards.filter(c=>c.branch.includes('economics')).length);
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
    assert.equal(await timers(),1);
    for(let i=0;i<3;i++){
      await page.locator('[data-me-daily-title]').click();await ready(page);assert.equal(await timers(),0);
      await page.locator('[data-me-return]').click();await ready(page);assert.equal(await timers(),1);
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
      const entries=page.locator('.site-nav [data-nav-group="projects"] .nav-menu>a');assert.equal(await entries.count(),4);
      assert.equal(await entries.nth(2).getAttribute('href'),'/english/');assert.equal(await entries.nth(3).getAttribute('href'),'/marx/');
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
  await check('without JavaScript, directories, chapter guides, sources and native menus remain usable',()=>using({width:320,javascript:false},async page=>{
    for(const route of ['/marx/','/marx/wenji/10/','/marx/capital/1/','/marx/capital/1/ch01/','/marx/works/manifesto/','/marx/commodity/','/marx/sources/']){
      await page.goto(origin+route);assert.equal(await page.locator('h1').count(),1);await geometry(page);
      if(route==='/marx/'){assert.equal(await page.locator('[data-me-row]:visible').count(),28);assert.equal(await page.locator('[data-me-next]').isVisible(),false);assert.equal(await page.locator('[data-me-filters]').isVisible(),false);}
      if(route==='/marx/wenji/10/')assert.equal(await page.locator('.me-letters li').count(),280);
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
  await check('two themes and all required widths, with no overflow, clipped reading or inner scroll area',async()=>{
    const routes=['/marx/','/marx/sources/','/marx/wenji/','/marx/wenji/1/','/marx/wenji/5/','/marx/wenji/10/','/marx/capital/','/marx/capital/1/','/marx/capital/english/','/marx/capital/routes/','/marx/capital/1/ch01/','/marx/works/manifesto/','/marx/commodity/','/marx/human-essence/','/today/','/en/today/'];
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
  await browser?.close();report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));
  const failed=report.checks.filter(c=>!c.passed).length;console.log(JSON.stringify({checks:report.checks.length,passed:report.checks.length-failed,failed,layouts:report.layouts.length,errors:report.errors.length,consoleErrors:report.consoleErrors.length,missing:report.missing.length,external:report.external.length,report:path.join(out,'browser-report.json')}));
  if(failed||report.errors.length||report.consoleErrors.length||report.missing.length||report.external.length)process.exitCode=1;
}})();
