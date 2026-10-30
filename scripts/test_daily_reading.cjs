'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {test} = require('node:test');
const R = require('../home/assets/daily-reading.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname,'../home/daily-content.json'),'utf8'));
class Element {
  constructor() { this.dataset={};this.attributes={};this.events=new Map();this.hidden=false;this.textContent=''; }
  setAttribute(name,value) { this.attributes[name]=String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type,handler) { if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(handler); }
  removeEventListener(type,handler) { this.events.get(type)?.delete(handler); }
  fire(type,event={}) { for(const handler of this.events.get(type)||[])handler({target:this,...event}); }
}
function harness({classic=data,english=null,day='2026-10-28T02:00:00Z',language='zh-CN',carrier=null}={}) {
  const elements=Object.fromEntries(['daily-content-data','daily-quote','daily-quote-text','daily-quote-author','daily-quote-work','daily-quote-note','daily-quote-button','daily-quotation-title'].map(id=>[id,new Element()]));
  elements['daily-content-data'].textContent=typeof classic==='string'?classic:JSON.stringify(classic);
  elements['daily-quote-text'].textContent='Server-rendered fallback';elements['daily-quote-button'].hidden=true;
  elements['daily-quotation-title'].textContent='马克思主义名句';
  if(english!==null){for(const id of ['english-quotes-data','english-quote','english-quote-text','english-quote-translation','english-quote-work','english-quote-note','english-quote-related','english-quote-translation-source','english-quote-button','english-quotation-title'])elements[id]=new Element();elements['english-quotes-data'].textContent=typeof english==='string'?english:JSON.stringify(english);elements['english-quote-text'].textContent='English fallback';elements['english-quote-button'].hidden=true;}
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

function englishFixture(){return{version:1,quotes:Array.from({length:5},(_,i)=>({id:'fixture-english-'+i,text:'A public original sentence '+i+'.',translation:'中文自译'+i+'。',translation_source:{type:'site'},author_zh:'测试作者',author_en:'Synthetic Author',work_zh:'合成作品',work_en:'Synthetic Work',locator_zh:'合成位置',first_published:1900,author_died:1950,url:'https://example.org/original-'+i,note:'合成测试说明。',...(i%2?{related:'/english/fixture-card/'}:{})}))};}
test('English display keeps verified verse lines and requires explicit quotation boundaries',()=>{
  const quote=englishFixture().quotes[0],accepted=text=>R.englishQuotations({version:1,quotes:[{...quote,text}]},new Date('2026-10-29')).length;
  for(const text of ['A full sentence.','…a bounded excerpt…','“A quotation.”','First line,\nSecond line.'])assert.equal(accepted(text),1,text);
  for(const text of ['a hidden fragment.','A dangling clause,',' A sentence.','A\n\nB.','A\nB\nC\nD\nE.'])assert.equal(accepted(text),0,text);
  for(const text of ['A\tliteral sentence.','First line,\r\nSecond line.'])assert.equal(accepted(text),0,text);
  for(const translation of ['甲\r\n乙','甲\t乙','甲\r乙\r丙\r丁\r戊'])assert.equal(R.englishQuotations({version:1,quotes:[{...quote,translation}]},new Date('2026-10-29')).length,0,translation);
  const english=englishFixture();english.quotes[0].text='First line,\nSecond line.';english.quotes[0].translation='第一行，\n第二行。';
  const h=harness({english});for(let i=0;i<english.quotes.length;i++)h.elements['english-quote-button'].fire('click');
  const selected=english.quotes.find(q=>q.id===h.elements['english-quote'].dataset.quoteId);assert.equal(h.elements['english-quote-text'].textContent,selected.text);
});
test('English display validation rejects unknown fields, unsafe URLs, excess lengths and non-public-domain editions',()=>{
  const valid=englishFixture(),quote=valid.quotes[0];assert.equal(R.englishQuotations(valid,new Date('2026-10-29')).length,5);
  for(const changes of [{extra:true},{id:'UPPER'},{url:'https://localhost/path'},{url:'https://127.0.0.1/path'},{url:'https://[::1]/path'},{url:'https://user:secret@example.org/'},{url:'https://example.org/?token=secret'},{url:'javascript:alert(1)'},{text:'word '.repeat(46)},{translation:'字'.repeat(121)},{note:'字'.repeat(161)},{first_published:1931},{author_died:1976},{first_published:true},{translation_source:{type:'site',extra:true}},{translation_source:{type:'published',name:'Modern translation',url:'https://example.org/',translator_died:2000}},{related:'/english/tools/'}])assert.equal(R.englishQuotations({version:1,quotes:[{...quote,...changes}]},new Date('2026-10-29')).length,0,JSON.stringify(changes));
  const edge={...quote,first_published:1930,author_died:1975};assert.equal(R.englishQuotations({version:1,quotes:[edge]},new Date('2026-10-29')).length,1);assert.equal(R.englishQuotations({version:1,quotes:[edge]},new Date('2025-10-29')).length,0);
  assert.equal(R.englishQuotations({version:1,quotes:[quote,{...quote,id:'other-id',text:quote.text.toUpperCase()}]}).length,1);
});
test('English and Marxist controls advance only their own deck and refresh every display field together',()=>{
  const english=englishFixture(),h=harness({english}),e=h.elements,classic=e['daily-quote'].dataset.quoteId,opening=e['english-quote'].dataset.quoteId;
  e['english-quote-button'].fire('click');assert.equal(e['daily-quote'].dataset.quoteId,classic);assert.notEqual(e['english-quote'].dataset.quoteId,opening);
  const selected=english.quotes.find(q=>q.id===e['english-quote'].dataset.quoteId);assert.equal(e['english-quote-text'].textContent,selected.text);assert.equal(e['english-quote-translation'].textContent,selected.translation);assert.equal(e['english-quote-work'].href,selected.url);assert(e['english-quote-note'].textContent.includes(selected.note));assert(e['english-quote-note'].textContent.includes('本站译文（AI 辅助'));assert.equal(e['english-quote-related'].hidden,!selected.related);
  const current=e['english-quote'].dataset.quoteId;e['daily-quote-button'].fire('click');assert.equal(e['english-quote'].dataset.quoteId,current);h.tick();assert.equal(e['english-quote'].dataset.quoteId,current);h.cleanups[0]();
});
test('English content is identical in both UI languages and the compact button label follows the UI',()=>{
  const h=harness({english:englishFixture()}),e=h.elements;e['english-quote-button'].fire('click');const content=['english-quote-text','english-quote-translation','english-quote-work','english-quote-note'].map(id=>e[id].textContent),id=e['english-quote'].dataset.quoteId;
  h.language('en');assert.equal(e['english-quote'].dataset.quoteId,id);assert.deepEqual(['english-quote-text','english-quote-translation','english-quote-work','english-quote-note'].map(id=>e[id].textContent),content);assert.equal(e['english-quote-button'].attributes['aria-label'],'Another quote · English quotations');h.cleanups[0]();
});
test('both independent remaining bags survive a language navigation without storage or repetition',()=>{
  const english=englishFixture(),a=harness({english}),seen=[a.elements['english-quote'].dataset.quoteId];a.elements['english-quote-button'].fire('click');seen.push(a.elements['english-quote'].dataset.quoteId);a.elements['daily-quote-button'].fire('click');const selected=a.elements['daily-quote'].dataset.quoteId,carrier=a.doc.documentElement;
  a.doc.fire('click',{button:0,target:{closest:()=>({getAttribute:name=>name==='data-site-language-switch'?'en':null})}});assert(carrier.__dailyReadingTransfer.english);a.cleanups[0]();const b=harness({english,language:'en',carrier});assert.equal(b.elements['daily-quote'].dataset.quoteId,selected);assert.equal(b.elements['english-quote'].dataset.quoteId,seen.at(-1));for(let i=seen.length;i<english.quotes.length;i++){b.elements['english-quote-button'].fire('click');seen.push(b.elements['english-quote'].dataset.quoteId);}assert.equal(new Set(seen).size,english.quotes.length);b.cleanups[0]();
});
test('English midnight reset and PageScope disposal retain the existing reading lifecycle',()=>{
  const english=englishFixture(),h=harness({english,day:'2026-10-28T15:59:59Z'}),e=h.elements;e['english-quote-button'].fire('click');h.advance('2026-10-28T16:00:00Z');h.tick();const day=R.dayNumber(new Date('2026-10-28T16:00:00Z'));assert.equal(e['english-quote'].dataset.quoteId,english.quotes[day%english.quotes.length].id);const before=e['english-quote'].dataset.quoteId;h.cleanups[0]();e['english-quote-button'].fire('click');assert.equal(e['english-quote'].dataset.quoteId,before);assert.equal(h.timers.size,0);assert.equal(h.changes.size,0);
});
test('invalid English display data preserves its static fallback without disabling the other deck',()=>{
  for(const english of ['{broken',{version:1,quotes:[]},null]){const h=harness({english:english===null?'null':english});assert.equal(h.elements['english-quote-text'].textContent,'English fallback');assert(h.elements['english-quote-button'].hidden);const before=h.elements['daily-quote'].dataset.quoteId;h.elements['daily-quote-button'].fire('click');assert.notEqual(h.elements['daily-quote'].dataset.quoteId,before);h.cleanups[0]();}
});
test('the production English pool is source-backed, complete and traversable before repetition',()=>{
  const english=JSON.parse(fs.readFileSync(path.join(__dirname,'../home/brief/english-quotes.json'),'utf8'));assert(english.quotes.length>=100);assert.equal(R.englishQuotations(english,new Date('2026-10-29')).length,english.quotes.length);const h=harness({english}),seen=new Set([h.elements['english-quote'].dataset.quoteId]);for(let i=1;i<english.quotes.length;i++){h.elements['english-quote-button'].fire('click');seen.add(h.elements['english-quote'].dataset.quoteId);}assert.equal(seen.size,english.quotes.length);const last=h.elements['english-quote'].dataset.quoteId;h.elements['english-quote-button'].fire('click');assert.notEqual(h.elements['english-quote'].dataset.quoteId,last);h.cleanups[0]();
});

test('theme metadata has the same finite vocabulary and strict shape as the Python quotation validator',()=>{
  const date=new Date('2026-10-30'),quote=englishFixture().quotes[0];
  const accepted=themes=>R.englishQuotations({version:1,quotes:[{...quote,themes}]},date);
  for(const theme of ['learning','life','love','courage','freedom','time','nature','friendship','hope','humor','society','art'])assert.equal(accepted([theme]).length,1,theme);
  assert.equal(accepted(['learning','freedom']).length,1);
  for(const themes of [[],['unknown'],['Learning'],['life','life'],['life','time','hope'],null,'life',true,{},[1],[{}],[[]]])assert.equal(accepted(themes).length,0,JSON.stringify(themes));
  assert.equal(R.englishQuotations({version:1,quotes:[quote,{...quote,id:'second-synthetic',text:'Another invented sentence.',themes:['life']}]},date).length,1,'Once themes are present, unclassified items cannot silently enter the deck');
});
test('adding themes leaves bilingual Today cards, shuffle bags, buttons and source links unchanged',()=>{
  const original=englishFixture(),classified=JSON.parse(JSON.stringify(original));classified.quotes.forEach((quote,index)=>{quote.themes=index%2?['life','hope']:['learning'];});
  const plain=harness({english:original}),themed=harness({english:classified});
  const ids=['english-quote-text','english-quote-translation','english-quote-work','english-quote-note','english-quote-related','english-quote-translation-source','english-quote-button'];
  for(let index=0;index<original.quotes.length*2;index++){
    assert.equal(plain.elements['english-quote'].dataset.quoteId,themed.elements['english-quote'].dataset.quoteId);
    for(const id of ids){assert.equal(plain.elements[id].textContent,themed.elements[id].textContent,id);assert.equal(plain.elements[id].hidden,themed.elements[id].hidden,id);assert.equal(plain.elements[id].href,themed.elements[id].href,id);assert.deepEqual(plain.elements[id].attributes,themed.elements[id].attributes,id);}
    plain.elements['english-quote-button'].fire('click');themed.elements['english-quote-button'].fire('click');
  }
  plain.language('en');themed.language('en');for(const id of ids)assert.equal(plain.elements[id].textContent,themed.elements[id].textContent,id);
  plain.cleanups[0]();themed.cleanups[0]();
});
