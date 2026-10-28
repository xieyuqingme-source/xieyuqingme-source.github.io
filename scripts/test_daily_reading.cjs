'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {test} = require('node:test');
const R = require('../home/assets/daily-reading.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname,'../home/daily-content.json'),'utf8'));
class Element {
  constructor() { this.dataset={};this.attributes={};this.events=new Map();this.hidden=false;this.textContent=''; }
  setAttribute(name,value) { this.attributes[name]=String(value); }
  addEventListener(type,handler) { if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(handler); }
  removeEventListener(type,handler) { this.events.get(type)?.delete(handler); }
  fire(type,event={}) { for(const handler of this.events.get(type)||[])handler({target:this,...event}); }
}
function harness({classic=data,day='2026-10-28T02:00:00Z',language='zh-CN',carrier=null}={}) {
  const elements=Object.fromEntries(['daily-content-data','daily-quote','daily-quote-text','daily-quote-author','daily-quote-work','daily-quote-note','daily-quote-button','daily-quotation-title'].map(id=>[id,new Element()]));
  elements['daily-content-data'].textContent=typeof classic==='string'?classic:JSON.stringify(classic);
  elements['daily-quote-text'].textContent='Server-rendered fallback';elements['daily-quote-button'].hidden=true;
  elements['daily-quotation-title'].textContent='马克思主义名句';
  const doc=new Element();doc.documentElement=carrier||{lang:language};doc.documentElement.lang=language;doc.hidden=false;doc.getElementById=id=>elements[id]||null;
  const timers=new Map(),cleanups=[],changes=new Set();let time=new Date(day),selectedLanguage=language,unsubscribed=0;
  const win={setInterval(fn,delay){const id=timers.size+1;timers.set(id,{fn,delay});return id;},clearInterval(id){timers.delete(id);},fetch(){throw Error('Quotes must not be fetched');},localStorage:{getItem(){throw Error('Quotes must not read storage');}},SiteNavigation:{own(fn){cleanups.push(fn);}},SiteI18n:{lang:()=>selectedLanguage,page:()=>({switchMode:'navigate'}),onChange(fn){changes.add(fn);return()=>{changes.delete(fn);unsubscribed++;};}}};
  const mounted=R.mount({window:win,document:doc,now:()=>time,random:()=>.37});
  return {elements,doc,win,timers,changes,cleanups,mounted,tick(){for(const timer of timers.values())timer.fn();},advance(value){time=new Date(value);},language(value){selectedLanguage=value;doc.documentElement.lang=value;for(const callback of changes)callback();},get unsubscribed(){return unsubscribed;}};
}
test('Beijing date switches at 16:00 UTC and remains stable throughout the local day',()=>{
  const before=R.dayNumber(new Date('2026-10-27T15:59:59Z')),after=R.dayNumber(new Date('2026-10-27T16:00:00Z'));
  assert.equal(after,before+1);assert.equal(after,R.dayNumber(new Date('2026-10-28T15:59:59Z')));
});
test('the daily opening is deterministic, including dates before the epoch',()=>{
  for(const day of [-100,-1,0,20754])for(const size of [1,2,430])for(const random of [()=>0,()=>.999])assert.equal(R.createDeck(size,day,random).current(),((day%size)+size)%size);
  assert.equal(R.createDeck(0,12).current(),-1);assert.equal(R.createDeck(0,12).next(),-1);assert.equal(R.createDeck(1,12).next(),0);
});
test('each shuffle cycle visits every quotation before reuse and never immediately repeats',()=>{
  const size=data.quotes.length;let seed=71;
  const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32),deck=R.createDeck(size,20754,random),values=[deck.current()];
  for(let index=1;index<size*3;index++)values.push(deck.next());
  for(let index=1;index<values.length;index++)assert.notEqual(values[index],values[index-1]);
  for(let index=0;index<values.length;index+=size)assert.equal(new Set(values.slice(index,index+size)).size,size);
  const pair=R.createDeck(2,0,()=>0);for(let index=0;index<100;index++)assert.equal(pair.next(),(index+1)%2);
});
test('malformed entries and unsafe source links preserve the readable fallback',()=>{
  const quote=data.quotes[0];
  for(const url of ['javascript:alert(1)','http://example.org','https://name:secret@example.org','https://example.org/\npath'])assert.equal(R.quotations({version:1,quotes:[{...quote,url}]}).length,0);
  for(const url of [{'zh-CN':quote.url['zh-CN']},{'zh-CN':quote.url['zh-CN'],en:'javascript:alert(1)'},{'zh-CN':'http://example.org',en:quote.url.en},{'zh-CN':[],en:quote.url.en},null])assert.equal(R.quotations({version:1,quotes:[{...quote,url}]}).length,0);
  assert.equal(R.quotations({version:1,quotes:[{...quote,url:quote.url['zh-CN']}]}).length,1);
  assert.equal(R.quotations({version:2,quotes:[quote]}).length,0);assert.equal(R.quotations({version:1,quotes:[quote,quote]}).length,1);
  for(const classic of ['{broken','null',{version:1,quotes:[]}]){const h=harness({classic});assert.equal(h.elements['daily-quote-text'].textContent,'Server-rendered fallback');assert(h.elements['daily-quote-button'].hidden);assert.equal(h.timers.size,0);}
});
test('the native change button advances and same-day refreshes preserve the manual choice',()=>{
  const h=harness(),e=h.elements;assert(!e['daily-quote-button'].hidden);assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,60000);
  const classic=e['daily-quote'].dataset.quoteId;e['daily-quote-button'].fire('click');assert.notEqual(e['daily-quote'].dataset.quoteId,classic);
  const manual=e['daily-quote'].dataset.quoteId;h.tick();h.doc.fire('visibilitychange');assert.equal(e['daily-quote'].dataset.quoteId,manual);
});
test('language changes retain the quotation and use the matching source language',()=>{
  const h=harness(),e=h.elements;e['daily-quote-button'].fire('click');const id=e['daily-quote'].dataset.quoteId,quote=data.quotes.find(item=>item.id===id);
  for(const language of ['en','zh-CN']){h.language(language);assert.equal(e['daily-quote'].dataset.quoteId,id);assert.equal(e['daily-quote-text'].textContent,quote.text[language]);assert.equal(e['daily-quote-author'].textContent,quote.author[language]);assert.equal(e['daily-quote-work'].href,quote.url[language]);assert.equal(e['daily-quote-note'].textContent,quote.translation_note[language]);assert.equal(e['daily-quote-work'].attributes.hreflang,quote.source_language?.[language]||language);assert.equal(e['daily-quote-work'].attributes.lang,language);assert.equal(e['daily-quotation-title'].textContent,language==='en'?'Marxist quotations':'马克思主义名句');assert.equal(e['daily-quote-button'].attributes['aria-label'],language==='en'?'Another quote · Marxist quotations':'换一句 · 马克思主义名句');}
});
test('paired language navigation consumes the handoff and preserves the remaining deck',()=>{
  const first=harness(),e=first.elements,seen=[e['daily-quote'].dataset.quoteId];
  e['daily-quote-button'].fire('click');seen.push(e['daily-quote'].dataset.quoteId);const carrier=first.doc.documentElement;
  first.doc.fire('click',{button:0,target:{closest:()=>({getAttribute:name=>name==='data-site-language-switch'?'en':null})}});
  assert(carrier.__dailyReadingTransfer);first.cleanups[0]();
  const next=harness({language:'en',carrier});assert.equal(next.elements['daily-quote'].dataset.quoteId,seen.at(-1));assert.equal(carrier.__dailyReadingTransfer,undefined);
  for(let index=seen.length;index<data.quotes.length;index++){next.elements['daily-quote-button'].fire('click');seen.push(next.elements['daily-quote'].dataset.quoteId);}assert.equal(new Set(seen).size,data.quotes.length);
  next.cleanups[0]();const returned=harness({carrier}),day=R.dayNumber(new Date('2026-10-28T02:00:00Z'));assert.equal(returned.elements['daily-quote'].dataset.quoteId,data.quotes[day%data.quotes.length].id);
});
test('old, mismatched or malformed transfers cannot change the daily opening',()=>{
  for(const handoff of [{poolKey:'different',day:1,language:'en'},{created:0,language:'en'},null]){const carrier={__dailyReadingTransfer:handoff},h=harness({language:'en',carrier}),day=R.dayNumber(new Date('2026-10-28T02:00:00Z'));assert.equal(h.elements['daily-quote'].dataset.quoteId,data.quotes[day%data.quotes.length].id);assert.equal(carrier.__dailyReadingTransfer,undefined);}
  const deck=R.createDeck(3,0,()=>.5,{selected:2,remaining:[2,0]});assert.equal(deck.current(),0);
  const saved=R.createDeck(3,0,()=>.5).snapshot();saved.remaining.length=0;assert.equal(R.createDeck(3,0,()=>.5).snapshot().remaining.length,2);
});
test('Beijing midnight resets the daily opening and manual controls remain usable',()=>{
  const h=harness({day:'2026-10-27T15:59:59Z'}),e=h.elements;e['daily-quote-button'].fire('click');h.advance('2026-10-27T16:00:00Z');h.tick();const day=R.dayNumber(new Date('2026-10-27T16:00:00Z'));
  assert.equal(e['daily-quote'].dataset.quoteId,data.quotes[day%data.quotes.length].id);e['daily-quote-button'].fire('click');assert.notEqual(e['daily-quote'].dataset.quoteId,data.quotes[day%data.quotes.length].id);
});
test('leaving clears the timer, subscription and button, while returning starts a fresh daily deck',()=>{
  const h=harness(),timer=[...h.timers.values()][0].fn,languageCallback=[...h.changes][0],before=h.elements['daily-quote-text'].textContent;
  h.cleanups[0]();h.mounted.destroy();assert.equal(h.timers.size,0);assert.equal(h.changes.size,0);assert.equal(h.unsubscribed,1);
  h.elements['daily-quote-button'].fire('click');h.advance('2026-11-03T00:00:00Z');timer();languageCallback();assert.equal(h.elements['daily-quote-text'].textContent,before);
  const returned=harness();assert.equal(returned.elements['daily-quote-text'].textContent,before);returned.elements['daily-quote-button'].fire('click');assert.notEqual(returned.elements['daily-quote-text'].textContent,before);
});
test('one valid quotation is readable without an ineffective change button',()=>{
  const h=harness({classic:{version:1,quotes:[data.quotes[0]]}});assert.equal(h.elements['daily-quote-text'].textContent,data.quotes[0].text['zh-CN']);assert(h.elements['daily-quote-button'].hidden);assert.doesNotThrow(()=>R.mount());
});
test('the checked pool has 430 distinct bilingual entries, joint authorship and traceable editions',()=>{
  assert.equal(data.version,1);assert.equal(data.quotes.length,430);assert.equal(new Set(data.quotes.map(item=>item.id)).size,430);assert.equal(R.quotations(data).length,430);
  const counts=new Map(),notes=fs.readFileSync(path.join(__dirname,'../home/brief/quotes-sources.md'),'utf8');
  const review=JSON.parse(fs.readFileSync(path.join(__dirname,'../home/brief/quotes-review.json'),'utf8')),records=new Map(review.quotes.map(item=>[item.id,item])),hash=text=>require('node:crypto').createHash('sha256').update(text).digest('hex');
  assert.equal(records.size,430);
  for(const language of ['zh-CN','en'])assert.equal(new Set(data.quotes.map(item=>item.text[language].replace(/[\p{P}\p{Z}\s]/gu,'').toLowerCase())).size,430);
  for(const item of data.quotes){counts.set(item.author['zh-CN'],(counts.get(item.author['zh-CN'])||0)+1);assert(notes.includes('`'+item.id+'`'));assert(notes.includes(item.url.en));assert(notes.includes(item.url['zh-CN']));
    for(const key of ['text','author','work','translation_note'])for(const language of ['zh-CN','en'])assert(typeof item[key][language]==='string'&&item[key][language].trim());
    for(const language of ['zh-CN','en']){assert(['www.marxists.org','www.chinaleifeng.com','archive.org'].includes(new URL(item.url[language]).hostname));assert.equal(records.get(item.id).sources[language].url,item.url[language]);assert.equal(records.get(item.id).texts_sha256[language],hash(item.text[language]));}
  }
  assert.deepEqual(Object.fromEntries(counts),{'马克思':110,'恩格斯':60,'列宁':50,'毛泽东':100,'马恩':80,'切·格瓦拉':10,'雷锋':10,'尼古拉·奥斯特洛夫斯基':10});
});
test('sources use the card language with only the two explicitly allowed translation exceptions',()=>{
  for(const language of ['zh-CN','en'])for(const quote of data.quotes){const h=harness({language,classic:{version:1,quotes:[quote]}});assert.equal(h.elements['daily-quote-work'].attributes.hreflang,quote.source_language?.[language]||language);}
  const quote=data.quotes[0];for(const tag of ['fr','en" onclick="alert(1)','javascript:en'])assert.equal(R.quotations({version:1,quotes:[{...quote,source_language:{'zh-CN':tag,en:'en'}}]}).length,0);
  for(const source_language of [{'zh-CN':'en',en:'en'},{'zh-CN':'zh-CN',en:'zh-CN'}])assert.equal(R.quotations({version:1,quotes:[{...quote,source_language}]}).length,0);
  for(const item of data.quotes){
    const expected={'zh-CN':'zh-CN',en:'en'};
    if(item.author['zh-CN']==='雷锋')expected.en=item.source_language.en;
    if(item.author['zh-CN']==='切·格瓦拉')expected['zh-CN']=item.source_language['zh-CN'];
    assert.deepEqual(item.source_language,expected);
    if(expected['zh-CN']===expected.en)assert(item.translation_note[expected.en==='en'?'zh-CN':'en'].includes('AI'));
    else assert.notEqual(item.url['zh-CN'],item.url.en);
  }
});
