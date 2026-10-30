'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs'),path = require('node:path'),vm = require('node:vm');
const moduleFile = process.env.ENGLISH_QUOTES_MODULE || path.join(__dirname,'../home/assets/english-quotes.js');
const quotes = require(moduleFile);

class Element {
  constructor() { this.listeners=new Map();this.hidden=false;this.value='all';this.textContent='';this.dataset={}; }
  addEventListener(type,fn) { if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn); }
  removeEventListener(type,fn) { this.listeners.get(type)?.delete(fn); }
  fire(type,event={}) { for(const fn of [...this.listeners.get(type)||[]])fn({target:this,preventDefault(){},...event}); }
  size(type) { return this.listeners.get(type)?.size || 0; }
  set innerHTML(_) { assert.fail('Quotation filters must not rewrite reading HTML'); }
}
function fixture(search='',records=[
  {author:'莎士比亚',period:'1600'}, {author:'简·奥斯汀',period:'1800'},
  {author:'威廉·布莱克',period:'1700'}, {author:'莎士比亚',period:'1600'}
]) {
  const rows=records.map((record,index)=>{const row=new Element();row.dataset={...record};row.textContent='Unchanged verse '+index+'\nSecond line.';return row;});
  const author=new Element(),period=new Element(),controls=new Element(),count=new Element(),empty=new Element();
  controls.hidden=true;empty.hidden=true;count.textContent='全部 '+rows.length+' 条';
  const root=new Element(),nodes={'[data-english-quote-filters]':controls,'#ec-quote-author':author,'#ec-quote-period':period,'#ec-quote-count':count,'#ec-quote-empty':empty};
  root.querySelector=selector=>nodes[selector]||null;
  root.querySelectorAll=selector=>selector==='[data-english-quote-row]'?rows:[];
  const document={querySelector:selector=>selector==='[data-english-quote-library]'?root:null};
  const window=new Element(),cleanups=[],replacements=[];
  let url=new URL('/english/quotes/'+search,'https://example.test');
  window.location={};for(const key of ['pathname','search','hash'])Object.defineProperty(window.location,key,{get:()=>url[key]});
  const historyState={__siteScroll:[10,20],kept:'history state'};
  window.history={state:historyState,replaceState(state,_,target){assert.equal(state,historyState);replacements.push(target);url=new URL(target,url);}};
  window.SiteNavigation={own:fn=>{cleanups.push(fn);return fn;}};
  for(const key of ['localStorage','sessionStorage','fetch'])Object.defineProperty(window,key,{get(){assert.fail('Filtering must not read storage or use a service');}});
  return {window,document,root,rows,author,period,controls,count,empty,cleanups,replacements,
    get url(){return url;},goto(target){url=new URL(target,url);window.fire('popstate');},
    visible:()=>rows.filter(row=>!row.hidden),listeners:()=>author.size('change')+period.size('change')+controls.size('submit')+controls.size('reset')+window.size('popstate')};
}

test('helpers restore exact known query values and reject empty, unknown, duplicated or malformed filters',()=>{
  const authors=new Set(['莎士比亚','简·奥斯汀']),periods=new Set(['1600','1800']);
  assert.deepEqual(quotes.readFilters('?author=%E8%8E%8E%E5%A3%AB%E6%AF%94%E4%BA%9A&period=1600',authors,periods),{author:'莎士比亚',period:'1600'});
  for(const search of ['',null,'?author=all&period=all','?author=unknown&period=01800','?author=&period=9999','?author=莎士比亚&author=莎士比亚&period=1600&period=1800','?author=%E0%A4%A&period=hello'])
    assert.deepEqual(quotes.readFilters(search,authors,periods),{author:'all',period:'all'});
  assert.deepEqual(quotes.readFilters('?author=invalid&period=1800',authors,periods),{author:'all',period:'1800'});
  assert.equal(quotes.matches({author:'甲',period:'1800'},{author:'甲',period:'1800'}),true);
  assert.equal(quotes.matches({author:'甲',period:'1800'},{author:'甲',period:'1700'}),false);
  assert.equal(quotes.matches({author:'甲',period:'1800'},{author:'all',period:'all'}),true);
});

test('query updates retain unrelated parameters and encode author names without HTML or new history entries',()=>{
  const result=quotes.queryString('?from=reading&author=old&period=0',{author:'简·奥斯汀',period:'1800'}),params=new URLSearchParams(result);
  assert.equal(params.get('from'),'reading');assert.equal(params.get('author'),'简·奥斯汀');assert.equal(params.get('period'),'1800');
  assert.equal(quotes.queryString('?author=old&period=1600',{author:'all',period:'all'}),'');
  assert.equal(quotes.queryString('?from=reading&author=old',{author:'all',period:'all'}),'?from=reading');
  const f=fixture('?from=reading#quote-shakespeare-01'),mounted=quotes.mount(f);
  f.author.value='简·奥斯汀';f.author.fire('change');
  assert.equal(f.url.hash,'#quote-shakespeare-01');assert.equal(f.url.searchParams.get('from'),'reading');assert.equal(f.replacements.length,1);
  mounted.refresh();assert.equal(f.replacements.length,1,'Rendering the same choice should not rewrite history again');
});

test('progressive enhancement reveals controls, filters jointly, reports empty intersections and preserves the poems',()=>{
  const f=fixture(),original=f.rows.map(row=>row.textContent),mounted=quotes.mount(f);
  assert.equal(f.controls.hidden,false);assert.equal(f.count.textContent,'显示 4 / 4 条');assert.equal(f.empty.hidden,true);
  f.author.value='莎士比亚';f.author.fire('change');assert.equal(f.visible().length,2);assert.equal(f.count.textContent,'显示 2 / 4 条');
  f.period.value='1800';f.period.fire('change');assert.equal(f.visible().length,0);assert.equal(f.empty.hidden,false);assert.equal(f.count.textContent,'显示 0 / 4 条');
  f.author.value='all';f.author.fire('change');assert.deepEqual(f.visible().map(row=>row.dataset.author),['简·奥斯汀']);assert.equal(f.empty.hidden,true);
  f.period.value='all';f.period.fire('change');assert.equal(f.visible().length,4);
  assert.deepEqual(f.rows.map(row=>row.textContent),original);assert.deepEqual(mounted.state(),{author:'all',period:'all'});
});

test('initial queries and same-page popstate restore the selects, visible rows and count',()=>{
  const f=fixture('?author=莎士比亚&period=1600#quote-shakespeare-01');quotes.mount(f);
  assert.equal(f.author.value,'莎士比亚');assert.equal(f.period.value,'1600');assert.equal(f.visible().length,2);
  f.goto('?author=简·奥斯汀&period=1800');assert.equal(f.author.value,'简·奥斯汀');assert.equal(f.period.value,'1800');assert.equal(f.visible().length,1);
  f.goto('?author=not-a-person&period=1800&from=test#quotation');assert.equal(f.author.value,'all');assert.equal(f.period.value,'1800');assert.equal(f.url.searchParams.has('author'),false);assert.equal(f.url.searchParams.get('from'),'test');assert.equal(f.url.hash,'#quotation');
});

test('invalid initial parameters are reset independently and removed from the URL',()=>{
  const f=fixture('?author=<script>&period=1800&from=public#safe');quotes.mount(f);
  assert.equal(f.author.value,'all');assert.equal(f.period.value,'1800');assert.equal(f.visible().length,1);
  assert.equal(f.url.searchParams.has('author'),false);assert.equal(f.url.searchParams.get('period'),'1800');assert.equal(f.url.searchParams.get('from'),'public');assert.equal(f.url.hash,'#safe');
  f.author.value='outside-option';f.period.value='01800';f.author.fire('change');
  assert.equal(f.author.value,'all');assert.equal(f.period.value,'all');assert.equal(f.visible().length,4);
});

test('native form submit filters without navigation and reset returns to all quotations',()=>{
  const f=fixture('?from=menu');quotes.mount(f);let prevented=0;
  f.author.value='简·奥斯汀';f.controls.fire('submit',{preventDefault(){prevented++;}});
  assert.equal(prevented,1);assert.equal(f.visible().length,1);
  f.controls.fire('reset',{preventDefault(){prevented++;}});assert.equal(prevented,2);assert.equal(f.author.value,'all');assert.equal(f.period.value,'all');assert.equal(f.visible().length,4);assert.equal(f.url.search,'?from=menu');
});

test('history-denied environments retain working local filters',()=>{
  const f=fixture();f.window.history.replaceState=()=>{throw new Error('History unavailable');};
  assert.doesNotThrow(()=>quotes.mount(f));f.author.value='莎士比亚';assert.doesNotThrow(()=>f.author.fire('change'));assert.equal(f.visible().length,2);
});

test('PageScope owns destruction; duplicate mounting does not stack handlers and returning can mount afresh',()=>{
  const f=fixture(),first=quotes.mount(f),second=quotes.mount(f);
  assert.equal(first,second);assert.equal(f.listeners(),5);assert.equal(f.cleanups.length,1);
  f.author.value='莎士比亚';f.author.fire('change');assert.equal(f.visible().length,2);
  const stale=[...f.author.listeners.get('change')][0];f.cleanups[0]();first.destroy();assert.equal(f.listeners(),0);
  assert.equal(f.controls.hidden,true);assert.equal(f.visible().length,4);assert.equal(f.count.textContent,'全部 4 条');
  const before=f.replacements.length;f.author.value='简·奥斯汀';stale();first.refresh();assert.equal(f.visible().length,4);assert.equal(f.replacements.length,before);
  const next=quotes.mount(f);assert.notEqual(next,first);assert.equal(f.listeners(),5);assert.equal(f.visible().length,2,'The URL restores the previously selected author on return');
  f.author.value='简·奥斯汀';f.author.fire('change');assert.equal(f.visible().length,1);next.destroy();assert.equal(f.listeners(),0);
});

test('an outgoing page cannot filter or rewrite another route during popstate navigation',()=>{
  const f=fixture('?author=莎士比亚');quotes.mount(f);const before=f.replacements.length;
  f.goto('/english/?author=another-page#outside');f.author.value='简·奥斯汀';f.author.fire('change');
  assert.equal(f.url.pathname,'/english/');assert.equal(f.url.searchParams.get('author'),'another-page');assert.equal(f.url.hash,'#outside');assert.equal(f.replacements.length,before);
});

test('missing hooks leave the complete server fallback untouched',()=>{
  assert.doesNotThrow(()=>quotes.mount().destroy());
  const absent={window:{},document:{querySelector:()=>null}};assert.doesNotThrow(()=>quotes.mount(absent).destroy());
  const f=fixture();f.root.querySelector=()=>null;quotes.mount(f).destroy();assert.equal(f.controls.hidden,true);assert.equal(f.visible().length,4);assert.equal(f.listeners(),0);
  const empty=fixture('',[]);quotes.mount(empty);assert.equal(empty.count.textContent,'显示 0 / 0 条');assert.equal(empty.empty.hidden,false);
});

test('the browser UMD path mounts and the CommonJS path remains inert until requested',()=>{
  const f=fixture('?period=1700'),context=vm.createContext({window:f.window,document:f.document,URLSearchParams,Symbol});
  f.window.document=f.document;
  vm.runInContext(fs.readFileSync(moduleFile,'utf8'),context);
  assert.equal(typeof f.window.EnglishQuotes.mount,'function');assert.equal(f.visible().length,1);assert.equal(f.controls.hidden,false);
  vm.runInContext(fs.readFileSync(moduleFile,'utf8'),context);
  assert.equal(f.listeners(),5);assert.equal(f.cleanups.length,1,'Reevaluating the script reuses the live root instance');f.cleanups[0]();assert.equal(f.listeners(),0);
});

function enhancedFixture(search='',size=65) {
  const records=Array.from({length:size},(_,index)=>({author:index%2?'乙':'甲',period:index%3?'1800':'1600',themes:index%2?'life humor':'learning life'}));
  const f=fixture(search,records),theme=new Element(),more=new Element(),random=new Element();
  more.hidden=true;more.textContent='再看 20 句';random.hidden=true;
  const oldQuery=f.root.querySelector;
  f.root.querySelector=selector=>({'#ec-quote-theme':theme,'#ec-quote-more':more,'#ec-quote-random':random}[selector]||oldQuery(selector));
  f.rows.forEach((row,index)=>{
    row.id='quote-test-'+index;row.dataset.copySource='作者'+index+' · 《作品》';
    const button=new Element(),status=new Element(),original=new Element(),translation=new Element();
    button.hidden=true;status.hidden=true;original.textContent='First line,Second line.';translation.textContent='第一行，第二行。';
    original.childNodes=[{nodeName:'#text',textContent:'First line,'},{nodeName:'BR'},{nodeName:'SPAN',childNodes:[{nodeName:'#text',textContent:'Second line.'}]}];
    translation.childNodes=[{nodeName:'#text',textContent:'第一行，'},{nodeName:'BR'},{nodeName:'#text',textContent:'第二行。'}];
    row.copyButton=button;row.copyStatus=status;
    row.querySelector=selector=>({'[data-english-quote-copy]':button,'[data-english-quote-copy-status]':status,'.ec-library-original':original,'.ec-library-translation':translation}[selector]||null);
    row.scrollIntoView=()=>{row.scrolled=(row.scrolled||0)+1;};row.focus=()=>{row.focused=true;};
  });
  return {...f,theme,more,random,visible:()=>f.rows.filter(row=>!row.hidden),get url(){return f.url;},allListeners:()=>{
    const elements=[f.window,f.author,f.period,f.controls,theme,more,random,...f.rows.map(row=>row.copyButton)];
    return elements.reduce((sum,node)=>sum+[...node.listeners.values()].reduce((n,set)=>n+set.size,0),0);
  }};
}

test('theme filters restore, combine with author/period and sanitize duplicate or unknown parameters',()=>{
  const known=new Set(['learning','life','humor']),authors=new Set(['甲','乙']),periods=new Set(['1800','1600']);
  assert.deepEqual(quotes.readFilters('?theme=humor&author=甲&period=1800',authors,periods,known),{author:'甲',period:'1800',theme:'humor'});
  for(const search of ['?theme=unknown','?theme=humor&theme=humor','?theme=','?theme=<script>'])assert.equal(quotes.readFilters(search,authors,periods,known).theme,'all');
  assert.equal(quotes.matches({author:'甲',period:'1800',themes:'learning life'},{author:'甲',period:'1800',theme:'life'}),true);
  assert.equal(quotes.matches({author:'甲',period:'1800',themes:'learning life'},{author:'甲',period:'1800',theme:'humor'}),false);
  assert.equal(quotes.queryString('?source=reading&theme=old',{author:'all',period:'all',theme:'life'}),'?source=reading&theme=life');
  const f=enhancedFixture('?from=today&theme=unknown&author=甲');quotes.mount(f);
  assert.equal(f.theme.value,'all');assert.equal(f.url.searchParams.get('from'),'today');assert.equal(f.url.searchParams.has('theme'),false);
  f.theme.value='humor';f.theme.fire('change');assert.equal(f.visible().length,0);assert.equal(f.empty.hidden,false);assert.equal(f.random.disabled,true);
  f.author.value='乙';f.author.fire('change');assert.equal(f.visible().length,20);assert(f.visible().every(row=>row.dataset.author==='乙'));
  f.period.value='1600';f.period.fire('change');assert(f.visible().every(row=>row.dataset.period==='1600'));assert.equal(f.more.hidden,true);
  f.controls.fire('reset');assert.deepEqual([f.author.value,f.period.value,f.theme.value],['all','all','all']);assert.equal(f.visible().length,20);assert.equal(f.url.search,'?from=today');
});

test('all server rows survive no-JS fallback; enhancement shows 20 and next controls add unseen rows in source order',()=>{
  const f=enhancedFixture();assert.equal(f.visible().length,65);assert.equal(f.more.hidden,true);
  const mounted=quotes.mount(f);assert.equal(f.visible().length,20);assert.equal(f.count.textContent,'显示 20 / 65 条');
  assert.equal(f.more.hidden,false);assert.equal(f.random.hidden,false);assert(f.rows.every(row=>row.copyButton.hidden===false));
  f.more.fire('click');assert.equal(f.visible().length,40);f.more.fire('click');assert.equal(f.visible().length,60);
  assert.equal(f.more.textContent,'再看 5 句');f.more.fire('click');assert.equal(f.visible().length,65);assert.equal(f.more.hidden,true);
  f.theme.value='learning';f.theme.fire('change');assert.equal(f.visible().length,20);assert(f.visible().every(row=>row.dataset.themes.includes('learning')));
  mounted.destroy();assert.equal(f.visible().length,65);assert.equal(f.controls.hidden,true);assert.equal(f.more.hidden,true);assert.equal(f.random.hidden,true);assert(f.rows.every(row=>row.copyButton.hidden));assert.equal(f.allListeners(),0);
});

test('deep permalinks reveal only their target beyond the first batch and clear only conflicting filters',()=>{
  const f=enhancedFixture('?author=甲&period=1800&theme=life#from=ignored',200);
  f.goto('?author=甲&period=1800&theme=life#quote-test-199');quotes.mount(f);
  assert.equal(f.author.value,'all');assert.equal(f.period.value,'1800');assert.equal(f.theme.value,'life');
  assert.equal(f.rows[199].hidden,false);assert.equal(f.visible().length,21);assert(f.rows[199].scrolled);assert.equal(f.rows[198].hidden,true);
  const shown=new Set(f.visible());f.more.fire('click');assert.equal(f.visible().length,41);assert([...shown].every(row=>!row.hidden));
  assert.deepEqual(f.visible(),f.rows.filter(row=>!row.hidden));
  f.goto('#quote-test-196');assert.equal(f.rows[196].hidden,false);assert.equal(f.visible().length,21);
  f.theme.value='learning';f.theme.fire('change');assert.equal(f.visible().length,20);assert.equal(f.url.hash,'');
});

test('random selection reveals one eligible target without making a tall backlog and supports a single remaining match',()=>{
  const f=enhancedFixture('?theme=humor',200);quotes.mount({...f,random:()=>.999});
  f.random.fire('click');assert.equal(f.rows[199].hidden,false);assert.equal(f.visible().length,21);assert(f.rows[199].focused);assert.equal(f.url.hash,'#quote-test-199');
  assert.equal(f.rows[197].hidden,true);assert.equal(f.rows[198].hidden,true);f.random.fire('click');assert.equal(f.url.hash,'#quote-test-197');assert.equal(f.visible().length,22);
  const one=enhancedFixture('',1);quotes.mount({...one,random:()=>.5});one.random.fire('click');assert.equal(one.visible().length,1);assert.equal(one.url.hash,'#quote-test-0');
  const empty=enhancedFixture('',0);quotes.mount(empty);assert.equal(empty.empty.hidden,false);assert.equal(empty.random.disabled,true);assert.doesNotThrow(()=>empty.random.fire('click'));
});

const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('copy preserves real BR poetry lines, translations and author/work; missing or denied Clipboard prompts manual selection',async()=>{
  const f=enhancedFixture('',1),copied=[];f.window.navigator={clipboard:{writeText:async text=>{copied.push(text);}}};quotes.mount(f);
  assert.equal(quotes.copyText(f.rows[0]),'First line,\nSecond line.\n\n第一行，\n第二行。\n\n作者0 · 《作品》');
  f.rows[0].copyButton.fire('click');await settle();assert.deepEqual(copied,[quotes.copyText(f.rows[0])]);assert.equal(f.rows[0].copyStatus.hidden,false);assert.match(f.rows[0].copyStatus.textContent,/已复制/);
  for(const navigator of [{},{clipboard:{writeText:async()=>{throw new Error('Permission denied');}}}]){
    f.window.navigator=navigator;f.rows[0].copyButton.fire('click');await settle();assert.match(f.rows[0].copyStatus.textContent,/手动选中/);
  }
  Object.defineProperty(f.window.navigator,'clipboard',{get(){throw new Error('Security error');}});f.rows[0].copyButton.fire('click');await settle();assert.match(f.rows[0].copyStatus.textContent,/手动选中/);
});

test('leaving during an asynchronous copy does not alter the departed page and removes every added listener',async()=>{
  const f=enhancedFixture('',1);let finish;f.window.navigator={clipboard:{writeText:()=>new Promise(resolve=>{finish=resolve;})}};
  const first=quotes.mount(f);assert.equal(first,quotes.mount(f));assert.equal(f.cleanups.length,1);f.rows[0].copyButton.fire('click');
  f.cleanups[0]();assert.equal(f.allListeners(),0);finish();await settle();assert.equal(f.rows[0].copyStatus.hidden,true);assert.equal(f.rows[0].copyStatus.textContent,'');
  const before=f.replacements.length;f.more.fire('click');f.random.fire('click');assert.equal(f.replacements.length,before);
});
