'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const T = require('../home/assets/home-today.js');
const C = require('../home/assets/astronomy-cycles.js');
const L = require('../home/assets/vendor/lunar-javascript-1.7.7.js');
const ids = ['today-position-sentence','today-year-label','today-year-left','today-year-track','today-year-fill','moon-phase-name','moon-phase-subtitle','moon-readings','year-term-summary','year-readings','today-astronomy-time','moon-cycle-note','moon-phase-caption','year-distance-note'];
class Element {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = {}; this.attributes = {}; this._text = ''; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...nodes) { for (const node of nodes) { if (node.fragment) this.append(...node.children); else { this.children.push(node); node.parent = this; } } }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  setAttribute(key,value) { this.attributes[key] = String(value); }
  querySelectorAll(selector) { return selector === '[data-today-year-tick]' ? this.children.filter(child => child.dataset.todayYearTick !== undefined) : []; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
}
function harness({withVisual = true,scoped = true,language = 'zh-CN',api = T} = {}) {
  const nodes = Object.fromEntries(ids.map(id => [id,new Element(id.includes('readings') ? 'dl' : 'div')]));
  nodes['today-year-track'].append(nodes['today-year-fill']);
  const root = {querySelector:selector => nodes[selector.slice(1)] || null};
  const doc = {documentElement:{lang:language},querySelector:() => root,
    createElement:tag => new Element(tag),createDocumentFragment:() => Object.assign(new Element(),{fragment:true})};
  let subscription, created = 0, destroyed = 0, refreshed = 0;
  const calls = [], owns = [], cleanups = [], settings = {};
  const win = {SiteI18n:{lang:() => doc.documentElement.lang,onChange(fn) { subscription = fn; return () => { subscription = null; }; }},SiteNavigation:{own:fn => owns.push(fn)}};
  if (withVisual) win.HomeTodayVisuals = {create(document,window,options) { created++; Object.assign(settings,options); assert.equal(document,doc); assert.equal(window,win); options.scope.own(() => destroyed++); return {setState:(snapshot,city) => calls.push([snapshot,city]),refresh:() => refreshed++}; }};
  const controller = api.create(doc,win,{root,...(scoped ? {scope:{own:fn => cleanups.push(fn)}} : {})});
  return {nodes,controller,calls,owns,cleanups,settings,created:() => created,destroyed:() => destroyed,refreshed:() => refreshed,
    changeLanguage(value) { doc.documentElement.lang = value; subscription?.(); },subscribed:() => !!subscription};
}
function snapshot(at = '2026-10-30T07:10:00Z') { return C.snapshot(at,L); }

test('one supplied instant drives sentence, lunar readouts, year progress and the visual snapshot',() => {
  const h = harness(), s = snapshot(), city = {lat:39.9};
  assert.equal(h.controller.setState(s,city),true);
  assert.equal(h.nodes['today-position-sentence'].textContent,'太阳直射南纬13.8°，正在南移，53天后直射南回归线。月亮是亏凸月，3天后下弦月。');
  assert.equal(h.nodes['today-astronomy-time'].textContent,'2026-10-30 15:10 北京时间');
  assert.equal(h.nodes['today-year-label'].textContent,'2026年 · 第303天');
  assert.equal(h.nodes['today-year-left'].textContent,'已过83% · 还剩62天');
  assert.equal(h.nodes['today-year-track'].attributes.role,'progressbar');
  assert.equal(h.nodes['today-year-track'].attributes['aria-valuenow'],'83');
  assert.equal(h.nodes['today-year-fill'].style.width,'82.913%');
  assert.equal(h.nodes['today-year-track'].children.length,5);
  assert.equal(h.nodes['moon-phase-name'].textContent,'亏凸月');
  assert.equal(h.nodes['moon-phase-subtitle'].textContent,'约78%被照亮 · 农历九月廿一');
  assert.match(h.nodes['moon-readings'].textContent,/下次新月10天后 · 11月9日 15:09 · 农历十月初一/);
  assert.match(h.nodes['moon-readings'].textContent,/约36.5万公里 · 比平均近5%/);
  assert.match(h.nodes['moon-readings'].textContent,/平均约38.4万公里/);
  assert.match(h.nodes['year-readings'].textContent,/2027年3月21日 04:24/);
  assert.equal(h.calls.length,1); assert.equal(h.calls[0][0],s); assert.equal(h.calls[0][1],city);
  h.controller.refresh(); assert.equal(h.nodes['today-year-track'].children.length,5); assert.equal(h.refreshed(),1);
});

test('main lunar phase day wording holds before and after the actual event, with adjacent-day countdown',() => {
  const h = harness();
  for (const at of ['2026-11-02T00:01:00+08:00','2026-11-02T23:59:00+08:00']) {
    h.controller.setState(snapshot(at),{lat:20});
    assert.equal(h.nodes['moon-phase-name'].textContent,'下弦月');
    assert.match(h.nodes['today-position-sentence'].textContent,/今天下弦月。$/);
  }
  h.controller.setState(snapshot('2026-11-01T12:00:00+08:00'),{lat:20});
  assert.match(h.nodes['today-position-sentence'].textContent,/明天下弦月。$/);
  h.controller.setState(snapshot('2026-11-03T00:00:00+08:00'),{lat:20});
  assert.equal(h.nodes['moon-phase-name'].textContent,'残月');
});

test('all four seasonal key days use the whole-day wording and keep event timestamps',() => {
  const h = harness();
  for (const [at,name,target] of [
    ['2026-03-20T00:30:00+08:00','春分','赤道'],['2026-06-21T00:30:00+08:00','夏至','北回归线'],
    ['2026-09-23T23:30:00+08:00','秋分','赤道'],['2026-12-22T23:30:00+08:00','冬至','南回归线']
  ]) {
    h.controller.setState(snapshot(at),{lat:20});
    assert.ok(h.nodes['today-position-sentence'].textContent.startsWith(`今天${name}，太阳直射${target}。`));
    assert.match(h.nodes['year-readings'].textContent,new RegExp(`今天${name} · 直射${target}`));
  }
});

test('same snapshot re-renders in English and southern city caption without changing the instant',() => {
  const h = harness(), s = snapshot(); h.controller.setState(s,{lat:-33}); h.changeLanguage('en');
  assert.equal(h.nodes['moon-phase-name'].textContent,'Waning gibbous');
  assert.match(h.nodes['moon-phase-subtitle'].textContent,/About 78% illuminated · Lunar month 9, day 21/);
  assert.match(h.nodes['moon-readings'].textContent,/lunar month 10, day 1/);
  assert.match(h.nodes['moon-readings'].textContent,/mean: 384,400 km/);
  assert.match(h.nodes['year-readings'].textContent,/21 Mar 2027 04:24/);
  assert.match(h.nodes['moon-phase-caption'].textContent,/Southern Hemisphere/);
  assert.match(h.nodes['today-position-sentence'].textContent,/Tropic of Capricorn in 53 days/);
  assert.equal(h.controller.getState().instantMs,s.instantMs); assert.equal(h.calls.length,1);
  h.changeLanguage('zh-CN'); assert.equal(h.nodes['moon-phase-name'].textContent,'亏凸月');
});

test('a newly started season shows less than one percent without rounding up',() => {
  const h = harness(), s = snapshot(); s.calendar.seasonFraction = .009;
  h.controller.setState(s,{lat:1}); assert.match(h.nodes['year-readings'].textContent,/不到1%/);
  h.changeLanguage('en'); assert.match(h.nodes['year-readings'].textContent,/less than 1%/);
  s.calendar.seasonFraction = 0; h.controller.setState(s,{lat:1}); assert.doesNotMatch(h.nodes['year-readings'].textContent,/less than 1%/);
});

test('today/tomorrow/cross-year date formatting never uses an elapsed-hours countdown',() => {
  assert.equal(T.dayPhrase(0,false),'今天'); assert.equal(T.dayPhrase(1,false),'明天'); assert.equal(T.dayPhrase(2,true),'in 2 days');
  for (const at of ['2027-01-01T00:30:00+08:00','2027-01-01T23:30:00+08:00']) {
    assert.match(T.dateText(Date.parse(at),Date.parse('2026-12-31T23:59:00+08:00'),false),/^2027年1月1日/);
    assert.match(T.dateText(Date.parse(at),Date.parse('2026-12-31T23:59:00+08:00'),true),/^1 Jan 2027/);
  }
  const h = harness(); h.controller.setState(snapshot(),{lat:1},{demo:true});
  assert.match(h.nodes['today-astronomy-time'].textContent,/^演示 · /);
  h.controller.setState(snapshot(),{lat:1}); assert.doesNotMatch(h.nodes['today-astronomy-time'].textContent,/演示/);
});

test('scope owns one cleanup, language and visual callbacks are removed, and destroy is idempotent',() => {
  const h = harness(); h.controller.setState(snapshot(),{lat:1});
  assert.equal(h.cleanups.length,1); assert.equal(h.owns.length,0); assert.equal(h.created(),1); assert(h.subscribed());
  const before = h.nodes['today-position-sentence'].textContent;
  h.cleanups[0](); h.controller.destroy(); h.controller.refresh(); h.changeLanguage('en');
  assert.equal(h.destroyed(),1); assert(!h.subscribed()); assert.equal(h.nodes['today-position-sentence'].textContent,before);
  assert.equal(h.controller.setState(snapshot(),{lat:1}),false); assert.equal(h.controller.getState().disposed,true);
  const fallback = harness({scoped:false,withVisual:false}); assert.equal(fallback.owns.length,1);
  fallback.controller.setState(snapshot(),{lat:1}); assert.match(fallback.nodes['moon-readings'].textContent,/下次新月/); fallback.owns[0]();
});

test('browser UMD rendering cannot create its own clock, timer, request or storage',() => {
  const source = fs.readFileSync(path.join(__dirname,'../home/assets/home-today.js'),'utf8');
  assert.doesNotMatch(source,/Date\.now|new Date\(\)|setInterval|setTimeout|fetch\(|localStorage|sessionStorage|\.position\(|\.moonPhase\(|getLunar\(/);
  class SuppliedDate extends Date { constructor(...args) { assert(args.length > 0,'an instant must be supplied'); super(...args); } static now() { throw new Error('own clock'); } }
  const context = vm.createContext({Date:SuppliedDate,Intl}); vm.runInContext(source,context);
  const h = harness({api:context.HomeToday}); h.controller.setState(snapshot(),{lat:1}); assert.match(h.nodes['today-astronomy-time'].textContent,/15:10/);
});
