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
  chineseShort:'14亿',chineseWords:'十四亿',englishShort:'1.4 billion',englishWords:'one billion four hundred million'
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
  assert.equal(result.chineseShort,'99999999.999999999999亿');
  assert.equal(result.chineseWords,null);
});
test('Chinese short form keeps significant digits after the unit division',() => assert.equal(numbers.convert('100000001.0001').chineseShort,'1.000000010001亿'));
test('Values below 万 have no artificial Chinese unit',() => assert.equal(numbers.convert('1000.25').chineseShort,'1000.25'));
test('Non-integers do not receive invented integer readings',() => {
  const result = numbers.convert('1.0001');
  assert.equal(result.chineseWords,null); assert.equal(result.englishWords,null);
});
test('The English full-spelling upper bound is explicit',() => {
  assert.equal(numbers.convert('1000000000000000').englishWords,null);
  assert.equal(numbers.convert('999999999999999').englishWords,'nine hundred ninety-nine trillion nine hundred ninety-nine billion nine hundred ninety-nine million nine hundred ninety-nine thousand nine hundred ninety-nine');
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
  constructor(tag = 'div') { this.tagName = tag; this.textContent = ''; this.children = []; this.attributes = {}; this.listeners = new Map(); this.hidden = false; this.value = ''; }
  addEventListener(type,handler) { this.listeners.set(type,handler); }
  removeEventListener(type,handler) { if (this.listeners.get(type) === handler) this.listeners.delete(type); }
  setAttribute(key,value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; this.textContent = ''; }
  focus() { this.focused = true; }
}
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
  assert.equal(f.results.children[0].children[1].textContent,'1,400,000,000');
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
  f.input.value = '5'; mounted.refresh(); assert.equal(f.results.children[0].children[1].textContent,'1,400,000,000');
});
