/* NOAA/Meeus solar geometry for a small educational Earth display.
 * Sources: https://gml.noaa.gov/grad/solcalc/calcdetails.html
 *          https://gml.noaa.gov/grad/solcalc/glossary.html
 * Times use a standard apparent solar zenith of 90.833 degrees; terrain is not modelled.
 */
(function (scope, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else scope.HomeAstronomy = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const RAD = Math.PI / 180;
  const DEG = 1 / RAD;
  const MINUTE = 60000;
  const DAY = 86400000;
  const terms = ['春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至','小寒','大寒','立春','雨水','惊蛰'];
  const termsEn = ['Vernal equinox','Clear and bright','Grain rain','Summer begins','Grain buds','Grain in ear','Summer solstice','Slight heat','Great heat','Autumn begins','End of heat','White dew','Autumnal equinox','Cold dew','Frost descent','Winter begins','Light snow','Heavy snow','Winter solstice','Slight cold','Great cold','Spring begins','Rain water','Insects awaken'];
  const normal = value => ((value + 180) % 360 + 360) % 360 - 180;
  function validDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new TypeError('A valid date is required');
    return date;
  }
  function position(value) {
    const date = validDate(value);
    const jd = date.getTime() / DAY + 2440587.5;
    const t = (jd - 2451545) / 36525;
    const meanLongitude = ((280.46646 + t * (36000.76983 + t * .0003032)) % 360 + 360) % 360;
    const anomaly = (357.52911 + t * (35999.05029 - .0001537 * t)) * RAD;
    const eccentricity = .016708634 - t * (.000042037 + .0000001267 * t);
    const centre = Math.sin(anomaly) * (1.914602 - t * (.004817 + .000014 * t))
      + Math.sin(2 * anomaly) * (.019993 - .000101 * t) + Math.sin(3 * anomaly) * .000289;
    const omega = (125.04 - 1934.136 * t) * RAD;
    const longitude = ((meanLongitude + centre - .00569 - .00478 * Math.sin(omega)) % 360 + 360) % 360;
    const obliquity = (23 + (26 + (21.448 - t * (46.815 + t * (.00059 - t * .001813))) / 60) / 60
      + .00256 * Math.cos(omega)) * RAD;
    const y = Math.tan(obliquity / 2) ** 2;
    const equationMinutes = 4 * DEG * (y * Math.sin(2 * meanLongitude * RAD)
      - 2 * eccentricity * Math.sin(anomaly)
      + 4 * eccentricity * y * Math.sin(anomaly) * Math.cos(2 * meanLongitude * RAD)
      - .5 * y * y * Math.sin(4 * meanLongitude * RAD)
      - 1.25 * eccentricity * eccentricity * Math.sin(2 * anomaly));
    const declination = Math.asin(Math.sin(obliquity) * Math.sin(longitude * RAD)) * DEG;
    const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60 + date.getUTCMilliseconds() / 60000;
    return {declination, longitude, earthLongitude: (longitude + 180) % 360,
      distanceAU: 1.000001018 * (1 - eccentricity * eccentricity) / (1 + eccentricity * Math.cos(anomaly + centre * RAD)),
      obliquity: obliquity * DEG, equationMinutes,
      subsolarLongitude: normal((720 - utcMinutes - equationMinutes) / 4)};
  }
  function dateParts(value, timeZone = 'Asia/Shanghai') {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(validDate(value));
    const field = type => Number(parts.find(part => part.type === type).value);
    return {year: field('year'), month: field('month'), day: field('day')};
  }
  function riseSet(value, observer) {
    const date = validDate(value);
    const latitude = Number(observer.lat), longitude = Number(observer.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new RangeError('Invalid observer coordinates');
    const local = dateParts(date, observer.tz || 'UTC');
    const base = Date.UTC(local.year, local.month - 1, local.day);
    let noon = 720 - 4 * longitude;
    for (let i = 0; i < 3; i++) noon = 720 - 4 * longitude - position(base + noon * MINUTE).equationMinutes;
    const atNoon = position(base + noon * MINUTE);
    const hourAngle = solar => (Math.cos(90.833 * RAD) - Math.sin(latitude * RAD) * Math.sin(solar.declination * RAD))
      / (Math.cos(latitude * RAD) * Math.cos(solar.declination * RAD));
    const cosine = hourAngle(atNoon);
    if (cosine > 1) return {rise: null, set: null, daylightMinutes: 0, polar: 'night'};
    if (cosine < -1) return {rise: null, set: null, daylightMinutes: 1440, polar: 'day'};
    function event(sign) {
      let minutes = noon + sign * 4 * Math.acos(Math.max(-1, Math.min(1, cosine))) * DEG;
      for (let i = 0; i < 4; i++) {
        const solar = position(base + minutes * MINUTE);
        const c = hourAngle(solar);
        if (c > 1 || c < -1) return null;
        minutes = 720 - 4 * longitude - solar.equationMinutes + sign * 4 * Math.acos(c) * DEG;
      }
      return new Date(base + minutes * MINUTE);
    }
    const rise = event(-1), set = event(1);
    return {rise, set, daylightMinutes: rise && set ? Math.max(0, Math.min(1440, (set - rise) / MINUTE)) : null, polar: null};
  }
  function altitude(value, latitude, longitude) {
    const solar = position(value);
    const sine = Math.sin(latitude * RAD) * Math.sin(solar.declination * RAD)
      + Math.cos(latitude * RAD) * Math.cos(solar.declination * RAD) * Math.cos((longitude - solar.subsolarLongitude) * RAD);
    return Math.asin(Math.max(-1, Math.min(1, sine))) * DEG;
  }
  function term(value, english = false) {
    const index = Math.floor(position(value).longitude / 15) % 24;
    return (english ? termsEn : terms)[index];
  }
  function lunar(value, timeZone = 'Asia/Shanghai', english = false) {
    try {
      if (english) return new Intl.DateTimeFormat('en-u-ca-chinese', {timeZone, year: 'numeric', month: 'long', day: 'numeric'}).format(validDate(value));
      const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {timeZone, year: 'numeric', month: 'long', day: 'numeric'}).formatToParts(validDate(value));
      const field = type => parts.find(part => part.type === type)?.value || '';
      const days = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
      return (field('yearName') || field('relatedYear')) + '年' + field('month') + (days[Number(field('day')) - 1] || field('day'));
    } catch (_) { return english ? 'Lunar calendar unavailable' : '农历暂不可用'; }
  }
  // Low-precision lunar longitude and horizontal parallax for an educational display.
  // Event timing is checked against USNO primary-phase fixtures:
  // https://aa.usno.navy.mil/data/api.html
  const BEIJING = 8 * 3600000;
  const wrap = value => ((value % 360) + 360) % 360;
  const signed = value => wrap(value + 180) - 180;
  const keys = ['new','firstQuarter','full','lastQuarter'];
  const targets = [0,90,180,270];
  const namesZh = ['新月','上弦月','满月','下弦月'];
  const namesEn = ['New moon','First quarter','Full moon','Last quarter'];
  function millis(value) {
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (!Number.isFinite(ms)) throw new TypeError('A valid date is required');
    return ms;
  }
  function beijingDayIndex(value) { return Math.floor((millis(value) + BEIJING) / DAY); }
  function moonPosition(value) {
    const t = (millis(value) / DAY + 2440587.5 - 2451545) / 36525;
    const sin = a => Math.sin(a * RAD), cos = a => Math.cos(a * RAD);
    const longitude = wrap(218.32 + 481267.881 * t
      + 6.29 * sin(135 + 477198.87 * t) - 1.27 * sin(259.3 - 413335.36 * t)
      + .66 * sin(235.7 + 890534.22 * t) + .21 * sin(269.9 + 954397.74 * t)
      - .19 * sin(357.5 + 35999.05 * t) - .11 * sin(186.5 + 966404.03 * t));
    const horizontalParallax = .9508 + .0518 * cos(135 + 477198.87 * t)
      + .0095 * cos(259.3 - 413335.36 * t) + .0078 * cos(235.7 + 890534.22 * t)
      + .0028 * cos(269.9 + 954397.74 * t);
    return {longitude,distanceKm:6378.14 / Math.sin(horizontalParallax * RAD)};
  }
  function elongation(value) { return wrap(moonPosition(value).longitude - position(value).longitude); }
  function phaseIndex(target) {
    const index = typeof target === 'string' ? keys.indexOf(target) : targets.indexOf(target);
    if (index < 0) throw new RangeError('A principal phase key or angle is required');
    return index;
  }
  function nextMoonPhase(value, target) {
    const start = millis(value), index = phaseIndex(target), angle = targets[index];
    const residual = at => signed(elongation(at) - angle);
    let left = start, fl = residual(left);
    // Inclusive at an already-computed root, otherwise the next future event.
    if (Math.abs(fl) < 1e-8) return {key:keys[index],longitude:angle,atMs:left,dayIndex:beijingDayIndex(left)};
    for (let step = 1; step <= 33 * 4; step++) {
      let right = start + step * DAY / 4, fr = residual(right);
      // A +180/-180 wrap is not an event; the phase crossing increases through 0.
      if (fl <= 0 && fr >= 0 && fr - fl < 180) {
        for (let iteration = 0; iteration < 48 && right - left > 1; iteration++) {
          const middle = (left + right) / 2;
          if (residual(middle) < 0) left = middle; else right = middle;
        }
        const atMs = (left + right) / 2;
        return {key:keys[index],longitude:angle,atMs,dayIndex:beijingDayIndex(atMs)};
      }
      left = right; fl = fr;
    }
    throw new RangeError('A principal phase was not bracketed within 33 days');
  }
  function phaseEvents(value) {
    const ms = millis(value), today = beijingDayIndex(ms);
    return keys.map(key => nextMoonPhase(ms,key)).sort((a,b) => a.atMs - b.atMs)
      .map(event => ({...event,days:event.dayIndex - today}));
  }
  function moonPhase(value, english = false) {
    const ms = millis(value), today = beijingDayIndex(ms), midnight = today * DAY - BEIJING;
    const nextEvents = phaseEvents(ms);
    const principalToday = keys.map(key => nextMoonPhase(midnight,key)).find(event => event.dayIndex === today) || null;
    const angle = elongation(ms), fraction = angle / 360;
    const quadrant = Math.floor(angle / 90);
    const phaseKey = principalToday?.key || ['waxingCrescent','waxingGibbous','waningGibbous','waningCrescent'][quadrant];
    const principalIndex = principalToday ? keys.indexOf(principalToday.key) : -1;
    const name = principalIndex >= 0 ? (english ? namesEn : namesZh)[principalIndex]
      : (english ? ['Waxing crescent','Waxing gibbous','Waning gibbous','Waning crescent'] : ['蛾眉月','盈凸月','亏凸月','残月'])[quadrant];
    const withDays = event => ({...event,days:event.dayIndex - today});
    return {...moonPosition(ms),elongation:angle,fraction,illumination:(1 - Math.cos(angle * RAD)) / 2,
      phaseKey,name,principalToday,next:withDays(nextEvents[0]),
      nextNew:withDays(nextEvents.find(event => event.key === 'new')),
      nextFull:withDays(nextEvents.find(event => event.key === 'full'))};
  }
  // Public city data and validation are independent of the astronomical calculations.
  // Both the day card and the lazy globe use this one observer model.
  const cityModel = (() => {
    const entries = [
      ['beijing','北京','Beijing',39.9042,116.4074,'Asia/Shanghai','CN','中国','北京市'],
      ['shanghai','上海','Shanghai',31.2304,121.4737,'Asia/Shanghai','CN','中国','上海市'],
      ['kuala','吉隆坡','Kuala Lumpur',3.139,101.6869,'Asia/Kuala_Lumpur','MY','马来西亚','吉隆坡'],
      ['london','伦敦','London',51.5074,-.1278,'Europe/London','GB','英国','England'],
      ['newyork','纽约','New York',40.7128,-74.006,'America/New_York','US','美国','New York'],
      ['moscow','莫斯科','Moscow',55.7558,37.6173,'Europe/Moscow','RU','俄罗斯','Moscow'],
      ['dubai','迪拜','Dubai',25.2048,55.2708,'Asia/Dubai','AE','阿联酋','Dubai'],
      ['guangzhou','广州','Guangzhou',23.1291,113.2644,'Asia/Shanghai','CN','中国','广东'],
      ['shenzhen','深圳','Shenzhen',22.5431,114.0579,'Asia/Shanghai','CN','中国','广东'],
      ['chengdu','成都','Chengdu',30.5728,104.0668,'Asia/Shanghai','CN','中国','四川'],
      ['hangzhou','杭州','Hangzhou',30.2741,120.1551,'Asia/Shanghai','CN','中国','浙江'],
      ['nanjing','南京','Nanjing',32.0603,118.7969,'Asia/Shanghai','CN','中国','江苏'],
      ['wuhan','武汉','Wuhan',30.5928,114.3055,'Asia/Shanghai','CN','中国','湖北'],
      ['chongqing','重庆','Chongqing',29.563,106.5516,'Asia/Shanghai','CN','中国','重庆市'],
      ['xian','西安','Xi’an',34.3416,108.9398,'Asia/Shanghai','CN','中国','陕西'],
      ['tianjin','天津','Tianjin',39.3434,117.3616,'Asia/Shanghai','CN','中国','天津市'],
      ['mianyang','绵阳','Mianyang',31.4675,104.6796,'Asia/Shanghai','CN','中国','四川']
    ];
    const presets = Object.freeze(Object.assign(Object.create(null),Object.fromEntries(entries.map(([id,name,en,lat,lon,tz,countryCode,country,region]) => [id,Object.freeze({id,name,en,lat,lon,tz,countryCode,country,region})]))));
    const clean = (value,max = 100) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !/[\u0000-\u001f\u007f-\u009f<>]/.test(value) ? value.trim() : '';
    function normalize(value) {
      if (typeof value === 'string') return presets[value] || null;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const name = clean(value.name), en = clean(value.en) || name, tz = clean(value.tz,80), country = clean(value.country);
      if (!name || !country || !tz || !Number.isFinite(value.lat) || !Number.isFinite(value.lon) || Math.abs(value.lat) > 90 || Math.abs(value.lon) > 180) return null;
      try { new Intl.DateTimeFormat('en-GB',{timeZone:tz}).format(0); } catch (_) { return null; }
      const region = value.region === undefined || value.region === '' ? '' : clean(value.region);
      if (value.region && !region) return null;
      const countryCode = typeof value.countryCode === 'string' && /^[A-Z]{2}$/.test(value.countryCode) ? value.countryCode : '';
      const id = clean(value.id,80) || 'custom';
      return Object.freeze({id,name,en,lat:value.lat,lon:value.lon,tz,country,countryCode,region});
    }
    function identity(value) { return `${value.lat.toFixed(5)}|${value.lon.toFixed(5)}|${value.tz}`; }
    function fromResult(value) {
      if (!value || !Number.isInteger(value.id) || value.id < 0) return null;
      return normalize({id:'geo-' + value.id,name:value.name,en:value.name,country:value.country,countryCode:value.country_code,region:value.admin1 || '',lat:value.latitude,lon:value.longitude,tz:value.timezone});
    }
    function countryName(value,english = false) {
      if (value.countryCode && typeof Intl.DisplayNames === 'function') {
        try { return new Intl.DisplayNames([english ? 'en' : 'zh-CN'],{type:'region'}).of(value.countryCode) || value.country; } catch (_) {}
      }
      return value.country;
    }
    function label(value,english = false,full = true) {
      const fields = [english ? value.en : value.name];
      if (full) fields.push(value.region,countryName(value,english),value.tz);
      return [...new Set(fields.filter(Boolean))].join(' · ');
    }
    function decode(raw) {
      if (typeof raw !== 'string') return null;
      if (presets[raw]) return presets[raw];
      try { const saved = JSON.parse(raw || 'null'); return saved?.version === 1 ? normalize(saved.city) : null; } catch (_) { return null; }
    }
    function samePlace(a,b) {
      if (identity(a) === identity(b)) return true;
      const name = value => {
        const compact = value.toLowerCase().replace(/[\s’'·-]/g,'').replace(/市$/,'');
        return compact === 'newyorkcity' || compact === 'nyc' ? 'newyork' : compact;
      };
      const overlap = [name(a.name),name(a.en)].some(value => value === name(b.name) || value === name(b.en));
      return overlap && a.countryCode === b.countryCode && a.tz === b.tz && Math.abs(a.lat - b.lat) < .2 && Math.abs(a.lon - b.lon) < .2;
    }
    function clockCities(selected) {
      const fixed = ['beijing','kuala','london','newyork','moscow'].map(key => presets[key]);
      return fixed.some(place => samePlace(selected,place)) ? [...fixed,presets.dubai] : [selected,...fixed];
    }
    return Object.freeze({presets,normalize,identity,fromResult,label,countryName,decode,samePlace,clockCities});
  })();
  return Object.freeze({position, dateParts, riseSet, altitude, term, lunar, normal, moonPhase, moonPosition, nextMoonPhase, phaseEvents, beijingDayIndex, cityModel});
});
