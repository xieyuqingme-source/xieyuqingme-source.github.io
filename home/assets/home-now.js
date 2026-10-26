/* 雨聊 homepage: Kuala Lumpur right now (time, weather, whether it is raining)
 * and one line a day from my own essays. Weather: https://open-meteo.com/ (free non-commercial endpoint). */
(function () {
  'use strict';
  const card = document.getElementById('now');
  const quote = document.getElementById('own-quote');
  if (!card && !quote) return;
  const english = (document.documentElement.lang || '').toLowerCase().startsWith('en');
  const word = (zh, en) => english ? en : zh;
  const find = id => document.getElementById(id);
  const TZ = 'Asia/Kuala_Lumpur';
  const ARRIVED = Math.floor(Date.UTC(2026, 3, 29) / 86400000);
  const CITY = 'kuala', CACHE = 'xieyuqing-weather-v1:' + CITY, CACHE_AGE = 30 * 60000, STALE_AGE = 24 * 3600000;
  let disposed = false;

  function parts(date) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'})
      .formatToParts(date).map(part => [part.type, part.value]));
  }
  function dayNumber(date) {
    const p = parts(date);
    return Math.floor(Date.UTC(+p.year, +p.month - 1, +p.day) / 86400000);
  }

  function renderClock() {
    if (!card || disposed) return;
    const now = new Date(), p = parts(now);
    const clock = find('now-clock');
    if (clock) { clock.textContent = p.hour + ':' + p.minute; clock.dateTime = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}+08:00`; }
    const day = find('now-date');
    if (day) day.textContent = new Intl.DateTimeFormat(english ? 'en-GB' : 'zh-CN', {timeZone: TZ, month: 'long', day: 'numeric', weekday: 'long'}).format(now);
    const days = find('now-days'), count = dayNumber(now) - ARRIVED + 1;
    if (days && count > 0) days.textContent = english ? `Day ${count} in Kuala Lumpur` : `我在吉隆坡的第 ${count} 天`;
  }

  const raining = code => (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  function describe(code) {
    if (code === 0) return word('晴', 'Clear');
    if (code <= 3) return word('多云', 'Cloudy');
    if (code <= 48) return word('雾', 'Fog');
    if (code <= 57) return word('毛毛雨', 'Drizzle');
    if (code <= 67) return word('下雨', 'Rain');
    if (code <= 77) return word('下雪', 'Snow');
    if (code <= 82) return word('阵雨', 'Showers');
    if (code <= 86) return word('阵雪', 'Snow showers');
    return word('雷阵雨', 'Thunderstorm');
  }
  function valid(item) {
    return item && item.city === CITY && Number.isFinite(item.temperature) && Math.abs(item.temperature) < 100
      && Number.isInteger(item.code) && item.code >= 0 && item.code <= 99
      && typeof item.time === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(item.time) && Number.isFinite(item.savedAt);
  }
  function cached() {
    try {
      const item = JSON.parse(window.localStorage.getItem(CACHE) || 'null');
      if (valid(item) && item.savedAt <= Date.now() + 60000 && Date.now() - item.savedAt < STALE_AGE) return item;
    } catch (_) {}
    return null;
  }
  function renderWeather(result) {
    if (!card || disposed) return;
    const weather = find('now-weather'), line = find('now-line');
    if (!result) {
      card.dataset.state = 'unknown';
      if (weather) weather.textContent = word('天气暂时没取到', 'Weather unavailable right now');
      if (line) line.textContent = word('吉隆坡常下雨，尤其是下午。', 'It rains a lot here, especially in the afternoon.');
      return;
    }
    const wet = raining(result.code);
    card.dataset.state = wet ? 'rain' : 'dry';
    if (weather) weather.textContent = Math.round(result.temperature) + '°C · ' + describe(result.code);
    if (line) line.textContent = wet ? word('窗外在下雨，正好聊聊。', 'It’s raining outside. A good time for a chat.') : word('此刻没在下雨。', 'No rain at the moment.');
  }
  async function loadWeather() {
    const hit = cached();
    if (hit) { renderWeather(hit); if (Date.now() - hit.savedAt < CACHE_AGE) return; }
    const controller = new window.AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const query = new window.URLSearchParams({latitude: '3.139', longitude: '101.6869', current: 'temperature_2m,weather_code', temperature_unit: 'celsius', timezone: TZ, forecast_days: '1'});
      const response = await window.fetch('https://api.open-meteo.com/v1/forecast?' + query, {signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'});
      if (!response.ok) throw new Error('Weather request failed');
      const current = (await response.json())?.current;
      const result = {city: CITY, temperature: current?.temperature_2m, code: current?.weather_code, time: current?.time, savedAt: Date.now(), stale: false};
      if (!valid(result)) throw new Error('Invalid weather response');
      try { window.localStorage.setItem(CACHE, JSON.stringify(result)); } catch (_) {}
      renderWeather(result);
    } catch (_) {
      if (!hit) renderWeather(null);
    } finally {
      window.clearTimeout(timer);
    }
  }

  function renderQuote() {
    if (!quote || disposed) return;
    let items = null;
    try { items = JSON.parse(find('own-quotes-data')?.textContent || 'null'); } catch (_) {}
    if (!Array.isArray(items) || !items.length) return;
    const item = items[((dayNumber(new Date()) % items.length) + items.length) % items.length];
    const lang = english ? 'en' : 'zh-CN', url = item?.url?.[lang] || '';
    if (!item?.text?.[lang] || !/^\/(?:en\/)?articles\//.test(url)) return;
    find('own-quote-text').textContent = item.text[lang];
    const link = document.createElement('a');
    link.href = url;
    link.textContent = english ? item.title.en : '《' + item.title['zh-CN'] + '》';
    const dash = document.createElement('span');
    dash.setAttribute('aria-hidden', 'true');
    dash.textContent = english ? '—' : '——';
    const nodes = [dash, document.createTextNode(' '), link];
    if (/^\d{4}-\d{2}-\d{2}$/.test(item.date || '')) {
      const time = document.createElement('time');
      time.dateTime = item.date;
      time.textContent = item.date.replaceAll('-', '.');
      nodes.push(document.createTextNode(' '), time);
    }
    find('own-quote-source').replaceChildren(...nodes);
  }

  renderClock();
  renderQuote();
  if (card) loadWeather();
  const clockTimer = window.setInterval(renderClock, 20000);
  window.SiteNavigation?.own?.(() => { disposed = true; window.clearInterval(clockTimer); });
})();
