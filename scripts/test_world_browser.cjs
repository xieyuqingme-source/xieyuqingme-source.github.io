'use strict';
// Isolated installed-Chrome acceptance: all pages/assets/indexes come from a local build.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(process.env.WEBSITE_ROOT||path.join(__dirname,'..')),site=path.resolve(root,process.env.WORLD_SITE||process.env.WEBSITE_SITE||'_site_unified');
const outputRoot=path.resolve(root,process.env.WORLD_OUTPUT||'.local-checks/world-browser');
const fallbackSite=process.env.WORLD_FALLBACK_SITE?path.resolve(root,process.env.WORLD_FALLBACK_SITE):null;
const unavailableSite=process.env.WORLD_UNAVAILABLE_SITE?path.resolve(root,process.env.WORLD_UNAVAILABLE_SITE):null;
const currentSnapshotFile=process.env.WORLD_CURRENT_SNAPSHOT?path.resolve(root,process.env.WORLD_CURRENT_SNAPSHOT):null;
const out=path.join(outputRoot,'run-'+new Date().toISOString().replace(/[-:.]/g,'')),temporary=path.join(out,'temporary');
fs.mkdirSync(temporary,{recursive:true});process.env.TEMP=temporary;process.env.TMP=temporary;
const origin='http://world-local.test',widths=[1440,1024,768,390,320],themes=['light','dark'];
const report={startedAt:new Date().toISOString(),site,output:out,checks:[],layouts:[],screenshots:[],screenshotRetries:[],errors:[],consoleErrors:[],expectedConsoleErrors:[],missing:[],external:[],requests:[],cleanup:[]};
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.wav':'audio/wav','.mp3':'audio/mpeg','.woff2':'font/woff2','.ico':'image/x-icon'};
let browser,sequence=0,archiveData,monthKey,routes;
async function check(name,fn){const start=Date.now();console.log('CHECK '+name);try{const detail=await fn();report.checks.push({name,passed:true,ms:Date.now()-start,detail});console.log('PASS '+name);}catch(error){report.checks.push({name,passed:false,ms:Date.now()-start,error:error.stack});console.error('FAIL '+name+': '+error.message);}}
async function captureShot(target,file,meta={},extra={}){
  const options={path:path.join(out,file),...(typeof target.page==='function'?{}:{fullPage:true}),...extra};
  try{await target.screenshot(options);}catch(error){const message=String(error?.stack||error);if(!/Page\.captureScreenshot/.test(message)||!/Unable to capture screenshot/.test(message))throw error;
    const retry={path:options.path,error:message};report.screenshotRetries.push(retry);fs.appendFileSync(path.join(out,'screenshot-retries.jsonl'),JSON.stringify(retry)+'\n');const page=typeof target.page==='function'?target.page():target;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));await page.waitForTimeout(150);await target.screenshot(options);
  }
  report.screenshots.push({path:options.path,...meta});return options.path;
}
function serve(route,options){return route.fulfill(options).catch(error=>{if(!/Target.*closed|Route is already handled|Invalid InterceptionId|Request.*(?:cancel|abort)|Response has been disposed/i.test(String(error)))throw error;});}
function syntheticIndex(count,month){const day=month+'-01';return {version:1,available:true,exists:true,message:'',month,items:Array.from({length:count},(_,i)=>({id:'news-'+(i+1).toString(16).padStart(20,'0'),date:day,title:'验收同词：Original title & punctuation '+(i+1),source:'本地验收来源',url:'https://news.example.org/articles/'+(i+1),day_url:'/world/'+day.replace(/-/g,'/')+'/',lang:'en',origin:'rss',date_basis:'published',search_titles:['验收同词：Original title & punctuation '+(i+1),'Legacy alternate title '+(i+1)]}))};}
async function context({width=1440,theme='light',javascript=true,base=site,indexMode='normal',reducedMotion='no-preference'}={}){
  const ctx=await browser.newContext({viewport:{width,height:1050},deviceScaleFactor:1,colorScheme:theme,javaScriptEnabled:javascript,reducedMotion});ctx.setDefaultTimeout(15000);ctx.__id=++sequence;ctx.__mode=indexMode;ctx.__held=[];ctx.__expectedIndexFailure=false;
  await ctx.addInitScript(theme=>{try{localStorage.setItem('xieyuqing-blog-theme',theme);}catch(_){}},theme);
  await ctx.route('**/*',async route=>{
    const url=new URL(route.request().url());report.requests.push({context:ctx.__id,url:url.href,type:route.request().resourceType()});
    if(['data:','blob:'].includes(url.protocol))return route.continue();
    if(url.origin==='https://api.open-meteo.com')return serve(route,{contentType:'application/json',body:JSON.stringify({timezone:'Asia/Shanghai',current:{time:'2026-10-31T12:00',temperature_2m:21.4,weather_code:1,apparent_temperature:20,relative_humidity_2m:60,wind_speed_10m:10,wind_direction_10m:180,pressure_msl:1015},daily:{time:['2026-10-31'],temperature_2m_max:[24],temperature_2m_min:[15],precipitation_probability_max:[10]}})});
    if(url.origin==='https://geocoding-api.open-meteo.com')return serve(route,{contentType:'application/json',body:'{"results":[]}'});
    if(url.origin!==origin){report.external.push({context:ctx.__id,url:url.href});return route.abort();}
    const indexMatch=url.pathname.match(/^\/world\/search\/(\d{4}-\d{2})\.json$/);
    if(indexMatch){
      if(ctx.__holdNext){ctx.__holdNext=false;ctx.__holdSeen?.();await new Promise(resolve=>ctx.__held.push(resolve));}
      const month=indexMatch[1];let data;
      if(ctx.__mode==='batch')data=syntheticIndex(112,month);
      if(ctx.__mode==='empty')data=syntheticIndex(0,month);
      if(ctx.__mode==='unavailable')data={...syntheticIndex(0,month),available:false,exists:false,message:'存档暂不可用'};
      if(ctx.__mode==='absent')data={...syntheticIndex(0,month),exists:false,message:'该月无存档'};
      if(ctx.__mode==='bad-schema')data={...syntheticIndex(1,month),month:'0000-00'};
      if(ctx.__mode==='unsafe'){data=syntheticIndex(1,month);data.items[0].url='javascript:alert(1)';}
      if(ctx.__mode==='bad-json')return serve(route,{contentType:'application/json',body:'{not-json}'});
      if(ctx.__mode==='oversize')return serve(route,{contentType:'application/json',body:' '.repeat(32*1024*1024)+'{}'});
      if(ctx.__mode==='http-fail'){ctx.__expectedIndexFailure=true;return serve(route,{status:503,contentType:'application/json',body:'{}'});}
      if(data)return serve(route,{contentType:'application/json',body:JSON.stringify(data)});
    }
    try{let file=path.resolve(base,'.'+decodeURIComponent(url.pathname));assert(file===path.resolve(base)||file.startsWith(path.resolve(base)+path.sep));
      if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
      if(!fs.existsSync(file)&&fallbackSite&&!url.pathname.startsWith('/world/')&&!/^\/assets\/world\.(?:js|css)$/.test(url.pathname)){file=path.resolve(fallbackSite,'.'+decodeURIComponent(url.pathname));assert(file===fallbackSite||file.startsWith(fallbackSite+path.sep));}
      if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');return serve(route,{contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});}
    catch(error){report.missing.push({context:ctx.__id,url:url.href,error:error.message});return serve(route,{status:404,body:'Missing local publication file'});}
  });
  ctx.on('page',page=>{page.on('pageerror',error=>report.errors.push({context:ctx.__id,error:error.stack||error.message}));page.on('console',message=>{if(message.type()!=='error')return;const entry={context:ctx.__id,text:message.text(),location:message.location()};if(/\/world\/search\//.test(entry.location.url||'')&&(ctx.__expectedIndexFailure||(ctx.__expectedLateAbort&&/ERR_ABORTED|ERR_FAILED/.test(entry.text))))report.expectedConsoleErrors.push(entry);else report.consoleErrors.push(entry);});});return ctx;
}
async function close(ctx){ctx.__held.splice(0).forEach(resolve=>resolve());await ctx.close();}
async function ready(page){await page.waitForFunction(()=>window.SiteNavigation&&!SiteNavigation.state().transition&&new URL(SiteNavigation.state().rendered).pathname===location.pathname);await page.evaluate(()=>document.fonts.ready);if(await page.locator('[data-world]').count())await page.waitForFunction(()=>!!window.HomeWorld);}
async function go(page,route){await page.goto(origin+route,{waitUntil:'domcontentloaded'});await ready(page);}
async function visit(page,route){await page.evaluate(route=>SiteNavigation.visit(route),route);await ready(page);}
async function geometry(page){const value=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,main:(()=>{const b=document.querySelector('main').getBoundingClientRect();return {x:b.x,width:b.width,height:b.height};})(),inside:[...document.querySelectorAll('main *')].filter(node=>node.getClientRects().length&&/auto|scroll/.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight+2).map(node=>node.id||node.className)}));assert(value.scroll<=value.width+1,JSON.stringify(value));assert.deepEqual(value.inside,[]);assert(value.main.width>0&&value.main.x>=0);return value;}
function indexRequests(ctx){return report.requests.filter(request=>request.context===ctx.__id&&/\/world\/search\//.test(new URL(request.url).pathname));}
async function sourceMatrix(page,width,type='all'){
  const cells=await page.locator('.source-grid').evaluateAll(grids=>grids.flatMap(grid=>{const outer=grid.getBoundingClientRect(),gap=parseFloat(getComputedStyle(grid).columnGap)||0;return [...grid.querySelectorAll(':scope>[data-source-cell]')].filter(cell=>cell.getClientRects().length).map(cell=>{const box=cell.getBoundingClientRect();return {kind:cell.dataset.sourceKind,x:box.x,width:box.width,gridX:outer.x,gridWidth:outer.width,gap};});}));
  const columns=width<=640||type!=='all'?1:width>=1000?4:2,slots={official:0,professional:1,media:2,community:3};
  for(const cell of cells){assert(Object.hasOwn(slots,cell.kind),'Each source cell needs its stable source kind');const column=columns===1?0:slots[cell.kind]%columns,columnWidth=(cell.gridWidth-cell.gap*(columns-1))/columns;assert(Math.abs(cell.width-columnWidth)<1.1,JSON.stringify(cell));assert(Math.abs(cell.x-(cell.gridX+column*(columnWidth+cell.gap)))<1.1,JSON.stringify(cell));}
  const widths=cells.map(cell=>cell.width);return {columns,cells:cells.length,minWidth:Math.min(...widths),maxWidth:Math.max(...widths),kindX:Object.fromEntries(Object.keys(slots).map(kind=>[kind,[...new Set(cells.filter(cell=>cell.kind===kind).map(cell=>Number(cell.x.toFixed(2))))]]))};
}
async function viewportScreens(page,name,width,theme,route){
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await captureShot(page,name+'-'+width+'-'+theme+'-viewport-top.png',{route,width,theme,kind:'viewport-top'},{fullPage:false});
  const selector=name==='sources'?'[data-source-domain]':name==='world'?'#today .world-news-group':null;
  if(selector){await page.locator(selector).first().evaluate(node=>node.scrollIntoView({block:'start',behavior:'instant'}));await captureShot(page,name+'-'+width+'-'+theme+'-viewport-section.png',{route,width,theme,kind:'viewport-section'},{fullPage:false});}
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
}
async function todayViewportScreens(){
  const ctx=await context({width:390,theme:'light'}),page=await ctx.newPage();try{
    await go(page,'/today/');await page.waitForFunction(()=>document.querySelector('#year-readings')?.children.length===10&&document.querySelector('#moon-phase-name')?.textContent.trim());
    await captureShot(page,'today-390-light-viewport-navigation.png',{route:'/today/',width:390,theme:'light',kind:'viewport-navigation'},{fullPage:false});
    for(const [id,label]of [['today-year','year'],['today-month','moon'],['daily-earth','day']]){
      await page.locator('#'+id).evaluate(node=>node.scrollIntoView({block:'start',behavior:'instant'}));
      if(id==='daily-earth')await page.waitForFunction(()=>document.querySelector('#daily-earth')?.dataset.earthReady==='true');
      else await page.waitForFunction(id=>[...document.querySelectorAll('#'+id+' svg')].some(svg=>svg.dataset.renderedInstant),id);
      await captureShot(page,'today-390-light-viewport-'+label+'.png',{route:'/today/',width:390,theme:'light',kind:'viewport-'+label},{fullPage:false});
    }
  }finally{await close(ctx);}
}
async function search(page,query){await page.locator('[data-world-search] input[name=q]').fill(query);await page.locator('[data-world-search] button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('[data-world-search-results]')?.hasAttribute('aria-busy'));}
function discover(){
  const directory=path.join(site,'world/search');assert(fs.existsSync(path.join(site,'world/index.html')),'Build /world/ before running this acceptance');assert(fs.existsSync(directory),'Chrome archive acceptance needs a local fixture build with monthly indexes');
  const files=fs.readdirSync(directory).filter(file=>/^\d{4}-\d{2}\.json$/.test(file)).sort().reverse();
  for(const file of files){const data=JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'));if(data.available&&data.exists&&data.items?.length){archiveData=data;monthKey=data.month;break;}}
  assert(archiveData,'Provide a fixture build containing at least one archived headline');routes={world:'/world/',sources:'/world/sources/',month:'/world/'+monthKey.replace('-','/')+'/',day:archiveData.items[0].day_url};
  for(const route of Object.values(routes))assert(fs.existsSync(path.join(site,route,'index.html')),route+' must have an actual SSR file');
  assert(!fs.existsSync(path.join(site,'en/world')),'World must not silently generate an English copy');
  return {routes,indexedMonth:monthKey,headlines:archiveData.items.length};
}
(async()=>{try{
  await check('local publication contains the four Chinese SSR routes and a real monthly archive index',async()=>discover());
  if(!routes)throw new Error('Local archive fixture preflight failed');
  assert(/^[dD]:[\\/]/.test(temporary),'Chrome CPU artifacts and its temporary profile must stay on D:');
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu','--disable-gpu-compositing'],downloadsPath:path.join(temporary,'downloads'),env:{...process.env,TEMP:temporary,TMP:temporary}});
  report.browser={channel:'chrome',version:browser.version(),playwright:require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')).version,node:process.version,headless:true,cpuArgs:['--disable-gpu','--disable-gpu-compositing'],temporaryDirectory:temporary};
  for(const [name,route]of Object.entries(routes))for(const width of widths)for(const theme of themes)await check('layout '+name+' '+width+' '+theme,async()=>{
    const ctx=await context({width,theme}),page=await ctx.newPage();try{await go(page,route);assert.match(await page.locator('html').getAttribute('lang'),/^zh/);assert.equal(await page.locator('main[data-world]').count(),1);assert.equal(indexRequests(ctx).length,0,'Mount and scrolling must not fetch title indexes');
      const boxes=await geometry(page);if(name==='sources'){const count=await page.locator('[data-source-card]').count();assert(count>0);assert.equal(await page.locator('[data-source-card]:visible').count(),count);const columns=await page.locator('[data-source-domain]:visible').first().evaluate(node=>getComputedStyle(node).display);assert.equal(columns,width<=640?'block':'grid');boxes.matrix=await sourceMatrix(page,width);}
      if((width===1440&&theme==='light')||(width===390&&theme==='dark'))await viewportScreens(page,name,width,theme,route);
      const screen=await captureShot(page,name+'-'+width+'-'+theme+'.png',{route,width,theme,kind:'full-page'});if((width===320||width===1440)&&name==='sources')await captureShot(page.locator('[data-source-domain]:visible').first(),name+'-'+width+'-'+theme+'-domain.png',{route,width,theme,kind:'domain'});
      report.layouts.push({name,route,width,theme,...boxes,screen});return boxes;
    }finally{await close(ctx);}
  });
  await check('current news preserves all live original titles, language tags, publication times, source links and publisher caps',async()=>{
    assert(currentSnapshotFile,'WORLD_CURRENT_SNAPSHOT must identify the actual snapshot used to build this SSR fixture');
    const snapshot=JSON.parse(fs.readFileSync(currentSnapshotFile,'utf8')),catalog=JSON.parse(fs.readFileSync(path.join(root,'home/brief/information-sources.json'),'utf8'));
    const feeds=new Map(catalog.sources.filter(source=>source.status==='approved').flatMap(source=>source.feeds).filter(feed=>feed.status==='approved'&&feed.collect).map(feed=>[feed.id,feed]));
    const byURL=new Map(snapshot.items.map(item=>[item.url,item])),perSource={},perPublisher={};assert(snapshot.items.length>0&&snapshot.items.length<=24);assert.equal(byURL.size,snapshot.items.length);
    for(const item of snapshot.items){const feed=feeds.get(item.source_id);assert(feed,'Live items must come from an enabled reviewed feed');assert.equal(item.lang,feed.lang);assert.equal(item.category,feed.category);perSource[item.source_id]=(perSource[item.source_id]||0)+1;perPublisher[feed.publisher]=(perPublisher[feed.publisher]||0)+1;}
    assert(Object.values(perSource).every(count=>count<=2));assert(Object.values(perPublisher).every(count=>count<=2));
    const ctx=await context({width:1440}),page=await ctx.newPage();try{await go(page,routes.world);
      const groups=await page.locator('#today .world-news-group').evaluateAll(nodes=>nodes.map(group=>({label:group.querySelector('h3').textContent,rows:[...group.querySelectorAll('.world-news')].map(row=>{const a=row.querySelector('h4 a');return {title:a.textContent,url:a.getAttribute('href'),lang:a.getAttribute('lang'),target:a.getAttribute('target'),rel:a.getAttribute('rel'),meta:row.querySelector('.world-news-meta').textContent};})})));
      const rows=groups.flatMap(group=>group.rows);assert.equal(rows.length,snapshot.items.length);assert.equal(groups.length,new Set(snapshot.items.map(item=>item.category)).size);assert(groups.length>=3);
      const categories=[];for(const group of groups){assert(group.label.trim());const kinds=new Set();for(const row of group.rows){const expected=byURL.get(row.url);assert(expected,'Rendered headline must use an exact original URL');kinds.add(expected.category);assert.equal(row.title,expected.title);assert.equal(row.lang,expected.lang);assert.equal(row.target,'_blank');assert(/noopener/.test(row.rel)&&/noreferrer/.test(row.rel));const url=new URL(row.url);assert.equal(url.protocol,'https:');assert(!url.username&&!url.password);assert(row.meta.includes(expected.source));
          const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(expected.published)).map(part=>[part.type,part.value]));const formatted=parts.year+'-'+parts.month+'-'+parts.day+' '+parts.hour+':'+parts.minute+' +08:00';assert(row.meta.includes('原文时间 '+formatted),row.meta);
        }assert.equal(kinds.size,1);categories.push({label:group.label,category:[...kinds][0],headlines:group.rows.length});}
      assert.match(await page.locator('#today').innerText(),/最近检查/);assert.equal(indexRequests(ctx).length,0);return {snapshot:currentSnapshotFile,headlines:rows.length,categories,languages:[...new Set(rows.map(row=>row.lang))],perSource,perPublisher,publicationPrecision:'minute; original ISO timestamps retained in the input snapshot',originalURLsExact:true};
    }finally{await close(ctx);}
  });
  await check('calendar distinguishes stored zero-headline days from genuinely missing civil days',async()=>{
    const ctx=await context({width:320}),page=await ctx.newPage();try{await go(page,routes.month);const monthDir=path.join(site,'world',...monthKey.split('-'));
      const counts=new Map();archiveData.items.forEach(item=>counts.set(item.date,(counts.get(item.date)||0)+1));const cells=await page.locator('[data-archive-date]').evaluateAll(nodes=>nodes.map(node=>({date:node.dataset.archiveDate,count:node.querySelector('.world-day-count').textContent,href:node.querySelector('.world-day-heading a')?.getAttribute('href')||null})));
      let empty=0,missing=0,recorded=0;for(const cell of cells){const exists=fs.existsSync(path.join(monthDir,cell.date.slice(8),'index.html'));if(exists){recorded++;const count=counts.get(cell.date)||0;assert.equal(cell.count,String(count));assert.equal(cell.href,'/world/'+cell.date.replace(/-/g,'/')+'/');if(!count)empty++;}else{missing++;assert.equal(cell.count,'—');assert.equal(cell.href,null);}}
      assert(recorded>0&&missing>0,'The fixture must include archived and missing dates');assert(empty>0,'The fixture must include a stored empty day');return {recorded,storedEmpty:empty,missing};
    }finally{await close(ctx);}
  });
  await check('the anniversary panel points to an actual prior-year SSR day containing stored original headlines',async()=>{
    const ctx=await context(),page=await ctx.newPage();try{await go(page,routes.world);const panel=page.locator('section').filter({has:page.locator('h3').filter({hasText:/^一年前的今天$/})}).last();assert.equal(await panel.count(),1,'The rich SSR fixture must contain a nonempty anniversary');
      const href=await panel.locator('a[href^="/world/"]').first().getAttribute('href');assert(/^\/world\/\d{4}\/\d{2}\/\d{2}\/$/.test(href));assert(fs.existsSync(path.join(site,href,'index.html')));const stamp=href.split('/').slice(2,5).join('-'),today=await page.locator('#world-today-date').getAttribute('datetime');assert.equal(stamp,String(Number(today.slice(0,4))-1).padStart(4,'0')+'-'+today.slice(5));const data=JSON.parse(fs.readFileSync(path.join(site,'world/search',stamp.slice(0,7)+'.json'),'utf8')),actual=data.items.filter(item=>item.date===stamp);assert(actual.length>0);const titles=await panel.locator('.world-day-list>li>a').allTextContents();assert(titles.length>0);assert(titles.every(title=>actual.some(item=>item.title===title)));return {day:stamp,storedTitles:actual.length,shown:titles.length};
    }finally{await close(ctx);}
  });
  await check('directory filters combine exact domain/type/language, retain metadata and reset by keyboard',async()=>{
    const ctx=await context({width:390}),page=await ctx.newPage();try{await go(page,routes.sources);const records=await page.locator('[data-source-card]').evaluateAll(nodes=>nodes.map(node=>({domain:node.dataset.domain,type:node.dataset.type,languages:node.dataset.languages,text:node.textContent,href:node.querySelector('a').getAttribute('href')})));
      const chosen=records.find(row=>row.languages.split(/\s+/).includes('en'))||records[0],language=chosen.languages.split(/\s+/)[0];for(const [name,value]of Object.entries({domain:chosen.domain,type:chosen.type,language}))await page.locator('[data-source-filters] select[name='+name+']').selectOption(value);
      const expected=records.filter(row=>row.domain===chosen.domain&&row.type===chosen.type&&row.languages.split(/\s+/).includes(language));assert.equal(await page.locator('[data-source-card]:visible').count(),expected.length);assert.deepEqual(await page.locator('[data-source-card]').evaluateAll(nodes=>nodes.map(node=>node.textContent)),records.map(row=>row.text));await page.setViewportSize({width:1440,height:1050});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));const singleColumn=await sourceMatrix(page,1440,chosen.type);assert.equal(singleColumn.columns,1);
      const options=await page.locator('[data-source-filters]').evaluate(form=>Object.fromEntries(['domain','type','language'].map(key=>[key,[...form.querySelector('select[name='+key+']').options].map(option=>option.value).filter(value=>value!=='all')])));let empty;
      outer:for(const domain of options.domain)for(const type of options.type)for(const language of options.language)if(!records.some(row=>row.domain===domain&&row.type===type&&row.languages.split(/\s+/).includes(language))){empty={domain,type,language};break outer;}
      assert(empty,'The fixture needs at least one empty filter intersection');for(const [name,value]of Object.entries(empty))await page.locator('[data-source-filters] select[name='+name+']').selectOption(value);assert.equal(await page.locator('[data-source-card]:visible').count(),0);assert(await page.locator('[data-source-empty]').isVisible());
      await page.locator('[data-source-filters] button[type=reset]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-source-card]:visible').count(),records.length);assert.equal(indexRequests(ctx).length,0);const resetMatrix=await sourceMatrix(page,1440);await page.locator('[data-source-filters] select[name=language]').selectOption(language);const languageMatrix=await sourceMatrix(page,1440);await geometry(page);return {sources:records.length,matching:expected.length,empty,singleColumn,resetMatrix,languageMatrix};
    }finally{await close(ctx);}
  });
  await check('explicit monthly title search preserves original titles and direct original/day links without query requests',async()=>{
    const ctx=await context({width:390}),page=await ctx.newPage();try{await go(page,routes.world);const form=page.locator('[data-world-search]');assert(await form.isVisible());await form.locator('select[name=month]').selectOption(monthKey);assert.equal(indexRequests(ctx).length,0);const first=archiveData.items[0],query=[...first.title].slice(0,32).join('');await search(page,query);const titles=page.locator('.world-search-title');assert(await titles.count()>0);const result=titles.filter({hasText:first.title}).first();assert.equal(await result.textContent(),first.title);assert.equal(await result.getAttribute('href'),first.url);assert.equal(await result.getAttribute('target'),'_blank');assert(await page.locator('[data-world-search-results] a[href="'+first.day_url+'"]').count()>0);
      assert(indexRequests(ctx).every(request=>new URL(request.url).search===''));assert.equal(indexRequests(ctx).length,1);await search(page,'验收不存在的关键词XYZ987');assert.match(await page.locator('[data-world-search-status]').innerText(),/没有找到/);assert.equal(indexRequests(ctx).length,1);await captureShot(page.locator('[data-world-search]'),'search-form-390-light.png',{kind:'search-form'});return {month:monthKey,original:first.title,requests:indexRequests(ctx).length};
    }finally{await close(ctx);}
  });
  await check('monthly search aliases, NFKC AND matching and all 112 results paginate in batches of 50',async()=>{
    const ctx=await context({width:320,theme:'dark',indexMode:'batch'}),page=await ctx.newPage();try{await go(page,routes.world);await search(page,'ＬＥＧＡＣＹ alternate');assert.equal(await page.locator('.world-search-result').count(),50);assert.match(await page.locator('[data-world-search-status]').innerText(),/112.*50/);await page.locator('[data-world-search-more]').press('Enter');assert.equal(await page.locator('.world-search-result').count(),100);await page.locator('[data-world-search-more]').press('Enter');assert.equal(await page.locator('.world-search-result').count(),112);assert(!await page.locator('[data-world-search-more]').isVisible());assert.match(await page.locator('.world-search-title').first().textContent(),/^验收同词：Original title & punctuation 1$/);await geometry(page);await captureShot(page.locator('[data-world-search-results]'),'search-results-320-dark.png',{kind:'search-results'});return {total:112,batches:[50,100,112]};
    }finally{await close(ctx);}
  });
  for(const mode of ['empty','unavailable','absent','bad-schema','unsafe','bad-json','oversize','http-fail'])await check('honest monthly-search state '+mode,async()=>{
    const ctx=await context({indexMode:mode}),page=await ctx.newPage();try{await go(page,routes.world);const before=await page.locator('h1').textContent();await search(page,'验收同词');const status=await page.locator('[data-world-search-status]').innerText();assert.match(status,mode==='empty'?/有存档.*没有可检索/:mode==='unavailable'?/存档暂不可用/:mode==='absent'?/该月无存档/:mode==='oversize'?/上限/:/暂不可用/);assert.equal(await page.locator('.world-search-result').count(),0);assert.equal(await page.locator('h1').textContent(),before);assert(await page.locator('[data-world-search-status] a[href^="/world/"]').isVisible());return {status};
    }finally{await close(ctx);}
  });
  await check('SPA three-round navigation cleans every page and an index arriving after leave stays harmless',async()=>{
    const ctx=await context(),page=await ctx.newPage();try{await go(page,routes.world);await page.evaluate(()=>{window.__worldAcceptanceMarker='kept';});const seen=new Map();
      for(let round=0;round<3;round++)for(const [name,route]of Object.entries(routes)){await visit(page,route);assert.equal(await page.evaluate(()=>window.__worldAcceptanceMarker),'kept');const state=await page.evaluate(()=>({listeners:SiteNavigation.state().scopeListeners,cleanups:SiteNavigation.state().scopeCleanups}));if(seen.has(name))assert.deepEqual(state,seen.get(name));else seen.set(name,state);report.cleanup.push({round,name,...state});assert.equal(indexRequests(ctx).length,0);}
      await visit(page,routes.world);ctx.__holdNext=true;const seenRequest=new Promise(resolve=>{ctx.__holdSeen=resolve;});await page.locator('[data-world-search] input[name=q]').fill('科学');await page.locator('[data-world-search] button[type=submit]').click();await seenRequest;ctx.__expectedLateAbort=true;await visit(page,routes.sources);const content=await page.locator('main').innerText();ctx.__held.splice(0).forEach(resolve=>resolve());await page.waitForTimeout(220);assert.equal(await page.locator('main').innerText(),content);assert.equal(await page.locator('[data-world-search-results] .world-search-result').count(),0);return {rounds:3,states:Object.fromEntries(seen),lateResponseHarmless:true};
    }finally{await close(ctx);}
  });
  for(const [name,route]of Object.entries(routes))await check('no JavaScript retains complete SSR '+name,async()=>{
    const ctx=await context({width:320,javascript:false}),page=await ctx.newPage();try{await page.goto(origin+route);assert(await page.locator('main h1').isVisible());assert(await page.locator('main a[href]').count()>0);assert.equal(indexRequests(ctx).length,0);if(name==='sources'){const count=await page.locator('[data-source-card]').count();assert(count>0);assert.equal(await page.locator('[data-source-card]:visible').count(),count);assert(!await page.locator('[data-source-filters]').isVisible());}if(await page.locator('[data-world-search]').count())assert(!await page.locator('[data-world-search]').isVisible());await geometry(page);await captureShot(page,'nojs-'+name+'-320.png',{route,width:320,kind:'no-js'});return {links:await page.locator('main a[href]').count()};
    }finally{await close(ctx);}
  });
  await check('reduced motion and keyboard access keep directory and search usable',async()=>{
    const ctx=await context({width:320,reducedMotion:'reduce'}),page=await ctx.newPage();try{await go(page,routes.sources);assert(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');const select=page.locator('[data-source-filters] select[name=domain]');await select.focus();await select.press('End');assert(await select.evaluate(node=>node===document.activeElement));assert.notEqual(await select.inputValue(),'all');await select.press('Home');assert.equal(await select.inputValue(),'all');await visit(page,routes.world);await page.locator('[data-world-search] input[name=q]').fill('验收');await page.locator('[data-world-search] input[name=q]').press('Enter');await page.waitForFunction(()=>!document.querySelector('[data-world-search-results]').hasAttribute('aria-busy'));await geometry(page);return {keyboard:true,reducedMotion:true};
    }finally{await close(ctx);}
  });
  if(unavailableSite)await check('archive-unavailable SSR remains honest without an invented anniversary or title search',async()=>{
    const ctx=await context({base:unavailableSite}),page=await ctx.newPage();try{await go(page,routes.world);assert.match(await page.locator('main').innerText(),/存档暂不可用/);assert.equal(indexRequests(ctx).length,0);assert.equal(await page.locator('[data-world-search]:visible').count(),0);assert.equal(await page.locator('h3').filter({hasText:/^一年前的今天$/}).count(),0);return {unavailableSite};}finally{await close(ctx);}
  });
  await todayViewportScreens();
  await check('zero unexpected scripts, console failures, missing resources or outbound requests',async()=>{assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.missing,[]);assert.deepEqual(report.external,[]);return {script:0,console:0,missing:0,external:0,expectedConsoleErrors:report.expectedConsoleErrors.length};});
}catch(error){report.fatal=error.stack;process.exitCode=1;}finally{if(browser)await browser.close();report.finishedAt=new Date().toISOString();report.passed=report.checks.filter(check=>check.passed).length;report.failed=report.checks.filter(check=>!check.passed).length;fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed,layouts:report.layouts.length,screenshots:report.screenshots.length,report:path.join(out,'browser-report.json')}));if(report.failed||report.fatal)process.exitCode=1;}})();
