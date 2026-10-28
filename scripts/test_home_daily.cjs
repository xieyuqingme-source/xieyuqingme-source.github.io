// Run with Node's built-in runner: node --test scripts/test_home_daily.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const A = require('../home/assets/astronomy-solar.js');
const Lunar = require('../home/assets/vendor/lunar-javascript-1.7.7.js');
const source = fs.readFileSync(path.join(__dirname,'../home/assets/home-daily.js'),'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
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
  contains(value) { return this.children.some(child => child === value || child.contains?.(value)); }
  closest(selector) { return selector === '[data-city-result]' && this.dataset.cityResult !== undefined ? this : null; }
  remove() { this.removed = true; }
}
function harness({mode = 'full',readyState = 'loading',idle = true,now = '2026-10-26T16:30:00Z',saved = null,mobile = false,denied = false,language = 'zh-CN',edition = '2026-10-27',articles = null,content = null,knowledge = [],memes = [],snapshot = null,history = null,newsSources = [],rules = [],holidays = {},weatherData,geocodingData,storedValues = {},deferForecast = false,deferGeocoding = false,withWeatherMap = false} = {}) {
  let epoch = new Date(now).getTime(), subscription, nextTimer = 0;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [epoch])); } static now() { return epoch; } }
  const ids = ['today-title','daily-city-name','weather-selection-status','news-snapshot-data','news-sources-data','daily-history-data','daily-history-list','history-date-note','news-source-links','timeline-date','daily-city-label','daily-weather-details','city-search-form','city-search-input','city-search-results','city-search-status','glance-date','daily-calendar-next-term','daily-brief-data','daily-content-data','daily-knowledge-data','daily-memes-data','daily-rules-data','daily-holidays-data','home-random-data','daily-feed','daily-news-title','daily-brief-notice','daily-edition','home-date','brief-body','brief-toggle','brief-lunar','brief-term','brief-weather','brief-headline','daily-calendar-lunar','daily-calendar-term','daily-calendar-cycle','daily-calendar-festivals','daily-calendar-holiday','daily-calendar-day','daily-calendar-weekday','daily-calendar-month','daily-weather','daily-weather-hint','daily-city','home-random-button','daily-street-title','daily-street-text','daily-street-links','daily-meme-card','daily-meme-added','daily-meme-origin','daily-meme-example','daily-meme-why','daily-concept-title','daily-concept-text','daily-concept-source','daily-quote','daily-quote-source','brief-bottom','daily-earth'];
  const nodes = Object.fromEntries(ids.map(id => [id,new Element()]));
  if (withWeatherMap) nodes['weather-map-canvas'] = new Element('canvas');
  for (const id of ['home-random-button','city-search-results']) nodes[id].hidden = true;
  const items = Array.from({length:12},(_,index) => ({title:{'zh-CN':'标题 ' + index,en:'Title ' + index},summary:{'zh-CN':'摘要',en:'Summary'},source:{'zh-CN':'来源',en:'Source'},published:'2026-10-26T09:00+08:00',category:['culture','science','economy','world','domestic'][index % 5],priority:index === 3 ? 'major' : 'normal',major_reason:index === 3 ? {'zh-CN':'重大事件',en:'Major event'} : undefined,url:'https://example.test/' + index}));
  for (const [id,value] of Object.entries({'news-snapshot-data':snapshot,'news-sources-data':{sources:newsSources},'daily-history-data':history,'daily-brief-data':{version:2,edition_date:edition,updated_at:edition + 'T09:50+08:00',items},'daily-content-data':content,'daily-knowledge-data':{items:knowledge},'daily-memes-data':{items:memes},'daily-rules-data':{weather:rules},'daily-holidays-data':{years:holidays},'home-random-data':articles})) nodes[id].textContent = JSON.stringify(value);
  const root = new Element(), body = new Element('body'), document = new Element('document');
  root.dataset = {briefMode:mode,lunarSrc:'/assets/vendor/lunar-javascript-1.7.7.js',d3Src:'/assets/vendor/d3-7.9.0.min.js',earthSrc:'/assets/home-earth.js'};
  const reads = [];
  Object.assign(document,{readyState,documentElement:{lang:language,dataset:{}},body,querySelector:() => root,getElementById:id => { reads.push(id); return nodes[id] || null; },createElement:tag => new Element(tag),createTextNode:value => ({textContent:value}),createDocumentFragment:() => Object.assign(new Element(),{fragment:true})});
  const stored = new Map(), intervals = new Map(), timers = new Map(), owned = [], observers = [], visited = [], assigned = [], requests = [], earthCalls = [], storageOps = [], idleCallbacks = new Map(), earthCityChanges = [];
  for (const [key,value] of Object.entries(storedValues)) stored.set(key,value);
  if (saved !== null) stored.set('xieyuqing-brief-closed',saved);
  const window = Object.assign(new Element('window'),{
    HomeAstronomy:A,URLSearchParams,AbortController,
    localStorage:{getItem:key => { storageOps.push(['get',key]); if (denied) throw new Error('denied'); return stored.get(key) ?? null; },setItem:(key,value) => { storageOps.push(['set',key]); if (denied) throw new Error('denied'); stored.set(key,value); },removeItem:key => { storageOps.push(['remove',key]); if (denied) throw new Error('denied'); stored.delete(key); }},
    matchMedia:() => ({matches:mobile}),
    setInterval:fn => { const id = ++nextTimer; intervals.set(id,fn); return id; },clearInterval:key => intervals.delete(key),
    setTimeout:(fn,ms) => { const id = ++nextTimer; timers.set(id,{fn,ms}); return id; },clearTimeout:key => timers.delete(key),
    SiteNavigation:{own:fn => owned.push(fn),visit:url => visited.push(url)},
    SiteI18n:{lang:() => document.documentElement.lang,onChange(fn) { subscription = fn; return () => { subscription = null; }; }},
    location:{assign:url => assigned.push(url)},
    IntersectionObserver:class { constructor(fn) { this.fn = fn; this.disconnected = false; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    fetch(url,options) {
      const entry = {url,signal:options.signal}; requests.push(entry);
      const geo = url.includes('geocoding-api');
      if ((geo && deferGeocoding) || (!geo && deferForecast)) return new Promise((resolve,reject) => { entry.resolve = data => resolve({ok:true,json:async () => data}); entry.reject = reject; });
      const result = geo ? geocodingData || {results:[]} : weatherData || {current:{temperature_2m:12.1,weather_code:3,time:'2026-10-27T00:30'},daily:{time:['2026-10-27'],temperature_2m_max:[34],temperature_2m_min:[-1],precipitation_probability_max:[65]}};
      return Promise.resolve({ok:true,json:async () => result});
    }
  });
  let mapOptions, mapDestroyed = false; const mapCities = [];
  window.HomeWeatherMap = {createWeatherMap(doc,win,options) { mapOptions = options; return {setCity(value) { mapCities.push(value); },refresh() {},destroy() { mapDestroyed = true; }}; }};
  if (idle) { window.requestIdleCallback = (fn,options) => { const id = ++nextTimer; idleCallbacks.set(id,{fn,options}); return id; }; window.cancelIdleCallback = id => idleCallbacks.delete(id); }
  vm.runInNewContext(source,{document,window,Intl,Date:Clock,Math},{timeout:1000});
  return {nodes,root,document,window,stored,mapCities,pickMap(point) { return mapOptions.onPick(point); },mapDestroyed:() => mapDestroyed,intervals,timers,observers,visited,assigned,body,requests,earthCalls,earthCityChanges,reads,storageOps,idleCallbacks,search(query) { nodes['city-search-input'].value = query; nodes['city-search-form'].events.submit({preventDefault() {}}); },chooseResult(index) { nodes['city-search-results'].events.click({target:nodes['city-search-results'].children[index].children[0]}); },selectPreset(value) { nodes['daily-city'].value = value; nodes['daily-city'].events.change(); },load() { document.readyState = 'complete'; window.events.load?.(); },runIdle() { const jobs = [...idleCallbacks.values()]; idleCallbacks.clear(); jobs.forEach(job => job.fn()); },runTimeouts() { const jobs = [...timers.values()]; timers.clear(); jobs.forEach(job => job.fn()); },tick(instant) { epoch = new Date(instant).getTime(); [...intervals.values()].forEach(fn => fn()); },changeLanguage(value) { document.documentElement.lang = value; subscription?.(); },intersect(value) { observers[0].fn([{isIntersecting:value}]); },loadScript(kind) { const script = body.children.find(node => node.src.includes(kind) && !node.loaded); assert.ok(script,'pending ' + kind); script.loaded = true; if (kind === 'lunar') Object.assign(window,Lunar); if (kind === 'home-earth') window.HomeEarth = {createEarth(...args) { earthCalls.push(args); return {setCity(value) { earthCityChanges.push(value); },setPaused(value) { earthCalls.push({paused:value}); },destroy() { earthCalls.push('destroy'); }}; }}; script.onload(); },failScript(kind) { const script = body.children.find(node => node.src.includes(kind) && !node.loaded); assert.ok(script); script.loaded = true; script.onerror(); },dispose() { owned.forEach(fn => fn()); }};
}
test('glance fills Beijing date and fallback term without reading embedded news, city or weather data',async () => {
  const h = harness({mode:'glance',saved:'2026-10-27'}); await settle();
  assert.equal(h.nodes['glance-date'].textContent,'10月27日 星期二'); assert.match(h.nodes['daily-calendar-lunar'].textContent,/丙午年九月十八/);
  assert.equal(h.nodes['daily-calendar-term'].textContent,'霜降'); assert.equal(h.nodes['daily-calendar-next-term'].textContent,''); assert.ok(!h.reads.some(id => id.includes('almanac')));
  assert.equal(h.requests.length,0); assert.equal(h.nodes['daily-feed'].children.length,0);
  assert.deepEqual(h.storageOps,[['remove','xieyuqing-brief-closed']]);
  for (const id of ['daily-brief-data','daily-content-data','daily-knowledge-data','daily-memes-data','daily-rules-data','daily-holidays-data']) assert.ok(!h.reads.includes(id),id);
  assert.doesNotMatch(source,/briefKey|syncBrief|renderBriefState|dataset\.brief\s*=/);
});
test('glance heavy assets wait for load and idle; globe additionally waits for the viewport',async () => {
  const h = harness({mode:'glance'}); h.intersect(true); assert.equal(h.body.children.length,0); assert.equal(h.idleCallbacks.size,0);
  h.load(); assert.equal(h.body.children.length,0); assert.equal([...h.idleCallbacks.values()][0].options.timeout,2000);
  h.intersect(false); h.runIdle(); assert.equal(h.body.children.length,1); h.loadScript('lunar'); await settle();
  assert.equal(h.nodes['daily-calendar-term'].textContent,'霜降第5天'); assert.equal(h.nodes['daily-calendar-next-term'].textContent,'距立冬还有11天'); assert.ok(!h.reads.some(id => id.includes('almanac')));
  h.intersect(true); h.loadScript('d3'); await settle(); h.loadScript('home-earth'); await settle(); assert.equal(h.earthCalls[0][2].globeOnly,true); assert.equal(h.requests.length,0);
  h.intersect(false); assert.equal(h.earthCalls.at(-1).paused,true); h.dispose(); assert.equal(h.earthCalls.at(-1),'destroy'); assert.equal(h.intervals.size,0); assert.ok(h.body.children.every(script => script.removed));
});
test('glance uses the 1200ms fallback, cancels idle work on leave, and ignores late callbacks',() => {
  const fallback = harness({mode:'glance',idle:false,readyState:'complete'}); assert.equal(fallback.body.children.length,0); assert.equal([...fallback.timers.values()][0].ms,1200); fallback.runTimeouts(); assert.equal(fallback.body.children.length,1);
  const left = harness({mode:'glance',readyState:'complete'}), callback = [...left.idleCallbacks.values()][0].fn; left.dispose(); assert.equal(left.idleCallbacks.size,0); callback(); assert.equal(left.body.children.length,0);
  const beforeLoad = harness({mode:'glance'}); beforeLoad.dispose(); beforeLoad.load(); assert.equal(beforeLoad.idleCallbacks.size,0); assert.equal(beforeLoad.body.children.length,0);
});
test('lunar failure preserves usable glance date and term fallbacks without divination UI',async () => {
  const h = harness({mode:'glance',language:'en',denied:true}); h.load(); h.runIdle(); h.failScript('lunar'); await settle(); assert.doesNotMatch(source,/getDayYi|getDayJi|getPengZu|getDayPosition|daily-almanac/); assert.equal(h.nodes['glance-date'].textContent,'Tuesday 27 October'); assert.equal(h.nodes['daily-calendar-term'].textContent,'Frost descent'); assert.equal(h.nodes['daily-calendar-next-term'].textContent,''); assert.equal(h.requests.length,0);
});
test('full mode shows all twelve news items with major entries first and immediate lunar loading',() => {
  const h = harness(), feed = h.nodes['daily-feed']; assert.equal(feed.children.length,12);
  const first = feed.children[0]; assert.equal(first.children[1].children[0].textContent,'标题 3'); assert.equal(first.children[0].children[0].textContent,'国际'); assert.equal(first.children[0].children[1].textContent,'要闻'); assert.equal(first.children[2].textContent,'摘要');
  assert.equal(feed.children[1].children[0].children[0].textContent,'时政'); assert.equal(h.nodes['daily-edition'].textContent,'新闻更新于 10月27日 09:50'); assert.match(h.body.children[0].src,/lunar/); assert.equal(h.idleCallbacks.size,0);
  assert.doesNotMatch(source,/data-news-filter|daily-filters/);
});
test('yesterday is labelled, a three-day-old edition remains visible, and a four-day-old one becomes one line',() => {
  assert.equal(harness({edition:'2026-10-26'}).nodes['daily-news-title'].textContent,'昨日要闻');
  const h = harness({edition:'2026-10-24'}); assert.equal(h.root.classes.has('brief-news-stale'),false); h.tick('2026-10-27T16:00:00Z'); assert.equal(h.root.classes.has('brief-news-stale'),true); assert.equal(h.nodes['daily-feed'].children.length,1); assert.equal(h.nodes['daily-feed'].textContent,'新闻暂停更新，先看看地球'); assert.equal(h.nodes['daily-brief-notice'].hidden,true); h.changeLanguage('en'); assert.match(h.nodes['daily-feed'].textContent,/^News updates paused/); assert.equal(h.nodes['daily-edition'].textContent,'News updated 24 October 09:50');
});
test('full weather includes validated detail fields, code advice and distinct forecast high/low hints',async () => {
  const rules = [{field:'precipitation_probability_max',operator:'gte',threshold:60,text:{'zh-CN':'可能下雨，记得带伞'}},{field:'temperature_2m_max',operator:'gte',threshold:33,text:{'zh-CN':'很热，注意防暑'}},{field:'temperature_2m_min',operator:'lte',threshold:0,text:{'zh-CN':'很冷，注意保暖'}}];
  const data = {current:{temperature_2m:12.1,weather_code:3,time:'2026-10-27T00:30',apparent_temperature:10.2,relative_humidity_2m:72,wind_speed_10m:15.5,wind_direction_10m:315,pressure_msl:1012.4},daily:{time:['2026-10-27'],temperature_2m_max:[34],temperature_2m_min:[-1],precipitation_probability_max:[65]}};
  const h = harness({rules,weatherData:data}); await settle(); assert.equal(h.requests.length,1); assert.ok(h.requests[0].url.includes('wind_speed_unit=kmh')); for (const field of ['apparent_temperature','relative_humidity_2m','wind_speed_10m','wind_direction_10m','pressure_msl']) assert.ok(h.requests[0].url.includes(field));
  assert.match(h.nodes['daily-weather-hint'].textContent,/今日预报：可能下雨.*今日最高气温：很热.*今日最低气温：很冷/); assert.equal(h.nodes['daily-weather-details'].children.length,5); assert.match(h.nodes['daily-weather-details'].textContent,/体感温度10.2 °C.*相对湿度72%.*15.5 km\/h.*西北.*315°.*海平面气压1012.4 hPa/); h.dispose(); assert.equal(h.intervals.size,0);
  const invalid = harness({weatherData:{current:{...data.current,apparent_temperature:null,relative_humidity_2m:101,wind_speed_10m:-1,wind_direction_10m:400,pressure_msl:Infinity}}}); await settle(); assert.equal(invalid.nodes['daily-weather-details'].hidden,true); assert.equal(invalid.nodes['daily-weather-details'].children.length,0);
});
test('calendar retains lunar, solar terms and Beijing timeline date but no almanac operations',async () => {
  const h = harness(); h.loadScript('lunar'); await settle(); assert.match(h.nodes['daily-calendar-cycle'].textContent,/丙午.*马/); assert.match(h.nodes['daily-calendar-term'].textContent,/霜降第5天.*立冬还有11天/); assert.equal(h.nodes['timeline-date'].textContent,'2026-10-27'); assert.doesNotMatch(source,/getDayYi|getDayJi|getPengZu|getDayPosition|daily-almanac/); h.selectPreset('london'); assert.equal(h.nodes['timeline-date'].textContent,'2026-10-27'); h.changeLanguage('en'); assert.match(h.nodes['daily-calendar-term'].textContent,/First Frost/);
});
test('calendar uses supplied holiday data and lunar-javascript festivals, including English library values',async () => {
  const h = harness({now:'2026-10-01T04:00:00Z',holidays:{2026:{days:[{date:'2026-10-01',name:'国庆节',isOffDay:true}]}}}); h.loadScript('lunar'); await settle(); assert.match(h.nodes['daily-calendar-holiday'].textContent,/假期.*国庆节/); assert.match(h.nodes['daily-calendar-festivals'].textContent,/国庆节/); h.changeLanguage('en'); assert.match(h.nodes['daily-calendar-cycle'].textContent,/Horse/); assert.match(h.nodes['daily-calendar-festivals'].textContent,/National Day/);
});
test('history is separate from news, retains original date evidence and advances at Beijing midnight',() => {
  const item = {id:'history-test',month_day:'10-27',year:1845,title:{'zh-CN':'历史事件',en:'Historical event'},text:{'zh-CN':'历史说明',en:'Historical note'},source:'Wikipedia',url:'https://en.wikipedia.org/wiki/Example',source_page:'https://en.wikipedia.org/wiki/Wikipedia:Selected_anniversaries/October_27',source_revision:12345};
  const history={items:[item,{...item,id:'history-next',month_day:'10-28',title:{'zh-CN':'次日事件',en:'Next day'}}],attribution:{'zh-CN':'贡献者',en:'Contributors'},selection_policy:{'zh-CN':'自动整理',en:'Compiled'}};
  const h=harness({history}); assert.match(h.nodes['daily-history-list'].textContent,/历史事件/); assert.doesNotMatch(h.nodes['daily-feed'].textContent,/历史事件/); assert.match(h.nodes['daily-history-list'].textContent,/日期出处/); h.changeLanguage('en');assert.match(h.nodes['daily-history-list'].textContent,/Historical event/);h.tick('2026-10-27T16:01:00Z');assert.match(h.nodes['daily-history-list'].textContent,/Next day/);assert.doesNotMatch(h.nodes['daily-history-list'].textContent,/Historical event/);assert.match(h.nodes['history-date-note'].textContent,/2026-10-28/);h.dispose();
});
test('news keeps original titles, language, links and publication times; old and future entries do not get refreshed',() => {
  const item={id:'test',title:'Original headline',source:'Source',source_id:'source',category:'world',lang:'en',published:'2026-10-26T17:00:00Z',url:'https://news.example.org/story?id=42'};
  const snapshot={version:1,collected_at:'2026-10-26T17:01:00Z',items:[item,{...item,id:'old',published:'2026-10-22T00:00:00Z'},{...item,id:'future',published:'2026-10-30T00:00:00Z'}]};
  const h=harness({snapshot,now:'2026-10-27T04:00:00Z',newsSources:[{name:'Newsroom',home_url:'https://news.example.org/'}]});assert.equal(h.nodes['daily-feed'].children.length,1);const article=h.nodes['daily-feed'].children[0];assert.equal(article.children[1].children[0].href,item.url);assert.equal(article.children[1].children[0].lang,'en');assert.equal(article.children[2].children[1].dateTime,item.published);assert.doesNotMatch(article.textContent,/摘要|人工挑选/);assert.match(h.nodes['daily-edition'].textContent,/最近检查/);assert.equal(h.nodes['news-source-links'].children[0].href,'https://news.example.org/');h.tick('2026-10-29T17:01:00Z');assert.equal(h.nodes['daily-feed'].children[0].className,'news-empty');assert.match(h.nodes['daily-edition'].textContent,/2026/);h.dispose();
});

test('random reading exposes valid destinations supplied for the current language',() => {
  const zh = harness({articles:['/articles/a.html','/en/articles/b.html','javascript:alert(1)','/articles//unsafe']}); assert.equal(zh.nodes['home-random-button'].hidden,false); zh.nodes['home-random-button'].events.click(); assert.deepEqual(zh.visited,['/articles/a.html']);
  const en = harness({language:'en',articles:['/en/articles/b.html']}); delete en.window.SiteNavigation.visit; en.nodes['home-random-button'].events.click(); assert.deepEqual(en.assigned,['/en/articles/b.html']); const original = harness({language:'en',articles:['/articles/english-original.html']}); original.nodes['home-random-button'].events.click(); assert.deepEqual(original.visited,['/articles/english-original.html']); assert.equal(harness({articles:['https://example.test/']}).nodes['home-random-button'].hidden,true);
});
test('own-quote script has no weather endpoint or now-card initialization and still refreshes daily',() => {
  const quoteSource = fs.readFileSync(path.join(__dirname,'../home/assets/home-now.js'),'utf8'); assert.doesNotMatch(quoteSource,/fetch|open-meteo|now-card|renderClock/);
  const nodes = {'own-quote':new Element(),'own-quote-text':new Element(),'own-quote-source':new Element(),'own-quotes-data':new Element()}; nodes['own-quotes-data'].textContent = JSON.stringify([{text:{'zh-CN':'旧文一句'},url:{'zh-CN':'/articles/old.html'},title:{'zh-CN':'旧文'},date:'2024-01-01'}]); const document = {documentElement:{lang:'zh-CN'},getElementById:id => nodes[id],createElement:tag => new Element(tag),createTextNode:value => ({textContent:value})}; let timer, owned; const window = {setInterval:fn => { timer = fn; return 1; },clearInterval:() => { timer = null; },SiteNavigation:{own:fn => { owned = fn; }}}; vm.runInNewContext(quoteSource,{window,document,Intl,Date},{timeout:1000}); assert.equal(nodes['own-quote-text'].textContent,'旧文一句'); assert.equal(nodes['own-quote-source'].children[2].href,'/articles/old.html'); assert.equal(typeof timer,'function'); owned(); assert.equal(timer,null);
});

const paris = {id:2988507,name:'Paris',country:'France',country_code:'FR',admin1:'Île-de-France',latitude:48.8534,longitude:2.3488,timezone:'Europe/Paris'};
const forecast = code => ({current:{temperature_2m:15,weather_code:code,time:'2026-10-27T00:30'},daily:{time:['2026-10-27'],temperature_2m_max:[20],temperature_2m_min:[10],precipitation_probability_max:[0]}});
test('all 29 explicit WMO conditions have advice even without forecast rain; unknown codes stay unknown',async () => {
  const codes = [0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,97,99];
  for (const code of codes) { const h = harness({weatherData:forecast(code)}); await settle(); assert.ok(!h.nodes['daily-weather'].textContent.includes('暂不可用'),String(code)); assert.equal(h.nodes['daily-weather-hint'].hidden,false,String(code)); assert.ok(h.nodes['daily-weather-hint'].textContent.length > 5); h.dispose(); }
  const unknown = harness({weatherData:forecast(42)}); await settle(); assert.match(unknown.nodes['daily-weather'].textContent,/天气状况暂不可用/); assert.equal(unknown.nodes['daily-weather-hint'].hidden,true);
  const rainy = harness({weatherData:forecast(95),rules:[{field:'precipitation_probability_max',operator:'gte',threshold:0,text:{'zh-CN':'可能下雨，记得带伞'}}]}); await settle(); assert.match(rainy.nodes['daily-weather-hint'].textContent,/雷暴/); assert.doesNotMatch(rainy.nodes['daily-weather-hint'].textContent,/可能下雨/);
});
test('city search is explicit, disambiguates results, saves coordinates, and passes the same observer to Earth',async () => {
  const h = harness({geocodingData:{results:[paris]}}); await settle(); assert.equal(h.requests.length,1); assert.equal(h.nodes['daily-city'].children.length,17); h.search('Paris'); await settle(); assert.equal(h.nodes['city-search-results'].hidden,false); const button = h.nodes['city-search-results'].children[0].children[0]; assert.equal(button.type,'button'); assert.match(button.textContent,/Paris.*Île-de-France.*法国.*Europe\/Paris/); h.chooseResult(0); await settle(); const saved = JSON.parse(h.stored.get('xieyuqing-home-city-v2')); assert.equal(saved.city.lat,paris.latitude); assert.equal(saved.city.tz,paris.timezone); assert.equal(h.nodes['daily-city'].value,'custom'); assert.match(h.nodes['daily-city-label'].textContent,/Paris/); assert.equal(h.nodes['city-search-results'].hidden,true);
  assert.ok(h.requests.at(-1).url.includes('latitude=48.8534')); assert.ok(h.requests.at(-1).url.includes('timezone=Europe%2FParis'));
  h.intersect(true); h.loadScript('d3'); await settle(); h.loadScript('home-earth'); await settle(); assert.equal(h.earthCalls[0][2].city.lat,paris.latitude); h.selectPreset('moscow'); assert.equal(h.earthCityChanges.at(-1).id,'moscow'); h.dispose();
});
test('overlapping city searches abort obsolete requests, reject bad results and ignore late responses',async () => {
  const h = harness({deferGeocoding:true}); h.search('Paris'); h.search('London'); const requests = h.requests.filter(item => item.url.includes('geocoding-api')); assert.equal(requests.length,2); assert.equal(requests[0].signal.aborted,true); requests[1].resolve({results:[{...paris,id:2643743,name:'London',country:'United Kingdom',country_code:'GB',admin1:'England',latitude:51.5085,longitude:-.1257,timezone:'Europe/London'},{...paris,latitude:999},{...paris,timezone:'Not/A_Zone'},{...paris,name:'<script>'}]}); await settle(); assert.equal(h.nodes['city-search-results'].children.length,1); requests[0].resolve({results:[paris]}); await settle(); assert.match(h.nodes['city-search-results'].textContent,/London/); assert.doesNotMatch(h.nodes['city-search-results'].textContent,/Paris/); h.search('Other'); const pending = h.requests.at(-1); h.dispose(); assert.equal(pending.signal.aborted,true);
});
test('city persistence migrates the old preset key and rejects invalid saved coordinates',async () => {
  const legacy = harness({storedValues:{'xieyuqing-home-city-v1':'london'}}); await settle(); assert.ok(legacy.requests[0].url.includes('Europe%2FLondon')); assert.equal(JSON.parse(legacy.stored.get('xieyuqing-home-city-v2')).city.id,'london');
  const bad = harness({storedValues:{'xieyuqing-home-city-v2':JSON.stringify({version:1,city:{name:'Bad',en:'Bad',country:'France',lat:999,lon:2,tz:'Europe/Paris'}})}}); await settle(); assert.ok(bad.requests[0].url.includes('latitude=39.9042'));
});
test('weather caches bind to coordinates and timezone and obsolete forecasts cannot overwrite the chosen city',async () => {
  const first = harness(); await settle(); const values = Object.fromEntries(first.stored), key = 'xieyuqing-weather-v3:' + A.cityModel.identity(A.cityModel.presets.beijing); assert.ok(values[key]); const hit = harness({storedValues:values}); await settle(); assert.equal(hit.requests.length,0);
  const poisoned = JSON.parse(values[key]); poisoned.observer = A.cityModel.fromResult(paris); values[key] = JSON.stringify(poisoned); const miss = harness({storedValues:values}); await settle(); assert.equal(miss.requests.length,1);
  const race = harness({deferForecast:true}); race.selectPreset('london'); assert.equal(race.requests[0].signal.aborted,true); race.requests[1].resolve(forecast(61)); await settle(); race.requests[0].resolve(forecast(0)); await settle(); assert.match(race.nodes['daily-weather'].textContent,/小雨/); assert.ok(race.stored.has('xieyuqing-weather-v3:' + A.cityModel.identity(A.cityModel.presets.london))); assert.ok(!race.stored.has(key)); race.selectPreset('dubai'); const pending = race.requests.at(-1); race.dispose(); assert.equal(pending.signal.aborted,true);
});
test('a fresh legacy weather cache remains readable while a new-schema forecast is fetched',async () => {
  const legacy = {city:'beijing',temperature:8,code:0,time:'2026-10-27T00:29',savedAt:Date.parse('2026-10-26T16:29:00Z')};
  const h = harness({deferForecast:true,storedValues:{'xieyuqing-weather-v2:beijing':JSON.stringify(legacy)}});
  assert.equal(h.requests.length,1); assert.match(h.nodes['daily-weather'].textContent,/8°C.*上次数据/); assert.ok(h.requests[0].url.includes('pressure_msl'));
  h.requests[0].resolve({current:{temperature_2m:9,weather_code:1,time:'2026-10-27T00:30',pressure_msl:1015,wind_speed_10m:3}}); await settle();
  assert.match(h.nodes['daily-weather'].textContent,/9°C/); assert.match(h.nodes['daily-weather-details'].textContent,/1015.0 hPa/); assert.ok(h.stored.has('xieyuqing-weather-v3:' + A.cityModel.identity(A.cityModel.presets.beijing)));
  const failed = harness({deferForecast:true,storedValues:{'xieyuqing-weather-v2:beijing':JSON.stringify(legacy)}}); failed.requests[0].reject(new Error('offline')); await settle(); assert.match(failed.nodes['daily-weather'].textContent,/8°C.*上次数据/);
});
test('prototype-named city preferences fall back safely and array-valued weather timestamps are rejected',async () => {
  for (const key of ['toString','constructor','__proto__']) {
    assert.equal(A.cityModel.normalize(key),null); assert.equal(A.cityModel.decode(key),null);
    const h = harness({storedValues:{'xieyuqing-home-city-v1':key}}); await settle(); assert.ok(h.requests[0].url.includes('latitude=39.9042')); assert.match(h.nodes['daily-city-label'].textContent,/北京/); h.dispose();
  }
  assert.equal(Object.getPrototypeOf(A.cityModel.presets),null);
  const good = harness(); await settle(); const stored = Object.fromEntries(good.stored), key = 'xieyuqing-weather-v3:' + A.cityModel.identity(A.cityModel.presets.beijing), poison = JSON.parse(stored[key]); poison.time = ['2026-10-27T00:30']; stored[key] = JSON.stringify(poison);
  const cached = harness({storedValues:stored}); await settle(); assert.equal(cached.requests.length,1); assert.match(cached.nodes['daily-weather'].textContent,/12°C/);
  const bad = forecast(0); bad.current.time = ['2026-10-27T00:30']; const incoming = harness({weatherData:bad}); await settle(); assert.equal(incoming.nodes['daily-weather'].textContent,'天气暂不可用'); assert.ok(!incoming.stored.has(key)); incoming.dispose();
});

test('today headline and compact lunar/term/festival line advance at Beijing midnight',async () => {
  const h = harness({now:'2026-10-28T15:59:00Z'}); h.loadScript('lunar'); await settle();
  assert.equal(h.nodes['today-title'].textContent,'今天：2026年10月28日');
  assert.equal(h.nodes['daily-calendar-lunar'].textContent,'丙午年九月十九');
  assert.equal(h.nodes['daily-calendar-term'].textContent,'霜降第6天 · 距立冬还有10天');
  assert.equal(h.nodes['daily-calendar-festivals'].textContent,'距万圣节前夜还有3天');
  h.selectPreset('newyork'); h.tick('2026-10-28T16:01:00Z');
  assert.equal(h.nodes['today-title'].textContent,'今天：2026年10月29日');
  assert.match(h.nodes['daily-calendar-term'].textContent,/第7天.*还有9天/);
  h.changeLanguage('en'); assert.equal(h.nodes['today-title'].textContent,'Today: 29 October 2026');
  h.dispose();
});

test('map selection resolves the actual timezone once and reuses its forecast for weather and Earth',async () => {
  const h = harness({withWeatherMap:true,deferForecast:true});
  const pending = h.pickMap({lat:48.5,lon:2.2}); assert.equal(h.requests.length,2);
  assert.match(h.requests[1].url,/timezone=auto/); const data = forecast(1); data.timezone = 'Europe/Paris';
  h.requests[1].resolve(data); await pending; await settle();
  assert.equal(h.requests.length,2,'the resolved forecast is reused');
  assert.equal(h.nodes['daily-city-name'].textContent,'地图选点');
  assert.match(h.nodes['daily-city-label'].textContent,/48.50°.*2.20°.*Europe\/Paris/);
  assert.equal(h.mapCities.at(-1).tz,'Europe/Paris');
  const saved = JSON.parse(h.stored.get('xieyuqing-home-city-v2')).city;
  assert.equal(saved.lat,48.5); assert.equal(saved.tz,'Europe/Paris'); assert(h.requests[0].signal.aborted);
  h.dispose(); assert(h.mapDestroyed());
});

test('obsolete map lookups, invalid timezones and late responses cannot replace a chosen city',async () => {
  const h = harness({withWeatherMap:true,deferForecast:true});
  const first = h.pickMap({lat:48.5,lon:2.2}); h.selectPreset('shanghai');
  assert(h.requests[1].signal.aborted); const valid = forecast(1); valid.timezone = 'Europe/Paris';
  h.requests[1].resolve(valid); await first; assert.equal(h.mapCities.at(-1).id,'shanghai');
  const second = h.pickMap({lat:20,lon:30}); const invalid = forecast(0); invalid.timezone = 'not/a/zone';
  h.requests[3].resolve(invalid); await second;
  assert.equal(h.mapCities.at(-1).id,'shanghai'); assert.match(h.nodes['weather-selection-status'].textContent,/保留当前天气/);
  const third = h.pickMap({lat:10,lon:20}); h.dispose(); assert(h.requests[4].signal.aborted);
  h.requests[4].resolve(valid); await third; assert.equal(h.mapCities.at(-1).id,'shanghai');
});
