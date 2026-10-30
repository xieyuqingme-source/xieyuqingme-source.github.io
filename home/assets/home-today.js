/* Text and progress for the Today page. All astronomy and calendar data come
 * from the supplied snapshot. This controller owns no clock or data requests.
 */
(function (scope, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else scope.HomeToday = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const termsZh = ['春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至','小寒','大寒','立春','雨水','惊蛰'];
  const termsEn = ['March equinox','Clear and bright','Grain rain','Summer begins','Grain buds','Grain in ear','June solstice','Slight heat','Great heat','Autumn begins','End of heat','White dew','September equinox','Cold dew','Frost descent','Winter begins','Light snow','Heavy snow','December solstice','Slight cold','Great cold','Spring begins','Rain water','Insects awaken'];
  const moonNames = {
    new:['新月','New moon'],firstQuarter:['上弦月','First quarter'],full:['满月','Full moon'],lastQuarter:['下弦月','Last quarter'],
    waxingCrescent:['蛾眉月','Waxing crescent'],waxingGibbous:['盈凸月','Waxing gibbous'],waningGibbous:['亏凸月','Waning gibbous'],waningCrescent:['残月','Waning crescent']
  };
  const BJ = 8 * 3600000, MEAN_MOON_KM = 384400;
  const pad = n => String(n).padStart(2,'0');
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  function beijing(value) {
    const date = new Date(value + BJ);
    return {year:date.getUTCFullYear(),month:date.getUTCMonth() + 1,day:date.getUTCDate(),hour:date.getUTCHours(),minute:date.getUTCMinutes()};
  }
  function dateText(atMs,baseMs,english,includeTime = true) {
    const date = beijing(atMs), base = beijing(baseMs), time = includeTime ? ' ' + pad(date.hour) + ':' + pad(date.minute) : '';
    if (english) {
      const label = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',month:'short',day:'numeric',...(date.year !== base.year ? {year:'numeric'} : {})}).format(new Date(atMs));
      return label + time;
    }
    return (date.year !== base.year ? date.year + '年' : '') + date.month + '月' + date.day + '日' + time;
  }
  function termName(event,english) {
    const index = Number.isFinite(event?.longitude) ? ((event.longitude % 360 + 360) % 360) / 15 : termsZh.indexOf(event?.key || event?.name);
    return (english ? termsEn : termsZh)[index] || event?.name || '';
  }
  function phaseName(key,english) { return moonNames[key]?.[english ? 1 : 0] || ''; }
  function dayPhrase(days,english) {
    if (days === 0) return english ? 'today' : '今天';
    if (days === 1) return english ? 'tomorrow' : '明天';
    return english ? `in ${days} days` : `${days}天后`;
  }
  function latitudeText(declination,english) {
    if (Math.abs(declination) < .05) return english ? 'near the equator' : '赤道附近';
    return english ? `${Math.abs(declination).toFixed(1)}°${declination < 0 ? 'S' : 'N'}` : `${declination < 0 ? '南' : '北'}纬${Math.abs(declination).toFixed(1)}°`;
  }
  function targetText(event,english) {
    const longitude = event.longitude;
    return english ? longitude === 90 ? 'the Tropic of Cancer' : longitude === 270 ? 'the Tropic of Capricorn' : 'the equator'
      : longitude === 90 ? '北回归线' : longitude === 270 ? '南回归线' : '赤道';
  }
  function sentence(state,english) {
    const {solar,moon,calendar} = state;
    let sun;
    if (calendar.keyToday) {
      const name = termName(calendar.keyToday,english), target = targetText(calendar.keyToday,english);
      sun = english ? `Today is the ${name}: the Sun is overhead at ${target}.` : `今天${name}，太阳直射${target}。`;
    } else {
      const event = [calendar.nextTropic,calendar.nextEquator].filter(Boolean).sort((a,b) => a.atMs - b.atMs)[0];
      const latitude = latitudeText(solar.declination,english), direction = solar.trend === 'north' ? (english ? 'north' : '北移') : (english ? 'south' : '南移');
      sun = english ? `The Sun is overhead ${Math.abs(solar.declination) < .05 ? latitude : 'at ' + latitude} and moving ${direction}; it reaches ${targetText(event,true)} ${dayPhrase(event.days,true)}.`
        : `太阳直射${latitude}，正在${direction}，${dayPhrase(event.days,false)}${event.longitude === 0 || event.longitude === 180 ? '回到' : '直射'}${targetText(event,false)}。`;
    }
    const moonText = moon.principalToday
      ? (english ? `Today is the ${phaseName(moon.principalToday.key,true).toLowerCase()}.` : `今天${phaseName(moon.principalToday.key,false)}。`)
      : (english ? `The Moon is a ${phaseName(moon.phaseKey,true).toLowerCase()}; ${phaseName(moon.next.key,true).toLowerCase()} ${dayPhrase(moon.next.days,true)}.`
        : `月亮是${phaseName(moon.phaseKey,false)}，${dayPhrase(moon.next.days,false)}${phaseName(moon.next.key,false)}。`);
    return sun + (english ? ' ' : '') + moonText;
  }
  function create(doc,win,options = {}) {
    const root = options.root || doc.querySelector('.daily-home');
    if (!root) return null;
    const find = id => root.id === id ? root : root.querySelector('#' + id);
    const cleanup = [];
    let state = null, city = null, disposed = false, demo = false;
    const english = () => String(options.language?.() || win.SiteI18n?.lang?.() || doc.documentElement.lang || 'zh-CN').startsWith('en');
    const word = (zh,en) => english() ? en : zh;
    function write(id,value) { const target = find(id); if (target) target.textContent = value; }
    function rows(id,items) {
      const target = find(id); if (!target) return;
      const fragment = doc.createDocumentFragment();
      for (const [label,value] of items) {
        const dt = doc.createElement('dt'), dd = doc.createElement('dd');
        dt.textContent = label; dd.textContent = value; fragment.append(dt,dd);
      }
      target.replaceChildren(fragment);
    }
    const visual = win.HomeTodayVisuals?.create?.(doc,win,{root,language:() => english() ? 'en' : 'zh-CN',scope:{own:fn => cleanup.push(fn)}}) || null;
    function render() {
      if (disposed || !state) return;
      const en = english(), {solar,moon,calendar,year} = state, date = beijing(state.instantMs);
      const progress = Math.round(clamp(year.progress,0,1) * 100), phase = phaseName(moon.phaseKey,en);
      write('today-position-sentence',sentence(state,en));
      write('today-year-label',en ? `${year.year} · day ${year.dayOfYear} of ${year.daysInYear}` : `${year.year}年 · 第${year.dayOfYear}天`);
      write('today-year-left',en ? `${progress}% elapsed · ${year.remainingDays} days left` : `已过${progress}% · 还剩${year.remainingDays}天`);
      const track = find('today-year-track'), fill = find('today-year-fill');
      if (fill) fill.style.width = (clamp(year.progress,0,1) * 100).toFixed(3) + '%';
      if (track) {
        track.setAttribute('role','progressbar'); track.setAttribute('aria-valuemin','0'); track.setAttribute('aria-valuemax','100'); track.setAttribute('aria-valuenow',String(progress));
        track.setAttribute('aria-label',en ? `${year.year} year progress` : `${year.year}年进度`);
        track.setAttribute('aria-valuetext',en ? `Day ${year.dayOfYear} of ${year.daysInYear}; ${progress}% elapsed; ${year.remainingDays} days left` : `第${year.dayOfYear}天，已过${progress}%，还剩${year.remainingDays}天`);
        for (const tick of track.querySelectorAll('[data-today-year-tick]')) tick.remove();
        for (const event of year.quarters) {
          const tick = doc.createElement('span'); tick.className = 'today-year-tick'; tick.dataset.todayYearTick = event.key;
          tick.style.left = (clamp((event.atMs - year.startMs) / (year.endMs - year.startMs),0,1) * 100).toFixed(3) + '%';
          const label = doc.createElement('span'); label.className = 'today-year-tick-label';
          label.textContent = en ? ({0:'Mar',90:'Jun',180:'Sep',270:'Dec'}[event.longitude]) : termName(event,false);
          tick.append(label);
          tick.title = termName(event,en) + ' · ' + dateText(event.atMs,state.instantMs,en,false); tick.setAttribute('aria-hidden','true'); track.append(tick);
        }
      }
      const stamp = `${date.year}-${pad(date.month)}-${pad(date.day)} ${pad(date.hour)}:${pad(date.minute)}`;
      write('today-astronomy-time',(demo ? word('演示 · ','Demo · ') : '') + stamp + word(' 北京时间',' Beijing time'));
      write('moon-phase-name',phase);
      const lunar = state.lunarDate ? (en ? 'Lunar ' + state.lunarDate.en : '农历' + state.lunarDate.zh) : '';
      write('moon-phase-subtitle',[(en ? 'About ' : '约') + Math.round(moon.illumination * 100) + (en ? '% illuminated' : '%被照亮'),lunar].filter(Boolean).join(' · '));
      const nextText = event => `${dayPhrase(event.days,en)} · ${dateText(event.atMs,state.instantMs,en)}`;
      const nextNewLunar = moon.nextNew.lunarDate ? (en ? ' · lunar ' + moon.nextNew.lunarDate.en : ' · 农历' + moon.nextNew.lunarDate.zh) : '';
      const distanceChange = Math.round(Math.abs(moon.distanceKm / MEAN_MOON_KM - 1) * 100);
      const comparison = distanceChange === 0 ? word('接近平均距离','near the mean distance') : moon.distanceKm < MEAN_MOON_KM ? word(`比平均近${distanceChange}%`,`${distanceChange}% closer than the mean`) : word(`比平均远${distanceChange}%`,`${distanceChange}% farther than the mean`);
      const meanMoon = word('平均约38.4万公里','mean: 384,400 km');
      rows('moon-readings',[
        [word('下一个主要月相','Next main phase'),phaseName(moon.next.key,en) + ' · ' + nextText(moon.next)],
        [word('下次新月','Next new moon'),nextText(moon.nextNew) + nextNewLunar],
        [word('下次满月','Next full moon'),nextText(moon.nextFull)],
        [word('地月距离','Earth–Moon distance'),(en ? 'About ' + Math.round(moon.distanceKm).toLocaleString('en-GB') + ' km' : '约' + (moon.distanceKm / 10000).toFixed(1) + '万公里') + ' · ' + comparison + (en ? ' (' + meanMoon + ')' : '（' + meanMoon + '）')]
      ]);
      write('moon-cycle-note',word('月亮绕地球一圈约27.3天，月相轮回约29.5天，因为地球同时在绕太阳走。','The Moon orbits Earth in about 27.3 days. Its phases repeat in about 29.5 days because Earth is also moving around the Sun.'));
      write('moon-phase-caption',city?.lat < 0 ? word('月相小图按所选地点的南半球视角显示。','The phase disc follows the selected location’s Southern Hemisphere view.') : word('月相小图按所选地点的北半球视角显示。','The phase disc follows the selected location’s Northern Hemisphere view.'));
      const previous = termName(calendar.previous,en), following = termName(calendar.next,en);
      write('year-term-summary',en ? `${previous} · day ${calendar.elapsedDays} · ${following} ${dayPhrase(calendar.remainingDays,true)}` : `${previous}第${calendar.elapsedDays}天 · ${dayPhrase(calendar.remainingDays,false)}${following}`);
      const currentSolar = calendar.keyToday ? (en ? `Today: ${termName(calendar.keyToday,true)} · overhead at ${targetText(calendar.keyToday,true)}` : `今天${termName(calendar.keyToday,false)} · 直射${targetText(calendar.keyToday,false)}`)
        : latitudeText(solar.declination,en) + ' · ' + (solar.trend === 'north' ? word('正在北移','moving north') : word('正在南移','moving south'));
      const auPercent = Math.abs(solar.distanceAU - 1) * 100;
      const sunComparison = auPercent < .05 ? word('接近平均距离','near the mean distance') : solar.distanceAU < 1 ? word(`比平均近${auPercent.toFixed(1)}%`,`${auPercent.toFixed(1)}% closer than the mean`) : word(`比平均远${auPercent.toFixed(1)}%`,`${auPercent.toFixed(1)}% farther than the mean`);
      const seasonFraction = clamp(calendar.seasonFraction,0,1), seasonPercent = seasonFraction > 0 && seasonFraction < .01 ? word('不到1%','less than 1%') : Math.round(seasonFraction * 100) + '%';
      rows('year-readings',[
        [word('太阳直射','Sun overhead'),currentSolar],
        [word('下一个回归线','Next tropic'),targetText(calendar.nextTropic,en) + ' · ' + nextText(calendar.nextTropic)],
        [word('下一次过赤道','Next equator crossing'),termName(calendar.nextEquator,en) + ' · ' + nextText(calendar.nextEquator)],
        [word('本季进度','Season progress'),termName(calendar.quarterStart,en) + ' → ' + termName(calendar.quarterEnd,en) + ' · ' + seasonPercent],
        [word('日地距离','Sun–Earth distance'),solar.distanceAU.toFixed(5) + ' AU · ' + sunComparison]
      ]);
      write('year-distance-note',word('地球每年1月初离太阳最近，7月初最远。季节来自地轴倾斜。','Earth is closest to the Sun in early January and farthest in early July. Seasons come from Earth’s axial tilt.'));
    }
    const api = {
      setState(snapshot,observer,display = {}) {
        if (disposed || !Number.isFinite(snapshot?.instantMs) || !snapshot?.solar || !snapshot?.moon || !snapshot?.calendar || !snapshot?.year) return false;
        state = snapshot; city = observer || city; demo = display.demo ?? snapshot.demo ?? false;
        render(); visual?.setState(snapshot,city); return true;
      },
      refresh() { if (disposed) return; render(); visual?.refresh(); },
      destroy() { if (disposed) return; disposed = true; cleanup.splice(0).reverse().forEach(fn => fn()); state = null; city = null; },
      getState:() => ({disposed,instantMs:state?.instantMs ?? null,demo})
    };
    const unsubscribe = win.SiteI18n?.onChange?.(() => api.refresh()); if (typeof unsubscribe === 'function') cleanup.push(unsubscribe);
    if (typeof options.scope?.own === 'function') options.scope.own(() => api.destroy()); else win.SiteNavigation?.own?.(() => api.destroy());
    return api;
  }
  return Object.freeze({create,sentence,dayPhrase,dateText,termName,phaseName});
});
