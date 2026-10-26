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
    return {declination, longitude, obliquity: obliquity * DEG, equationMinutes,
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
  return Object.freeze({position, dateParts, riseSet, altitude, term, lunar, normal});
});
