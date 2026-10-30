'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const A = require('../home/assets/astronomy-solar.js');
const L = require('../home/assets/vendor/lunar-javascript-1.7.7.js');
const M = {position:A.moonPosition,phase:A.moonPhase,nextPhase:A.nextMoonPhase,dayIndex:A.beijingDayIndex,
  elongation:value => A.moonPhase(value).elongation};
const C = require('../home/assets/astronomy-cycles.js');
const DAY = 86400000, BJ = 8 * 3600000;
const fixture = name => JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','today-astronomy',name),'utf8'));
const stamp = item => Date.UTC(item.year,item.month - 1,item.day,...item.time.split(':').map(Number));
const phaseKeys = {'New Moon':'new','First Quarter':'firstQuarter','Full Moon':'full','Last Quarter':'lastQuarter'};
const signed = degrees => ((degrees + 180) % 360 + 360) % 360 - 180;
const moonRows = [2026,2027].flatMap(year => fixture(`raw/moon-${year}.json`).phasedata.filter(row => row.year === year));
const seasons = [2026,2027,2028,2029,2030].flatMap(year => fixture(`raw/seasons-${year}.json`).data.filter(row => ['Equinox','Solstice'].includes(row.phenom)));
const solarLongitude = month => ({3:0,6:90,9:180,12:270})[month];

// Deliberately independent fixture helper: no solar event root is used by the
// calendar model; the calendar always uses lunar-javascript.
function solarRootNear(atMs,target) {
  let left = atMs - DAY, right = atMs + DAY;
  assert.ok(signed(A.position(left).longitude - target) < 0);
  assert.ok(signed(A.position(right).longitude - target) > 0);
  for (let i = 0; i < 42; i++) {
    const mid = (left + right) / 2;
    if (signed(A.position(mid).longitude - target) < 0) left = mid; else right = mid;
  }
  return (left + right) / 2;
}

test('all official source responses remain byte-for-byte auditable',() => {
  const meta = fixture('sources.json');
  assert.equal(meta.sources.length,7);
  for (const source of meta.sources) {
    assert.match(source.url,/^https:\/\/aa\.usno\.navy\.mil\/api\//);
    assert.equal(source.retrieved_at.slice(0,10),'2026-10-30');
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'fixtures','today-astronomy',source.file))).digest('hex');
    assert.equal(hash,source.sha256);
  }
});

test('existing solar geometry stays within 10 minutes for all 20 USNO equinoxes/solstices',() => {
  assert.equal(seasons.length,20);
  for (const row of seasons) {
    const expected = stamp(row), actual = solarRootNear(expected,solarLongitude(row.month));
    assert.ok(Math.abs(actual - expected) <= 10 * 60000,JSON.stringify({row,errorMinutes:(actual - expected) / 60000}));
  }
});

test('the original solar API and all saved solar numeric values remain unchanged',() => {
  const baseline = fixture('solar-baseline.json');
  assert.equal(baseline.source_commit,'4ebdb92fa2bf89f53778e1b17a723ee2db7a74cb');
  for (const key of baseline.apiNames) assert.equal(typeof A[key],key === 'cityModel' ? 'object' : 'function',key + ' remains public');
  assert.deepEqual(JSON.parse(JSON.stringify(A.cityModel.presets)),baseline.cityPresets);
  for (const row of baseline.positions) {
    const actual = A.position(row.atMs);
    for (const key of Object.keys(row.value)) assert.equal(actual[key],row.value[key]);
    assert.equal(actual.earthLongitude,(actual.longitude + 180) % 360);
    assert.equal(actual.distanceAU,C.distanceAU(row.atMs));
    assert.ok(actual.distanceAU > .98 && actual.distanceAU < 1.02);
  }
  for (const row of baseline.observers) {
    assert.deepEqual(JSON.parse(JSON.stringify(A.riseSet(row.atMs,row.observer))),row.riseSet);
    assert.equal(A.altitude(row.atMs,row.observer.lat,row.observer.lon),row.altitude);
    assert.deepEqual(A.dateParts(row.atMs,row.observer.tz),row.dateParts);
  }
  for (const row of baseline.calendars) {
    assert.equal(A.term(row.atMs,row.english),row.term);
    assert.equal(A.lunar(row.atMs,'Asia/Shanghai',row.english),row.lunar);
  }
});

test('lunar-javascript event times, used for display, also stay within the solar tolerance',() => {
  L.I18n.setLanguage('chs');
  for (const row of seasons) {
    const event = C.eventsForYear(row.year,L).find(event => event.longitude === solarLongitude(row.month) && C.beijingParts(event.atMs).year === row.year);
    assert.ok(event);
    assert.ok(Math.abs(event.atMs - stamp(row)) <= 10 * 60000,JSON.stringify(row));
  }
});

test('all 99 main lunar phases in 2026–27 stay within 60 minutes and the same Beijing date',() => {
  assert.equal(moonRows.length,99);
  for (const row of moonRows) {
    const expected = stamp(row), event = M.nextPhase(expected - DAY,phaseKeys[row.phase]);
    assert.ok(Math.abs(event.atMs - expected) <= 60 * 60000,JSON.stringify({row,errorMinutes:(event.atMs - expected) / 60000}));
    assert.equal(M.dayIndex(event.atMs),M.dayIndex(expected),JSON.stringify(row));
    assert.ok(Math.abs(signed(M.elongation(event.atMs) - event.longitude)) < .00001);
  }
});

test('principal names cover the entire Beijing event day; adjacent days retain quadrant names',() => {
  const principal = new Set(Object.values(phaseKeys));
  for (const row of moonRows) {
    const day = M.dayIndex(stamp(row)), midnight = day * DAY - BJ, key = phaseKeys[row.phase];
    for (const at of [midnight,midnight + DAY / 2,midnight + DAY - 1]) assert.equal(M.phase(at).phaseKey,key,JSON.stringify(row));
    assert.ok(!principal.has(M.phase(midnight - 1).phaseKey));
    assert.ok(!principal.has(M.phase(midnight + DAY).phaseKey));
  }
});

test('next phase is monotonic through 0 degrees and does not confuse the opposite crossing',() => {
  for (const key of Object.values(phaseKeys)) {
    const event = M.nextPhase('2026-12-25T00:00:00Z',key);
    const before = M.nextPhase(event.atMs - 1000,key), after = M.nextPhase(event.atMs + 1000,key);
    assert.ok(Math.abs(before.atMs - event.atMs) < 2);
    assert.ok(after.atMs > event.atMs + 25 * DAY);
    assert.ok(after.atMs < event.atMs + 33 * DAY);
  }
  assert.throws(() => M.position('invalid'),TypeError);
  assert.throws(() => M.nextPhase(0,'eclipse'),RangeError);
});

test('illumination and distance remain physical across the fixture date range',() => {
  for (let at = Date.UTC(2026,0,1); at < Date.UTC(2028,0,1); at += DAY) {
    const p = M.phase(at);
    assert.ok(p.longitude >= 0 && p.longitude < 360);
    assert.ok(p.illumination >= 0 && p.illumination <= 1);
    assert.ok(p.distanceKm > 350000 && p.distanceKm < 410000);
    assert.ok(C.distanceAU(at) > .98 && C.distanceAU(at) < 1.02);
  }
});

test('every next new moon reached from 2026–27 falls on lunar day one',() => {
  for (let at = Date.UTC(2026,0,1); at < Date.UTC(2028,0,1); at += DAY) {
    const event = A.moonPhase(at).nextNew, local = C.beijingParts(event.atMs);
    const lunar = L.Solar.fromYmd(local.year,local.month,local.day).getLunar();
    assert.equal(lunar.getDay(),1,JSON.stringify({at:new Date(at).toISOString(),event}));
  }
});

test('calendar dates and countdowns match the existing header on every 2026–30 term date and the day before',() => {
  L.I18n.setLanguage('chs');
  for (let year = 2026; year <= 2030; year++) {
    const annual = C.eventsForYear(year,L).filter(event => C.beijingParts(event.atMs).year === year);
    for (const event of annual) for (const offset of [-1,0]) {
      const at = (event.dayIndex + offset) * DAY - BJ + 30 * 60000;
      const local = C.beijingParts(at), lunar = L.Solar.fromYmd(local.year,local.month,local.day).getLunar();
      const previous = lunar.getPrevJieQi(true), next = lunar.getNextJieQi(true), s = C.snapshot(at,L);
      const ymdIndex = date => Math.floor(Date.parse(date + 'T00:00:00Z') / DAY);
      assert.equal(s.calendar.previous.name,previous.getName());
      assert.equal(s.calendar.next.name,next.getName());
      assert.equal(s.calendar.elapsedDays,C.dayIndex(at) - ymdIndex(previous.getSolar().toYmd()) + 1);
      assert.equal(s.calendar.remainingDays,ymdIndex(next.getSolar().toYmd()) - C.dayIndex(at));
      assert.equal(s.calendar.terms.length,24);
    }
  }
});

test('Beijing 00:30 and 23:30 events use civil days across year and leap boundaries',() => {
  for (const event of ['2027-01-01T00:30:00+08:00','2027-01-01T23:30:00+08:00','2028-02-29T00:30:00+08:00','2028-02-29T23:30:00+08:00']) {
    const at = Date.parse(event), midnight = C.dayIndex(at) * DAY - BJ;
    assert.equal(C.dayIndex(at) - C.dayIndex(midnight - 1),1);
    assert.equal(C.dayIndex(at) - C.dayIndex(midnight),0);
    assert.equal(C.dayIndex(midnight + DAY) - C.dayIndex(at),1);
  }
  const leap = C.snapshot('2028-02-29T12:00:00+08:00',L), start = C.snapshot('2027-01-01T00:00:00+08:00',L);
  assert.equal(leap.year.dayOfYear,60); assert.equal(leap.year.daysInYear,366);
  assert.equal(start.year.dayOfYear,1); assert.equal(start.year.progress,0);
  assert.equal(leap.year.solarSamples[0].atMs,leap.year.startMs);
  assert.equal(leap.year.solarSamples.at(-1).atMs,leap.year.endMs);
  assert.ok(leap.year.solarSamples.every(p => p.atMs >= leap.year.startMs && p.atMs <= leap.year.endMs));
});

test('season narratives cover all four quarters, event-day overrides and cross-year targets',() => {
  const cases = [
    ['2026-01-30T12:00:00+08:00','south','north','夏至','春分'],
    ['2026-04-30T12:00:00+08:00','north','north','夏至','秋分'],
    ['2026-07-30T12:00:00+08:00','north','south','冬至','秋分'],
    ['2026-10-30T12:00:00+08:00','south','south','冬至','春分']
  ];
  for (const [at,hemisphere,trend,tropic,equator] of cases) {
    const s = C.snapshot(at,L);
    assert.equal(s.solar.hemisphere,hemisphere); assert.equal(s.solar.trend,trend);
    assert.equal(s.calendar.nextTropic.name,tropic); assert.equal(s.calendar.nextEquator.name,equator);
    assert.ok(s.calendar.seasonFraction >= 0 && s.calendar.seasonFraction <= 1);
  }
  for (const event of C.snapshot('2026-10-30',L).year.quarters) {
    for (const minute of [30,23 * 60 + 30]) {
      const s = C.snapshot(event.dayIndex * DAY - BJ + minute * 60000,L);
      assert.equal(s.calendar.keyToday.key,event.key);
    }
  }
});

test('year progress follows the selected instant; next seasonal targets include a future event today',() => {
  const base = C.snapshot('2026-10-30',L), atMorning = C.snapshot('2026-10-30T00:30:00+08:00',L), atNight = C.snapshot('2026-10-30T23:30:00+08:00',L);
  assert.ok(atNight.year.progress > atMorning.year.progress);
  assert.ok(Math.abs(atNight.year.progress - atMorning.year.progress - 23 * 3600000 / (atNight.year.endMs - atNight.year.startMs)) < 1e-12);
  assert.equal(atNight.year.remainingDays,atMorning.year.remainingDays);
  for (const event of base.year.quarters) {
    const field = event.longitude === 90 || event.longitude === 270 ? 'nextTropic' : 'nextEquator';
    for (const at of [event.dayIndex * DAY - BJ + 30 * 60000,event.dayIndex * DAY - BJ + (23 * 60 + 30) * 60000,event.atMs - 1,event.atMs + 1]) {
      const s = C.snapshot(at,L);
      assert.equal(s.calendar.keyToday.key,event.key);
      if (at < event.atMs) { assert.equal(s.calendar[field].atMs,event.atMs); assert.equal(s.calendar[field].days,0); }
      else assert.ok(s.calendar[field].atMs > event.atMs);
    }
    const exactly = C.snapshot(event.atMs,L); assert.ok(exactly.calendar[field].atMs > event.atMs);
  }
});

test('snapshot remains deterministic through English/Chinese library changes and does not switch language',() => {
  const at = '2026-12-22T03:00:00+08:00';
  L.I18n.setLanguage('chs'); const chinese = C.snapshot(at,L);
  L.I18n.setLanguage('en'); const english = C.snapshot(at,L);
  assert.equal(L.I18n.getLanguage(),'en');
  assert.deepEqual(english,chinese);
  L.I18n.setLanguage('chs');
  assert.deepEqual(C.snapshot(at,L),chinese);
});

test('browser UMD publishes one astronomy source and the cycle API without extra resources',() => {
  const context = vm.createContext({Date,Intl,console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../home/assets/astronomy-solar.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../home/assets/astronomy-cycles.js'),'utf8'),context);
  assert.equal(context.HomeAstronomy.moonPhase('2026-10-30T07:10:00Z').phaseKey,'waningGibbous');
  assert.equal(context.HomeTimeCycles.snapshot('2026-10-30T07:10:00Z',L).calendar.nextTropic.days,53);
});

