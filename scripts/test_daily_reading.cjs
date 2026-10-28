'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {test} = require('node:test');
const R = require('../home/assets/daily-reading.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname,'../home/daily-content.json'),'utf8'));
class Element {
  constructor(tag='div') { this.tagName=tag.toUpperCase();this.dataset={};this.attributes={};this.children=[];this.events=new Map();this.hidden=false;this._text=''; }
  set textContent(value) { this._text=String(value);this.children=[]; }
  get textContent() { return this._text+this.children.map(child=>child.textContent).join(''); }
  setAttribute(name,value) { this.attributes[name]=String(value); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text='';this.children=children; }
  addEventListener(type,handler) { if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(handler); }
  removeEventListener(type,handler) { this.events.get(type)?.delete(handler); }
  fire(type,event={}) { for(const handler of this.events.get(type)||[])handler({target:this,...event}); }
}
const ownItems = Array.from({length:5},(_,index)=>({text:{'zh-CN':'旧文原句'+index,en:'An essay line '+index},title:{'zh-CN':'文章'+index,en:'Essay '+index},url:{'zh-CN':'/articles/essay-'+index+'/',en:'/en/articles/essay-'+index+'/'},date:'2024-05-06'}));
function harness({classic=data,own=ownItems,day='2026-10-28T02:00:00Z',language='zh-CN',carrier=null}={}) {
  const elements=Object.fromEntries(['daily-content-data','own-quotes-data','daily-quote','daily-quote-text','daily-quote-author','daily-quote-work','daily-quote-note','daily-quote-source','daily-quote-button','daily-quotation-title','own-quote','own-quote-text','own-quote-source','own-quote-button','quote-title'].map(id=>[id,new Element()]));
  elements['daily-content-data'].textContent=typeof classic==='string'?classic:JSON.stringify(classic);
  elements['own-quotes-data'].textContent=typeof own==='string'?own:JSON.stringify(own);
  for(const id of ['daily-quote-text','own-quote-text'])elements[id].textContent='Server-rendered fallback';
  elements['daily-quote-button'].hidden=elements['own-quote-button'].hidden=true;
  elements['daily-quotation-title'].textContent='每日语录';elements['quote-title'].textContent='旧文一句';
  const doc=new Element('document');doc.documentElement=carrier||{lang:language};doc.documentElement.lang=language;doc.hidden=false;doc.getElementById=id=>elements[id]||null;doc.createElement=tag=>new Element(tag);doc.createTextNode=text=>{const node=new Element('#text');node.textContent=text;return node;};
  const timers=new Map(),cleanups=[],changes=new Set();let time=new Date(day),selectedLanguage=language,unsubscribed=0;
  const win={setInterval(fn,delay){const id=timers.size+1;timers.set(id,{fn,delay});return id;},clearInterval(id){timers.delete(id);},fetch(){throw Error('Quotes must not be fetched');},localStorage:{getItem(){throw Error('Quote controls must not read storage');}},SiteNavigation:{own(fn){cleanups.push(fn);}},SiteI18n:{lang:()=>selectedLanguage,page:()=>({switchMode:'navigate'}),onChange(fn){changes.add(fn);return()=>{changes.delete(fn);unsubscribed++;};}}};
  const mounted=R.mount({window:win,document:doc,now:()=>time,random:()=>.37});
  return {elements,doc,win,timers,changes,cleanups,mounted,tick(){for(const timer of timers.values())timer.fn();},advance(value){time=new Date(value);},language(value){selectedLanguage=value;doc.documentElement.lang=value;for(const callback of changes)callback();},get unsubscribed(){return unsubscribed;}};
}
test('Beijing date switches at 16:00 UTC and remains stable throughout the local day',()=>{
  const before=R.dayNumber(new Date('2026-10-27T15:59:59Z')),after=R.dayNumber(new Date('2026-10-27T16:00:00Z'));
  assert.equal(after,before+1);assert.equal(after,R.dayNumber(new Date('2026-10-28T15:59:59Z')));
});
test('the daily opening is deterministic, including dates before the epoch',()=>{
  for(const day of [-100,-1,0,20754])for(const size of [1,2,20])for(const random of [()=>0,()=>.999])assert.equal(R.createDeck(size,day,random).current(),((day%size)+size)%size);
  assert.equal(R.createDeck(0,12).current(),-1);assert.equal(R.createDeck(0,12).next(),-1);assert.equal(R.createDeck(1,12).next(),0);
});
test('each shuffle cycle visits every quotation before reuse and never immediately repeats',()=>{
  let seed=71;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32),deck=R.createDeck(20,20754,random),values=[deck.current()];
  for(let index=1;index<220;index++)values.push(deck.next());
  for(let index=1;index<values.length;index++)assert.notEqual(values[index],values[index-1]);
  for(let index=0;index<values.length;index+=20)assert.equal(new Set(values.slice(index,index+20)).size,20);
  const pair=R.createDeck(2,0,()=>0);for(let index=0;index<100;index++)assert.equal(pair.next(),(index+1)%2);
});
test('malformed entries and unsafe source or article links preserve the readable fallback',()=>{
  const quote=data.quotes[0];
  for(const url of ['javascript:alert(1)','http://example.org','https://name:secret@example.org','https://example.org/\npath'])assert.equal(R.quotations({version:1,quotes:[{...quote,url}]}).length,0);
  assert.equal(R.quotations({version:2,quotes:[quote]}).length,0);assert.equal(R.quotations({version:1,quotes:[quote,quote]}).length,1);
  for(const url of ['//example.org/articles/','/articles/../../about/','/articles/\nunsafe','/projects/','/articles/\\evil'])assert.equal(R.essayLines([{...ownItems[0],url:{'zh-CN':url,en:'/en/articles/valid/'}}]).length,0);
  assert.equal(R.essayLines([ownItems[0],ownItems[0]]).length,1);
  const h=harness({classic:'{broken',own:'null'});assert.equal(h.elements['daily-quote-text'].textContent,'Server-rendered fallback');assert.equal(h.elements['own-quote-text'].textContent,'Server-rendered fallback');
  assert(h.elements['daily-quote-button'].hidden);assert(h.elements['own-quote-button'].hidden);assert.equal(h.timers.size,0);
});
test('both native buttons advance independently and a same-day timer does not undo a manual choice',()=>{
  const h=harness(),e=h.elements;assert(!e['daily-quote-button'].hidden);assert(!e['own-quote-button'].hidden);assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,60000);
  const classic=e['daily-quote'].dataset.quoteId,own=e['own-quote'].dataset.quoteIndex;
  e['daily-quote-button'].fire('click');assert.notEqual(e['daily-quote'].dataset.quoteId,classic);assert.equal(e['own-quote'].dataset.quoteIndex,own);
  const changed=e['daily-quote-text'].textContent;e['own-quote-button'].fire('click');assert.notEqual(e['own-quote'].dataset.quoteIndex,own);assert.equal(e['daily-quote-text'].textContent,changed);
  const manual=[e['daily-quote'].dataset.quoteId,e['own-quote'].dataset.quoteIndex];h.tick();h.doc.fire('visibilitychange');assert.deepEqual([e['daily-quote'].dataset.quoteId,e['own-quote'].dataset.quoteIndex],manual);
});
test('language changes render the same two chosen items with their matching source links',()=>{
  const h=harness(),e=h.elements;e['daily-quote-button'].fire('click');e['own-quote-button'].fire('click');const id=e['daily-quote'].dataset.quoteId,index=+e['own-quote'].dataset.quoteIndex;
  h.language('en');const quote=data.quotes.find(item=>item.id===id);assert.equal(e['daily-quote'].dataset.quoteId,id);assert.equal(e['daily-quote-text'].textContent,quote.text.en);assert.equal(e['daily-quote-author'].textContent,quote.author.en);assert.equal(e['daily-quote-work'].href,quote.url);assert.equal(e['daily-quote-note'].textContent,quote.translation_note.en);
  assert.equal(e['own-quote-text'].textContent,ownItems[index].text.en);assert.equal(e['own-quote-source'].children.find(child=>child.tagName==='A').href,ownItems[index].url.en);assert.equal(e['daily-quote-button'].textContent,'Another quote');
  h.language('zh-CN');assert.equal(e['daily-quote'].dataset.quoteId,id);assert.equal(e['own-quote-text'].textContent,ownItems[index].text['zh-CN']);assert.equal(e['own-quote-source'].children.find(child=>child.tagName==='TIME').textContent,'2024.05.06');
});
test('a paired language navigation consumes one in-memory handoff and preserves both remaining decks',()=>{
  const first=harness(),e=first.elements,seen=[e['daily-quote'].dataset.quoteId];
  e['daily-quote-button'].fire('click');seen.push(e['daily-quote'].dataset.quoteId);e['own-quote-button'].fire('click');
  const ownIndex=e['own-quote'].dataset.quoteIndex,carrier=first.doc.documentElement;
  first.doc.fire('click',{button:0,target:{closest:()=>({getAttribute:name=>name==='data-site-language-switch'?'en':null})}});
  assert(carrier.__dailyReadingTransfer);first.cleanups[0]();
  const next=harness({language:'en',carrier});assert.equal(next.elements['daily-quote'].dataset.quoteId,seen.at(-1));assert.equal(next.elements['own-quote'].dataset.quoteIndex,ownIndex);assert.equal(carrier.__dailyReadingTransfer,undefined);
  assert.equal(next.elements['daily-quote-text'].textContent,data.quotes.find(item=>item.id===seen.at(-1)).text.en);
  for(let index=2;index<data.quotes.length;index++){next.elements['daily-quote-button'].fire('click');seen.push(next.elements['daily-quote'].dataset.quoteId);}assert.equal(new Set(seen).size,data.quotes.length);
  next.cleanups[0]();const returned=harness({carrier});const day=R.dayNumber(new Date('2026-10-28T02:00:00Z'));assert.equal(returned.elements['daily-quote'].dataset.quoteId,data.quotes[day%data.quotes.length].id);
});
test('old, mismatched or malformed transfers cannot change the daily opening',()=>{
  for(const handoff of [{poolKey:'different',day:1,language:'en'},{created:0,language:'en'},null]){
    const carrier={__dailyReadingTransfer:handoff},h=harness({language:'en',carrier}),day=R.dayNumber(new Date('2026-10-28T02:00:00Z'));assert.equal(h.elements['daily-quote'].dataset.quoteId,data.quotes[day%data.quotes.length].id);assert.equal(carrier.__dailyReadingTransfer,undefined);
  }
  const deck=R.createDeck(3,0,()=>.5,{selected:2,remaining:[2,0]});assert.equal(deck.current(),0);
  const saved=R.createDeck(3,0,()=>.5).snapshot();saved.remaining.length=0;assert.equal(R.createDeck(3,0,()=>.5).snapshot().remaining.length,2);
});
test('Beijing midnight resets both decks to the new daily opening, then manual controls remain usable',()=>{
  const h=harness({day:'2026-10-27T15:59:59Z'}),e=h.elements;e['daily-quote-button'].fire('click');e['own-quote-button'].fire('click');
  h.advance('2026-10-27T16:00:00Z');h.tick();const day=R.dayNumber(new Date('2026-10-27T16:00:00Z'));
  assert.equal(e['daily-quote'].dataset.quoteId,data.quotes[day%data.quotes.length].id);assert.equal(+e['own-quote'].dataset.quoteIndex,day%ownItems.length);
  e['daily-quote-button'].fire('click');assert.notEqual(e['daily-quote'].dataset.quoteId,data.quotes[day%data.quotes.length].id);
});
test('leaving clears the single timer, language subscription and buttons; returning initializes a fresh daily deck',()=>{
  const h=harness(),timer=[...h.timers.values()][0].fn,languageCallback=[...h.changes][0],before=h.elements['daily-quote-text'].textContent;
  h.cleanups[0]();h.mounted.destroy();assert.equal(h.timers.size,0);assert.equal(h.changes.size,0);assert.equal(h.unsubscribed,1);
  h.elements['daily-quote-button'].fire('click');h.elements['own-quote-button'].fire('click');h.advance('2026-11-03T00:00:00Z');timer();languageCallback();assert.equal(h.elements['daily-quote-text'].textContent,before);
  const returned=harness();assert.equal(returned.elements['daily-quote-text'].textContent,before);returned.elements['daily-quote-button'].fire('click');assert.notEqual(returned.elements['daily-quote-text'].textContent,before);
});
test('a single valid entry is readable and has no ineffective change button',()=>{
  const h=harness({classic:{version:1,quotes:[data.quotes[0]]},own:[ownItems[0]]});assert.equal(h.elements['daily-quote-text'].textContent,data.quotes[0].text['zh-CN']);assert(h.elements['daily-quote-button'].hidden);assert(h.elements['own-quote-button'].hidden);
  assert.doesNotThrow(()=>R.mount());
});
test('the checked pool has five short bilingual entries per author with per-work excerpt limits and documented locators',()=>{
  assert.equal(data.version,1);assert.equal(data.quotes.length,20);assert.equal(new Set(data.quotes.map(item=>item.id)).size,20);assert.equal(R.quotations(data).length,20);
  const counts=new Map(),works=new Map(),notes=fs.readFileSync(path.join(__dirname,'../home/brief/quotes-sources.md'),'utf8');
  for(const item of data.quotes){counts.set(item.author['zh-CN'],(counts.get(item.author['zh-CN'])||0)+1);assert(notes.includes('`'+item.id+'`'));assert(/^https:\/\/www\.marxists\.org\/chinese\//.test(item.url));assert(item.translation_note['zh-CN'].includes('本站'));assert(/site/i.test(item.translation_note.en));
    for(const key of ['text','author','work','translation_note'])for(const language of ['zh-CN','en'])assert(typeof item[key][language]==='string'&&item[key][language].trim());
    const total=works.get(item.url)||{zh:0,en:0};total.zh+=Array.from(item.text['zh-CN']).length;total.en+=item.text.en.trim().split(/\s+/).length;works.set(item.url,total);
  }
  assert.deepEqual(Object.fromEntries(counts),{'马克思':5,'恩格斯':5,'列宁':5,'毛泽东':5});for(const [url,total]of works){assert(total.zh<=25,url+' Chinese excerpt total '+total.zh);assert(total.en<=25,url+' English excerpt total '+total.en);}
});
