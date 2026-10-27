/* Manual daily news, a lightweight day card, and page-owned lazy Earth assets. */
(function () {
  'use strict';
  const root = document.querySelector('.daily-home');
  if (!root) return;
  const glance = root.dataset.briefMode === 'glance';
  const find = id => document.getElementById(id);
  const read = id => { try { return JSON.parse(find(id)?.textContent || 'null'); } catch (_) { return null; } };
  const brief = glance ? null : read('daily-brief-data'), content = glance ? null : read('daily-content-data');
  const knowledge = glance ? [] : read('daily-knowledge-data')?.items || [], memes = glance ? [] : read('daily-memes-data')?.items || [];
  const rules = glance ? [] : read('daily-rules-data')?.weather || [], holidays = glance ? {} : read('daily-holidays-data')?.years || {};
  const astro = window.HomeAstronomy, cityModel = astro.cityModel, cities = cityModel.presets;
  const lang = () => (window.SiteI18n?.lang?.() || document.documentElement.lang || 'zh-CN').startsWith('en') ? 'en' : 'zh-CN';
  const text = value => typeof value === 'string' ? value : value?.[lang()] || value?.['zh-CN'] || '';
  const word = (zh, en) => lang() === 'en' ? en : zh;
  const categories = {domestic: ['时政','Politics'],world: ['国际','World'],economy: ['经济','Economy'],science: ['科技','Science'],culture: ['文化','Culture']};
  const order = Object.keys(categories);
  try { window.localStorage.removeItem('xieyuqing-brief-closed'); } catch (_) {}
  let lastDay = '', lastLanguage = '', disposed = false, city = cities.beijing, assetsReady = !glance, lunarAttempted = false;
  let weather = null, weatherRequest = null, weatherTicket = 0, earth = null, earthVisible = false, earthLoading = false;
  let festivalCache = null, searchRequest = null, searchTicket = 0, searchResults = [];
  const cleanup = [], pending = new Map();
  const pageId = window.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  window.HomeBriefPageId = pageId;
  if (!glance) try {
    const current = cityModel.decode(window.localStorage.getItem('xieyuqing-home-city-v2'));
    const legacy = current ? null : cityModel.decode(window.localStorage.getItem('xieyuqing-home-city-v1'));
    if (current || legacy) city = current || legacy;
    if (legacy) window.localStorage.setItem('xieyuqing-home-city-v2',JSON.stringify({version:1,city}));
  } catch (_) {}
  function listen(target, type, handler, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    cleanup.push(() => target.removeEventListener(type, handler, options));
  }
  function write(id, value) { const target = find(id); if (target) target.textContent = value; }
  function node(tag, className, value) { const result = document.createElement(tag); if (className) result.className = className; if (value !== undefined) result.textContent = value; return result; }
  function link(url, value) {
    const result = node('a', '', value);
    if (/^https:\/\//.test(url || '') || /^\/(?:en\/)?articles\//.test(url || '')) result.href = url;
    if (/^https:\/\//.test(url || '')) { result.target = '_blank'; result.rel = 'noopener noreferrer'; }
    return result;
  }
  function parts(date, zone = 'Asia/Shanghai') { return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: zone,year: 'numeric',month: '2-digit',day: '2-digit'}).formatToParts(date).map(part => [part.type, part.value])); }
  function dayIndex(date, zone) { const p = parts(date, zone); return Math.floor(Date.UTC(+p.year,+p.month - 1,+p.day) / 86400000); }
  function dayStamp(date, zone) { return new Date(dayIndex(date, zone) * 86400000).toISOString().slice(0,10); }
  function monthDay(date) { return new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'zh-CN', {timeZone: 'Asia/Shanghai',month: 'long',day: 'numeric'}).format(date); }
  function source(item) {
    const result = node('div', 'yl-source');
    result.append(document.createTextNode(text(item.source) + ' · '));
    if (item.published) {
      const time = node('time', '', item.published.replace('T',' ').replace(/\+08:00$/, ''));
      time.dateTime = item.published; result.append(time);
    } else result.append(document.createTextNode(text(item.published_label)));
    result.append(document.createTextNode(' · '), link(item.url, word('阅读原文 ↗','Read source ↗')));
    return result;
  }
  function renderFeed(date) {
    if (glance || !brief?.items?.length || !find('daily-feed')) return;
    const age = dayIndex(date) - Math.floor(Date.parse(brief.edition_date + 'T00:00:00Z') / 86400000), stale = age > 3;
    root.classList.toggle('brief-news-stale', stale);
    write('daily-news-title', age === 1 ? word('昨日要闻','Yesterday’s news') : word('要闻','News'));
    const edition = new Date(brief.edition_date + 'T04:00:00Z'), updated = brief.updated_at?.slice(11,16) || '';
    write('daily-edition', word('新闻更新于 ','News updated ') + monthDay(edition) + (updated ? ' ' + updated : ''));
    const notice = find('daily-brief-notice');
    if (notice) { notice.hidden = stale; notice.textContent = word('新闻由人工挑选，标题和摘要依据原文；点「阅读原文」看全文。','News is selected manually; headlines and summaries follow the sources. Choose “Read source” for the full text.'); }
    if (stale) {
      const paused = word('新闻暂停更新，先看看地球','News updates paused; take a look at Earth');
      find('daily-feed').replaceChildren(node('p','yl-note yl-news-paused',paused)); return;
    }
    const category = item => item.category || (item.categories?.[0] === 'business' ? 'economy' : item.categories?.[0]);
    const entries = [...brief.items].sort((a,b) => Number(b.priority === 'major') - Number(a.priority === 'major') || order.indexOf(category(a)) - order.indexOf(category(b)));
    const fragment = document.createDocumentFragment();
    entries.forEach((item,index) => {
      const article = node('article',(index === 0 ? 'yl-lead' : 'yl-item') + ' news-row');
      const label = node('div','yl-label');
      label.append(node('span','news-category',categories[category(item)]?.[lang() === 'en' ? 1 : 0] || ''));
      if (item.priority === 'major') { const badge = node('span','news-major',word('要闻','Major')); badge.title = text(item.major_reason); label.append(badge); }
      const heading = node('h3'); heading.append(link(item.url,text(item.title)));
      article.append(label,heading,node('p','news-summary',text(item.summary)),source(item)); fragment.append(article);
    });
    find('daily-feed').replaceChildren(fragment);
  }
  function renderDaily(date) {
    if (glance) return;
    const index = dayIndex(date), pick = list => list?.length ? list[((index % list.length) + list.length) % list.length] : null;
    const quote = pick(content?.quotes);
    if (quote) {
      write('daily-quote',text(quote.text));
      const credit = find('daily-quote-source');
      if (credit) { credit.replaceChildren(document.createTextNode(text(quote.author) + ' · '),link(quote.url,text(quote.work) + ' ↗')); credit.title = text(quote.translation_note); }
    }
    const term = astro?.term(date,false), stamp = dayStamp(date).slice(5);
    const concept = knowledge.find(item => item.trigger?.date === stamp) || knowledge.find(item => item.trigger?.solar_term === term) || pick(knowledge);
    if (concept) {
      write('daily-concept-title',text(concept.title)); write('daily-concept-text',text(concept.text));
      const credit = find('daily-concept-source'); if (credit) { credit.href = concept.url; credit.textContent = concept.source + ' ↗'; }
    }
    const meme = [...memes].sort((a,b) => b.added.localeCompare(a.added))[0], card = find('daily-meme-card');
    if (card) card.hidden = !meme;
    find('brief-bottom')?.classList.toggle('has-meme',!!meme);
    if (meme) {
      write('daily-street-title',text(meme.term)); write('daily-street-text',text(meme.meaning));
      write('daily-meme-added',lang() === 'en' ? 'Added ' + monthDay(new Date(meme.added + 'T04:00:00Z')) : monthDay(new Date(meme.added + 'T04:00:00Z')) + '收录');
      for (const [id,key,label] of [['daily-meme-origin','origin',word('出处','Origin')],['daily-meme-example','example',word('例句','Example')],['daily-meme-why','why_popular',word('为什么火','Why popular')]]) {
        const target = find(id), value = text(meme[key]); if (target) { target.hidden = !value; target.textContent = value ? label + '：' + value : ''; }
      }
      const links = [link(meme.url,text(meme.source) + ' ↗')];
      if (meme.related_url) links.push(link(lang() === 'en' ? meme.related_url.replace(/^\/articles\/[^/]+\//,'/en/articles/') : meme.related_url,text(meme.related_label) + ' ↗'));
      find('daily-street-links')?.replaceChildren(...links);
    }
  }
  const conditionCodes = {};
  function conditions(codes,zh,en,hintZh,hintEn,wet = false) {
    codes.forEach((code,index) => { conditionCodes[code] = {label:[zh[index],en[index]],hint:[hintZh,hintEn],wet}; });
  }
  conditions([0,1,2,3],['晴','大部晴朗','局部多云','阴天'],['Clear','Mainly clear','Partly cloudy','Overcast'],'出门留意天气变化，有日照时注意防晒。','Keep an eye on changing weather and use sun protection when needed.');
  conditions([45,48],['雾','雾凇'],['Fog','Depositing rime fog'],'能见度可能较低，出行放慢速度，注意路况。','Visibility may be low; slow down and pay attention to road conditions.');
  conditions([51,53,55],['小毛毛雨','中等毛毛雨','强毛毛雨'],['Light drizzle','Moderate drizzle','Dense drizzle'],'有毛毛雨，出门带把伞，留意路面湿滑。','Take an umbrella for drizzle and watch for slippery surfaces.',true);
  conditions([56,57],['轻度冻毛毛雨','强冻毛毛雨'],['Light freezing drizzle','Dense freezing drizzle'],'有冻毛毛雨，路面可能结冰，出行注意防滑。','Freezing drizzle may make surfaces icy; take care when travelling.',true);
  conditions([61,63,65],['小雨','中雨','大雨'],['Slight rain','Moderate rain','Heavy rain'],'正在下雨，记得带伞，注意路面湿滑。','Take an umbrella for rain and watch for slippery roads.',true);
  conditions([66,67],['轻度冻雨','强冻雨'],['Light freezing rain','Heavy freezing rain'],'有冻雨，路面可能结冰，出行注意防滑。','Freezing rain may make roads icy; take care when travelling.',true);
  conditions([71,73,75,77],['小雪','中雪','大雪','米雪'],['Slight snowfall','Moderate snowfall','Heavy snowfall','Snow grains'],'有降雪，注意保暖，留意积雪和路面防滑。','Dress warmly for snow and watch for snow-covered or slippery surfaces.',true);
  conditions([80,81,82],['小阵雨','中等阵雨','强阵雨'],['Slight rain showers','Moderate rain showers','Violent rain showers'],'有阵雨，带伞出门，留意天气变化和路面积水。','Carry an umbrella for showers and watch for changing weather and standing water.',true);
  conditions([85,86],['小阵雪','强阵雪'],['Slight snow showers','Heavy snow showers'],'有阵雪，注意保暖和防滑，留意天气变化。','Dress warmly for snow showers and watch for slippery surfaces.',true);
  conditions([95,97],['雷暴','强雷暴'],['Thunderstorm','Heavy thunderstorm'],'有雷暴，尽量留在室内，远离树木和积水。','Stay indoors during thunderstorms when possible, away from trees and standing water.',true);
  conditions([96,99],['雷暴伴小冰雹','雷暴伴大冰雹'],['Thunderstorm with slight hail','Thunderstorm with heavy hail'],'雷暴伴冰雹，尽量留在室内，远离窗边。','Thunderstorms with hail: stay indoors when possible and keep away from windows.',true);
  function numberIn(value,min,max) { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
  function detailsFrom(value) {
    const result = {};
    for (const [key,min,max] of [['apparent_temperature',-100,100],['relative_humidity_2m',0,100],['wind_speed_10m',0,500],['wind_direction_10m',0,360],['pressure_msl',300,1200]]) if (numberIn(value?.[key],min,max)) result[key] = value[key];
    if (result.wind_speed_10m === 0) delete result.wind_direction_10m;
    return result;
  }
  function dailyFrom(value) {
    const result = {};
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.date || '') || !Number.isFinite(Date.parse(value.date + 'T00:00:00Z'))) return result;
    result.date = value.date;
    for (const field of ['temperature_2m_max','temperature_2m_min']) if (numberIn(value[field],-100,70)) result[field] = value[field];
    if (numberIn(value.precipitation_probability_max,0,100)) result.precipitation_probability_max = value.precipitation_probability_max;
    if (result.temperature_2m_max < result.temperature_2m_min) { delete result.temperature_2m_max; delete result.temperature_2m_min; }
    return result;
  }
  function renderWeather() {
    if (glance) return;
    const target = find('daily-weather'), current = weather?.cityKey === cityModel.identity(city) ? weather : null;
    const condition = current && conditionCodes[current.code], english = lang() === 'en';
    if (target) {
      target.replaceChildren();
      if (current) {
        target.append(node('strong','',Math.round(current.temperature) + '°C'),node('span','',condition?.label[english ? 1 : 0] || word('天气状况暂不可用','Weather condition unavailable')));
        const caption = node('small','',(current.stale ? word('上次数据 · ','Last data · ') : word('当地 ','Local ')) + current.time.replace('T',' ').slice(5,16) + ' · ');
        caption.append(link('https://open-meteo.com/','Open-Meteo')); target.append(caption);
      } else target.textContent = weather?.error ? word('天气暂不可用','Weather unavailable') : word('正在读取天气…','Loading weather…');
    }
    const detail = find('daily-weather-details');
    if (detail) {
      detail.replaceChildren();
      const values = current?.details || {};
      const directions = english ? ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'] : ['北','北东北','东北','东东北','东','东东南','东南','南东南','南','南西南','西南','西西南','西','西西北','西北','北西北'];
      const fields = [
        ['apparent_temperature',word('体感温度','Feels like'),value => value.toFixed(1) + ' °C'],
        ['relative_humidity_2m',word('相对湿度','Relative humidity'),value => Math.round(value) + '%'],
        ['wind_speed_10m',word('风速','Wind speed'),value => value.toFixed(1) + ' km/h'],
        ['wind_direction_10m',word('风向','Wind direction'),value => directions[Math.round(value / 22.5) % 16] + ' · ' + Math.round(value) + '°'],
        ['pressure_msl',word('海平面气压','Mean sea-level pressure'),value => value.toFixed(1) + ' hPa']
      ];
      for (const [key,label,format] of fields) if (Number.isFinite(values[key])) { const group = node('div','weather-detail'); group.append(node('dt','',label),node('dd','',format(values[key]))); detail.append(group); }
      detail.hidden = !detail.children.length;
    }
    const matching = current?.daily?.date === dayStamp(new Date(),city.tz) ? rules.filter(rule => {
      const value = current.daily[rule.field]; return Number.isFinite(value) && (rule.operator === 'gte' ? value >= rule.threshold : rule.operator === 'lte' && value <= rule.threshold);
    }) : [];
    const hints = condition ? [condition.hint[english ? 1 : 0]] : [];
    for (const rule of matching) {
      if (rule.field === 'precipitation_probability_max' && condition?.wet) continue;
      const prefix = rule.field === 'temperature_2m_max' ? word('今日最高气温：','Today’s high: ') : rule.field === 'temperature_2m_min' ? word('今日最低气温：','Today’s low: ') : word('今日预报：','Today’s forecast: ');
      hints.push(prefix + text(rule.text));
    }
    const hint = find('daily-weather-hint'); if (hint) { hint.hidden = !hints.length; hint.textContent = [...new Set(hints)].join(' · '); }
  }
  function renderCalendar(date) {
    if (disposed) return;
    const zone = glance ? 'Asia/Shanghai' : city.tz;
    const local = parts(date,zone), beijing = parts(date), english = lang() === 'en';
    const weekday = new Intl.DateTimeFormat(english ? 'en-GB' : 'zh-CN',{timeZone:zone,weekday:'long'}).format(date);
    if (glance) {
      const stamp = new Intl.DateTimeFormat(english ? 'en-GB' : 'zh-CN',{timeZone:zone,month:'long',day:'numeric'}).format(date);
      write('glance-date',english ? weekday + ' ' + stamp : stamp + ' ' + weekday);
    } else {
      write('daily-calendar-day',String(+local.day)); write('daily-calendar-weekday',weekday);
      write('daily-calendar-month',local.year + ' · ' + new Intl.DateTimeFormat(english ? 'en-GB' : 'zh-CN',{timeZone:zone,month:'long'}).format(date));

    }
    write('daily-calendar-lunar',word('农历','Lunar · ') + (astro?.lunar(date,zone,english) || ''));
    write('daily-calendar-term',astro?.term(date,english) || ''); write('daily-calendar-next-term','');
    if (!glance) {
      const holiday = holidays[beijing.year]?.days?.find(item => item.date === dayStamp(date));
      const holidayNode = find('daily-calendar-holiday');
      const holidayNames = {'元旦':'New Year’s Day','春节':'Spring Festival','清明节':'Qingming Festival','劳动节':'Labour Day','端午节':'Dragon Boat Festival','中秋节':'Mid-Autumn Festival','国庆节':'National Day'};
      if (holidayNode) { holidayNode.hidden = !holiday; holidayNode.textContent = holiday ? (holiday.isOffDay ? word('假期 · ','Holiday · ') : word('调休上班 · ','Adjusted working day · ')) + (english ? holidayNames[holiday.name] || holiday.name : holiday.name) : ''; }
    }
    if (!window.Solar || !window.I18n) {
      return;
    }
    window.I18n.setLanguage(english ? 'en' : 'chs');
    const solar = window.Solar.fromYmd(+local.year,+local.month,+local.day), lunar = solar.getLunar();
    write('daily-calendar-cycle',lunar.getYearInGanZhi() + word('年 · ',' · ') + lunar.getYearShengXiao());
    const previous = lunar.getPrevJieQi(true), next = lunar.getNextJieQi(true);
    const localDay = dayIndex(date,zone), toDay = value => Math.floor(Date.parse(value + 'T00:00:00Z') / 86400000);
    const elapsed = localDay - toDay(previous.getSolar().toYmd()) + 1, remaining = toDay(next.getSolar().toYmd()) - localDay;
    const first = english ? `${previous.getName()} · day ${elapsed}` : `${previous.getName()}第${elapsed}天`;
    const second = english ? `${remaining} days until ${next.getName()}` : `距${next.getName()}还有${remaining}天`;
    write('daily-calendar-term',glance ? first : first + ' · ' + second);
    if (glance) write('daily-calendar-next-term',second);
    const current = [...solar.getFestivals(),...lunar.getFestivals()];
    if (glance) {
      const festivals = find('daily-calendar-festivals'); if (festivals) { festivals.hidden = !current.length; festivals.textContent = current.join(' · '); }
    } else {
      const cacheKey = solar.toYmd() + ':' + lang();
      if (festivalCache?.key !== cacheKey) {
        let upcoming = null;
        for (let days = 1; days <= 370 && !upcoming; days++) { const day = solar.next(days), names = [...day.getFestivals(),...day.getLunar().getFestivals()]; if (names.length) upcoming = {days,names}; }
        festivalCache = {key:cacheKey,upcoming};
      }
      const upcoming = festivalCache.upcoming;
      const nextText = upcoming ? (english ? `${upcoming.names.join(' · ')} in ${upcoming.days} days` : `距${upcoming.names.join(' · ')}还有${upcoming.days}天`) : '';
      write('daily-calendar-festivals',[current.join(' · '),nextText].filter(Boolean).join(' · '));
    }
  }
  function weatherRecord(value,selected,legacy = false) {
    const key = cityModel.identity(selected), observer = cityModel.normalize(value?.observer);
    if (!value || (legacy ? value.city !== selected.id || !cities[selected.id] || cityModel.identity(cities[selected.id]) !== key : value.cityKey !== key || !observer || cityModel.identity(observer) !== key)
      || !Number.isFinite(value.savedAt) || value.savedAt > Date.now() + 60000 || Date.now() - value.savedAt >= 86400000
      || !numberIn(value.temperature,-100,100) || typeof value.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value.time)) return null;
    return {observer:selected,cityKey:key,temperature:value.temperature,code:Number.isInteger(value.code) ? value.code : null,time:value.time,savedAt:value.savedAt,details:detailsFrom(value.details),daily:dailyFrom(value.daily),needsRefresh:legacy};
  }
  function cachedWeather(selected) {
    try {
      const current = weatherRecord(JSON.parse(window.localStorage.getItem('xieyuqing-weather-v3:' + cityModel.identity(selected)) || 'null'),selected);
      if (current) return current;
      if (cities[selected.id] && cityModel.identity(cities[selected.id]) === cityModel.identity(selected)) return weatherRecord(JSON.parse(window.localStorage.getItem('xieyuqing-weather-v2:' + selected.id) || 'null'),selected,true);
    } catch (_) {} return null;
  }
  async function loadWeather() {
    if (glance || !window.fetch || disposed) return;
    const selected = city, key = cityModel.identity(selected), ticket = ++weatherTicket, cached = cachedWeather(selected);
    weatherRequest?.abort();
    if (cached) { weather = {...cached,stale:cached.needsRefresh || Date.now() - cached.savedAt >= 1800000}; renderWeather(); if (!weather.stale) return; }
    else { weather = null; renderWeather(); }
    const controller = new window.AbortController(); weatherRequest = controller;
    const timeout = window.setTimeout(() => controller.abort(),8000);
    try {
      const query = new window.URLSearchParams({latitude:String(selected.lat),longitude:String(selected.lon),current:'temperature_2m,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,pressure_msl',daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max',temperature_unit:'celsius',wind_speed_unit:'kmh',timezone:selected.tz,forecast_days:'1'});
      const response = await window.fetch('https://api.open-meteo.com/v1/forecast?' + query,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if (!response.ok) throw new Error('Weather unavailable');
      const data = await response.json(), current = data.current;
      if (!current || !numberIn(current.temperature_2m,-100,100) || typeof current.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(current.time)) throw new Error('Invalid weather');
      if (disposed || ticket !== weatherTicket || key !== cityModel.identity(city)) return;
      const dailyIndex = Math.max(0,data.daily?.time?.indexOf(current.time.slice(0,10)) ?? 0), daily = {date:data.daily?.time?.[dailyIndex]};
      for (const field of ['temperature_2m_max','temperature_2m_min','precipitation_probability_max']) daily[field] = data.daily?.[field]?.[dailyIndex];
      weather = {observer:selected,cityKey:key,temperature:current.temperature_2m,code:Number.isInteger(current.weather_code) ? current.weather_code : null,time:current.time,savedAt:Date.now(),stale:false,details:detailsFrom(current),daily:dailyFrom(daily)};
      try { window.localStorage.setItem('xieyuqing-weather-v3:' + key,JSON.stringify(weather)); } catch (_) {}
    } catch (_) { if (!disposed && ticket === weatherTicket && key === cityModel.identity(city)) weather = cached ? {...cached,stale:true} : {error:true}; }
    finally { window.clearTimeout(timeout); if (!disposed && ticket === weatherTicket) renderWeather(); }
  }
  function renderCityChoices() {
    if (glance) return;
    const input = find('daily-city');
    if (input) {
      input.replaceChildren();
      let selected = '';
      for (const preset of Object.values(cities)) { const option = node('option','',cityModel.label(preset,lang() === 'en',false)); option.value = preset.id; input.append(option); if (cityModel.identity(preset) === cityModel.identity(city)) selected = preset.id; }
      if (!selected) { const option = node('option','',cityModel.label(city,lang() === 'en')); option.value = 'custom'; input.append(option); selected = 'custom'; }
      input.value = selected;
    }
    write('daily-city-label',cityModel.label(city,lang() === 'en'));
  }
  function selectCity(value) {
    const selected = cityModel.normalize(value); if (!selected || glance || disposed) return;
    searchTicket++; searchRequest?.abort(); searchResults = []; renderSearchResults();
    city = selected;
    try {
      window.localStorage.setItem('xieyuqing-home-city-v2',JSON.stringify({version:1,city}));
      if (cities[city.id] && cityModel.identity(cities[city.id]) === cityModel.identity(city)) window.localStorage.setItem('xieyuqing-home-city-v1',city.id);
      else window.localStorage.removeItem('xieyuqing-home-city-v1');
    } catch (_) {}
    renderCityChoices(); renderCalendar(new Date()); earth?.setCity(city); loadWeather();
  }
  function renderSearchResults() {
    const list = find('city-search-results'); if (!list) return;
    list.replaceChildren();
    list.hidden = !searchResults.length;
    searchResults.forEach((place,index) => { const item = node('li'), button = node('button','city-result',cityModel.label(place,lang() === 'en')); button.type = 'button'; button.dataset.cityResult = String(index); item.append(button); list.append(item); });
  }
  async function searchCities(event) {
    event.preventDefault();
    if (glance || disposed) return;
    const ticket = ++searchTicket; searchRequest?.abort(); searchResults = []; renderSearchResults();
    const query = find('city-search-input')?.value?.trim() || '';
    if (query.length < 2 || query.length > 80) { write('city-search-status',word('请输入2到80个字的城市名。','Enter a city name with 2 to 80 characters.')); return; }
    write('city-search-status',word('正在查找城市…','Finding cities…'));
    const controller = new window.AbortController(); searchRequest = controller;
    const timeout = window.setTimeout(() => controller.abort(),8000);
    try {
      const params = new window.URLSearchParams({name:query,count:'10',language:lang() === 'en' ? 'en' : 'zh',format:'json'});
      const response = await window.fetch('https://geocoding-api.open-meteo.com/v1/search?' + params,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if (!response.ok) throw new Error('City search unavailable');
      const data = await response.json(); if (disposed || ticket !== searchTicket) return;
      const seen = new Set(); searchResults = (Array.isArray(data.results) ? data.results : []).slice(0,10).map(cityModel.fromResult).filter(place => { if (!place) return false; const id = cityModel.identity(place); if (seen.has(id)) return false; seen.add(id); return true; });
      renderSearchResults(); write('city-search-status',searchResults.length ? word(`找到${searchResults.length}个城市，请选择。`,`Found ${searchResults.length} cities. Choose one.`) : word('没有找到城市，请换个名称再试。','No cities found. Try another name.'));
    } catch (_) { if (!disposed && ticket === searchTicket) write('city-search-status',word('城市查找暂不可用，请稍后再试。','City search is unavailable. Try again later.')); }
    finally { window.clearTimeout(timeout); }
  }
  function loadAsset(url) {
    if (!/^\/assets\//.test(url || '')) return Promise.reject(new Error('Missing local asset'));
    if (pending.has(url)) return pending.get(url);
    const promise = new Promise((resolve,reject) => {
      const script = document.createElement('script'); script.src = url; script.async = false; script.dataset.homeScope = pageId; script.dataset.pageScript = '';
      script.onload = () => resolve(); script.onerror = () => { pending.delete(url); reject(new Error('Local asset unavailable')); };
      document.body.append(script); cleanup.push(() => script.remove());
    });
    pending.set(url,promise); return promise;
  }
  async function maybeLoadEarth() {
    if (disposed || !assetsReady || !earthVisible) { earth?.setPaused(true); return; }
    if (earth) { earth.setPaused(false); return; }
    if (earthLoading) return;
    earthLoading = true;
    try {
      await loadAsset(root.dataset.d3Src); if (disposed || !assetsReady || !earthVisible) return;
      await loadAsset(root.dataset.earthSrc); if (disposed || !assetsReady || !earthVisible) return;
      earth = window.HomeEarth?.createEarth(document,window,{globeOnly:true,city:glance ? cities.beijing : city});
    } catch (_) {} finally { earthLoading = false; }
  }
  function loadLunar() {
    if (disposed || lunarAttempted) return;
    lunarAttempted = true;
    if (window.Solar) { renderCalendar(new Date()); return; }
    loadAsset(root.dataset.lunarSrc).then(() => { if (!disposed) { renderCalendar(new Date()); if (!glance) renderDaily(new Date()); } }).catch(() => {
      if (disposed) return;
      write('daily-calendar-next-term','');
    });
  }
  function startAssets() {
    if (disposed) return;
    assetsReady = true; loadLunar(); maybeLoadEarth();
  }
  function refresh(force) {
    if (disposed) return;
    const date = new Date(), currentDay = String(dayIndex(date)), currentLanguage = lang();
    if (force || lastDay !== currentDay || lastLanguage !== currentLanguage) {
      if (!glance) { renderDaily(date); renderFeed(date); renderCityChoices(); renderSearchResults(); renderWeather(); write('timeline-date',dayStamp(date)); }
      renderCalendar(date); lastDay = currentDay; lastLanguage = currentLanguage;
    } else renderCalendar(date);
  }
  if (!glance) {
    listen(find('daily-city'),'change',() => { const value = find('daily-city').value; if (cities[value]) selectCity(cities[value]); });
    listen(find('city-search-form'),'submit',searchCities);
    listen(find('city-search-results'),'click',event => {
      const button = event.target.closest?.('[data-city-result]'); if (!button || !find('city-search-results').contains(button)) return;
      const selected = searchResults[Number(button.dataset.cityResult)]; if (!selected) return;
      selectCity(selected); searchResults = []; renderSearchResults(); write('city-search-status',word('已选择：','Selected: ') + cityModel.label(city,lang() === 'en'));
    });
  }
  const articles = read('home-random-data'), randomButton = find('home-random-button'), english = lang() === 'en';
  const articleLinks = Array.isArray(articles) ? articles.filter(url => typeof url === 'string' && (english ? /^\/(?:en\/)?articles\/(?!\/)/ : /^\/articles\/(?!\/)/).test(url)) : [];
  if (randomButton && articleLinks.length) { randomButton.hidden = false; listen(randomButton,'click',() => { const url = articleLinks[Math.floor(Math.random() * articleLinks.length)]; if (window.SiteNavigation?.visit) window.SiteNavigation.visit(url); else window.location.assign(url); }); }
  const earthTarget = find('daily-earth');
  if (earthTarget && window.IntersectionObserver) {
    const observer = new window.IntersectionObserver(entries => { earthVisible = entries.some(entry => entry.isIntersecting); maybeLoadEarth(); },{threshold:0}); observer.observe(earthTarget); cleanup.push(() => observer.disconnect());
  } else if (earthTarget) {
    const check = () => { const rect = earthTarget.getBoundingClientRect?.(); earthVisible = !!rect && rect.bottom > 0 && rect.top < window.innerHeight; maybeLoadEarth(); };
    listen(window,'scroll',check,{passive:true}); listen(window,'resize',check); check();
  }
  refresh(true);
  if (glance) {
    let scheduled = false;
    const schedule = () => {
      if (scheduled || disposed) return; scheduled = true;
      if (window.requestIdleCallback) {
        const idle = window.requestIdleCallback(() => { if (!disposed) startAssets(); },{timeout:2000});
        cleanup.push(() => window.cancelIdleCallback?.(idle));
      } else {
        const timeout = window.setTimeout(startAssets,1200); cleanup.push(() => window.clearTimeout(timeout));
      }
    };
    if (document.readyState === 'complete') schedule(); else listen(window,'load',schedule,{once:true});
  } else { startAssets(); loadWeather(); }
  const timer = window.setInterval(() => refresh(false),60000);
  const weatherTimer = glance ? null : window.setInterval(() => { if (!document.hidden) loadWeather(); },1800000);
  const unsubscribe = window.SiteI18n?.onChange?.(() => refresh(true));
  listen(document,'visibilitychange',() => { if (!document.hidden) { refresh(true); if (!glance) loadWeather(); } });
  window.SiteNavigation?.own?.(() => { disposed = true; weatherRequest?.abort(); searchRequest?.abort(); earth?.destroy(); window.clearInterval(timer); if (weatherTimer !== null) window.clearInterval(weatherTimer); if (typeof unsubscribe === 'function') unsubscribe(); cleanup.splice(0).reverse().forEach(fn => fn()); });

})();
