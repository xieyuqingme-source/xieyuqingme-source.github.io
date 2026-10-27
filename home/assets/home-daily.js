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
  const astro = window.HomeAstronomy;
  const lang = () => (window.SiteI18n?.lang?.() || document.documentElement.lang || 'zh-CN').startsWith('en') ? 'en' : 'zh-CN';
  const text = value => typeof value === 'string' ? value : value?.[lang()] || value?.['zh-CN'] || '';
  const word = (zh, en) => lang() === 'en' ? en : zh;
  const categories = {domestic: ['时政','Politics'],world: ['国际','World'],economy: ['经济','Economy'],science: ['科技','Science'],culture: ['文化','Culture']};
  const order = Object.keys(categories);
  try { window.localStorage.removeItem('xieyuqing-brief-closed'); } catch (_) {}
  const cities = {
    beijing: {name: ['北京','Beijing'],lat: 39.9042,lon: 116.4074,tz: 'Asia/Shanghai'},
    shanghai: {name: ['上海','Shanghai'],lat: 31.2304,lon: 121.4737,tz: 'Asia/Shanghai'},
    kuala: {name: ['吉隆坡','Kuala Lumpur'],lat: 3.139,lon: 101.6869,tz: 'Asia/Kuala_Lumpur'},
    london: {name: ['伦敦','London'],lat: 51.5074,lon: -.1278,tz: 'Europe/London'}
  };
  let lastDay = '', lastLanguage = '', disposed = false, city = 'beijing', assetsReady = !glance, lunarAttempted = false;
  let weather = null, weatherRequest = null, weatherTicket = 0, earth = null, earthVisible = false, earthLoading = false;
  let festivalCache = null;
  const cleanup = [], pending = new Map();
  const pageId = window.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  window.HomeBriefPageId = pageId;
  if (!glance) try { const saved = window.localStorage.getItem('xieyuqing-home-city-v1'); if (cities[saved]) city = saved; } catch (_) {}
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
  function renderWeather() {
    if (glance) return;
    const target = find('daily-weather');
    if (target) {
      target.replaceChildren();
      if (weather?.city === city) {
        const descriptions = weather.code === 0 ? ['晴','Clear'] : weather.code <= 3 ? ['多云','Cloudy'] : weather.code <= 48 ? ['雾','Fog'] : weather.code <= 57 ? ['毛毛雨','Drizzle'] : weather.code <= 67 ? ['雨','Rain'] : weather.code <= 77 ? ['雪','Snow'] : weather.code <= 82 ? ['阵雨','Rain showers'] : weather.code <= 86 ? ['阵雪','Snow showers'] : ['雷暴','Thunderstorm'];
        target.append(node('strong','',Math.round(weather.temperature) + '°C'),node('span','',descriptions[lang() === 'en' ? 1 : 0]));
        const caption = node('small','',(weather.stale ? word('上次数据 · ','Last data · ') : word('当地 ','Local ')) + weather.time.replace('T',' ').slice(5,16) + ' · ');
        caption.append(link('https://open-meteo.com/','Open-Meteo')); target.append(caption);
      } else target.textContent = weather?.error ? word('天气暂不可用','Weather unavailable') : word('正在读取天气…','Loading weather…');
    }
    const matching = weather?.daily?.date === dayStamp(new Date(),cities[city].tz) ? rules.filter(rule => {
      const value = weather.daily[rule.field]; return Number.isFinite(value) && (rule.operator === 'gte' ? value >= rule.threshold : rule.operator === 'lte' && value <= rule.threshold);
    }) : [];
    const hint = find('daily-weather-hint'); if (hint) { hint.hidden = !matching.length; hint.textContent = matching.map(rule => text(rule.text)).join(' · '); }
  }
  function renderCalendar(date) {
    if (disposed) return;
    const zone = glance ? 'Asia/Shanghai' : cities[city].tz;
    const local = parts(date,zone), beijing = parts(date), english = lang() === 'en';
    const weekday = new Intl.DateTimeFormat(english ? 'en-GB' : 'zh-CN',{timeZone:zone,weekday:'long'}).format(date);
    if (glance) {
      const stamp = new Intl.DateTimeFormat(english ? 'en-GB' : 'zh-CN',{timeZone:zone,month:'long',day:'numeric'}).format(date);
      write('glance-date',english ? weekday + ' ' + stamp : stamp + ' ' + weekday);
    } else {
      write('daily-calendar-day',String(+local.day)); write('daily-calendar-weekday',weekday);
      write('daily-calendar-month',local.year + ' · ' + new Intl.DateTimeFormat(english ? 'en-GB' : 'zh-CN',{timeZone:zone,month:'long'}).format(date));
      if (find('daily-city')) find('daily-city').value = city;
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
      if (glance) { write('daily-almanac-yi','—'); write('daily-almanac-ji','—'); }
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
    const yi = lunar.getDayYi(), ji = lunar.getDayJi();
    write('daily-almanac-yi',(glance ? yi.slice(0,3) : yi).join(' · ')); write('daily-almanac-ji',(glance ? ji.slice(0,3) : ji).join(' · '));
    if (!glance) {
      write('daily-almanac-clash',word('冲','Clash · ') + lunar.getDayChongDesc() + word(' · 煞',' · Sha · ') + lunar.getDaySha());
      write('daily-almanac-directions',english ? `Lucky directions — Joy: ${lunar.getDayPositionXiDesc()} · Fortune: ${lunar.getDayPositionFuDesc()} · Wealth: ${lunar.getDayPositionCaiDesc()}`
        : `喜神 ${lunar.getDayPositionXiDesc()} · 福神 ${lunar.getDayPositionFuDesc()} · 财神 ${lunar.getDayPositionCaiDesc()}`);
      const pengzu = find('daily-almanac-pengzu'); if (pengzu) { pengzu.hidden = english; pengzu.textContent = english ? '' : '彭祖百忌：' + lunar.getPengZuGan() + ' · ' + lunar.getPengZuZhi(); }
      const almanac = find('daily-almanac'); if (almanac) almanac.hidden = false;
    }
  }
  function cachedWeather() {
    try {
      const value = JSON.parse(window.localStorage.getItem('xieyuqing-weather-v2:' + city) || 'null');
      if (value?.city === city && Number.isFinite(value.savedAt) && value.savedAt <= Date.now() + 60000 && Date.now() - value.savedAt < 86400000 && Number.isFinite(value.temperature) && Math.abs(value.temperature) < 100 && Number.isInteger(value.code) && value.code >= 0 && value.code <= 99 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value.time || '')) return value;
    } catch (_) {} return null;
  }
  async function loadWeather() {
    if (glance || !window.fetch || disposed) return;
    const selectedCity = city, selected = cities[city], ticket = ++weatherTicket, cached = cachedWeather();
    weatherRequest?.abort();
    if (cached) { weather = {...cached,stale:Date.now() - cached.savedAt >= 1800000}; renderWeather(); if (!weather.stale) return; }
    else { weather = null; renderWeather(); }
    const controller = new window.AbortController(); weatherRequest = controller;
    const timeout = window.setTimeout(() => controller.abort(),8000);
    try {
      const query = new window.URLSearchParams({latitude:String(selected.lat),longitude:String(selected.lon),current:'temperature_2m,weather_code',daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max',temperature_unit:'celsius',timezone:selected.tz,forecast_days:'1'});
      const response = await window.fetch('https://api.open-meteo.com/v1/forecast?' + query,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if (!response.ok) throw new Error('Weather unavailable');
      const data = await response.json(), current = data.current;
      if (!current || !Number.isFinite(current.temperature_2m) || Math.abs(current.temperature_2m) >= 100 || !Number.isInteger(current.weather_code) || current.weather_code < 0 || current.weather_code > 99 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(current.time || '')) throw new Error('Invalid weather');
      if (disposed || ticket !== weatherTicket || selectedCity !== city) return;
      const dailyIndex = Math.max(0,data.daily?.time?.indexOf(current.time.slice(0,10)) ?? 0), daily = {date:data.daily?.time?.[dailyIndex]};
      for (const field of ['temperature_2m_max','temperature_2m_min','precipitation_probability_max']) { const value = data.daily?.[field]?.[dailyIndex]; if (Number.isFinite(value)) daily[field] = value; }
      weather = {city,temperature:current.temperature_2m,code:current.weather_code,time:current.time,savedAt:Date.now(),stale:false,daily};
      try { window.localStorage.setItem('xieyuqing-weather-v2:' + city,JSON.stringify(weather)); } catch (_) {}
    } catch (_) { if (!disposed && ticket === weatherTicket) weather = cached ? {...cached,stale:true} : {error:true}; }
    finally { window.clearTimeout(timeout); if (!disposed && ticket === weatherTicket) renderWeather(); }
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
      earth = window.HomeEarth?.createEarth(document,window,{globeOnly:true});
    } catch (_) {} finally { earthLoading = false; }
  }
  function loadLunar() {
    if (disposed || lunarAttempted) return;
    lunarAttempted = true;
    if (window.Solar) { renderCalendar(new Date()); return; }
    loadAsset(root.dataset.lunarSrc).then(() => { if (!disposed) { renderCalendar(new Date()); if (!glance) renderDaily(new Date()); } }).catch(() => {
      if (disposed) return;
      const almanac = find('glance-almanac-card'); if (glance && almanac) almanac.hidden = true;
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
      if (!glance) { renderDaily(date); renderFeed(date); renderWeather(); }
      renderCalendar(date); lastDay = currentDay; lastLanguage = currentLanguage;
    } else renderCalendar(date);
  }
  if (!glance) listen(find('daily-city'),'change',() => {
    const value = find('daily-city').value; if (!cities[value]) return; city = value;
    try { window.localStorage.setItem('xieyuqing-home-city-v1',city); } catch (_) {}
    renderCalendar(new Date()); loadWeather();
  });
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
  window.SiteNavigation?.own?.(() => { disposed = true; weatherRequest?.abort(); earth?.destroy(); window.clearInterval(timer); if (weatherTimer !== null) window.clearInterval(weatherTimer); if (typeof unsubscribe === 'function') unsubscribe(); cleanup.splice(0).reverse().forEach(fn => fn()); });

})();
