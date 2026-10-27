/* Homepage almanac, local solar geometry and a city-based weather forecast.
 * Weather: https://open-meteo.com/en/docs (free non-commercial endpoint).
 * Geography: the site's existing Natural Earth land geometry; no visitor location is requested.
 */
(function (scope) {
  'use strict';
  const CITIES = Object.freeze({
    beijing: {name: '北京',en: 'Beijing',lat: 39.9042,lon: 116.4074,tz: 'Asia/Shanghai'},
    shanghai: {name: '上海',en: 'Shanghai',lat: 31.2304,lon: 121.4737,tz: 'Asia/Shanghai'},
    kuala: {name: '吉隆坡',en: 'Kuala Lumpur',lat: 3.139,lon: 101.6869,tz: 'Asia/Kuala_Lumpur'},
    london: {name: '伦敦',en: 'London',lat: 51.5074,lon: -.1278,tz: 'Europe/London'}
  });
  function createEarth(document, window, options = {}) {
    const root = document.querySelector('#daily-earth');
    if (!root || root.dataset.earthReady === 'true') return null;
    const glance = document.querySelector('.daily-home')?.dataset.briefMode === 'glance';
    const astro = window.HomeAstronomy;
    if (!astro) return null;
    root.dataset.earthReady = 'true';
    const find = id => document.getElementById(id);
    const canvas = find('earth-canvas');
    let context = null;
    try { context = canvas?.getContext?.('2d') || null; } catch (_) {}
    const cityInput = find('daily-city'), hourInput = find('earth-hour');
    const language = () => (window.SiteI18n?.lang?.() || document.documentElement.lang || 'zh-CN').startsWith('en');
    const text = (zh, en) => language() ? en : zh;
    const state = {city: 'beijing',demo: false,hour: 12,demoDay: null,viewLon: 110,viewLat: 16};
    const cleanup = [];
    let disposed = false, paused = false, geography = null, weatherTicket = 0, weatherRequest = null, drawFrame = null, weatherResult = null;
    const TIMEOUT = 8000, CACHE_AGE = 30 * 60000, STALE_AGE = 24 * 3600000;
    const cityKey = 'xieyuqing-home-city-v1', cacheKey = city => 'xieyuqing-weather-v1:' + city;
    if (!glance) try { const saved = window.localStorage.getItem(cityKey); if (CITIES[saved]) state.city = saved; } catch (_) {}
    if (!glance && options.globeOnly && CITIES[cityInput?.value]) state.city = cityInput.value;
    state.viewLon = CITIES[state.city].lon;
    state.viewLat = Math.max(-25, Math.min(35, CITIES[state.city].lat * .6));
    function write(id, value) { const node = find(id); if (node) node.textContent = value; }
    function listen(target, type, handler, options) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, handler, options);
      cleanup.push(() => target.removeEventListener(type, handler, options));
    }
    function onCleanup(fn) { cleanup.push(fn); }
    function currentDate() {
      if (!state.demo || !state.demoDay) return new Date();
      return new Date(Date.UTC(state.demoDay.year, state.demoDay.month - 1, state.demoDay.day) + (state.hour - 8) * 3600000);
    }
    function clock(date, zone) {
      return new Intl.DateTimeFormat(language() ? 'en-GB' : 'zh-CN', {timeZone: zone,hour: '2-digit',minute: '2-digit',hourCycle: 'h23'}).format(date);
    }
    function dateStamp(date, zone) {
      return new Intl.DateTimeFormat(language() ? 'en-GB' : 'zh-CN', {timeZone: zone,month: '2-digit',day: '2-digit'}).format(date);
    }
    function angle(value, north, south) { return (value < 0 ? south : north) + ' ' + Math.abs(value).toFixed(2) + '°'; }
    function renderFacts() {
      if (disposed || paused) return;
      const date = currentDate(), city = CITIES[state.city], solar = astro.position(date);
      const local = astro.dateParts(date, city.tz), beijing = astro.dateParts(date, 'Asia/Shanghai');
      if (!options.globeOnly) {
      const month = new Intl.DateTimeFormat(language() ? 'en-GB' : 'zh-CN', {timeZone: city.tz,month: 'long'}).format(date);
      write('daily-calendar-month', local.year + ' · ' + (language() ? month.toUpperCase() : month));
      write('daily-calendar-day', String(local.day));
      write('daily-calendar-weekday', new Intl.DateTimeFormat(language() ? 'en-GB' : 'zh-CN', {timeZone: city.tz,weekday: 'long'}).format(date));
      write('daily-calendar-lunar', (language() ? 'Lunar · ' : '农历') + astro.lunar(date, city.tz, language()));
      write('daily-calendar-term', astro.term(date, language()));
      }
      const above = astro.altitude(date, city.lat, city.lon) >= 0;
      write('daily-local-time', (language() ? city.en : city.name) + ' · ' + dateStamp(date, city.tz) + ' ' + clock(date, city.tz) + ' · ' + text(above ? '白昼' : '夜间', above ? 'Day' : 'Night'));
      write('daily-subsolar', language() ? angle(solar.declination, 'N', 'S') + ' · ' + angle(solar.subsolarLongitude, 'E', 'W')
        : angle(solar.declination, '北纬', '南纬') + ' · ' + angle(solar.subsolarLongitude, '东经', '西经'));
      const events = astro.riseSet(date, city);
      const polar = events.polar === 'day' ? text('极昼', 'Polar day') : events.polar === 'night' ? text('极夜', 'Polar night') : text('暂无太阳事件', 'No solar event');
      write('daily-sunrise', events.rise ? clock(new Date(Math.round(events.rise.getTime() / 60000) * 60000), city.tz) : polar);
      write('daily-sunset', events.set ? clock(new Date(Math.round(events.set.getTime() / 60000) * 60000), city.tz) : polar);
      const duration = Number.isFinite(events.daylightMinutes) ? Math.round(events.daylightMinutes) : null;
      write('daily-daylength', duration === null ? text('今日太阳事件需进一步计算', 'Solar events unavailable') : text('白昼约 ', 'Daylight ≈ ') + Math.floor(duration / 60) + text(' 时 ', ' h ') + String(duration % 60).padStart(2, '0') + text(' 分', ' min'));
      const actual = new Date();
      write('daily-moon-phase', text('月相 · ', 'Moon phase · ') + astro.moonPhase(actual, language()).name);
      const clocks = find('daily-world-clocks');
      if (clocks) {
        clocks.replaceChildren();
        const cities = [CITIES.beijing,CITIES.kuala,CITIES.london,{name: '纽约',en: 'New York',lat: 40.7128,lon: -74.006,tz: 'America/New_York'}];
        for (const place of cities) {
          const item = document.createElement('div');
          const daytime = astro.altitude(actual, place.lat, place.lon) >= 0;
          item.textContent = (language() ? place.en : place.name) + ' · ' + clock(actual, place.tz) + ' · ' + text(daytime ? '白天' : '夜晚', daytime ? 'Day' : 'Night');
          clocks.append(item);
        }
      }
      if (cityInput) cityInput.value = state.city;
      if (hourInput) {
        const hour = state.demo ? state.hour : Number(new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Shanghai',hour: '2-digit',hourCycle: 'h23'}).format(date))
          + Number(new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Shanghai',minute: '2-digit'}).format(date)) / 60;
        hourInput.value = String(hour);
      }
      write('earth-hour-label', (state.demo ? text('演示 · ', 'Demo · ') : text('实时 · ', 'Live · ')) + clock(date, 'Asia/Shanghai') + text(' 北京时间', ' Beijing time'));
      const now = find('earth-now');
      if (now) { now.hidden = !state.demo; now.textContent = text('回到实时', 'Return to live'); }
      if (root.dataset) root.dataset.earthMode = state.demo ? 'demo' : 'live';
      if (canvas) canvas.setAttribute('aria-label', text('地球昼夜图：', 'Earth day and night: ') + (language() ? city.en : city.name) + ' ' + clock(date, city.tz) + (find('daily-subsolar') ? '；' + text('太阳直射点 ', 'Subsolar point ') + find('daily-subsolar').textContent : ''));
      // The slider always uses a Beijing civil day, while city facts use their own local dates.
      if (!state.demo) state.demoDay = beijing;
      renderGlobe();
    }
    function palette(name, fallback) {
      const value = window.getComputedStyle(root).getPropertyValue(name).trim();
      return value || fallback;
    }
    function renderGlobe() {
      if (!context || !canvas || disposed || paused) return;
      const d3 = window.d3, bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, bounds.width || 240), height = width * 1.02, ratio = Math.min(window.devicePixelRatio || 1, 2);
      const pixels = Math.round(width * ratio), rows = Math.round(height * ratio);
      if (canvas.width !== pixels) canvas.width = pixels;
      if (canvas.height !== rows) canvas.height = rows;
      context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      const dark = document.documentElement.dataset.theme === 'dark';
      const ink = palette('--yl-ink', palette('--ink', dark ? '#d8e6d8' : '#234b3c'));
      const sea = palette('--yl-sea', dark ? '#38544a' : '#dbe6dc'), land = palette('--yl-land', dark ? '#96b49a' : '#77977d');
      const line = palette('--line', dark ? '#506556' : '#bfcdbf'), accent = palette('--yl-rust', dark ? '#e4a380' : '#a44c33');
      const radius = width * .405, x = width / 2, y = height * .475;
      if (!d3?.geoOrthographic || !geography) {
        const gradient = context.createRadialGradient(x - radius * .3, y - radius * .4, 0, x, y, radius);
        gradient.addColorStop(0, sea); gradient.addColorStop(1, land);
        context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fillStyle = gradient; context.fill();
        context.font = '12px sans-serif'; context.fillStyle = ink; context.textAlign = 'center';
        context.fillText(geography === false ? text('地球底图暂不可用', 'Map unavailable') : text('地球底图加载中', 'Loading Earth'), x, y);
        return;
      }
      const sun = astro.position(currentDate()), city = CITIES[state.city];
      const projection = d3.geoOrthographic().translate([x, y]).scale(radius).rotate([-state.viewLon, -state.viewLat, -11]).clipAngle(90);
      const path = d3.geoPath(projection, context);
      // Axis endpoints use exactly the map projection. Its screen angle depends on
      // the viewing direction; the real obliquity is relative to the orbit normal.
      const north = projection([0, 90]), south = projection([0, -90]);
      const axisTip = point => [x + (point[0] - x) * 1.19, y + (point[1] - y) * 1.19];
      const northTip = axisTip(north), southTip = axisTip(south);
      context.beginPath(); context.moveTo(southTip[0], southTip[1]); context.lineTo(northTip[0], northTip[1]);
      context.strokeStyle = ink; context.globalAlpha = .65; context.lineWidth = .8; context.setLineDash([3, 3]); context.stroke(); context.setLineDash([]); context.globalAlpha = 1;
      context.beginPath(); path({type: 'Sphere'}); context.fillStyle = sea; context.fill();
      context.save(); context.beginPath(); path({type: 'Sphere'}); context.clip();
      context.beginPath(); path(geography); context.fillStyle = land; context.fill();
      context.beginPath(); path(d3.geoGraticule().step([30, 30])()); context.strokeStyle = ink; context.globalAlpha = .18; context.lineWidth = .55; context.stroke(); context.globalAlpha = 1;
      const parallel = latitude => ({type: 'LineString',coordinates: Array.from({length: 181}, (_, i) => [-180 + i * 2, latitude])});
      context.beginPath(); path(parallel(0)); context.strokeStyle = ink; context.globalAlpha = .56; context.lineWidth = .85; context.stroke();
      context.beginPath(); path(parallel(sun.obliquity)); path(parallel(-sun.obliquity)); context.setLineDash([2.5, 3]); context.globalAlpha = .42; context.lineWidth = .65; context.stroke(); context.setLineDash([]); context.globalAlpha = 1;
      context.beginPath(); path(d3.geoCircle().center([astro.normal(sun.subsolarLongitude + 180), -sun.declination]).radius(90).precision(2)());
      context.fillStyle = palette('--yl-night', dark ? 'rgba(3,14,8,.65)' : 'rgba(17,45,38,.43)'); context.fill();
      const shade = context.createRadialGradient(x - radius * .3, y - radius * .4, radius * .1, x, y, radius);
      shade.addColorStop(0, 'rgba(255,255,255,.13)'); shade.addColorStop(.72, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.16)');
      context.fillStyle = shade; context.fillRect(0, 0, width, height); context.restore();
      context.beginPath(); path({type: 'Sphere'}); context.strokeStyle = line; context.lineWidth = .8; context.stroke();
      const visible = (longitude, latitude) => d3.geoDistance([state.viewLon, state.viewLat], [longitude, latitude]) < Math.PI / 2 - .02;
      if (visible(sun.subsolarLongitude, sun.declination)) {
        const point = projection([sun.subsolarLongitude, sun.declination]);
        context.beginPath(); context.arc(point[0], point[1], 4, 0, Math.PI * 2); context.fillStyle = accent; context.fill();
        context.beginPath(); context.arc(point[0], point[1], 7.5, 0, Math.PI * 2); context.strokeStyle = accent; context.lineWidth = .8; context.stroke();
      }
      if (visible(city.lon, city.lat)) {
        const point = projection([city.lon, city.lat]);
        context.beginPath(); context.arc(point[0], point[1], 3, 0, Math.PI * 2); context.fillStyle = ink; context.fill();
        context.lineWidth = 1.4; context.strokeStyle = sea; context.stroke();
        if (width > 175) { context.font = '11px sans-serif'; context.textAlign = point[0] > width * .7 ? 'right' : 'left'; context.fillText(language() ? city.en : city.name, point[0] + (point[0] > width * .7 ? -8 : 8), point[1] - 7); }
      }
      context.strokeStyle = line; context.lineWidth = .65; context.beginPath(); context.arc(x, y, radius + 8, -Math.PI * .83, -Math.PI * .17); context.stroke();
      for (let i = 0; i < 7; i++) { const angle = -Math.PI * .83 + i * Math.PI * .66 / 6; context.beginPath(); context.moveTo(x + Math.cos(angle) * (radius + 6), y + Math.sin(angle) * (radius + 6)); context.lineTo(x + Math.cos(angle) * (radius + 10), y + Math.sin(angle) * (radius + 10)); context.stroke(); }
      context.font = '11px sans-serif'; context.textAlign = 'center'; context.fillStyle = ink; context.fillText('N', northTip[0], northTip[1] - 4);
    }
    function requestDraw() {
      if (drawFrame !== null || disposed || paused) return;
      drawFrame = window.requestAnimationFrame(() => { drawFrame = null; renderGlobe(); });
    }
    function weatherCode(code) {
      if (code === 0) return text('晴', 'Clear');
      if (code <= 3) return text('多云', 'Cloudy');
      if (code <= 48) return text('雾', 'Fog');
      if (code <= 57) return text('毛毛雨', 'Drizzle');
      if (code <= 67) return text('雨', 'Rain');
      if (code <= 77) return text('雪', 'Snow');
      if (code <= 82) return text('阵雨', 'Rain showers');
      if (code <= 86) return text('阵雪', 'Snow showers');
      return text('雷暴', 'Thunderstorm');
    }
    function renderWeather() {
      const node = find('daily-weather'); if (!node || disposed) return;
      node.replaceChildren();
      if (weatherResult?.city === state.city) {
        const current = document.createElement('strong'); current.textContent = Math.round(weatherResult.temperature) + '°C';
        const description = document.createElement('span'); description.textContent = weatherCode(weatherResult.code);
        const caption = document.createElement('small');
        caption.textContent = (weatherResult.stale ? text('上次数据 · ', 'Last data · ') : text('当地 ', 'Local ')) + weatherResult.time.replace('T', ' ').slice(5, 16) + ' · ';
        const source = document.createElement('a'); source.href = 'https://open-meteo.com/'; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = 'Open-Meteo';
        caption.append(source); node.append(current, description, caption);
      } else node.textContent = weatherResult?.error ? text('天气暂不可用', 'Weather unavailable') : text('正在读取天气…', 'Loading weather…');
    }
    function cachedWeather(city) {
      try {
        const item = JSON.parse(window.localStorage.getItem(cacheKey(city)) || 'null');
        if (item?.city === city && Number.isFinite(item.savedAt) && item.savedAt <= Date.now() + 60000 && Date.now() - item.savedAt < STALE_AGE
          && Number.isFinite(item.temperature) && Math.abs(item.temperature) < 100 && Number.isInteger(item.code) && item.code >= 0 && item.code <= 99 && typeof item.time === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(item.time)) return item;
      } catch (_) {} return null;
    }
    async function loadWeather() {
      const cityName = state.city, city = CITIES[cityName], ticket = ++weatherTicket, cached = cachedWeather(cityName);
      weatherRequest?.abort();
      if (cached) { weatherResult = {...cached,stale: Date.now() - cached.savedAt >= CACHE_AGE}; renderWeather(); if (!weatherResult.stale) return; }
      else { weatherResult = null; renderWeather(); }
      const controller = new window.AbortController(); weatherRequest = controller;
      const timeout = window.setTimeout(() => controller.abort(), TIMEOUT);
      try {
        const query = new window.URLSearchParams({latitude: String(city.lat),longitude: String(city.lon),current: 'temperature_2m,weather_code',temperature_unit: 'celsius',timezone: city.tz,forecast_days: '1'});
        const response = await window.fetch('https://api.open-meteo.com/v1/forecast?' + query, {signal: controller.signal,credentials: 'omit',referrerPolicy: 'no-referrer'});
        if (!response.ok) throw new Error('Weather response unavailable');
        const data = await response.json(), current = data.current;
        if (!current || !Number.isFinite(current.temperature_2m) || Math.abs(current.temperature_2m) >= 100 || !Number.isInteger(current.weather_code) || current.weather_code < 0 || current.weather_code > 99 || typeof current.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(current.time)) throw new Error('Invalid weather response');
        if (disposed || ticket !== weatherTicket || cityName !== state.city) return;
        weatherResult = {city: cityName,temperature: current.temperature_2m,code: current.weather_code,time: current.time,savedAt: Date.now(),stale: false};
        try { window.localStorage.setItem(cacheKey(cityName), JSON.stringify(weatherResult)); } catch (_) {}
      } catch (_) {
        if (disposed || ticket !== weatherTicket || cityName !== state.city) return;
        weatherResult = cached ? {...cached,stale: true} : {error: true};
      } finally { window.clearTimeout(timeout); if (!disposed && ticket === weatherTicket) renderWeather(); }
    }
    listen(cityInput, 'change', () => { if (!CITIES[cityInput.value]) return; state.city = cityInput.value; state.viewLon = CITIES[state.city].lon; state.viewLat = Math.max(-25, Math.min(35, CITIES[state.city].lat * .6)); try { window.localStorage.setItem(cityKey, state.city); } catch (_) {} renderFacts(); if (!options.globeOnly) loadWeather(); });
    listen(hourInput, 'input', () => { if (!state.demo) state.demoDay = astro.dateParts(new Date(), 'Asia/Shanghai'); state.demo = true; state.hour = Math.min(1439, Math.max(0, Math.round(Number(hourInput.value) * 60) || 0)) / 60; renderFacts(); });
    listen(find('earth-now'), 'click', () => { state.demo = false; renderFacts(); });
    let pointer = null;
    if (canvas) canvas.setAttribute('tabindex','0');
    listen(canvas, 'keydown', event => {
      const step = {ArrowLeft:[-8,0],ArrowRight:[8,0],ArrowUp:[0,8],ArrowDown:[0,-8]}[event.key];
      if (!step) return;
      event.preventDefault(); state.viewLon = astro.normal(state.viewLon + step[0]); state.viewLat = Math.max(-70,Math.min(70,state.viewLat + step[1])); requestDraw();
    });
    listen(canvas, 'pointerdown', event => { pointer = {id: event.pointerId,x: event.clientX,y: event.clientY,lon: state.viewLon,lat: state.viewLat}; canvas.setPointerCapture?.(event.pointerId); });
    listen(canvas, 'pointermove', event => { if (!pointer || event.pointerId !== pointer.id) return; state.viewLon = astro.normal(pointer.lon - (event.clientX - pointer.x) * .5); state.viewLat = Math.max(-70, Math.min(70, pointer.lat + (event.clientY - pointer.y) * .4)); requestDraw(); });
    listen(canvas, 'pointerup', () => { pointer = null; }); listen(canvas, 'pointercancel', () => { pointer = null; });
    if (window.ResizeObserver && canvas?.parentElement) { const observer = new window.ResizeObserver(requestDraw); observer.observe(canvas.parentElement); onCleanup(() => observer.disconnect()); }
    if (window.MutationObserver) { const observer = new window.MutationObserver(requestDraw); observer.observe(document.documentElement, {attributes: true,attributeFilter: ['data-theme','data-skin']}); onCleanup(() => observer.disconnect()); }
    listen(window, 'resize', requestDraw);
    listen(document, 'visibilitychange', () => { if (!document.hidden) { renderFacts(); if (!options.globeOnly) loadWeather(); } });
    const refresh = window.setInterval(() => { if (!document.hidden && !state.demo) renderFacts(); }, 60000);
    const weatherRefresh = options.globeOnly ? null : window.setInterval(() => { if (!document.hidden) loadWeather(); }, CACHE_AGE);
    onCleanup(() => { window.clearInterval(refresh); window.clearInterval(weatherRefresh); weatherRequest?.abort(); if (drawFrame !== null) window.cancelAnimationFrame(drawFrame); });
    const unsubscribe = window.SiteI18n?.onChange?.(() => { renderFacts(); renderWeather(); }); if (typeof unsubscribe === 'function') onCleanup(unsubscribe);
    const mapController = new window.AbortController(); onCleanup(() => mapController.abort());
    window.fetch('/assets/map-land.json', {signal: mapController.signal,credentials: 'same-origin'}).then(response => { if (!response.ok) throw new Error('Land geometry unavailable'); return response.json(); }).then(data => { if (!disposed && data?.type === 'FeatureCollection' && Array.isArray(data.features)) { geography = data; requestDraw(); } }).catch(() => { if (!disposed) { geography = false; requestDraw(); } });
    const controller = {refresh: renderFacts,setPaused(value) { paused = !!value; if (paused && drawFrame !== null) { window.cancelAnimationFrame(drawFrame); drawFrame = null; } if (!paused) renderFacts(); },destroy() { if (disposed) return; disposed = true; cleanup.splice(0).reverse().forEach(fn => { try { fn(); } catch (_) {} }); root.dataset.earthReady = 'false'; },getState: () => ({city: state.city,demo: state.demo,hour: state.hour,paused})};
    window.SiteNavigation?.own?.(() => controller.destroy());
    renderFacts(); if (!options.globeOnly) loadWeather();
    return controller;
  }
  if (typeof module === 'object' && module.exports) module.exports = {createEarth,CITIES};
  else scope.HomeEarth = Object.freeze({createEarth,CITIES});
})(typeof window !== 'undefined' ? window : globalThis);
