/* Run with Node.js; all calculations are local and exact. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const numbers = require('../home/assets/english-numbers.js');

const parsed = [
  ['0',0n],['10',100000n],['10000',100000000n],['100000',1000000000n],
  ['1000000',10000000000n],['10000000',100000000000n],['100000000',1000000000000n],['1000000000',10000000000000n],
  ['14亿',14000000000000n],['960万',96000000000n],['8300万',830000000000n],['48.6万',4860000000n],
  ['1.25亿',1250000000000n],['1亿2000万',1200000000000n],['2万5千',250000000n],['1千2百3十4',12340000n],
  ['1亿2万3',1000200030000n],['1.4 billion',14000000000000n],['1.4 BILLION',14000000000000n],
  ['a million',10000000000n],['A THOUSAND',10000000n],['2 trillion',20000000000000000n],
  ['1,234,567.8901',12345678901n],['1 234 567.8901',12345678901n],['１，２３４．５６７８',12345678n],
  [' １．４　ｂｉｌｌｉｏｎ ',14000000000000n],['0.0001',1n],['0.1000',1000n],['0.0001万',10000n],
  ['1 亿 2000 万',1200000000000n],['999999999999',9999999999990000n],['9999999999999999.9999',99999999999999999999n]
];
for (const [input,expected] of parsed) test(`parse exact fixed-point: ${input}`,() => assert.equal(numbers.parse(input),expected));

test('14亿 exposes the two groupings and both written languages',() => assert.deepEqual(numbers.convert('14亿'),{
  digits:'1400000000',grouped3:'1,400,000,000',grouped4:'14,0000,0000',
  groups3:[{digits:'1',label:'billion'},{digits:'400',label:'million'},{digits:'000',label:'thousand'},{digits:'000',label:'ones'}],
  groups4:[{digits:'14',label:'亿'},{digits:'0000',label:'万'},{digits:'0000',label:'个'}],
  chineseShort:'14亿',chineseApprox:null,chineseWords:'十四亿',englishShort:'1.4 billion',englishWords:'one billion four hundred million'
}));
test('960万 converts to 9.6 million',() => assert.equal(numbers.convert('960万').englishShort,'9.6 million'));
test('8300万 converts to 83 million',() => assert.equal(numbers.convert('8300万').englishShort,'83 million'));
test('48.6万 converts to exactly 486 thousand',() => assert.equal(numbers.convert('48.6万').englishShort,'486 thousand'));
test('English and Chinese scale inputs produce identical full output',() => assert.deepEqual(numbers.convert('1.4 billion'),numbers.convert('14亿')));
test('Four fractional places survive without floating-point loss',() => {
  const result = numbers.convert('9999999999999999.9999');
  assert.equal(result.digits,'9999999999999999.9999');
  assert.equal(result.grouped3,'9,999,999,999,999,999.9999');
  assert.equal(result.grouped4,'9999,9999,9999,9999.9999');
  assert.equal(result.chineseShort,'99999999亿9999万9999.9999');
  assert.equal(result.chineseWords,null);
});
test('Chinese mixed-unit form retains all four fractional places',() => assert.equal(numbers.convert('100000001.0001').chineseShort,'1亿1.0001'));
test('Values below 万 have no artificial Chinese unit',() => assert.equal(numbers.convert('1000.25').chineseShort,'1000.25'));
test('Non-integers do not receive invented integer readings',() => {
  const result = numbers.convert('1.0001');
  assert.equal(result.chineseWords,null); assert.equal(result.englishWords,null);
});
test('The English full-spelling upper bound is explicit',() => {
  assert.equal(numbers.convert('1000000000000000').englishWords,null);
  assert.equal(numbers.convert('999999999999999').englishWords,'nine hundred ninety-nine trillion nine hundred ninety-nine billion nine hundred ninety-nine million nine hundred ninety-nine thousand nine hundred ninety-nine');
});

for (const [input,exact,approximate] of [
  ['12345678','1234万5678','约1235万'],['486000','48万6000','约49万'],
  ['125000000','1亿2500万','约1亿'],['149999999','1亿4999万9999','约1亿'],
  ['150000000','1亿5000万','约2亿'],['100010001','1亿1万1','约1亿'],
  ['100000000.0001','1亿0.0001','约1亿'],['10000.0001','1万0.0001','约1万'],
  ['12345678.9012','1234万5678.9012','约1235万'],['9999.9999','9999.9999','约10000'],
  ['14亿','14亿',null],['960万','960万',null],['2 trillion','20000亿',null],['0','0',null]
]) test(`Natural Chinese short form and explicit approximation: ${input}`,() => {
  const result=numbers.convert(input);
  assert.equal(result.chineseShort,exact);assert.equal(result.chineseApprox,approximate);
  assert.equal(numbers.parse(result.chineseShort),numbers.parse(input));
});

test('Grouping carries the matching units while retaining every digit and decimal',() => {
  const result=numbers.convert('9999999999999999.9999');
  assert.deepEqual(result.groups3.map(group=>group.label),['quadrillion','trillion','billion','million','thousand','ones']);
  assert.deepEqual(result.groups4.map(group=>group.label),['万亿','亿','万','个']);
  for (const input of ['0','0.0001','9999.9999','10000','100000001','14亿','9999999999999999.9999']) {
    const converted=numbers.convert(input);
    for (const size of [3,4]) {
      const groups=converted['groups'+size];
      assert.equal(groups.map(group=>group.digits).join(','),converted['grouped'+size]);
      assert.equal(groups.map(group=>group.digits).join(''),converted.digits);
      assert.ok(groups.every(group=>group.label && typeof group.digits==='string'));
    }
  }
});

test('Mixed-unit outputs and grouping digits preserve fixed-point values across the full range',() => {
  const limit=100000000000000000000n;let state=148786331n;
  for (let index=0;index<256;index++) {
    state=(state*6364136223846793005n+1442695040888963407n)%limit;
    const input=state/10000n+'.'+(state%10000n).toString().padStart(4,'0');
    const result=numbers.convert(input);
    assert.equal(numbers.parse(result.chineseShort),state,input);
    assert.equal(numbers.parse(result.digits),state,input);
    for (const groups of [result.groups3,result.groups4]) assert.equal(numbers.parse(groups.map(group=>group.digits).join('')),state,input);
  }
});

for (const [input,expected] of [
  ['0','零'],['10','十'],['11','十一'],['19','十九'],['20','二十'],['101','一百零一'],['110','一百一十'],['1001','一千零一'],
  ['1010','一千零一十'],['10000','一万'],['10001','一万零一'],['10010','一万零一十'],['100000','十万'],
  ['100100','十万零一百'],['101000','十万一千'],['100000001','一亿零一'],['100010000','一亿零一万'],['110000000','一亿一千万'],
  ['1000000000000','一万亿'],['1000000000001','一万亿零一'],['1000100010001','一万亿零一亿零一万零一'],
  ['9999999999999999','九千九百九十九万亿九千九百九十九亿九千九百九十九万九千九百九十九']
]) test(`Chinese reading: ${input}`,() => assert.equal(numbers.convert(input).chineseWords,expected));

for (const [input,expected] of [
  ['0','zero'],['10','ten'],['11','eleven'],['12','twelve'],['13','thirteen'],['15','fifteen'],['18','eighteen'],
  ['20','twenty'],['21','twenty-one'],['40','forty'],['99','ninety-nine'],['100','one hundred'],['105','one hundred five'],
  ['123','one hundred twenty-three'],['1001','one thousand one'],['1010','one thousand ten'],['100000','one hundred thousand'],
  ['1000001','one million one'],['1001001001','one billion one million one thousand one'],['2000000000000','two trillion']
]) test(`American English reading: ${input}`,() => assert.equal(numbers.convert(input).englishWords,expected));

for (const [input,expected] of [
  ['1000','1 thousand'],['1230','1.23 thousand'],['1234','≈ 1.23 thousand'],['1235','≈ 1.24 thousand'],
  ['999999','≈ 1 million'],['999.9999','≈ 1 thousand'],['0.0049','≈ 0'],['0.0050','≈ 0.01'],['1.2345','≈ 1.23'],
  ['1.2300','1.23'],['1234567890','≈ 1.23 billion'],['9999999999999999.9999','≈ 10000 trillion']
]) test(`Abbreviation and honest rounding: ${input}`,() => assert.equal(numbers.convert(input).englishShort,expected));

for (const input of ['0','10','1000','10000','100000','1.25亿','48.6万','14亿','2 trillion']) {
  test(`Exact short form can be parsed back: ${input}`,() => {
    const result = numbers.convert(input);
    assert.equal(result.englishShort.startsWith('≈'),false);
    assert.equal(numbers.parse(result.englishShort),numbers.parse(input));
    assert.equal(numbers.parse(result.chineseShort),numbers.parse(input));
  });
}

for (const input of [
  '', ' ', '-1', '+1', '1e6', 'NaN', 'Infinity', '1/2', '1.23456', '1.00001 million', '1.', '.5',
  '1,23', '1,234,56', '1234,567', '1 23', '1,234 567', '1..2', '1,000.12.3',
  '1万2亿', '1万2万', '1亿万', '亿', '1foo', 'one million', '14 billions',
  '十四亿', '2兆', '10000000000000000', '100000000亿', '10000 trillion',
  '<script>alert(1)</script>', '1\n2', null, 1000
]) test(`Reject unsupported or malformed input: ${JSON.stringify(input)}`,() => assert.throws(() => numbers.parse(input),numbers.NumberInputError));
test('Errors explain the unsupported 兆 and pure Chinese formats',() => {
  assert.throws(() => numbers.parse('1兆'),/不同地区/);
  assert.throws(() => numbers.parse('十四亿'),/阿拉伯数字/);
});

class Element {
  constructor(tag = 'div') { this.tagName = tag; this._textContent = ''; this.children = []; this.attributes = {}; this.listeners = new Map(); this.hidden = false; this.value = ''; }
  get textContent() { return this._textContent + this.children.map(child=>child.textContent).join(''); }
  set textContent(value) { this._textContent=String(value);this.children=[]; }
  addEventListener(type,handler) { this.listeners.set(type,handler); }
  removeEventListener(type,handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type); }
  setAttribute(key,value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._textContent='';this.children=children; }
  focus() { this.focused = true; }
}
function groupingDigits(definition) { return definition.children[0].children.filter(child=>child.className==='english-number-group').map(child=>child.children[0].textContent).join(','); }
function fixture() {
  const input = new Element('input'), results = new Element(), error = new Element(), example = new Element('button');
  input.value = '14亿'; example.setAttribute('data-number-example','48.6万');
  const root = {querySelectorAll:() => [example]}, elements = {'english-number-input':input,'english-number-results':results,'english-number-error':error};
  const document = {querySelector:() => root,getElementById:id => elements[id],createElement:tag => new Element(tag)};
  const timers = new Map(); let owned;
  const window = {setTimeout:callback => { const key = Symbol(); timers.set(key,callback); return key; },clearTimeout:key => timers.delete(key),SiteNavigation:{own:cleanup => { owned = cleanup; }}};
  return {input,results,error,example,document,window,timers,get owned() { return owned; }};
}
test('Local UI renders text safely, examples work, and invalid results are cleared',() => {
  const f = fixture(); numbers.mount(f);
  assert.equal(groupingDigits(f.results.children[0].children[1]),'1,400,000,000');
  f.example.listeners.get('click')();
  assert.equal(f.input.value,'48.6万'); assert.equal(f.input.focused,true);
  assert.equal(f.results.children[0].children[9].textContent,'486 thousand');
  f.input.value = '<img src=x onerror=alert(1)>';
  f.input.listeners.get('input')();
  [...f.timers.values()][0]();
  assert.equal(f.results.children.length,0); assert.equal(f.error.hidden,false); assert.equal(f.input.attributes['aria-invalid'],'true');
});
test('PageScope destruction removes listeners and pending debounce; repeated cleanup is safe',() => {
  const f = fixture(), mounted = numbers.mount(f);
  f.input.listeners.get('input')(); f.input.listeners.get('input')();
  assert.equal(f.timers.size,1);
  f.owned(); mounted.destroy();
  assert.equal(f.timers.size,0); assert.equal(f.input.listeners.size,0); assert.equal(f.example.listeners.size,0);
  f.input.value = '5'; mounted.refresh(); assert.equal(groupingDigits(f.results.children[0].children[1]),'1,400,000,000');
});

test('The two grouping diagrams expose visible unit labels and language metadata',() => {
  const f=fixture();numbers.mount(f);
  const list=f.results.children[0];assert.equal(list.children.length,12);
  for (const [index,expectedLanguage,units] of [[1,'en',['billion','million','thousand','ones']],[3,'zh-CN',['亿','万','个']]]) {
    const definition=list.children[index],strip=definition.children[0];
    assert.equal(definition.lang,expectedLanguage);assert.equal(strip.className,'english-number-groups');
    assert.equal(strip.getAttribute('role'),'group');assert.ok(strip.getAttribute('aria-label'));
    const groups=strip.children.filter(child=>child.className==='english-number-group');
    assert.deepEqual(groups.map(group=>group.children[1].textContent),units);
    assert.ok(groups.every(group=>group.children[0].tagName==='b' && group.children[0].lang==='en' && group.children[1].tagName==='small' && group.children[1].lang===expectedLanguage));
    assert.ok(strip.children.filter(child=>child.className==='english-number-separator').every(child=>child.getAttribute('aria-hidden')==='true'));
  }
});

test('A mixed short form and its estimate are separate readable elements',() => {
  const f=fixture(),mounted=numbers.mount(f);f.input.value='12345678';mounted.refresh();
  const definition=f.results.children[0].children[5];
  assert.equal(definition._textContent,'1234万5678');
  assert.equal(definition.children[0].className,'english-number-approx');
  assert.equal(definition.children[0].textContent,'约1235万');
});

test('Enter converts immediately, composition is respected, and keyboard cleanup is owned',() => {
  const f=fixture(),mounted=numbers.mount(f);f.input.value='12345678';f.input.listeners.get('input')();
  f.input.listeners.get('keydown')({key:'Tab'});assert.equal(f.timers.size,1);
  f.input.listeners.get('keydown')({key:'Enter',isComposing:true});assert.equal(f.timers.size,1);
  f.input.listeners.get('keydown')({key:'Enter',isComposing:false});
  assert.equal(f.timers.size,0);assert.equal(groupingDigits(f.results.children[0].children[1]),'12,345,678');
  mounted.destroy();assert.equal(f.input.listeners.has('keydown'),false);
});

test('Pages without the tool keep their DOM untouched when enhancement is unavailable',() => {
  const calls=[],document={querySelector:()=>{calls.push('query');return null;},getElementById:()=>assert.fail('Do not inspect or change unrelated page content'),createElement:()=>assert.fail('Do not create unrelated page content')};
  const mounted=numbers.mount({window:{},document});
  mounted.destroy();mounted.destroy();assert.deepEqual(calls,['query']);
  assert.doesNotThrow(()=>numbers.mount().destroy());
  assert.doesNotThrow(()=>numbers.mount({window:{},document:{querySelector:()=>({}),getElementById:()=>null}}).destroy());
});


test('Practice gives a reproducible shuffled round without adjacent or in-round repeats',()=>{
  const first=numbers.createPractice({random:()=>0.371}),second=numbers.createPractice({random:()=>0.371});
  const seen=new Set();let previous=null;
  for(let index=0;index<48;index++){
    const a=first.current(),b=second.current();assert.deepEqual(a,b);assert.notEqual(a.digits,previous);
    if(index<16){assert(!seen.has(a.digits));seen.add(a.digits);}
    previous=a.digits;first.next();second.next();
  }
  assert.equal(seen.size,16);
});
test('Both practice directions have exact expected answers and reject source-language or bare answers',()=>{
  const practice=numbers.createPractice({random:()=>0});
  for(const mode of ['zh-en','en-zh']){
    practice.setMode(mode);
    for(let index=0;index<32;index++){
      const q=practice.current();assert.equal(numbers.parse(q.number),numbers.parse(q.expected));
      assert.equal(practice.check(q.expected).correct,true);
      assert.equal(practice.check(q.number).kind,'format');
      assert.equal(practice.check(q.digits).kind,'format');
      assert.equal(practice.check('1e6').correct,false);
      practice.next();
    }
  }
});
test('Practice accepts equivalent target units, case/fullwidth forms and validates BigInt precision',()=>{
  const practice=numbers.createPractice({random:()=>0.371});let found=false;
  for(let index=0;index<16;index++){
    const q=practice.current();
    assert.equal(practice.check(q.expected.toUpperCase()).correct,true);
    assert.equal(practice.check(q.expected.replace(/[0-9.]/g,char=>String.fromCharCode(char.charCodeAt(0)+0xfee0))).correct,true);
    assert.equal(practice.check(q.digits.slice(0,-1)+(q.digits.endsWith('9')?'8':'9')+' thousand').correct,false);
    if(q.digits==='9999999999999999'){
      found=true;assert.equal(practice.check('9999999999999.999 thousand').correct,true);
      assert.equal(practice.check('9999999999999.9989 thousand').correct,false);
    }
    if(q.digits==='1400000000')assert.equal(practice.check('1400 million').correct,true);
    practice.next();
  }
  assert(found);
  practice.setMode('en-zh');
  for(let index=0;index<16;index++){
    const q=practice.current();assert.equal(practice.check(q.digits+'万').correct,false);
    if(q.digits==='1400000000'){assert.equal(practice.check('14亿').correct,true);assert.equal(practice.check('140000万').correct,true);}
    practice.next();
  }
});
test('Practice returns safe useful errors, never rounds answers, and isolates returned snapshots',()=>{
  const practice=numbers.createPractice({random:()=>0});const q=practice.current();
  for(const bad of ['',null,'<img src=x onerror=alert(1)>','1.23456 million','10000 trillion','1兆','十四亿'])assert.equal(practice.check(bad).correct,false);
  assert.equal(practice.check('1.23456 million').kind,'invalid');
  assert.throws(()=>practice.setMode('bad'),numbers.NumberInputError);
  q.expected='Changed copy';assert.notEqual(practice.current().expected,q.expected);
  assert.equal(numbers.convert('1400000000').digits,'1400000000');
  for(const random of [()=>NaN,()=>Infinity,()=>-10,()=>5]){
    const p=numbers.createPractice({random});let previous=p.current().digits;
    for(let index=0;index<40;index++){const next=p.next();assert.notEqual(next.digits,previous);previous=next.digits;}
  }
});

function practiceFixture(){
  const f=fixture(),question=new Element('p'),answer=new Element('input'),feedback=new Element('p'),check=new Element('button'),next=new Element('button');
  const modes=['zh-en','en-zh'].map(mode=>{const button=new Element('button');button.setAttribute('data-number-practice-mode',mode);return button;});
  const mapping={'[data-number-practice-question]':question,'[data-number-practice-answer]':answer,'[data-number-practice-feedback]':feedback,'[data-number-practice-check]':check,'[data-number-practice-next]':next};
  const root=new Element('section');root.hidden=true;root.querySelector=selector=>mapping[selector]||null;root.querySelectorAll=selector=>selector==='[data-number-practice-mode]'?modes:[];
  const oldQuery=f.document.querySelector;f.document.querySelector=selector=>selector==='[data-number-practice]'?root:oldQuery(selector);
  Object.defineProperty(f.window,'localStorage',{get(){assert.fail('Practice must not use persistent storage');}});
  Object.defineProperty(f.window,'sessionStorage',{get(){assert.fail('Practice must not use session storage');}});
  return Object.assign(f,{root,question,answer,feedback,check,next,modes});
}
test('Practice UI checks on demand, clears stale feedback and changes both direction and question',()=>{
  const f=practiceFixture(),mounted=numbers.mount({...f,random:()=>0.371});
  assert.equal(f.root.hidden,false);assert.equal(f.modes[0].getAttribute('aria-pressed'),'true');
  f.answer.value=mounted.practice.current().expected;f.check.listeners.get('click')();
  assert.equal(f.feedback.getAttribute('data-result'),'correct');assert.equal(f.feedback.hidden,false);
  f.answer.listeners.get('input')();assert.equal(f.feedback.textContent,'');assert.equal(f.feedback.hidden,true);
  f.answer.value=mounted.practice.current().digits;f.check.listeners.get('click')();assert.equal(f.feedback.getAttribute('data-result'),'format');assert.equal(f.answer.getAttribute('aria-invalid'),'true');
  const before=mounted.practice.current().digits;f.modes[1].listeners.get('click')();assert.notEqual(mounted.practice.current().digits,before);assert.equal(f.modes[1].getAttribute('aria-pressed'),'true');assert.equal(f.answer.value,'');assert.equal(f.answer.getAttribute('aria-invalid'),null);
  f.answer.value=mounted.practice.current().expected;f.answer.listeners.get('keydown')({key:'Enter'});assert.equal(f.feedback.getAttribute('data-result'),'correct');
  const nextBefore=mounted.practice.current().digits;f.next.listeners.get('click')();assert.notEqual(mounted.practice.current().digits,nextBefore);assert.equal(f.answer.focused,true);assert.equal(f.feedback.textContent,'');
  mounted.destroy();
});
test('Practice Enter respects IME and all practice listeners are removed on PageScope cleanup',()=>{
  const f=practiceFixture(),mounted=numbers.mount({...f,random:()=>0});f.answer.value=mounted.practice.current().expected;
  for(const event of [{key:'Enter',isComposing:true},{key:'Enter',keyCode:229},{key:'Tab'}]){f.answer.listeners.get('keydown')(event);assert.equal(f.feedback.textContent,'');}
  f.answer.listeners.get('compositionstart')();f.answer.listeners.get('keydown')({key:'Enter'});assert.equal(f.feedback.textContent,'');
  f.answer.listeners.get('compositionend')();f.answer.listeners.get('keydown')({key:'Enter'});assert.equal(f.feedback.getAttribute('data-result'),'correct');
  f.owned();mounted.destroy();for(const element of [f.answer,f.check,f.next,...f.modes])assert.equal(element.listeners.size,0);
});
