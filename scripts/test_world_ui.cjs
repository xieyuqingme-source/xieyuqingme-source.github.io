'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),path=require('node:path');
const world=require(process.env.WORLD_MODULE||path.join(__dirname,'../home/assets/world.js'));
class Node {
  constructor(tag='DIV',attrs={}){this.tagName=tag.toUpperCase();this.nodeType=1;this.attributes=new Map();this.dataset={};this.childNodes=[];this.parentNode=null;this.events=new Map();this.hidden=false;this.value='';for(const [key,value]of Object.entries(attrs))this.setAttribute(key,value);}
  setAttribute(key,value){this.attributes.set(key,String(value));if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
  getAttribute(key){return this.attributes.get(key)??null;}
  removeAttribute(key){this.attributes.delete(key);if(key.startsWith('data-'))delete this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];}
  get textContent(){return this.nodeType===3?this.data:this.childNodes.map(child=>child.textContent).join('');}
  set textContent(value){if(this.nodeType===3)this.data=String(value);else{const text=new Node();text.nodeType=3;text.data=String(value);this.replaceChildren(text);}}
  get options(){return this.childNodes.filter(node=>node.tagName==='OPTION');}
  appendChild(node){node.remove();this.childNodes.push(node);node.parentNode=this;return node;}
  replaceChildren(...nodes){this.childNodes.forEach(node=>{node.parentNode=null;});this.childNodes=[];nodes.forEach(node=>this.appendChild(node));}
  remove(){if(this.parentNode){const at=this.parentNode.childNodes.indexOf(this);this.parentNode.childNodes.splice(at,1);this.parentNode=null;}}
  insertAdjacentElement(where,node){assert.equal(where,'afterend');node.remove();const at=this.parentNode.childNodes.indexOf(this);this.parentNode.childNodes.splice(at+1,0,node);node.parentNode=this.parentNode;}
  addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(fn);}
  removeEventListener(type,fn){this.events.get(type)?.delete(fn);}
  fire(type){const event={type,preventDefault(){this.prevented=true;}};return Promise.all([...(this.events.get(type)||[])].map(fn=>fn(event)));}
  matches(selector){if(selector.startsWith('#'))return this.getAttribute('id')===selector.slice(1);if(/^\w+$/.test(selector))return this.tagName===selector.toUpperCase();const match=selector.match(/^(\w+)?\[([^=\]]+)(?:="([^"]*)")?\]$/);return !!match&&(!match[1]||this.tagName===match[1].toUpperCase())&&this.attributes.has(match[2])&&(match[3]===undefined||this.getAttribute(match[2])===match[3]);}
  querySelectorAll(selector){return this.childNodes.flatMap(node=>node.nodeType===3?[]:[...(node.matches(selector)?[node]:[]),...node.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  get listeners(){return [...this.events.values()].reduce((sum,items)=>sum+items.size,0)+this.childNodes.reduce((sum,node)=>sum+node.listeners,0);}
}
function append(parent,tag,attrs={},value){const node=new Node(tag,attrs);if(value!==undefined)node.textContent=value;parent.appendChild(node);return node;}
function select(parent,name,values){const node=append(parent,'select',{name});values.forEach(value=>{const option=append(node,'option',{},value);option.value=value;});node.value=values[0];return node;}
function fixture({sources=true,search=true,url='/world/sources/?from=menu#kept',months=[{month:'2026-10',url:'/world/search/2026-10.json'},{month:'2026-09',url:'/world/search/2026-09.json'}]}={}){
  const root=new Node('main',{'data-world':''}),window=new Node('window'),cleanups=[],requests=[];
  let current=new URL(url,'https://site.example.org');window.location={};for(const key of ['origin','pathname','search','hash'])Object.defineProperty(window.location,key,{get:()=>current[key]});
  window.history={state:{kept:true},replaceState(state,_,target){assert.equal(state,this.state);current=new URL(target,current);}};window.SiteNavigation={own(fn){cleanups.push(fn);}};window.AbortController=AbortController;
  window.fetch=async(url,options)=>{requests.push({url,options});return response(index());};
  const document={querySelector:selector=>root.matches(selector)?root:root.querySelector(selector),createElement:tag=>new Node(tag),createTextNode:value=>{const node=new Node();node.nodeType=3;node.data=String(value);return node;}};
  const f={root,window,document,cleanups,requests,get url(){return current;},goto(target){current=new URL(target,current);return window.fire('popstate');}};
  if(sources){
    const directory=append(root,'section',{'data-source-directory':''}),form=append(directory,'form',{'data-source-filters':''});form.hidden=true;
    const domain=select(form,'domain',['all','science','health']),type=select(form,'type',['all','official','professional']),language=select(form,'language',['all','zh-CN','en']);
    const count=append(directory,'p',{'data-source-count':''},'共 3 个来源'),empty=append(directory,'p',{'data-source-empty':''},'没有匹配来源');empty.hidden=true;
    const a=append(directory,'section',{'data-source-domain':'science'}),b=append(directory,'section',{'data-source-domain':'health'});
    const ac=append(a,'div',{'data-source-cell':'','data-source-kind':'official'}),pc=append(a,'div',{'data-source-cell':'','data-source-kind':'professional'}),bc=append(b,'div',{'data-source-cell':'','data-source-kind':'official'});
    const cards=[append(ac,'article',{'data-source-card':'','data-domain':'science','data-type':'official','data-languages':'zh-CN en'},'原样：科学一手来源'),append(pc,'article',{'data-source-card':'','data-domain':'science','data-type':'professional','data-languages':'en'},'原样：科学专业来源'),append(bc,'article',{'data-source-card':'','data-domain':'health','data-type':'official','data-languages':'zh-CN'},'原样：健康一手来源')];
    Object.assign(f,{directory,filters:form,domain,type,language,count,empty,cards,domains:[a,b],cells:[ac,pc,bc]});
  }
  if(search){
    const manifest=append(root,'script',{id:'world-search-months'},JSON.stringify({version:1,months,default_month:months[0]?.month||''}));
    const form=append(root,'form',{'data-world-search':''});form.hidden=true;const month=select(form,'month',months.map(item=>item.month)),query=append(form,'input',{name:'q'});
    const status=append(root,'p',{'data-world-search-status':''},'请输入标题关键词'),results=append(root,'ol',{'data-world-search-results':''});
    Object.assign(f,{manifest,search:form,month,query,status,results});Object.defineProperty(f,'more',{get:()=>root.querySelector('[data-world-search-more]')});
  }
  return f;
}
function item(n=1,extra={}){return {id:'news-'+n.toString(16).padStart(20,'0'),date:'2026-10-27',title:'原样：Straße ＡＩ 科学标题 '+n,source:'公开来源',url:'https://news.example.org/articles/'+n+'?from=rss',day_url:'/world/2026/10/27/',lang:'zh-CN',origin:'rss',date_basis:'published',search_titles:['原样：Straße ＡＩ 科学标题 '+n],...extra};}
function index(items=[item()],extra={}){return {version:1,available:true,exists:true,message:'',month:'2026-10',items,...extra};}
function response(data,options={}){return new Response(typeof data==='string'?data:JSON.stringify(data),{headers:{'Content-Type':'application/json'},...options});}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('NFKC and full case folding match literal AND words, aliases and original punctuation',()=>{
  assert.equal(world.fold('ＳＴＲＡＳＳＥ Straße Σςσ Ꭰꭰ ı İ'),'strasse strasse σσσ ᎠᎠ ı i\u0307');
  const row=item(1,{search_titles:[item().title,'旧人工英文别名 NASA Mars']});
  assert(world.matchesTitle(row,world.queryWords('strasse ai')));assert(world.matchesTitle(row,world.queryWords('ＮＡＳＡ mars')));
  assert(!world.matchesTitle(row,world.queryWords('NASA 月球')));assert(!world.matchesTitle(row,world.queryWords('.*')));
  assert.deepEqual(world.queryWords(' 科学\u3000科学  AI  '),['科学','ai']);assert.deepEqual(world.queryWords('   '),[]);
  assert.throws(()=>world.queryWords('x'.repeat(161)),/160/);
});
test('directory filters use AND, exact stable keys and multilingual tokens',()=>{
  const record={domain:'health',type:'official',languages:'zh-CN en'};
  assert(world.matchesSource(record,{domain:'all',type:'official',language:'en'}));
  assert(!world.matchesSource(record,{domain:'science',type:'official',language:'en'}));
  assert(!world.matchesSource(record,{domain:'all',type:'all',language:'zh'}));
  const known={domain:new Set(['all','health']),type:new Set(['all','official']),language:new Set(['all','en'])};
  assert.deepEqual(world.readFilters('?domain=health&type=official&language=en',known),{domain:'health',type:'official',language:'en'});
  assert.deepEqual(world.readFilters('?domain=health&domain=health&type=unknown&language=%E0%A4%A',known),{domain:'all',type:'all',language:'all'});
});
test('index manifest permits only exact same-site monthly index paths and valid defaults',()=>{
  const base='https://site.example.org';assert.equal(world.indexURL('/world/search/2026-10.json','2026-10',base),base+'/world/search/2026-10.json');
  for(const value of ['https://evil.example.org/world/search/2026-10.json','//evil.example.org/x','/world/search/../2026-10.json','/world/search/2026-10.json?q=secret','/world/search/2026-10.json#x','/world/search/2026-09.json'])assert.equal(world.indexURL(value,'2026-10',base),null);
  assert.throws(()=>world.validateMonths({version:1,months:[{month:'2026-10',url:'/world/search/2026-10.json'}],default_month:'2026-09'},base));
  assert.equal(world.validateMonths({version:1,months:[],default_month:''},base).months.size,0);
});
test('every indexed field is checked before any result can render',()=>{
  const good=index();assert.equal(world.validateIndex(good,'2026-10'),good);
  const mutations=[x=>x.version=2,x=>x.month='2026-09',x=>x.available='yes',x=>x.items.push(x.items[0]),x=>x.extra='unexpected',x=>x.items[0].date='2026-10-32',x=>x.items[0].day_url='/world/2026/10/26/',x=>x.items[0].url='javascript:alert(1)',x=>x.items[0].lang='unknown',x=>x.items[0].origin='unknown',x=>x.items[0].date_basis='unknown',x=>x.items[0].title='<script>alert(1)</script>',x=>x.items[0].source='x'.repeat(101),x=>x.items[0].search_titles=[],x=>x.items[0].search_titles=['another title'],x=>x.items[0].search_titles.push(x.items[0].title)];
  for(const mutate of mutations){const bad=structuredClone(good);mutate(bad);assert.throws(()=>world.validateIndex(bad,'2026-10'));}
  assert.doesNotThrow(()=>world.validateIndex(index([item(1,{date:'2024-02-29',day_url:'/world/2024/02/29/'})],{month:'2024-02'}),'2024-02'));
  assert.throws(()=>world.validateIndex(index([item(1,{date:'2025-02-29',day_url:'/world/2025/02/29/'})],{month:'2025-02'}),'2025-02'));
});
test('article URLs preserve legitimate queries and reject nonpublic or unsafe destinations',()=>{
  assert(world.publicURL('https://www.bbc.com/news/articles/abc?at_medium=RSS&at_campaign=rss'));
  for(const value of ['http://www.bbc.com/a','https://user:pass@www.bbc.com/a','https://127.0.0.1/a','https://foo.local/a','https://foo.test/a','https://www.bbc.com:8443/a','https://www.bbc.com/a#fragment','https://www.bbc.com/%250a','https://www.bbc.com/a\\evil','data:text/html,x'])assert(!world.publicURL(value),value);
});
test('Traditional Chinese original titles remain searchable without invalidating their month',async()=>{
  const title='繁體中文原標題：保留原文與來源',row=item(1,{title,lang:'zh-Hant',search_titles:[title]});
  assert.doesNotThrow(()=>world.validateIndex(index([row]),'2026-10'));
  const f=fixture({sources:false});f.window.fetch=async()=>response(index([row]));world.mount(f);f.query.value='繁體 原標題';await f.search.fire('submit');
  assert.equal(f.results.childNodes[0].childNodes[0].textContent,title);assert.equal(f.results.childNodes[0].childNodes[0].lang,'zh-Hant');
});
test('streamed and fallback responses enforce byte limits, HTTP and JSON type',async()=>{
  assert.deepEqual(await world.readResponse(response({ok:'科学'})),{ok:'科学'});
  await assert.rejects(world.readResponse(response('{}',{status:503})),/读取/);
  await assert.rejects(world.readResponse(response('{}',{headers:{'Content-Type':'text/html'}})),/格式/);
  await assert.rejects(world.readResponse(response('{}',{headers:{'Content-Type':'application/json','Content-Length':String(world.MAX_INDEX_BYTES+1)}})),/上限/);
  await assert.rejects(world.readResponse(response('科学'),5),/上限/);
  await assert.rejects(world.readResponse(response('{not-json}')),/格式/);
  await assert.rejects(world.readResponse({ok:true,headers:new Headers({'Content-Type':'application/json'}),text:async()=>'"科学"'},6),/上限/);
});
test('SSR directory is enhanced jointly without network, storage, reordering or text mutation',async()=>{
  const f=fixture({search:false}),original=f.cards.map(card=>card.textContent);f.window.fetch=()=>assert.fail('Directory must not fetch');
  for(const name of ['localStorage','sessionStorage'])Object.defineProperty(f.window,name,{get(){assert.fail('No storage');}});
  const app=world.mount(f);assert.equal(f.filters.hidden,false);assert.equal(f.count.textContent,'显示 3 / 3 个来源');
  f.domain.value='science';await f.domain.fire('change');f.language.value='zh-CN';await f.language.fire('change');assert.deepEqual(f.cards.map(card=>!card.hidden),[true,false,false]);assert.equal(f.domains[1].hidden,true);
  f.type.value='professional';await f.type.fire('change');assert.equal(f.empty.hidden,false);assert.equal(f.count.textContent,'显示 0 / 3 个来源');
  assert.equal(f.url.searchParams.get('from'),'menu');assert.equal(f.url.hash,'#kept');
  await f.filters.fire('reset');assert.equal(f.empty.hidden,true);assert.equal(f.cards.filter(card=>!card.hidden).length,3);assert.deepEqual(f.cards.map(card=>card.textContent),original);assert.deepEqual(app.state().sources,{domain:'all',type:'all',language:'all'});
});
test('URL restoration and denied history retain working source filters',async()=>{
  const f=fixture({search:false,url:'/world/sources/?domain=health&type=official&language=zh-CN'});world.mount(f);assert.equal(f.cards.filter(card=>!card.hidden).length,1);
  await f.goto('/world/sources/?domain=science');assert.equal(f.cards.filter(card=>!card.hidden).length,2);
  f.window.history.replaceState=()=>{throw new Error('Denied');};f.language.value='en';await assert.doesNotReject(f.language.fire('change'));assert.equal(f.cards.filter(card=>!card.hidden).length,2);
});
test('type filtering preserves stable matrix kinds while hiding cells and reset restores the full matrix',async()=>{
  const f=fixture({search:false}),kinds=f.cells.map(cell=>cell.dataset.sourceKind),app=world.mount(f);
  assert.equal(f.directory.getAttribute('data-source-type-filter'),'all');f.type.value='professional';await f.type.fire('change');
  assert.equal(f.directory.getAttribute('data-source-type-filter'),'professional');assert.deepEqual(f.cells.filter(cell=>!cell.hidden).map(cell=>cell.dataset.sourceKind),['professional']);
  await f.filters.fire('reset');assert.equal(f.directory.getAttribute('data-source-type-filter'),'all');assert.deepEqual(f.cells.map(cell=>cell.dataset.sourceKind),kinds);assert(f.cells.every(cell=>!cell.hidden));app.destroy();assert.equal(f.directory.getAttribute('data-source-type-filter'),null);
});
test('mount is idempotent, PageScope owns cleanup, destroy restores SSR, and returning mounts afresh',async()=>{
  const f=fixture(),before=f.root.listeners,app=world.mount(f);assert.equal(world.mount(f),app);assert.equal(f.cleanups.length,1);assert(f.root.listeners>before);
  f.cleanups[0]();app.destroy();assert.equal(f.root.listeners,before);assert.equal(f.window.listeners,0);assert(f.filters.hidden&&f.search.hidden);assert.equal(f.more,null);assert.equal(f.count.textContent,'共 3 个来源');assert(f.cards.every(card=>!card.hidden));
  const next=world.mount(f);assert.notEqual(next,app);assert.equal(f.cleanups.length,2);next.destroy();
});
test('no available months or malformed metadata keeps search unexposed and SSR intact',()=>{
  for(const months of [[],[{month:'2026-10',url:'https://evil.example.org/x'}]]){const f=fixture({months});world.mount(f);assert(f.search.hidden);assert.equal(f.requests.length,0);assert.equal(f.status.textContent,'请输入标题关键词');}
});
test('only explicit submit fetches the chosen local month, never q, and successful month data is reused',async()=>{
  const f=fixture(),app=world.mount(f);assert.equal(f.requests.length,0);f.query.value='STRASSE ai';await f.query.fire('input');assert.equal(f.requests.length,0);await f.search.fire('submit');
  assert.equal(f.requests.length,1);const request=f.requests[0];assert.equal(request.url,'https://site.example.org/world/search/2026-10.json');assert.equal(request.options.credentials,'same-origin');assert.equal(request.options.redirect,'error');assert(request.options.signal instanceof AbortSignal);
  assert.equal(f.results.childNodes.length,1);assert.equal(f.results.childNodes[0].childNodes[0].textContent,item().title);assert.equal(f.results.childNodes[0].childNodes[0].href,item().url);assert.equal(f.results.childNodes[0].childNodes[0].rel,'noopener noreferrer');assert.equal(f.results.childNodes[0].childNodes[1].childNodes.at(-1).href,item().day_url);
  assert.equal(app.state().search.status,'results');f.query.value='不存在';await f.search.fire('submit');assert.equal(f.requests.length,1);assert.match(f.status.textContent,/没有找到/);assert.equal(f.results.childNodes.length,0);
});
test('fifty-result batches report the complete match count and preserve exact source titles',async()=>{
  const f=fixture();f.window.fetch=async()=>response(index(Array.from({length:112},(_,n)=>item(n+1))));const app=world.mount(f);f.query.value='科学';await f.search.fire('submit');
  assert.equal(f.results.childNodes.length,50);assert.match(f.status.textContent,/112.*50/);assert(!f.more.hidden);await f.more.fire('click');assert.equal(f.results.childNodes.length,100);await f.more.fire('click');assert.equal(f.results.childNodes.length,112);assert(f.more.hidden);assert.equal(app.state().search.total,112);
});
test('blank and oversized queries and unknown months never issue a request',async()=>{
  const f=fixture();world.mount(f);await f.search.fire('submit');assert.match(f.status.textContent,/请输入/);f.query.value='x'.repeat(161);await f.search.fire('submit');assert.match(f.status.textContent,/160/);f.query.value='science';f.month.value='2026-08';await f.search.fire('submit');assert.match(f.status.textContent,/选择/);assert.equal(f.requests.length,0);
});
test('unavailable, absent archive and recorded empty month remain distinct and retryable',async()=>{
  for(const [data,pattern]of [[index([],{available:false,exists:false,message:'存档暂不可用'}),/存档暂不可用/],[index([],{exists:false,message:'该月无存档'}),/该月无存档/],[index([]),/本月有存档/]]){
    const f=fixture();let calls=0;f.window.fetch=async()=>{calls++;return response(data);};world.mount(f);f.query.value='科学';await f.search.fire('submit');assert.match(f.status.textContent,pattern);assert.equal(f.status.querySelector('a').href,'/world/2026/10/');await f.search.fire('submit');assert.equal(calls,data.exists?1:2);
  }
});
test('HTTP, invalid JSON and wrong-schema month errors preserve SSR and allow a later successful submit',async()=>{
  for(const bad of [()=>response('{}',{status:503}),()=>response('{not-json}'),()=>response(index([],{month:'2026-09'})),()=>response(index([item(1,{url:'javascript:alert(1)'})]))]){
    const f=fixture(),original=f.cards.map(card=>card.textContent);let count=0;f.window.fetch=async()=>++count===1?bad():response(index());world.mount(f);f.query.value='科学';await f.search.fire('submit');assert.match(f.status.textContent,/暂不可用/);assert.equal(f.results.childNodes.length,0);assert.deepEqual(f.cards.map(card=>card.textContent),original);await f.search.fire('submit');assert.equal(f.results.childNodes.length,1);
  }
});
test('a newer submit wins over both late success and late failure from an uncancellable request',async()=>{
  for(const fail of [false,true]){
    const f=fixture(),old=deferred();let count=0,firstSignal;f.window.fetch=async(_,options)=>{if(++count===1){firstSignal=options.signal;return old.promise;}return response(index([item(2)]));};world.mount(f);f.query.value='科学';const pending=f.search.fire('submit');await tick();
    f.query.value='标题 2';await f.search.fire('submit');const displayed=f.results.textContent;assert.match(displayed,/标题 2/);assert(firstSignal.aborted);if(fail)old.reject(new Error('late failure'));else old.resolve(response(index([item(1)])));await pending;assert.equal(f.results.textContent,displayed);assert.match(f.status.textContent,/找到 1/);
  }
});
test('changing month aborts pending search and clears its results without fetching the next month',async()=>{
  const f=fixture(),pending=deferred();let signal,calls=0;f.window.fetch=async(_,options)=>{calls++;signal=options.signal;return pending.promise;};world.mount(f);f.query.value='科学';const request=f.search.fire('submit');await tick();f.month.value='2026-09';await f.month.fire('change');assert(signal.aborted);assert.equal(calls,1);assert.match(f.status.textContent,/月份已切换/);pending.resolve(response(index()));await request;assert.equal(f.results.childNodes.length,0);
});
test('PageScope exit aborts requests and late responses cannot mutate old or newly mounted pages',async()=>{
  const f=fixture(),pending=deferred();let signal;f.window.fetch=async(_,options)=>{signal=options.signal;return pending.promise;};const app=world.mount(f);f.query.value='科学';const request=f.search.fire('submit');await tick();app.destroy();assert(signal.aborted);const original=f.root.textContent;const next=fixture();world.mount(next);pending.resolve(response(index()));await request;assert.equal(f.root.textContent,original);assert.equal(next.results.childNodes.length,0);assert.equal(next.requests.length,0);assert.equal(f.root.listeners,0);
});
test('reset cancels pending search and restores default month without a request',async()=>{
  const f=fixture(),pending=deferred();let signal;f.window.fetch=async(_,options)=>{signal=options.signal;return pending.promise;};const app=world.mount(f);f.query.value='科学';const request=f.search.fire('submit');await tick();await f.search.fire('reset');assert(signal.aborted);assert.equal(f.query.value,'');assert.equal(f.month.value,'2026-10');assert.equal(app.state().search.status,'idle');pending.resolve(response(index()));await request;assert.equal(f.results.childNodes.length,0);
});
test('search can run independently of a source directory and missing roots stay harmless',async()=>{
  const f=fixture({sources:false});world.mount(f);f.query.value='科学';await f.search.fire('submit');assert.equal(f.results.childNodes.length,1);assert.doesNotThrow(()=>world.mount({}).destroy());
});
