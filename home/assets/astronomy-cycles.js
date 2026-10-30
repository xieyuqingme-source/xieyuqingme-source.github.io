/* Pure time-cycle snapshot. Calendar dates come only from the already
 * vendored lunar-javascript, matching the page header's Beijing civil-day rule.
 * The injected library is never switched to another language by this module.
 */
(function (scope, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./astronomy-solar.js'));
  else scope.HomeTimeCycles = factory(scope.HomeAstronomy);
})(typeof window !== 'undefined' ? window : globalThis, function (astronomy) {
  'use strict';
  const DAY = 86400000, BEIJING = 8 * 3600000;
  const names = ['春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至','小寒','大寒','立春','雨水','惊蛰'];
  const lunarMonths = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
  const lunarDays = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
  const wrap = x => ((x % 360) + 360) % 360;
  function millis(value) {
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (!Number.isFinite(ms)) throw new TypeError('A valid date is required');
    return ms;
  }
  function dayIndex(value) { return Math.floor((millis(value) + BEIJING) / DAY); }
  function beijingParts(value) {
    const d = new Date(millis(value) + BEIJING);
    return {year:d.getUTCFullYear(),month:d.getUTCMonth() + 1,day:d.getUTCDate()};
  }
  function distanceAU(value) {
    return astronomy.position(value).distanceAU;
  }
  function lunarDate(value,library) {
    const local = beijingParts(value), lunar = library.Solar.fromYmd(local.year,local.month,local.day).getLunar();
    const rawMonth = lunar.getMonth(), month = Math.abs(rawMonth), day = lunar.getDay(), leap = rawMonth < 0;
    return {month,day,leap,zh:(leap ? '闰' : '') + lunarMonths[month - 1] + '月' + lunarDays[day - 1],
      en:`${leap ? 'leap month' : 'month'} ${month}, day ${day}`};
  }
  function eventsForYear(year, library) {
    if (!library?.Solar?.fromYmd) throw new TypeError('The local lunar-javascript Solar API is required');
    const lunar = library.Solar.fromYmd(year,7,1).getLunar();
    // The library sequence begins at the previous December's Heavy Snow.
    // Read the table first so the list and keys have the same current language.
    const table = lunar.getJieQiTable(), list = lunar.getJieQiList();
    return list.map((key,index) => {
      const solar = table[key], longitude = wrap(255 + index * 15), termIndex = longitude / 15;
      const atMs = Date.parse(solar.toYmdHms().replace(' ','T') + '+08:00');
      if (!Number.isFinite(atMs)) throw new TypeError('Invalid local solar-term date');
      return {key:names[termIndex],name:names[termIndex],longitude,termIndex,atMs,dayIndex:dayIndex(atMs)};
    });
  }
  function snapshot(value, library) {
    const instantMs = millis(value), local = beijingParts(instantMs), today = dayIndex(instantMs), year = local.year;
    const startMs = Date.UTC(year,0,1) - BEIJING, endMs = Date.UTC(year + 1,0,1) - BEIJING;
    const daysInYear = dayIndex(endMs) - dayIndex(startMs), dayOfYear = today - dayIndex(startMs) + 1;
    const deduped = new Map();
    for (const y of [year - 1,year,year + 1]) for (const event of eventsForYear(y,library)) deduped.set(event.atMs,event);
    const all = [...deduped.values()].sort((a,b) => a.atMs - b.atMs);
    const civilPrevious = all.filter(event => event.dayIndex <= today).at(-1);
    const civilNext = all.find(event => event.dayIndex > today);
    const withDays = event => ({...event,days:event.dayIndex - today});
    const quarters = all.filter(event => event.longitude % 90 === 0);
    const quarterStart = quarters.filter(event => event.atMs <= instantMs).at(-1);
    const quarterEnd = quarters.find(event => event.atMs > instantMs);
    const keyToday = quarters.find(event => event.dayIndex === today) || null;
    const future = quarters.filter(event => event.atMs > instantMs);
    const solar = astronomy.position(instantMs), lunarPhase = astronomy.moonPhase(instantMs);
    lunarPhase.nextNew = {...lunarPhase.nextNew,lunarDate:lunarDate(lunarPhase.nextNew.atMs,library)};
    const hemisphere = Math.abs(solar.declination) < .000001 ? 'equator' : solar.declination > 0 ? 'north' : 'south';
    const trend = astronomy.position(instantMs + DAY / 2).declination >= astronomy.position(instantMs - DAY / 2).declination ? 'north' : 'south';
    const terms = all.filter(event => event.atMs >= startMs && event.atMs < endMs).sort((a,b) => a.longitude - b.longitude);
    const yearQuarters = terms.filter(event => event.longitude % 90 === 0).sort((a,b) => a.atMs - b.atMs);
    const solarSamples = [{atMs:startMs,declination:astronomy.position(startMs).declination}];
    for (let day = 0; day < daysInYear; day++) {
      const atMs = startMs + (day + .5) * DAY;
      solarSamples.push({atMs,declination:astronomy.position(atMs).declination});
    }
    solarSamples.push({atMs:endMs,declination:astronomy.position(endMs).declination});
    return {instantMs,lunarDate:lunarDate(instantMs,library),
      solar:{...solar,earthLongitude:wrap(solar.longitude + 180),distanceAU:distanceAU(instantMs),hemisphere,trend},
      moon:{...lunarPhase,phaseName:lunarPhase.name},
      calendar:{terms,currentTermIndex:civilPrevious.termIndex,previous:withDays(civilPrevious),next:withDays(civilNext),
        elapsedDays:today - civilPrevious.dayIndex + 1,remainingDays:civilNext.dayIndex - today,
        keyToday,nextTropic:withDays(future.find(event => event.longitude === 90 || event.longitude === 270)),
        nextEquator:withDays(future.find(event => event.longitude === 0 || event.longitude === 180)),
        quarterStart,quarterEnd,seasonFraction:Math.max(0,Math.min(1,(instantMs - quarterStart.atMs) / (quarterEnd.atMs - quarterStart.atMs)))},
      year:{year,startMs,endMs,dayOfYear,daysInYear,progress:(instantMs - startMs) / (endMs - startMs),
        remainingDays:daysInYear - dayOfYear,monthStarts:Array.from({length:13},(_,month) => Date.UTC(year,month,1) - BEIJING),
        solarSamples,quarters:yearQuarters}};
  }
  return Object.freeze({snapshot,eventsForYear,distanceAU,dayIndex,beijingParts,lunarDate});
});
