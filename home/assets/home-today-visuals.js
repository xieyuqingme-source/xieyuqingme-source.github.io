/* Local, event-driven SVG diagrams. Astronomy and time selection belong to the caller. */
(function (scope, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else scope.HomeTodayVisuals = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const RAD = Math.PI / 180;
  const normal = value => ((value % 360) + 360) % 360;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const f = value => Number(value.toFixed(2));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const termNames = ['春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至','小寒','大寒','立春','雨水','惊蛰'];
  const termNamesEn = ['March equinox','Clear and bright','Grain rain','Summer begins','Grain buds','Grain in ear','June solstice','Slight heat','Great heat','Autumn begins','End of heat','White dew','September equinox','Cold dew','Frost descent','Winter begins','Light snow','Heavy snow','December solstice','Slight cold','Great cold','Spring begins','Rain water','Insects awaken'];
  function termName(event, english) {
    const index = Number.isFinite(event?.longitude) ? Math.round(normal(event.longitude) / 15) % 24 : termNames.indexOf(event?.name);
    return index >= 0 ? (english ? termNamesEn : termNames)[index] : event?.name || '';
  }
  function point(x, y, angle, radius) { return [x + Math.cos(angle * RAD) * radius, y - Math.sin(angle * RAD) * radius]; }
  function arc(x, y, radius, start, end) {
    const delta = clamp(end - start, 0, 359.999);
    if (delta < .0001) return '';
    const first = point(x, y, start, radius), last = point(x, y, start + delta, radius);
    return `M${f(first[0])} ${f(first[1])}A${radius} ${radius} 0 ${delta > 180 ? 1 : 0} 0 ${f(last[0])} ${f(last[1])}`;
  }
  function litBody(x, y, radius, toward, className) {
    const top = point(x, y, toward + 90, radius), bottom = point(x, y, toward - 90, radius);
    return `<g data-light-direction="${f(normal(toward))}"><circle cx="${f(x)}" cy="${f(y)}" r="${radius}" class="tv-body-night"/><path d="M${f(top[0])} ${f(top[1])}A${radius} ${radius} 0 0 1 ${f(bottom[0])} ${f(bottom[1])}Z" class="${className}"/><circle cx="${f(x)}" cy="${f(y)}" r="${radius}" class="tv-body-outline"/></g>`;
  }
  function phaseGeometry(elongation, southern = false) {
    const angle = normal(elongation), waxing = angle <= 180, phase = waxing ? angle : 360 - angle;
    const radius = 34, cosine = Math.cos(phase * RAD), projected = Math.abs(cosine) * radius;
    const terminator = projected < .001 ? 'L40 6' : `A${f(projected)} 34 0 0 ${cosine > 0 ? 0 : 1} 40 6`;
    return {angle, illumination:(1 - Math.cos(angle * RAD)) / 2, mirror:(waxing ? 1 : -1) * (southern ? -1 : 1), path:`M40 6A34 34 0 0 1 40 74${terminator}Z`};
  }
  function defs(prefix) {
    return `<defs><marker id="${prefix}-motion" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" class="tv-arrow-fill"/></marker><marker id="${prefix}-light" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" class="tv-sun"/></marker></defs>`;
  }
  function graphic(content, description, viewBox, prefix) {
    return {content:`<title id="${prefix}-title">${escape(description)}</title>${content}`, description, viewBox};
  }
  function optionsFor(options) { return {english:!!options?.english, prefix:String(options?.prefix || 'today').replace(/[^a-zA-Z0-9_-]/g,'') || 'today'}; }
  function renderMoon(state, options = {}) {
    const {english, prefix} = optionsFor(options), sun = state.solar.longitude, moon = state.moon.longitude;
    const x = 220, y = 220, radius = 130;
    let content = defs(prefix) + `<circle cx="220" cy="220" r="130" class="tv-track"/>`;
    for (const offset of [-38,0,38]) {
      const far = point(x,y,sun,198), near = point(x,y,sun,165), shift = point(0,0,sun + 90,offset);
      content += `<line x1="${f(far[0] + shift[0])}" y1="${f(far[1] + shift[1])}" x2="${f(near[0] + shift[0])}" y2="${f(near[1] + shift[1])}" class="tv-light-ray" marker-end="url(#${prefix}-light)"/>`;
    }
    const lightSource = point(x,y,sun,190), lightSide = point(0,0,sun + 90,70), moonCaption = point(x,y,moon,radius + 27);
    const lightLabel = [1,-1].map(side => [clamp(lightSource[0] + side * lightSide[0],30,410),clamp(lightSource[1] + side * lightSide[1],20,420)])
      .sort((a,b) => Math.hypot(b[0] - moonCaption[0],b[1] - moonCaption[1]) - Math.hypot(a[0] - moonCaption[0],a[1] - moonCaption[1]))[0];
    content += `<text x="${f(lightLabel[0])}" y="${f(lightLabel[1])}" class="tv-label" text-anchor="middle">${english ? 'Sunlight' : '阳光'}</text>`;
    const labels = english ? ['New moon','First quarter','Full moon','Last quarter'] : ['新月','上弦','满月','下弦'];
    // Names need clearance from the moving Moon on principal-phase dates.
    // English names are longer; both languages also clear the central Earth.
    const phaseLabelRadius = radius - (english ? 50 : 30);
    labels.forEach((label,index) => {
      const angle = sun + index * 90, a = point(x,y,angle,radius - 5), b = point(x,y,angle,radius + 5), name = point(x,y,angle,phaseLabelRadius);
      content += `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" class="tv-tick tv-major"/><text x="${f(name[0])}" y="${f(name[1])}" class="tv-label" text-anchor="middle" dominant-baseline="central">${label}</text>`;
    });
    content += litBody(x,y,23,sun,'tv-earth-lit') + `<text x="220" y="260" class="tv-label tv-strong" text-anchor="middle">${english ? 'Earth' : '地球'}</text>`;
    const location = point(x,y,moon,radius), label = point(x,y,moon,radius + 27);
    content += `<path d="${arc(x,y,radius + 15,moon + 7,moon + 25)}" class="tv-motion" marker-end="url(#${prefix}-motion)"/>`;
    content += litBody(location[0],location[1],11,sun,'tv-moon-lit') + `<text x="${f(label[0])}" y="${f(label[1])}" class="tv-label tv-strong" text-anchor="middle" dominant-baseline="central">${english ? 'Moon' : '月亮'}</text>`;
    const description = english ? `Earth–Moon diagram, viewed from ecliptic north. ${Math.round(state.moon.illumination * 100)}% of the Moon is illuminated; both bodies face the sunlight.` : `地月示意图，从黄道北极俯看。月亮约${Math.round(state.moon.illumination * 100)}%被照亮；地球和月亮的亮面都朝向太阳。`;
    return graphic(content,description,'0 0 440 440',prefix);
  }
  function renderPhase(state, options = {}) {
    const {english, prefix} = optionsFor(options), southern = options.city?.lat < 0, geometry = phaseGeometry(state.moon.elongation,southern);
    let content = '<circle cx="40" cy="40" r="34" class="tv-moon-night"/>';
    if (geometry.illumination > .999999) content += '<circle cx="40" cy="40" r="34" class="tv-moon-lit"/>';
    else if (geometry.illumination > .000001) content += `<path d="${geometry.path}" class="tv-moon-lit"${geometry.mirror < 0 ? ' transform="translate(80 0) scale(-1 1)"' : ''}/>`;
    content += '<circle cx="40" cy="40" r="34" class="tv-body-outline"/>';
    const description = english ? `Moon as seen from ${southern ? 'a southern' : 'a northern'} hemisphere location; ${Math.round(state.moon.illumination * 100)}% illuminated.` : `从${southern ? '南' : '北'}半球看到的月相，约${Math.round(state.moon.illumination * 100)}%被照亮。`;
    return graphic(content,description,'0 0 80 80',prefix);
  }
  function renderOrbit(state, options = {}) {
    const {english, prefix} = optionsFor(options), x = 240, y = 240, radius = 146;
    const longitude = normal(state.solar.earthLongitude ?? state.solar.longitude + 180);
    const start = normal((state.calendar.quarterStart?.longitude ?? Math.floor(state.solar.longitude / 90) * 90) + 180);
    // The term table and approximate solar geometry can differ by a few minutes.
    // A longitude just before the new quarter must clamp to zero, not wrap to 360°.
    const end = start + 90, delta = normal(longitude - start), travelled = start + (delta > 180 ? 0 : Math.min(90,delta));
    let content = defs(prefix) + `<circle cx="240" cy="240" r="146" class="tv-track"/><path d="${arc(x,y,radius,start,end)}" class="tv-season"/><path d="${arc(x,y,radius,start,Math.min(end,travelled))}" class="tv-travelled"/>`;
    const terms = state.calendar.terms || termNames.map((name,index) => ({name,longitude:index * 15}));
    for (const [index,term] of terms.entries()) {
      const angle = normal(term.longitude + 180), major = Math.round(normal(term.longitude)) % 90 === 0;
      const first = point(x,y,angle,radius - (major ? 7 : 4)), last = point(x,y,angle,radius + (major ? 7 : 4));
      const selected = index === state.calendar.currentTermIndex, classes = `tv-term${major ? ' tv-major' : ''}${selected ? ' tv-current' : ''}`;
      content += `<line x1="${f(first[0])}" y1="${f(first[1])}" x2="${f(last[0])}" y2="${f(last[1])}" class="tv-tick${major ? ' tv-major' : ''}${selected ? ' tv-current' : ''}"/>`;
      const caption = termName(term,english);
      if (english) {
        const label = point(x,y,angle,radius + 13), left = angle > 90 && angle < 270, rotation = -angle + (left ? 180 : 0);
        const words = caption.split(' '), middle = Math.ceil(words.length / 2), lines = [words.slice(0,middle).join(' '),words.slice(middle).join(' ')].filter(Boolean);
        content += `<text transform="translate(${f(label[0])} ${f(label[1])}) rotate(${f(rotation)})" class="${classes}" text-anchor="${left ? 'end' : 'start'}">${lines.map((line,i) => `<tspan x="0" dy="${i ? 11 : lines.length > 1 ? -2 : 3}">${escape(line)}</tspan>`).join('')}</text>`;
      } else {
        const label = point(x,y,angle,radius + 24);
        content += `<text x="${f(label[0])}" y="${f(label[1])}" class="${classes}" text-anchor="middle" dominant-baseline="central">${escape(caption)}</text>`;
      }
    }
    content += '<circle cx="240" cy="240" r="16" class="tv-sun"/>' + `<text x="240" y="274" class="tv-label" text-anchor="middle">${english ? 'Sun' : '太阳'}</text>`;
    content += `<path d="${arc(x,y,radius - 18,longitude + 7,longitude + 25)}" class="tv-motion" marker-end="url(#${prefix}-motion)"/>`;
    const earth = point(x,y,longitude,radius), pole = point(earth[0],earth[1],90,14 * Math.sin(state.solar.obliquity * RAD));
    content += litBody(earth[0],earth[1],14,longitude + 180,'tv-earth-lit') + `<circle cx="${f(pole[0])}" cy="${f(pole[1])}" r="2.4" class="tv-pole" data-pole-direction="90"/>`;
    const previous = termName(state.calendar.previous,english), next = termName(state.calendar.next,english), latitude = Math.abs(state.solar.declination).toFixed(1);
    const description = english ? `Earth orbit diagram: between ${previous} and ${next}. The Sun is overhead at ${latitude}°${state.solar.declination < 0 ? 'S' : 'N'}. The north-pole point keeps a fixed direction.` : `地球公转示意图：地球位于${previous}与${next}之间，太阳直射${state.solar.declination < 0 ? '南' : '北'}纬${latitude}°。北极白点朝向固定。`;
    return graphic(content,description,'0 0 480 480',prefix);
  }
  function splitCurve(samples, instantMs, declination, startMs, endMs) {
    const current = {atMs:clamp(instantMs,startMs,endMs),declination};
    const clean = samples.filter(sample => Number.isFinite(sample.atMs) && Number.isFinite(sample.declination) && sample.atMs >= startMs && sample.atMs <= endMs).filter(sample => Math.abs(sample.atMs - current.atMs) > .5).slice().sort((a,b) => a.atMs - b.atMs);
    return {past:[...clean.filter(sample => sample.atMs < current.atMs),current], future:[current,...clean.filter(sample => sample.atMs > current.atMs)]};
  }
  function dateLabel(atMs, english) {
    return new Intl.DateTimeFormat(english ? 'en-GB' : 'zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'}).format(new Date(atMs));
  }
  function declinationSize(value) {
    const width = clamp(Math.round(value || 640),280,1000), compact = width < 520, height = compact ? 296 : 214;
    return {width,compact,height,viewBox:`0 0 ${width} ${height}`};
  }
  function renderDeclination(state, options = {}) {
    const {english, prefix} = optionsFor(options), {width,compact,height} = declinationSize(options.width);
    const left = 14, right = width - 14, top = 35, bottom = 158, middle = (top + bottom) / 2;
    const x = atMs => left + clamp((atMs - state.year.startMs) / (state.year.endMs - state.year.startMs),0,1) * (right - left);
    const y = latitude => middle - latitude / 23.44 * (bottom - top) / 2;
    let content = '';
    for (const [latitude,label] of [[23.44,english ? '23.4°N · Tropic of Cancer' : '北回归线 23.4°N'],[0,english ? 'Equator' : '赤道'],[-23.44,english ? '23.4°S · Tropic of Capricorn' : '南回归线 23.4°S']]) {
      content += `<line x1="${left}" x2="${right}" y1="${f(y(latitude))}" y2="${f(y(latitude))}" class="tv-grid${latitude === 0 ? ' tv-equator' : ''}"/><text x="${left}" y="${f(y(latitude) + (latitude < 0 ? 16 : -9))}" class="tv-label">${label}</text>`;
    }
    const split = splitCurve(state.year.solarSamples || [],state.instantMs,state.solar.declination,state.year.startMs,state.year.endMs);
    const path = samples => samples.map((sample,index) => `${index ? 'L' : 'M'}${f(x(sample.atMs))} ${f(y(sample.declination))}`).join('');
    content += `<path d="${path(split.future)}" class="tv-curve-future"/><path d="${path(split.past)}" class="tv-curve-past"/>`;
    const shortNamesEn = {0:'Mar equinox',90:'Jun solstice',180:'Sep equinox',270:'Dec solstice'};
    for (const [index,event] of (state.year.quarters || []).entries()) {
      if (event.atMs < state.year.startMs || event.atMs > state.year.endMs) continue;
      const longitude = normal(event.longitude), latitude = longitude === 90 ? 23.44 : longitude === 270 ? -23.44 : 0;
      const px = x(event.atMs), py = y(latitude), anchor = px > width - 100 ? 'end' : px < 100 ? 'start' : 'middle';
      content += `<circle cx="${f(px)}" cy="${f(py)}" r="3.1" class="tv-key-dot"/>`;
      if (compact) {
        const labelX = index % 2 ? width / 2 + 5 : left, labelY = 241 + Math.floor(index / 2) * 29;
        content += `<text x="${f(px + (px > width - 30 ? -8 : 8))}" y="${f(py + (longitude === 90 ? 15 : -7))}" class="tv-label tv-strong" text-anchor="${px > width - 30 ? 'end' : 'start'}">${index + 1}</text><text x="${f(labelX)}" y="${labelY}" class="tv-label"><tspan x="${f(labelX)}">${index + 1}. ${escape(termName(event,english))}</tspan><tspan x="${f(labelX)}" dy="13">${escape(dateLabel(event.atMs,english))}</tspan></text>`;
      } else {
        const label = (english ? shortNamesEn[longitude] || termName(event,true) : termName(event,false)) + ' ' + dateLabel(event.atMs,english);
        content += `<text x="${f(px)}" y="${f(py + (longitude === 270 || longitude === 0 ? 17 : -10))}" class="tv-label" text-anchor="${anchor}">${escape(label)}</text>`;
      }
    }
    const months = state.year.monthStarts || [];
    months.slice(0,12).forEach((entry,index) => {
      const atMs = typeof entry === 'number' ? entry : entry.atMs;
      const px = x(atMs), label = english ? String(index + 1) : String(index + 1) + '月';
      content += `<line x1="${f(px)}" x2="${f(px)}" y1="${compact ? 196 : 190}" y2="${compact ? 200 : 194}" class="tv-tick"/><text x="${f(px)}" y="${compact ? 214 : 208}" class="tv-month" text-anchor="${index === 0 ? 'start' : 'middle'}">${label}</text>`;
    });
    const px = x(state.instantMs), py = y(state.solar.declination), afterMiddle = px > width / 2;
    const label = (english ? 'Selected ' : '所选时刻 ') + Math.abs(state.solar.declination).toFixed(1) + '°' + (state.solar.declination < 0 ? 'S' : 'N');
    // A compact chart gives the selected value a separate row. Keeping it beside
    // the dot can cover a quarter-event number on an equinox or solstice day.
    const selectedLabelY = compact ? 190 : py + (state.solar.declination < 0 ? -15 : 19);
    content += `<line x1="${f(px)}" x2="${f(px)}" y1="21" y2="185" class="tv-selected-line"/><circle cx="${f(px)}" cy="${f(py)}" r="5" class="tv-selected-dot"/><text x="${f(px + (afterMiddle ? -8 : 8))}" y="${f(selectedLabelY)}" class="tv-label tv-strong" text-anchor="${afterMiddle ? 'end' : 'start'}">${label}</text>`;
    const description = english ? `Annual subsolar latitude, January to December ${state.year.year}. Solid line shows elapsed time; dashed line shows future time. Selected latitude ${Math.abs(state.solar.declination).toFixed(1)}°${state.solar.declination < 0 ? 'S' : 'N'}.` : `${state.year.year}年1至12月太阳直射点纬度。实线是已过时间，虚线是未来；所选时刻直射${state.solar.declination < 0 ? '南' : '北'}纬${Math.abs(state.solar.declination).toFixed(1)}°。`;
    return graphic(content,description,`0 0 ${width} ${height}`,prefix);
  }
  let instance = 0;
  function create(doc, win, options = {}) {
    const root = options.root || doc.querySelector('.daily-home');
    if (!root) return null;
    const targets = [...root.querySelectorAll('[data-today-visual]')].filter(target => ['moon','phase','orbit','declination'].includes(target.dataset.todayVisual));
    if (!targets.length) return null;
    const cleanup = [], visible = new Set(), prefix = 'tv-' + (++instance), renderer = {moon:renderMoon,phase:renderPhase,orbit:renderOrbit,declination:renderDeclination};
    let state = null, city = null, frame = null, disposed = false;
    const english = () => (options.language?.() || win.SiteI18n?.lang?.() || doc.documentElement.lang || '').startsWith('en');
    function reserveSize() {
      if (disposed) return;
      for (const target of targets) if (target.dataset.todayVisual === 'declination') target.setAttribute('viewBox',declinationSize(target.clientWidth).viewBox);
    }
    function resize() { reserveSize(); requestDraw(); }
    function draw() {
      if (disposed || !state || doc.hidden) return;
      for (const [index,target] of targets.entries()) {
        if (!visible.has(target)) continue;
        const id = prefix + '-' + index;
        const result = renderer[target.dataset.todayVisual](state,{english:english(),prefix:id,city,width:target.clientWidth});
        target.setAttribute('viewBox',result.viewBox); target.setAttribute('role','img'); target.setAttribute('aria-labelledby',id + '-title'); target.removeAttribute('aria-label');
        target.innerHTML = result.content;
        target.dataset.renderedInstant = String(state.instantMs);
      }
    }
    function requestDraw() {
      if (disposed || frame !== null || !state || !visible.size) return;
      frame = win.requestAnimationFrame(() => { frame = null; draw(); });
    }
    function listen(target,type,handler,settings) {
      target?.addEventListener?.(type,handler,settings); cleanup.push(() => target?.removeEventListener?.(type,handler,settings));
    }
    reserveSize();
    if (win.IntersectionObserver) {
      const observer = new win.IntersectionObserver(entries => { for (const entry of entries) { if (entry.isIntersecting) visible.add(entry.target); else visible.delete(entry.target); } requestDraw(); },{threshold:0});
      targets.forEach(target => observer.observe(target)); cleanup.push(() => observer.disconnect());
    } else {
      const check = () => { targets.forEach(target => { const rect = target.getBoundingClientRect?.(); if (rect && rect.bottom > 0 && rect.top < win.innerHeight) visible.add(target); else visible.delete(target); }); requestDraw(); };
      listen(win,'scroll',check,{passive:true}); listen(win,'resize',check); check();
    }
    if (win.ResizeObserver) { const observer = new win.ResizeObserver(resize); targets.forEach(target => observer.observe(target)); cleanup.push(() => observer.disconnect()); }
    listen(win,'resize',resize); listen(doc,'visibilitychange',requestDraw);
    const unsubscribe = win.SiteI18n?.onChange?.(requestDraw); if (typeof unsubscribe === 'function') cleanup.push(unsubscribe);
    const api = {
      setState(snapshot, observer) { if (disposed || !snapshot?.solar || !snapshot?.moon || !snapshot?.calendar || !snapshot?.year || !Number.isFinite(snapshot.instantMs)) return false; state = snapshot; city = observer || city; requestDraw(); return true; },
      refresh:requestDraw,
      destroy() { if (disposed) return; disposed = true; if (frame !== null) win.cancelAnimationFrame(frame); frame = null; cleanup.splice(0).reverse().forEach(fn => fn()); visible.clear(); state = null; city = null; },
      getState:() => ({disposed,instantMs:state?.instantMs ?? null,visible:visible.size})
    };
    if (typeof options.scope?.own === 'function') options.scope.own(() => api.destroy());
    else win.SiteNavigation?.own?.(() => api.destroy());
    return api;
  }
  return Object.freeze({create,point,arc,litBody,phaseGeometry,splitCurve,renderMoon,renderPhase,renderOrbit,renderDeclination});
});
