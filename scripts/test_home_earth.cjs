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
  for (const [key, city] of Object.entries(CITIES)) {
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
  const header = '/* site-page-scope:v1 */\n(function(document,window,self,globalThis){\nconst {fetch,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame,cancelAnimationFrame,ResizeObserver,IntersectionObserver,MutationObserver,URL,history,location,matchMedia}=window;\n';
  const footer = '\n})(...(()=>{if(typeof module==="object"&&module.exports)return[globalThis.document,globalThis,globalThis,globalThis];const e=window.SiteNavigation.environment();return[e.document,e.window,e.window,e.window];})());\n';
  for (const file of ['home/assets/vendor/d3-7.9.0.min.js','home/assets/astronomy-solar.js']) vm.runInContext(header + read(file) + footer, sandbox);
  assert.equal(typeof owned.d3.geoOrthographic, 'function');
  assert.ok(Math.abs(owned.HomeAstronomy.position(epoch).declination - A.position(epoch).declination) < 1e-9);
  const geography = JSON.parse(read('home/assets/map-land.json'));
  const fraction = owned.d3.geoArea(geography) / (4 * Math.PI);
  assert.ok(fraction > .25 && fraction < .35, 'existing GeoJSON winding represents land');
  assert.ok(globals.has('d3') && globals.has('HomeAstronomy'));
  for (const [key, value] of globals) if (target[key] === value) delete target[key];
  assert.equal(target.d3, undefined); assert.equal(target.HomeAstronomy, undefined);
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
  const ids = ['daily-city','earth-hour','earth-hour-label','daily-local-time','daily-sunrise','daily-sunset','daily-daylength','daily-subsolar','daily-calendar-month','daily-calendar-day','daily-calendar-weekday','daily-calendar-lunar','daily-calendar-term','daily-weather','earth-now'];
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
    assert.ok(h.nodes['daily-calendar-month'].textContent.includes(' · '));
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

test('both templates keep the Earth DOM contract and dependency order', () => {
  const ids = ['daily-earth','earth-canvas','daily-city','earth-hour','earth-hour-label','earth-now','daily-local-time','daily-sunrise','daily-sunset','daily-daylength','daily-subsolar','daily-calendar-month','daily-calendar-day','daily-calendar-weekday','daily-calendar-lunar','daily-calendar-term','daily-weather'];
  for (const file of ['home/index.template.html','home/en/index.template.html']) {
    const html = read(file);
    for (const id of ids) assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, file + ' #' + id);
    const d3 = html.indexOf('src="/assets/vendor/d3-7.9.0.min.js"');
    const astro = html.indexOf('src="/assets/astronomy-solar.js"'), earth = html.indexOf('src="/assets/home-earth.js"');
    assert.ok(d3 >= 0 && astro > d3 && earth > astro, file + ' script order');
  }
});
