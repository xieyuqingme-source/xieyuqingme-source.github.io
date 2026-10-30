'use strict';
const assert = require('node:assert/strict');
const visual = require('../home/assets/home-today-visuals.js');
const DAY = 86400000, BJ = 8 * 3600000;
const startMs = Date.UTC(2026,0,1) - BJ, endMs = Date.UTC(2027,0,1) - BJ;
const quarters = [{name:'春分',longitude:0,atMs:Date.UTC(2026,2,20)},{name:'夏至',longitude:90,atMs:Date.UTC(2026,5,21)},{name:'秋分',longitude:180,atMs:Date.UTC(2026,8,23)},{name:'冬至',longitude:270,atMs:Date.UTC(2026,11,22)}];
function fixture(longitude = 216, elongation = 236) {
  const solarSamples = Array.from({length:366},(_,index) => ({atMs:startMs + index * DAY,declination:23.44 * Math.sin((index - 80) / 365 * Math.PI * 2)}));
  return {instantMs:Date.UTC(2026,9,30,7,10),solar:{longitude,declination:-13.8,obliquity:23.44,earthLongitude:(longitude + 180) % 360},moon:{longitude:(longitude + elongation) % 360,elongation,illumination:(1 - Math.cos(elongation * Math.PI / 180)) / 2},calendar:{terms:Array.from({length:24},(_,index) => ({longitude:index * 15})),currentTermIndex:14,previous:{longitude:210},next:{longitude:225},quarterStart:{longitude:Math.floor(longitude / 90) * 90}},year:{year:2026,startMs,endMs,solarSamples,quarters,monthStarts:Array.from({length:12},(_,month) => Date.UTC(2026,month,1) - BJ)}};
}
function near(actual,expected) { assert(Math.abs(actual - expected) < 1e-10,`${actual} != ${expected}`); }
for (const [angle,expected] of [[0,[10,0]],[90,[0,-10]],[180,[-10,0]],[270,[0,10]]]) {
  const actual = visual.point(0,0,angle,10); actual.forEach((value,index) => near(value,expected[index]));
  const body = visual.litBody(0,0,10,angle,'lit'); assert(body.includes(`data-light-direction="${angle}"`));
}
assert.equal(visual.arc(0,0,1,20,20),'');
assert.match(visual.arc(0,0,10,0,90),/M10 0A10 10 0 0 0 0 -10/);
for (const [angle,expected] of [[0,0],[90,.5],[180,1],[270,.5]]) {
  near(visual.phaseGeometry(angle).illumination,expected);
  assert.equal(visual.phaseGeometry(angle,true).mirror,-visual.phaseGeometry(angle,false).mirror);
}
assert.match(visual.renderPhase(fixture(216,90),{city:{lat:20}}).content,/M40 6A34 34 0 0 1 40 74L40 6Z/);
assert(!visual.renderPhase(fixture(216,0)).content.includes('<path'));
assert.match(visual.renderPhase(fixture(216,180)).content,/<circle cx="40" cy="40" r="34" class="tv-moon-lit"/);
assert.match(visual.renderPhase(fixture(216,90),{city:{lat:-20}}).content,/translate\(80 0\) scale\(-1 1\)/);
assert.match(visual.renderMoon(fixture()).description,/从黄道北极俯看/);
assert.match(visual.renderMoon(fixture(),{english:true}).description,/viewed from ecliptic north/);
for (const english of [false,true]) for (const sun of [0,90,180,270]) for (const phase of [0,90,180,270]) {
  const state = fixture(sun,phase), chart = visual.renderMoon(state,{english});
  const labels = [...chart.content.matchAll(/<text x="([^"]+)" y="([^"]+)" class="tv-label" text-anchor="middle" dominant-baseline="central">([^<]+)<\/text>/g)];
  assert.equal(labels.length,4);
  const moon = visual.point(220,220,state.moon.longitude,130);
  for (const label of labels) {
    const location = [Number(label[1]),Number(label[2])];
    assert(Math.hypot(location[0]-moon[0],location[1]-moon[1]) >= (english ? 45 : 28),'Phase names must clear the moving Moon');
    assert(Math.hypot(location[0]-220,location[1]-220) >= 75,'Phase names must clear the central Earth');
  }
}
for (let sun = 0; sun < 360; sun += 15) for (let moon = 0; moon < 360; moon += 15) {
  const state = fixture(sun,moon-sun), chart = visual.renderMoon(state,{english:true});
  const caption = /<text x="([^"]+)" y="([^"]+)" class="tv-label" text-anchor="middle">Sunlight<\/text>/.exec(chart.content);
  const moonLabel = visual.point(220,220,moon,157); assert(caption);
  assert(Math.hypot(Number(caption[1])-moonLabel[0],Number(caption[2])-moonLabel[1]) >= 60,'Sunlight and Moon names must have separate space');
  assert(Number(caption[1]) >= 30 && Number(caption[1]) <= 410 && Number(caption[2]) >= 20 && Number(caption[2]) <= 420);
}
for (const longitude of [0,90,180,270,359.99]) {
  const state = fixture(longitude), render = visual.renderOrbit(state);
  const earth = visual.point(240,240,state.solar.earthLongitude,146);
  const pole = /<circle cx="([^"]+)" cy="([^"]+)" r="2.4" class="tv-pole"/.exec(render.content);
  assert(pole); assert(Math.abs(Number(pole[1]) - earth[0]) < .01); assert(Number(pole[2]) < earth[1]);
  assert.equal((render.content.match(/class="tv-term/g) || []).length,24);
  assert(!/NaN|undefined/.test(render.content));
}
const split = visual.splitCurve([{atMs:-1,declination:0},{atMs:0,declination:1},{atMs:3,declination:2},{atMs:10,declination:3},{atMs:11,declination:4}],4,9,0,10);
const boundary = fixture(359.999); boundary.calendar.quarterStart = {longitude:0};
assert.match(visual.renderOrbit(boundary).content,/<path d="" class="tv-travelled"/);
assert.deepEqual(split.past,[{atMs:0,declination:1},{atMs:3,declination:2},{atMs:4,declination:9}]);
assert.deepEqual(split.future,[{atMs:4,declination:9},{atMs:10,declination:3}]);
for (const english of [false,true]) for (const width of [280,320,390,768,1024,1440]) {
  const result = visual.renderDeclination(fixture(),{english,width});
  assert.equal((result.content.match(/class="tv-month"/g) || []).length,12);
  assert.equal((result.content.match(/class="tv-key-dot"/g) || []).length,4);
  assert(!/NaN|undefined/.test(result.content));
  const [past,future] = ['tv-curve-past','tv-curve-future'].map(name => new RegExp(`<path d="([^"]+)" class="${name}"`).exec(result.content)[1]);
  const last = past.match(/(?:M|L)([^ML]+)$/)[1], first = future.match(/^M([^ML]+)/)[1]; assert.equal(last,first);
}
for (const [index,latitude] of [0,23.44,0,-23.44].entries()) for (const width of [280,350]) for (const english of [false,true]) {
  const state = fixture(index * 90); state.instantMs = quarters[index].atMs; state.solar.declination = latitude;
  const chart = visual.renderDeclination(state,{width,english}), selected = /<text x="[^"]+" y="([^"]+)" class="tv-label tv-strong"[^>]*>(?:Selected|所选时刻)/.exec(chart.content);
  const southern = /<text x="[^"]+" y="([^"]+)" class="tv-label">(?:南回归线|23\.4°S)/.exec(chart.content);
  const month = /<text x="[^"]+" y="([^"]+)" class="tv-month"/.exec(chart.content);
  assert(selected && southern && month); assert(Number(selected[1]) - Number(southern[1]) >= 16,'Selected row must clear the southern latitude label');
  assert(Number(month[1]) - Number(selected[1]) >= 24,'Selected row must clear the month labels and ticks');
  assert.equal((chart.content.match(/class="tv-key-dot"/g) || []).length,4);
}
// Controller: the offscreen model remains current, and page cleanup owns every observer/frame.
function target(kind) { return {dataset:{todayVisual:kind},clientWidth:320,innerHTML:'',attributes:{},setAttribute(name,value){this.attributes[name] = value;},removeAttribute(name){delete this.attributes[name];}}; }
const targets = ['moon','phase','orbit','declination'].map(target), frames = new Map();
let frameId = 0, intersection, resizes = [], owns = [], disconnected = 0;
const root = {querySelectorAll:() => targets}, doc = {hidden:false,documentElement:{lang:'zh-CN'},querySelector:() => root,addEventListener(){},removeEventListener(){}};
const win = {requestAnimationFrame(fn){frames.set(++frameId,fn);return frameId;},cancelAnimationFrame(id){frames.delete(id);},IntersectionObserver:class {constructor(callback){intersection=callback;}observe(){}disconnect(){disconnected++;}},ResizeObserver:class {constructor(callback){resizes.push(callback);}observe(){}disconnect(){disconnected++;}},addEventListener(){},removeEventListener(){},SiteNavigation:{own(fn){owns.push(fn);}}};
function flush(){const queue=[...frames.values()];frames.clear();queue.forEach(fn=>fn());}
const controller = visual.create(doc,win); assert(controller);
const reservedCurve = targets[3].attributes.viewBox;
assert.equal(reservedCurve,'0 0 320 296'); assert.equal(targets[3].innerHTML,'','Reserving chart height must not render offscreen content');
controller.setState(fixture(),{lat:10});flush();assert(targets.every(svg => svg.innerHTML === ''));
const later = {...fixture(216,90),instantMs:fixture().instantMs + 3600000};controller.setState(later,{lat:-20});
intersection([{target:targets[1],isIntersecting:true}]);flush();assert(targets[1].innerHTML.includes('translate(80 0) scale(-1 1)'));
assert.equal(controller.getState().instantMs,later.instantMs);
intersection(targets.map(svg=>({target:svg,isIntersecting:true})));flush();
const ids = targets.map(svg => svg.attributes['aria-labelledby']); assert.equal(new Set(ids).size,4); assert(targets.every(svg=>svg.attributes.role === 'img'));
assert.equal(targets[3].attributes.viewBox,reservedCurve,'First lazy draw must retain the reserved dimensions');
assert(targets.every(svg=>svg.dataset.renderedInstant === String(later.instantMs)));
targets[3].clientWidth = 800; const oldContent = targets[3].innerHTML; resizes[0]();
assert.equal(targets[3].attributes.viewBox,'0 0 800 214'); assert.equal(targets[3].innerHTML,oldContent,'Resize reserves dimensions before the next draw');
flush(); assert.equal(targets[3].attributes.viewBox,'0 0 800 214');
controller.refresh();assert.equal(frames.size,1);owns[0]();assert.equal(disconnected,2);assert.equal(frames.size,0);assert(controller.getState().disposed);
assert.equal(controller.setState(fixture(),{lat:20}),false);
console.log('PASS: geometry, hemisphere phase, fixed pole, four seasons, curve seams, 24 terms/12 months/4 events, lazy updates and disposal');
