'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs'),path = require('node:path'),vm = require('node:vm');
const quotes = require('../home/assets/english-quotes.js');

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
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../home/assets/english-quotes.js'),'utf8'),context);
  assert.equal(typeof f.window.EnglishQuotes.mount,'function');assert.equal(f.visible().length,1);assert.equal(f.controls.hidden,false);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../home/assets/english-quotes.js'),'utf8'),context);
  assert.equal(f.listeners(),5);assert.equal(f.cleanups.length,1,'Reevaluating the script reuses the live root instance');f.cleanups[0]();assert.equal(f.listeners(),0);
});
