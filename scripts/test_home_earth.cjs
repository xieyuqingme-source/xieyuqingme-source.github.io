// Run with Node's built-in test runner: node --test scripts/test_home_earth.cjs
// Fixed epochs test the model; production always reads the visitor's current time.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const root = path.resolve(__dirname, '..');
const A = require('../home/assets/astronomy-solar.js');
const {createEarth, CITIES} = require('../home/assets/home-earth.js');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const epoch = new Date('2026-10-26T04:00:00Z');
const settle = () => new Promise(resolve => setImmediate(resolve));

test('NOAA solar geometry agrees with equinox, solstices and the subsolar zenith', () => {
  const solar = A.position(epoch);
  assert.ok(Math.abs(solar.declination + 12.4269) < .001);
  assert.ok(Math.abs(solar.subsolarLongitude - 115.9889) < .001);
  assert.ok(Math.abs(A.altitude(epoch, solar.declination, solar.subsolarLongitude) - 90) < .00001);
  assert.ok(Math.abs(A.position('2026-06-21T08:24:00Z').declination - 23.44) < .02);
  assert.ok(Math.abs(A.position('2026-12-21T20:50:00Z').declination + 23.44) < .02);
  assert.ok(Math.abs(A.position('2026-03-20T14:46:00Z').declination) < .02);
  assert.equal(A.term(epoch), '霜降');
  assert.ok(A.lunar(epoch).includes('九月十七'));
});

test('four city sunrise/sunset use the local civil date, including London after DST', () => {
  const expected = {beijing: [396,1040],shanghai: [365,1031],kuala: [417,1138],london: [403,1005]};
  for (const key of Object.keys(expected)) {
    const city = CITIES[key];
    const events = A.riseSet(epoch, city);
    const minute = date => {
      const rounded = new Date(Math.round(date.getTime() / 60000) * 60000);
      const parts = new Intl.DateTimeFormat('en-GB', {timeZone: city.tz,hour: '2-digit',minute: '2-digit',hourCycle: 'h23'}).formatToParts(rounded);
      return Number(parts.find(p => p.type === 'hour').value) * 60 + Number(parts.find(p => p.type === 'minute').value);
    };
    assert.ok(Math.abs(minute(events.rise) - expected[key][0]) <= 1, key + ' sunrise');
    assert.ok(Math.abs(minute(events.set) - expected[key][1]) <= 1, key + ' sunset');
    assert.ok(events.set > events.rise);
  }
  assert.deepEqual(A.dateParts('2026-10-25T23:30:00Z', 'Asia/Shanghai'), {year: 2026,month: 10,day: 26});
  assert.deepEqual(A.dateParts('2026-10-25T23:30:00Z', 'Europe/London'), {year: 2026,month: 10,day: 25});
});

test('polar day/night and invalid inputs remain explicit', () => {
  assert.equal(A.riseSet('2026-06-21T12:00:00Z', {lat: 89,lon: 0,tz: 'UTC'}).polar, 'day');
  assert.equal(A.riseSet('2026-12-21T12:00:00Z', {lat: 89,lon: 0,tz: 'UTC'}).polar, 'night');
  assert.throws(() => A.position('invalid'), TypeError);
  assert.throws(() => A.riseSet(epoch, {lat: 100,lon: 0}), RangeError);
});

test('actual vendored D3 and astronomy share the published PageScope and can be removed', () => {
  const globals = new Map(), target = {document: {},console};
  const owned = new Proxy(target, {
    set(t, key, value) { t[key] = value; globals.set(key, value); return true; },
    get(t, key) { return ['window','self','globalThis'].includes(key) ? owned : t[key]; }
  });
  target.SiteNavigation = {environment: () => ({document: target.document,window: owned})};
  const sandbox = {window: target,console}; vm.createContext(sandbox);
  const scoper = read('scripts/site_navigation.py');
  assert.ok(scoper.includes('function(document,window,self,globalThis)'));
  const header = '/* site-page-scope:v1 */\n(function(document,window,self,globalThis){\nif(document?.currentScript?.dataset?.homeScope&&document.currentScript.dataset.homeScope!==window.HomeBriefPageId)return;\nconst {fetch,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame,cancelAnimationFrame,ResizeObserver,IntersectionObserver,MutationObserver,URL,history,location,matchMedia}=window;\n';
  const footer = '\n}).apply(...(()=>{if(typeof module==="object"&&module.exports)return[globalThis,[globalThis.document,globalThis,globalThis,globalThis]];const e=window.SiteNavigation.environment();return[e.window,[e.document,e.window,e.window,e.window]];})());\n';
  for (const file of ['home/assets/vendor/d3-7.9.0.min.js','home/assets/astronomy-solar.js','home/assets/vendor/lunar-javascript-1.7.7.js','home/assets/home-earth.js']) vm.runInContext(header + read(file) + footer, sandbox);
  assert.equal(typeof owned.d3.geoOrthographic, 'function');
  assert.ok(Math.abs(owned.HomeAstronomy.position(epoch).declination - A.position(epoch).declination) < 1e-9);
  const geography = JSON.parse(read('home/assets/map-land.json'));
  const fraction = owned.d3.geoArea(geography) / (4 * Math.PI);
  assert.ok(fraction > .25 && fraction < .35, 'existing GeoJSON winding represents land');
  assert.ok(globals.has('d3') && globals.has('HomeAstronomy') && globals.has('Solar') && globals.has('I18n') && globals.has('HomeEarth'));
  assert.equal(owned.Solar.fromYmd(2026,10,27).getLunar().getPrevJieQi(true).getName(),'霜降');
  for (const [key, value] of globals) if (target[key] === value) delete target[key];
  assert.equal(target.d3, undefined); assert.equal(target.HomeAstronomy, undefined); assert.equal(target.Solar,undefined); assert.equal(target.I18n,undefined); assert.equal(target.HomeEarth,undefined);
  target.HomeBriefPageId = 'new-home'; target.document.currentScript = {dataset:{homeScope:'old-home'}};
  vm.runInContext(header + read('home/assets/vendor/lunar-javascript-1.7.7.js') + footer,sandbox);
  assert.equal(target.Solar,undefined,'a late script from a departed scope must not publish globals');
});

class Element {
  constructor() { this.dataset = {}; this.events = {}; this.children = []; this.hidden = false; this.value = ''; this._text = ''; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  addEventListener(type, fn) { this.events[type] = fn; }
  removeEventListener(type, fn) { if (this.events[type] === fn) delete this.events[type]; }
  replaceChildren() { this.children = []; this._text = ''; }
  append(...nodes) { this.children.push(...nodes); }
}
function harness(cached) {
  const ids = ['daily-city','earth-hour','earth-hour-label','daily-local-time','daily-sunrise','daily-sunset','daily-daylength','daily-subsolar','daily-calendar-month','daily-calendar-day','daily-calendar-weekday','daily-calendar-lunar','daily-calendar-term','daily-weather','earth-now','daily-moon-phase','daily-world-clocks'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Element()])), element = new Element(), document = new Element(), storage = new Map();
  if (cached) storage.set('xieyuqing-weather-v1:beijing', JSON.stringify(cached));
  document.documentElement = {lang: 'zh-CN',dataset: {theme: 'light'}};
  document.querySelector = selector => selector === '#daily-earth' ? element : null;
  document.getElementById = id => nodes[id] || null;
  document.createElement = () => new Element();
  let next = 1, subscriber = null;
  const requests = [], timers = new Map(), intervals = new Map(), owned = [];
  const window = {
    HomeAstronomy: A,URLSearchParams,AbortController,
    localStorage: {getItem: key => storage.get(key) || null,setItem: (key, value) => storage.set(key, value)},
    addEventListener() {},removeEventListener() {},
    setTimeout(fn, ms) { const id = next++; timers.set(id, {fn, ms}); return id; },clearTimeout: id => timers.delete(id),
    setInterval(fn, ms) { const id = next++; intervals.set(id, {fn, ms}); return id; },clearInterval: id => intervals.delete(id),
    requestAnimationFrame: () => next++,cancelAnimationFrame() {},SiteNavigation: {own: fn => owned.push(fn)},
    SiteI18n: {lang: () => document.documentElement.lang,onChange(fn) { subscriber = fn; return () => { subscriber = null; }; }},
    fetch(url, options) {
      if (url.startsWith('/assets')) return Promise.resolve({ok: true,json: async () => ({type: 'FeatureCollection',features: []})});
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
        requests.push({url,resolve,reject,signal: options.signal});
      });
    }
  };
  return {nodes,element,document,window,storage,requests,timers,intervals,owned,changeLanguage(lang) { document.documentElement.lang = lang; subscriber?.(); }};
}

test('demo reaches 23:59, live mode returns, and language subscriptions clean up', async () => {
  const h = harness(), control = createEarth(h.document, h.window);
  try {
    assert.equal(createEarth(h.document, h.window), null);
    h.nodes['earth-hour'].value = '23.9833'; h.nodes['earth-hour'].events.input();
    assert.equal(control.getState().demo, true);
    assert.ok(h.nodes['earth-hour-label'].textContent.includes('23:59 北京时间'));
    assert.equal(h.nodes['earth-now'].hidden, false);
    h.changeLanguage('en');
    assert.ok(h.nodes['earth-hour-label'].textContent.includes('Demo'));
    assert.match(h.nodes['daily-local-time'].textContent,/Beijing.*Day|Beijing.*Night/);
    h.nodes['earth-now'].events.click();
    assert.equal(control.getState().demo, false); assert.equal(h.nodes['earth-now'].hidden, true);
  } finally { control.destroy(); }
  await settle();
  assert.equal(h.intervals.size, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.element.dataset.earthReady, 'false');
  assert.equal(Object.keys(h.nodes['daily-city'].events).length, 0);
});

test('changing city aborts obsolete weather, attributes the source, and reuses fresh cache', async () => {
  const h = harness(), control = createEarth(h.document, h.window);
  try {
    h.nodes['daily-city'].value = 'london'; h.nodes['daily-city'].events.change();
    assert.ok(h.requests[0].signal.aborted);
    assert.ok(h.requests[1].url.includes('timezone=Europe%2FLondon'));
    h.requests[1].resolve({ok: true,json: async () => ({current: {temperature_2m: 12.3,weather_code: 3,time: '2026-10-26T11:15'}})});
    await settle();
    assert.ok(h.nodes['daily-weather'].textContent.includes('12°C'));
    assert.ok(h.nodes['daily-weather'].textContent.includes('Open-Meteo'));
    assert.ok(h.storage.has('xieyuqing-weather-v1:london'));
    h.nodes['daily-city'].value = 'beijing'; h.nodes['daily-city'].events.change();
    const count = h.requests.length;
    h.nodes['daily-city'].value = 'london'; h.nodes['daily-city'].events.change();
    await settle();
    assert.equal(h.requests.length, count);
    assert.ok(h.nodes['daily-weather'].textContent.includes('12°C'));
  } finally { control.destroy(); }
  await settle();
});

test('weather timeout reports unavailability and stale cache survives refresh failure', async () => {
  const h = harness(), control = createEarth(h.document, h.window);
  [...h.timers.values()].find(timer => timer.ms === 8000).fn();
  await settle();
  assert.equal(h.nodes['daily-weather'].textContent, '天气暂不可用');
  control.destroy();
  const stale = harness({city: 'beijing',temperature: 8.2,code: 0,time: '2026-10-26T11:15',savedAt: Date.now() - 31 * 60000});
  const second = createEarth(stale.document, stale.window);
  assert.ok(stale.nodes['daily-weather'].textContent.includes('上次数据'));
  stale.requests[0].reject(new Error('offline')); await settle();
  assert.ok(stale.nodes['daily-weather'].textContent.includes('8°C'));
  assert.ok(stale.nodes['daily-weather'].textContent.includes('上次数据'));
  second.destroy();
});

test('missing optional DOM fields and canvas are safe', async () => {
  const h = harness(); h.document.getElementById = () => null;
  const control = createEarth(h.document, h.window);
  assert.ok(control); control.destroy(); await settle();
  h.document.querySelector = () => null;
  assert.equal(createEarth(h.document, h.window), null);
});

test('glance and full templates keep their Earth contracts and declare heavy scripts only as lazy URLs', () => {
  for (const file of ['home/index.template.html','home/en/index.template.html','home/today.template.html','home/en/today.template.html']) {
    const html = read(file);
    const glance = !file.includes('today.template');
    const ids = glance ? ['daily-earth','earth-canvas','daily-local-time','daily-calendar-lunar','daily-calendar-term','glance-date','daily-calendar-next-term']
      : ['daily-earth','earth-canvas','daily-city','earth-hour','earth-hour-label','earth-now','daily-local-time','daily-sunrise','daily-sunset','daily-daylength','daily-subsolar','daily-moon-phase','daily-world-clocks','today-title','daily-calendar-lunar','daily-calendar-term','daily-calendar-festivals','daily-weather'];
    for (const id of ids) assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, file + ' #' + id);
    if (!glance) {
      const title = file.startsWith('home/en/') ? 'today_date_title_en' : 'today_date_title';
      assert.ok(html.includes('<h1 id="today-title">{{' + title + '}}</h1>'),file + ' date title is supplied by the builder');
      for (const id of ['daily-calendar-month','daily-calendar-day','daily-calendar-weekday']) assert.doesNotMatch(html,new RegExp('id="' + id + '"'),file + ' obsolete calendar block stays removed');
    }
    assert.ok(html.includes('data-brief-mode="' + (glance ? 'glance' : 'full') + '"'),file + ' mode');
    assert.match(html,/data-d3-src="\/assets\/vendor\/d3-7\.9\.0\.min\.js"/);
    assert.match(html,/data-earth-src="\/assets\/home-earth\.js"/);
    assert.match(html,/data-lunar-src="\/assets\/vendor\/lunar-javascript-1\.7\.7\.js"/);
    assert.doesNotMatch(html,/<script\b[^>]+src="\/assets\/(?:vendor\/(?:d3|lunar)|home-earth)/);
    for (const name of ['astronomy-solar','home-daily']) assert.equal((html.match(new RegExp('<script\\b[^>]+src="/assets/' + name + '\\.js"','g')) || []).length,1,file + ' loads one ' + name + ' controller');
    assert.ok(html.indexOf('src="/assets/astronomy-solar.js"') < html.indexOf('src="/assets/home-daily.js"'),file + ' light astronomy precedes daily controller');
  }
});

test('mean lunar phase follows the synodic cycle and rejects invalid dates',() => {
  const zero = Date.UTC(2000,0,6,18,14), month = 29.530588853 * 86400000;
  assert.equal(A.moonPhase(zero).name,'新月'); assert.ok(A.moonPhase(zero).illumination < 1e-9);
  assert.equal(A.moonPhase(zero + month / 2,true).name,'Full moon'); assert.ok(Math.abs(A.moonPhase(zero + month / 2).illumination - 1) < 1e-9);
  assert.equal(A.moonPhase(zero + month * .625).name,'亏凸月'); assert.equal(A.moonPhase(zero + month * .75,true).name,'Last quarter');
  assert.throws(() => A.moonPhase('invalid'),TypeError);
});

test('lazy globe mode adds six world clocks without a second weather request and pauses rendering',async () => {
  const h = harness();
  let draws = 0;
  const context = {setTransform() {},clearRect() { draws++; },createRadialGradient:() => ({addColorStop() {}}),beginPath() {},arc() {},fill() {},fillText() {}};
  h.nodes['earth-canvas'] = new Element(); Object.assign(h.nodes['earth-canvas'],{getContext:() => context,getBoundingClientRect:() => ({width:160}),setAttribute() {}});
  h.window.getComputedStyle = () => ({getPropertyValue:() => ''});
  const control = createEarth(h.document,h.window,{globeOnly:true});
  assert.equal(h.requests.length,0);
  assert.equal(h.nodes['daily-world-clocks'].children.length,6);
  assert.match(h.nodes['daily-world-clocks'].textContent,/北京.*吉隆坡.*伦敦.*纽约.*莫斯科.*迪拜/);
  assert.match(h.nodes['daily-moon-phase'].textContent,/月相/);
  const before = draws; control.setPaused(true); control.refresh(); assert.equal(draws,before); assert.equal(control.getState().paused,true);
  control.setPaused(false); assert.ok(draws > before); control.destroy(); await settle(); assert.equal(h.intervals.size,0);
});

test('homepage mini globe stays in Beijing without reading city preferences or weather caches',async () => {
  const h = harness(); let reads = 0;
  h.document.querySelector = selector => selector === '#daily-earth' ? h.element : selector === '.daily-home' ? {dataset:{briefMode:'glance'}} : null;
  h.window.localStorage.getItem = () => { reads++; return 'london'; };
  const clock = new Element(), canvas = new Element(); canvas.setAttribute = () => {};
  h.document.getElementById = id => id === 'daily-local-time' ? clock : id === 'earth-canvas' ? canvas : null;
  const controller = createEarth(h.document,h.window,{globeOnly:true});
  assert.equal(controller.getState().city,'beijing'); assert.equal(reads,0); assert.equal(h.requests.length,0); assert.match(clock.textContent,/北京/);
  controller.destroy(); await settle(); assert.equal(h.intervals.size,0);
});

test('a lazy globe keeps the already selected city when storage is unavailable', async () => {
  const h = harness();
  h.nodes['daily-city'].value = 'kuala';
  h.window.localStorage.getItem = () => { throw new Error('Storage unavailable'); };
  const control = createEarth(h.document,h.window,{globeOnly:true});
  assert.equal(control.getState().city,'kuala');
  assert.equal(h.nodes['daily-city'].value,'kuala');
  assert.match(h.nodes['daily-local-time'].textContent,/吉隆坡/);
  assert.equal(h.requests.length,0);
  control.destroy(); await settle();
});
const CM = A.cityModel;
test('one city model supplies validated presets, custom observers, legacy decoding and clock membership',() => {
  assert.equal(CITIES,CM.presets);
  for (const value of Object.values(CM.presets)) assert.ok(CM.normalize(value));
  for (const id of ['beijing','shanghai','kuala','london','newyork','moscow','dubai','chengdu','mianyang']) assert.ok(CM.presets[id]);
  assert.equal(CM.decode('london').tz,'Europe/London');
  const paris = CM.fromResult({id:2988507,name:'Paris',country:'France',country_code:'FR',admin1:'Île-de-France',latitude:48.8534,longitude:2.3488,timezone:'Europe/Paris'});
  assert.ok(paris); assert.match(CM.label(paris,true),/Paris.*France.*Europe\/Paris/);
  assert.equal(CM.decode(JSON.stringify({version:1,city:paris})).lat,paris.lat);
  for (const changed of [{lat:999},{lon:181},{lat:'48.8'},{tz:'Invalid/Zone'},{name:'<script>'},{country:''}]) assert.equal(CM.normalize({...paris,...changed}),null);
  assert.deepEqual(CM.clockCities(CM.presets.beijing).map(value => value.id),['beijing','kuala','london','newyork','moscow','dubai']);
  assert.deepEqual(CM.clockCities(paris).map(value => value.id),[paris.id,'beijing','kuala','london','newyork','moscow']);
  const ny = CM.fromResult({id:5128581,name:'New York City',country:'United States',country_code:'US',admin1:'New York',latitude:40.7143,longitude:-74.006,timezone:'America/New_York'});
  assert.equal(CM.clockCities(ny).at(-1).id,'dubai');
  assert.equal(CM.clockCities({...ny,name:'Jersey City',en:'Jersey City'}).at(0).name,'Jersey City');
});
test('the lazy globe accepts the day card observer and keeps a custom select option unchanged',async () => {
  const h = harness(), paris = CM.normalize({id:'geo-2988507',name:'Paris',en:'Paris',country:'France',countryCode:'FR',region:'Île-de-France',lat:48.8534,lon:2.3488,tz:'Europe/Paris'});
  h.nodes['daily-city'].value = 'custom';
  const control = createEarth(h.document,h.window,{globeOnly:true,city:paris});
  assert.equal(h.nodes['daily-city'].value,'custom'); assert.equal(control.getState().observer.lat,paris.lat); assert.equal(control.getState().observer.tz,paris.tz);
  assert.equal(h.nodes['daily-world-clocks'].children.length,6); assert.match(h.nodes['daily-world-clocks'].children[0].textContent,/Paris/); assert.match(h.nodes['daily-world-clocks'].children[5].textContent,/莫斯科/); assert.match(h.nodes['daily-local-time'].textContent,/Paris/);
  assert.equal(h.requests.length,0); assert.equal(control.setCity({...paris,lat:1000}),false);
  assert.equal(control.setCity(CM.presets.newyork),true); assert.match(h.nodes['daily-world-clocks'].children[5].textContent,/迪拜/); assert.match(h.nodes['daily-local-time'].textContent,/纽约/); assert.equal(h.nodes['daily-city'].value,'custom');
  control.destroy(); await settle(); assert.equal(h.intervals.size,0);
});
