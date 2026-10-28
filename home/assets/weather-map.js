/* Local Natural Earth map for choosing a weather observer. No remote map tiles. */
(function (scope, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else scope.HomeWeatherMap = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const normal = value => ((value + 180) % 360 + 360) % 360 - 180;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function viewState(value = {}) {
    const zoom = clamp(Number.isFinite(value.zoom) ? value.zoom : 1, 1, 16);
    return {zoom, lon:normal(Number.isFinite(value.lon) ? value.lon : 0), lat:clamp(Number.isFinite(value.lat) ? value.lat : 0, -90 + 90 / zoom, 90 - 90 / zoom)};
  }
  function project(point, width, height, view = {}) {
    const state = viewState(view), delta = normal(point.lon - state.lon);
    return [width / 2 + delta * width * state.zoom / 360, height / 2 - (point.lat - state.lat) * height * state.zoom / 180];
  }
  function unproject(point, width, height, view = {}) {
    if (!(width > 0) || !(height > 0) || !point.every(Number.isFinite)) return null;
    const state = viewState(view);
    return {lon:normal(state.lon + (point[0] / width - .5) * 360 / state.zoom), lat:clamp(state.lat - (point[1] / height - .5) * 180 / state.zoom, -90, 90)};
  }
  function coordinateLabel(point, english = false) {
    if (!point) return '';
    const angle = (value, positive, negative) => Math.abs(value).toFixed(2) + '°' + (value >= 0 ? positive : negative);
    return english ? angle(point.lat, ' N', ' S') + ' · ' + angle(point.lon, ' E', ' W')
      : angle(point.lat, ' 北纬', ' 南纬') + ' · ' + angle(point.lon, ' 东经', ' 西经');
  }
  function createWeatherMap(doc, win, options = {}) {
    const root = doc.getElementById('weather-map'), canvas = doc.getElementById('weather-map-canvas');
    const context = canvas?.getContext?.('2d'), model = win.HomeAstronomy?.cityModel;
    if (!root || !canvas || !context || !model) return null;
    const cleanup = [], controller = new win.AbortController();
    let disposed = false, geography = null, frame = null, pointer = null, selected = model.normalize(options.city) || model.presets.beijing;
    let view = viewState(), cursor = null, dimensions = {width:600,height:300}, selectionTicket = 0, labelBoxes = [];
    const english = () => (win.SiteI18n?.lang?.() || doc.documentElement.lang || '').startsWith('en');
    const word = (zh, en) => english() ? en : zh;
    const status = value => { const target = doc.getElementById('weather-map-status'); if (target) target.textContent = value; };
    function listen(target, type, handler, settings) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, handler, settings); cleanup.push(() => target.removeEventListener(type, handler, settings));
    }
    function requestDraw() {
      if (!disposed && frame === null) frame = win.requestAnimationFrame(() => { frame = null; draw(); });
    }
    function color(name, fallback) { return win.getComputedStyle(root).getPropertyValue(name).trim() || fallback; }
    function labelMarker(point, caption, prominent = false) {
      const [x,y] = project(point,dimensions.width,dimensions.height,view);
      if (x < 0 || x > dimensions.width || y < 0 || y > dimensions.height) return;
      const radius = prominent ? 4.5 : 2.4;
      context.beginPath(); context.arc(x,y,radius,0,2*Math.PI); context.fillStyle = prominent ? color('--accent','#28647a') : color('--muted','#667980'); context.fill();
      if (!caption) return;
      context.font = (prominent ? '600 ' : '') + '11px sans-serif';
      const measured = context.measureText(caption).width, margin = 7;
      const textX = clamp(x + margin, 4, dimensions.width - measured - 4), textY = y > 25 ? y - 8 : y + 18;
      const box = [textX-3,textY-12,textX+measured+3,textY+4];
      if (!prominent && labelBoxes.some(other => box[0]<other[2] && box[2]>other[0] && box[1]<other[3] && box[3]>other[1])) return;
      labelBoxes.push(box);
      context.lineJoin = 'round'; context.lineWidth = 3; context.strokeStyle = color('--paper','#f3f6f6'); context.strokeText(caption,textX,textY);
      context.fillStyle = color('--ink','#17333e'); context.fillText(caption,textX,textY);
    }
    function draw() {
      if (disposed) return;
      const bounds = canvas.getBoundingClientRect(), width = Math.max(1,bounds.width || 600), height = width / 2;
      const ratio = Math.min(win.devicePixelRatio || 1,2);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); dimensions = {width,height};
      context.setTransform(ratio,0,0,ratio,0,0); context.clearRect(0,0,width,height);
      context.fillStyle = color('--weather-map-water', '#e5edef'); context.fillRect(0,0,width,height);
      context.save(); context.beginPath(); context.rect(0,0,width,height); context.clip();
      context.strokeStyle = color('--line','#ccdade'); context.lineWidth = .55; context.globalAlpha = .7;
      for (let lon = -180; lon < 180; lon += 30) {
        const x = project({lat:0,lon},width,height,view)[0]; context.beginPath(); context.moveTo(x,0); context.lineTo(x,height); context.stroke();
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const y = project({lat,lon:0},width,height,view)[1]; context.beginPath(); context.moveTo(0,y); context.lineTo(width,y); context.stroke();
      }
      context.globalAlpha = 1;
      if (geography) {
        context.fillStyle = color('--weather-map-land','#b4c9c5'); context.strokeStyle = color('--weather-map-coast','#92aaa7'); context.lineWidth = .5;
        for (const feature of geography.features) {
          const polygons = feature.geometry?.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
          for (const polygon of polygons) for (const offset of [-360,0,360]) {
            context.beginPath();
            for (const ring of polygon) {
              ring.forEach(([lon,lat],index) => {
                const x = width / 2 + (lon + offset - view.lon) * width * view.zoom / 360;
                const y = height / 2 - (lat - view.lat) * height * view.zoom / 180;
                if (index) context.lineTo(x,y); else context.moveTo(x,y);
              }); context.closePath();
            }
            context.fill('evenodd'); context.stroke();
          }
        }
      }
      labelBoxes = []; labelMarker(selected,english() ? selected.en : selected.name,true);
      const labelled = new Set(['beijing','kuala','london','newyork','moscow']);
      for (const place of Object.values(model.presets)) {
        if (model.samePlace(place,selected)) continue;
        labelMarker(place,view.zoom >= 3 || labelled.has(place.id) ? (english() ? place.en : place.name) : '');
      }
      if (cursor) {
        const [x,y] = project(cursor,width,height,view); context.strokeStyle = color('--accent','#28647a'); context.lineWidth = 1;
        context.beginPath(); context.moveTo(x-9,y); context.lineTo(x+9,y); context.moveTo(x,y-9); context.lineTo(x,y+9); context.stroke();
      }
      context.restore();
      canvas.setAttribute('aria-label',word('天气选点地图。当前：','Weather location map. Selected: ') + model.label(selected,english(),false) + '；' + coordinateLabel(selected,english()));
      const output = doc.getElementById('weather-map-coordinate'); if (output) output.textContent = coordinateLabel(cursor || selected,english());
      for (const button of root.querySelectorAll('[data-weather-map-zoom]')) {
        const action = button.dataset.weatherMapZoom;
        button.disabled = action === 'in' && view.zoom >= 16 || action === 'out' && view.zoom <= 1;
      }
    }
    function zoomBy(factor) {
      const focal = cursor || selected;
      view = viewState({zoom:view.zoom * factor,lon:focal.lon,lat:focal.lat}); requestDraw();
    }
    function choose(point, snap = true) {
      if (disposed || !point || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return;
      const ticket = ++selectionTicket;
      const position = project(point,dimensions.width,dimensions.height,view);
      const preset = snap ? Object.values(model.presets).map(place => ({place,pixel:project(place,dimensions.width,dimensions.height,view)}))
        .map(item => ({...item,distance:Math.hypot(item.pixel[0]-position[0],item.pixel[1]-position[1])})).filter(item => item.distance <= 9).sort((a,b) => a.distance-b.distance)[0]?.place : undefined;
      cursor = preset || {lat:Number(point.lat.toFixed(4)),lon:Number(point.lon.toFixed(4))}; requestDraw();
      status(word('正在读取所选地点…','Reading the selected location…'));
      Promise.resolve().then(() => options.onPick?.({...cursor,...(preset ? {preset} : {})})).then(result => {
        if (!disposed && ticket === selectionTicket) status(result === false ? word('该地点暂不可用，请换个地方。','This location is unavailable. Try another point.') : '');
      }).catch(() => { if (!disposed && ticket === selectionTicket) status(word('该地点暂不可用，请稍后再试。','This location is unavailable. Try again later.')); });
    }
    listen(canvas,'pointerdown',event => {
      if (event.button !== undefined && event.button !== 0) return;
      pointer = {id:event.pointerId,x:event.clientX,y:event.clientY,view:{...view},dragged:false}; canvas.setPointerCapture?.(event.pointerId);
    });
    listen(canvas,'pointermove',event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX-pointer.x, dy = event.clientY-pointer.y;
      if (Math.hypot(dx,dy) > 6) pointer.dragged = true;
      if (!pointer.dragged) return;
      view = viewState({...pointer.view,lon:pointer.view.lon-dx*360/(dimensions.width*pointer.view.zoom),lat:pointer.view.lat+dy*180/(dimensions.height*pointer.view.zoom)}); requestDraw();
    });
    listen(canvas,'pointerup',event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dragged = pointer.dragged; pointer = null;
      if (!dragged) { const rect = canvas.getBoundingClientRect(); choose(unproject([event.clientX-rect.left,event.clientY-rect.top],dimensions.width,dimensions.height,view)); }
    });
    listen(canvas,'pointercancel',() => { pointer = null; });
    listen(canvas,'keydown',event => {
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(2); return; }
      if (event.key === '-') { event.preventDefault(); zoomBy(.5); return; }
      if (event.key === 'Home') { event.preventDefault(); view = viewState(); cursor = null; requestDraw(); return; }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(cursor || selected, !cursor); return; }
      const movement = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
      if (!movement) return;
      event.preventDefault(); const current = cursor || selected, step = (event.shiftKey ? 1 : 5) / view.zoom;
      cursor = {lat:clamp(current.lat+movement[1]*step,-89.9,89.9),lon:normal(current.lon+movement[0]*step)};
      const [x,y] = project(cursor,dimensions.width,dimensions.height,view);
      if (x < 15 || x > dimensions.width-15 || y < 15 || y > dimensions.height-15) view = viewState({...view,lon:cursor.lon,lat:cursor.lat});
      status(word('按 Enter 查看此处天气。','Press Enter to view weather here.')); requestDraw();
    });
    listen(root,'click',event => {
      const button = event.target.closest?.('[data-weather-map-zoom]'); if (!button || !root.contains(button)) return;
      const action = button.dataset.weatherMapZoom;
      if (action === 'reset') { view = viewState(); cursor = null; requestDraw(); } else if (action === 'in' || action === 'out') zoomBy(action === 'in' ? 2 : .5);
    });
    if (win.ResizeObserver) { const observer = new win.ResizeObserver(requestDraw); observer.observe(canvas); cleanup.push(() => observer.disconnect()); }
    if (win.MutationObserver) { const observer = new win.MutationObserver(requestDraw); observer.observe(doc.documentElement,{attributes:true,attributeFilter:['data-theme','data-skin']}); cleanup.push(() => observer.disconnect()); }
    listen(win,'resize',requestDraw);
    const unsubscribe = win.SiteI18n?.onChange?.(requestDraw); if (typeof unsubscribe === 'function') cleanup.push(unsubscribe);
    win.fetch('/assets/map-land.json',{signal:controller.signal,credentials:'same-origin'}).then(response => {
      if (!response.ok) throw new Error('Map unavailable'); return response.json();
    }).then(data => {
      if (!disposed && data?.type === 'FeatureCollection' && Array.isArray(data.features)) { geography = data; requestDraw(); }
    }).catch(() => { if (!disposed) { status(word('底图暂不可用，仍可按经纬度选点或查找城市。','Map unavailable; coordinates and city search still work.')); requestDraw(); } });
    const api = {
      setCity(value) { const valid = model.normalize(value); if (!valid || disposed) return false; selected = valid; cursor = null; selectionTicket++; status(''); requestDraw(); return true; },
      refresh:requestDraw,
      destroy() { if (disposed) return; disposed = true; controller.abort(); if (frame !== null) win.cancelAnimationFrame(frame); cleanup.splice(0).reverse().forEach(fn => fn()); },
      getState:() => ({selected,view:{...view},cursor:cursor && {...cursor},disposed})
    };
    win.SiteNavigation?.own?.(() => api.destroy()); requestDraw(); return api;
  }
  return Object.freeze({createWeatherMap,viewState,project,unproject,coordinateLabel});
});
