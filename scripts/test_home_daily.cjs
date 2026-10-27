// Run with Node's built-in runner: node --test scripts/test_home_daily.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const A = require('../home/assets/astronomy-solar.js');
const Lunar = require('../home/assets/vendor/lunar-javascript-1.7.7.js');
const source = fs.readFileSync(path.join(__dirname,'../home/assets/home-daily.js'),'utf8');
const storageKey = 'xieyuqing-brief-closed', settle = () => new Promise(resolve => setImmediate(resolve));
class Element {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.events = {}; this.attributes = {}; this.hidden = false; this._text = ''; this.classes = new Set(); this.classList = {toggle:(key,on) => on ? this.classes.add(key) : this.classes.delete(key)}; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...nodes) { for (const node of nodes) { if (node.fragment) this.children.push(...node.children); else this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  setAttribute(name,value) { this.attributes[name] = String(value); }
  addEventListener(type,handler) { this.events[type] = handler; }
  removeEventListener(type,handler) { if (this.events[type] === handler) delete this.events[type]; }
  querySelector(tag) { return this.children.find(child => child.tagName === tag.toUpperCase()) || null; }
  remove() { this.removed = true; }
}
function harness({now = '2026-10-26T16:30:00Z',saved = null,mobile = false,denied = false,language = 'zh-CN',edition = '2026-10-27',articles = null,content = null,knowledge = [],memes = [],rules = [],holidays = {},weatherData} = {}) {
  let epoch = new Date(now).getTime(), subscription, nextTimer = 0;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [epoch])); } static now() { return epoch; } }
  const ids = ['daily-brief-data','daily-content-data','daily-knowledge-data','daily-memes-data','daily-rules-data','daily-holidays-data','home-random-data','daily-feed','daily-news-title','daily-brief-notice','daily-edition','home-date','brief-body','brief-toggle','brief-lunar','brief-term','brief-weather','brief-headline','daily-calendar-lunar','daily-calendar-term','daily-calendar-cycle','daily-calendar-festivals','daily-calendar-holiday','daily-calendar-day','daily-calendar-weekday','daily-calendar-month','daily-weather','daily-weather-hint','daily-city','home-random-button','daily-street-title','daily-street-text','daily-street-links','daily-meme-card','daily-meme-added','daily-meme-origin','daily-meme-example','daily-meme-why','daily-concept-title','daily-concept-text','daily-concept-source','daily-quote','daily-quote-source','brief-bottom','daily-earth','daily-almanac','daily-almanac-yi','daily-almanac-ji','daily-almanac-clash','daily-almanac-more'];
  const nodes = Object.fromEntries(ids.map(id => [id,new Element()]));
  for (const id of ['brief-toggle','home-random-button','daily-almanac']) nodes[id].hidden = true;
  const items = Array.from({length:9},(_,index) => ({title:{'zh-CN':'标题 ' + index,en:'Title ' + index},summary:{'zh-CN':'摘要',en:'Summary'},source:{'zh-CN':'来源',en:'Source'},published:'2026-10-26T09:00+08:00',category:['culture','science','economy','world','domestic'][index % 5],priority:index === 3 ? 'major' : 'normal',major_reason:index === 3 ? {'zh-CN':'重大事件',en:'Major event'} : undefined,url:'https://example.test/' + index}));
  for (const [id,value] of Object.entries({'daily-brief-data':{version:2,edition_date:edition,updated_at:edition + 'T09:50+08:00',items},'daily-content-data':content,'daily-knowledge-data':{items:knowledge},'daily-memes-data':{items:memes},'daily-rules-data':{weather:rules},'daily-holidays-data':{years:holidays},'home-random-data':articles})) nodes[id].textContent = JSON.stringify(value);
  const root = new Element(), body = new Element('body'), document = new Element('document');
  root.dataset = {lunarSrc:'/assets/vendor/lunar-javascript-1.7.7.js',d3Src:'/assets/vendor/d3-7.9.0.min.js',earthSrc:'/assets/home-earth.js'};
  Object.assign(document,{documentElement:{lang:language,dataset:{brief:'closed'}},body,querySelector:() => root,getElementById:id => nodes[id] || null,createElement:tag => new Element(tag),createTextNode:value => ({textContent:value}),createDocumentFragment:() => Object.assign(new Element(),{fragment:true})});
  const stored = new Map(), intervals = new Map(), timers = new Map(), owned = [], observers = [], visited = [], assigned = [], requests = [], earthCalls = [];
  if (saved !== null) stored.set(storageKey,saved);
  const window = {
    HomeAstronomy:A,URLSearchParams,AbortController,
    localStorage:{getItem:key => { if (denied) throw new Error('denied'); return stored.get(key) ?? null; },setItem:(key,value) => { if (denied) throw new Error('denied'); stored.set(key,value); },removeItem:key => { if (denied) throw new Error('denied'); stored.delete(key); }},
    matchMedia:() => ({matches:mobile}),
    setInterval:fn => { const id = ++nextTimer; intervals.set(id,fn); return id; },clearInterval:key => intervals.delete(key),
    setTimeout:fn => { const id = ++nextTimer; timers.set(id,fn); return id; },clearTimeout:key => timers.delete(key),
    SiteNavigation:{own:fn => owned.push(fn),visit:url => visited.push(url)},
    SiteI18n:{lang:() => document.documentElement.lang,onChange(fn) { subscription = fn; return () => { subscription = null; }; }},
    location:{assign:url => assigned.push(url)},
    IntersectionObserver:class { constructor(fn) { this.fn = fn; this.disconnected = false; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    fetch(url,options) { requests.push({url,signal:options.signal}); const result = weatherData || {current:{temperature_2m:12.1,weather_code:3,time:'2026-10-27T00:30'},daily:{time:['2026-10-27'],temperature_2m_max:[34],temperature_2m_min:[-1],precipitation_probability_max:[65]}}; return Promise.resolve({ok:true,json:async () => result}); }
  };
  vm.runInNewContext(source,{document,window,Intl,Date:Clock,Math},{timeout:1000});
  return {nodes,root,document,window,stored,intervals,timers,observers,visited,assigned,body,requests,earthCalls,clickToggle() { nodes['brief-toggle'].events.click(); },tick(instant) { epoch = new Date(instant).getTime(); [...intervals.values()].forEach(fn => fn()); },changeLanguage(value) { document.documentElement.lang = value; subscription?.(); },intersect(value) { observers[0].fn([{isIntersecting:value}]); },loadScript(kind) { const script = body.children.find(node => node.src.includes(kind) && !node.loaded); assert.ok(script,'pending ' + kind); script.loaded = true; if (kind === 'lunar') Object.assign(window,Lunar); if (kind === 'home-earth') window.HomeEarth = {createEarth(...args) { earthCalls.push(args); return {setPaused(value) { earthCalls.push({paused:value}); },destroy() { earthCalls.push('destroy'); }}; }}; script.onload(); },dispose() { owned.forEach(fn => fn()); }};
}
test('desktop opens without a record, remembers today in Beijing, and restores on a new page scope',() => {
  const h = harness();
  assert.equal(h.nodes['brief-body'].hidden,false); assert.equal(h.nodes['brief-toggle'].attributes['aria-expanded'],'true'); assert.equal(h.nodes['brief-toggle'].attributes['aria-controls'],'brief-body');
  h.clickToggle(); assert.equal(h.stored.get(storageKey),'2026-10-27'); assert.equal(h.nodes['brief-body'].hidden,true); assert.equal(h.nodes['brief-toggle'].textContent,'展开今日简报');
  assert.equal(harness({saved:h.stored.get(storageKey)}).nodes['brief-body'].hidden,true);
  h.clickToggle(); assert.equal(h.stored.has(storageKey),false);
});
test('phones default closed only without a record; yesterday opens and day rollover reopens',() => {
  assert.equal(harness({mobile:true}).nodes['brief-body'].hidden,true); assert.equal(harness({mobile:true,saved:'2026-10-26'}).nodes['brief-body'].hidden,false);
  const h = harness({mobile:true,saved:'2026-10-27'}); h.tick('2026-10-27T16:00:00Z'); assert.equal(h.nodes['brief-body'].hidden,false); assert.match(h.nodes['home-date'].textContent,/28/);
});
test('denied storage does not prevent toggling or localization',() => {
  const h = harness({denied:true,mobile:true}); assert.equal(h.nodes['brief-body'].hidden,true); assert.doesNotThrow(() => h.clickToggle()); h.changeLanguage('en'); assert.equal(h.nodes['brief-toggle'].textContent,'Hide'); h.clickToggle(); assert.equal(h.nodes['brief-toggle'].textContent,'Show today’s brief');
});
test('news is limited to eight, major items lead, every item has a category and summary, and there are no filters',() => {
  const h = harness(), feed = h.nodes['daily-feed']; assert.equal(feed.children.length,8);
  assert.equal(h.nodes['brief-headline'].textContent,'标题 3');
  const first = feed.children[0]; assert.equal(first.children[0].children[0].textContent,'国际'); assert.equal(first.children[0].children[1].textContent,'要闻'); assert.equal(first.children[2].textContent,'摘要');
  assert.equal(feed.children[1].children[0].children[0].textContent,'时政'); assert.equal(h.nodes['daily-edition'].textContent,'新闻更新于 10月27日 09:50');
  assert.doesNotMatch(source,/data-news-filter|daily-filters/);
});
test('yesterday is labelled, a three-day-old edition remains visible, and a four-day-old one becomes one line',() => {
  assert.equal(harness({edition:'2026-10-26'}).nodes['daily-news-title'].textContent,'昨日要闻');
  const h = harness({edition:'2026-10-24'}); assert.equal(h.root.classes.has('brief-news-stale'),false); h.tick('2026-10-27T16:00:00Z'); assert.equal(h.root.classes.has('brief-news-stale'),true); assert.equal(h.nodes['daily-feed'].children.length,1); assert.equal(h.nodes['daily-feed'].textContent,'新闻暂停更新，先看看地球'); assert.equal(h.nodes['daily-brief-notice'].hidden,true); h.changeLanguage('en'); assert.match(h.nodes['daily-feed'].textContent,/^News updates paused/); assert.equal(h.nodes['daily-edition'].textContent,'News updated 24 October 09:50');
});
test('one extended weather request supplies summary and rule-based rain, heat and cold hints',async () => {
  const rules = [{field:'precipitation_probability_max',operator:'gte',threshold:60,text:{'zh-CN':'可能下雨，记得带伞'}},{field:'temperature_2m_max',operator:'gte',threshold:33,text:{'zh-CN':'很热，注意防暑'}},{field:'temperature_2m_min',operator:'lte',threshold:0,text:{'zh-CN':'很冷，注意保暖'}}];
  const h = harness({rules}); await settle(); assert.equal(h.requests.length,1); assert.ok(h.requests[0].url.includes('daily=temperature_2m_max%2Ctemperature_2m_min%2Cprecipitation_probability_max')); assert.equal(h.nodes['brief-weather'].textContent,'北京 · 12°C 多云'); assert.equal(h.nodes['daily-weather-hint'].textContent,'可能下雨，记得带伞 · 很热，注意防暑 · 很冷，注意保暖'); assert.equal(h.nodes['daily-weather-hint'].hidden,false); assert.match(h.nodes['brief-lunar'].textContent,/九月十八/); assert.equal(h.nodes['brief-term'].textContent,'霜降'); h.dispose(); assert.equal(h.intervals.size,0); assert.equal(h.observers[0].disconnected,true); assert.equal(Object.keys(h.nodes['brief-toggle'].events).length,0);
  const noHint = harness({rules,weatherData:{current:{temperature_2m:20,weather_code:0,time:'2026-10-27T00:30'},daily:{time:['2026-10-27'],temperature_2m_max:[25],temperature_2m_min:[10],precipitation_probability_max:[20]}}}); await settle(); assert.equal(noHint.nodes['daily-weather-hint'].hidden,true);
});
test('lunar loads after expansion; D3 and Earth wait for visibility, then pause on collapse and clean up',async () => {
  const h = harness({mobile:true}); await settle(); assert.equal(h.body.children.length,0); h.intersect(true); assert.equal(h.body.children.length,0); h.intersect(false); h.clickToggle(); assert.equal(h.body.children.length,1); assert.match(h.body.children[0].src,/lunar/); h.loadScript('lunar'); await settle(); assert.match(h.nodes['daily-calendar-cycle'].textContent,/丙午.*马/); assert.match(h.nodes['daily-calendar-term'].textContent,/霜降第5天.*立冬还有11天/); assert.equal(h.nodes['daily-almanac'].hidden,false); assert.equal(h.nodes['daily-almanac-yi'].textContent.split(' · ').length,4); assert.match(h.nodes['daily-almanac-more'].textContent,/教牛马/);
  h.intersect(true); h.loadScript('d3'); await settle(); h.loadScript('home-earth'); await settle(); assert.equal(h.earthCalls.length,1); assert.equal(h.earthCalls[0][2].globeOnly,true); assert.equal(h.requests.length,1); h.clickToggle(); assert.equal(h.earthCalls.at(-1).paused,true); h.dispose(); assert.equal(h.earthCalls.at(-1),'destroy'); assert.ok(h.body.children.every(script => script.removed));
});
test('calendar uses supplied holiday data and lunar-javascript festivals, including English library values',async () => {
  const h = harness({now:'2026-10-01T04:00:00Z',holidays:{2026:{days:[{date:'2026-10-01',name:'国庆节',isOffDay:true}]}}}); h.loadScript('lunar'); await settle(); assert.match(h.nodes['daily-calendar-holiday'].textContent,/假期.*国庆节/); assert.match(h.nodes['daily-calendar-festivals'].textContent,/国庆节/); h.changeLanguage('en'); assert.match(h.nodes['daily-calendar-cycle'].textContent,/Horse/); assert.match(h.nodes['daily-calendar-festivals'].textContent,/National Day/); assert.match(h.nodes['daily-almanac-yi'].textContent,/[a-z]/i);
});
test('knowledge prioritizes solar-term and date triggers; latest meme preserves optional lines and related English links',() => {
  const knowledge = [{id:'rotation',title:{'zh-CN':'轮换'},text:{'zh-CN':'文字'},source:'Source',url:'https://example.test/'},{id:'frost',trigger:{solar_term:'霜降'},title:{'zh-CN':'霜降'},text:{'zh-CN':'霜降知识'},source:'Source',url:'https://example.test/'},{id:'date',trigger:{date:'10-28'},title:{'zh-CN':'指定日期'},text:{'zh-CN':'文字'},source:'Source',url:'https://example.test/'}];
  const meme = {term:{'zh-CN':'街谈',en:'Street'},meaning:{'zh-CN':'文字',en:'Text'},source:'Source',url:'https://example.test/source',related_url:'/articles/chinese/example.html',related_label:{'zh-CN':'相关文章',en:'Related article'},added:'2026-10-26'};
  const h = harness({knowledge,memes:[{...meme,added:'2026-10-25',term:'旧梗'},meme]}); assert.equal(h.nodes['daily-concept-title'].textContent,'霜降'); assert.equal(h.nodes['daily-meme-card'].hidden,false); assert.equal(h.nodes['daily-street-title'].textContent,'街谈'); assert.equal(h.nodes['daily-meme-origin'].hidden,true); assert.equal(h.nodes['daily-street-links'].children[1].href,'/articles/chinese/example.html'); h.changeLanguage('en'); assert.equal(h.nodes['daily-street-links'].children[1].href,'/en/articles/example.html'); h.tick('2026-10-28T04:00:00Z'); assert.equal(h.nodes['daily-concept-title'].textContent,'指定日期'); assert.equal(harness({memes:[]}).nodes['daily-meme-card'].hidden,true);
});
test('random reading exposes valid destinations supplied for the current language',() => {
  const zh = harness({articles:['/articles/a.html','/en/articles/b.html','javascript:alert(1)','/articles//unsafe']}); assert.equal(zh.nodes['home-random-button'].hidden,false); zh.nodes['home-random-button'].events.click(); assert.deepEqual(zh.visited,['/articles/a.html']);
  const en = harness({language:'en',articles:['/en/articles/b.html']}); delete en.window.SiteNavigation.visit; en.nodes['home-random-button'].events.click(); assert.deepEqual(en.assigned,['/en/articles/b.html']); const original = harness({language:'en',articles:['/articles/english-original.html']}); original.nodes['home-random-button'].events.click(); assert.deepEqual(original.visited,['/articles/english-original.html']); assert.equal(harness({articles:['https://example.test/']}).nodes['home-random-button'].hidden,true);
});
test('own-quote script has no weather endpoint or now-card initialization and still refreshes daily',() => {
  const quoteSource = fs.readFileSync(path.join(__dirname,'../home/assets/home-now.js'),'utf8'); assert.doesNotMatch(quoteSource,/fetch|open-meteo|now-card|renderClock/);
  const nodes = {'own-quote':new Element(),'own-quote-text':new Element(),'own-quote-source':new Element(),'own-quotes-data':new Element()}; nodes['own-quotes-data'].textContent = JSON.stringify([{text:{'zh-CN':'旧文一句'},url:{'zh-CN':'/articles/old.html'},title:{'zh-CN':'旧文'},date:'2024-01-01'}]); const document = {documentElement:{lang:'zh-CN'},getElementById:id => nodes[id],createElement:tag => new Element(tag),createTextNode:value => ({textContent:value})}; let timer, owned; const window = {setInterval:fn => { timer = fn; return 1; },clearInterval:() => { timer = null; },SiteNavigation:{own:fn => { owned = fn; }}}; vm.runInNewContext(quoteSource,{window,document,Intl,Date},{timeout:1000}); assert.equal(nodes['own-quote-text'].textContent,'旧文一句'); assert.equal(nodes['own-quote-source'].children[2].href,'/articles/old.html'); assert.equal(typeof timer,'function'); owned(); assert.equal(timer,null);
});
