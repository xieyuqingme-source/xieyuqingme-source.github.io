(() => {
  "use strict";
  const I = (key, values, fallback) => globalThis.FootprintsI18n ? globalThis.FootprintsI18n.text(key, values, fallback) : fallback.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
  function layoutOutroTitle(value, measure, options = {}) {
    const original = String(value || ""), text = original.replace(/\s+/gu, " ").trim(), width = options.width || 1152;
    const compact = options.height === 720, maximum = options.overlay ? 32 : compact ? 44 : 60, minimum = options.overlay ? 26 : compact ? 32 : 44, maxLines = 2;
    const firstBaseline = options.overlay ? 588 : compact ? options.mapBottom + 89 : 818;
    if (!/[\r\n]/u.test(original) && measure(original, maximum) <= width) return {fontSize:maximum, lines:[original], truncated:false, baselines:[options.overlay ? 620 : firstBaseline], closingBaseline:options.overlay ? 656 : compact ? options.mapBottom + 149 : 890};
    const graphemes = word => typeof Intl.Segmenter === "function" ? Array.from(new Intl.Segmenter(undefined, {granularity:"grapheme"}).segment(word), part => part.segment) : Array.from(word);
    function wrap(fontSize) {
      const lines = []; let line = "";
      for (const word of text.split(" ").filter(Boolean)) {
        if (measure(word, fontSize) > width) {
          if (line) { lines.push(line); line = ""; }
          for (const unit of graphemes(word)) {
            if (line && measure(line + unit, fontSize) > width) { lines.push(line); line = unit; }
            else line += unit;
          }
        } else if (!line || measure(line + " " + word, fontSize) <= width) line += (line ? " " : "") + word;
        else { lines.push(line); line = word; }
      }
      if (line || !lines.length) lines.push(line);
      return lines;
    }
    let fontSize = maximum, lines = wrap(fontSize);
    while (lines.length > maxLines && fontSize > minimum) { fontSize -= 2; lines = wrap(fontSize); }
    const truncated = lines.length > maxLines;
    if (truncated) {
      lines = lines.slice(0, maxLines);
      let last = lines[maxLines - 1].trimEnd();
      while (last && measure(last + "…", fontSize) > width) {
        const space = last.lastIndexOf(" ");
        last = space > 0 ? last.slice(0, space) : graphemes(last).slice(0, -1).join("");
      }
      lines[maxLines - 1] = last + "…";
    }
    return {fontSize, lines, truncated, baselines:lines.map((_, index) => options.overlay && lines.length === 1 ? 620 : firstBaseline + index * (fontSize + 6)), closingBaseline:options.overlay ? 656 : compact ? (lines.length > 1 ? options.mapBottom + 191 : options.mapBottom + 149) : lines.length > 1 ? 946 : 890};
  }
  function captionLines(value,measure,width){
    const units=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(String(value)),part=>part.segment):Array.from(String(value));
    const lines=[];let start=0;
    while(start<units.length){let end=start,lastSpace=-1;
      while(end<units.length){if(units[end]==='\n'){end++;break;}if(measure(units.slice(start,end+1).join(''))>width&&end>start){if(lastSpace>start)end=lastSpace;break;}end++;if(/\s/u.test(units[end-1]))lastSpace=end;}
      if(end<=start)end=start+1;lines.push(units.slice(start,end).join(''));start=end;
    }
    return lines.length?lines:[''];
  }
  function captionLayout(lineCount=2){
    const count=Math.max(1,Math.min(2,Math.trunc(Number(lineCount)||1))),lastBaseline=656;
    const descriptionYs=Array.from({length:count},(_,index)=>lastBaseline-(count-1-index)*32),headerY=descriptionYs[0]-32;
    return{width:1280,height:720,mapBottom:720,left:32,textWidth:1216,headerY,dateY:headerY,cityY:headerY,descriptionYs,safeBottom:56,fontSizes:{date:22,city:30,description:26},overlay:true};
  }
  if (typeof module === "object" && module.exports) { module.exports = {layoutOutroTitle,captionLayout,captionLines}; return; }
  const A = window.FootprintsMap, J = window.FootprintsJourney, V = window.FootprintsVideo, M = window.FootprintsModel, L = window.FootprintsLabels;
  const $ = id => document.getElementById(id);
  if (!A || !J || !V) return;
  const canvas = $("video-canvas"), context = canvas.getContext("2d"), preview = $("video-preview");
  canvas.width=1280;canvas.height=720; // Protect cached older HTML from mismatched drawing coordinates.
  let plan = null, controller = null, busy = false, resultUrl = null, previewPlan = null, lock = [], lastProgress = "";
  const cap = V.capabilities();
  $("video-capability").textContent = cap.supported ? "" : I("map.video-ui.s001", {p0:(cap.reason || I("map.video-ui.s002", {}, "此浏览器不能生成视频。"))}, "{p0} 可继续下载 PNG / SVG 图片；建议使用新版 Chrome 或 Edge。");
  const musicText = (key, values = {}) => window.SiteI18n?.t(key, values, key) || key;
  const formatLabel=document.createElement('label');formatLabel.className='video-format-label';formatLabel.innerHTML='<span id="video-format-label"></span><select id="video-format"><option value="mp4"></option><option value="webm"></option></select>';document.querySelector('.playback-controls').append(formatLabel);
  const formatNote=document.createElement('p');formatNote.id='video-format-note';formatNote.className='playback-note';formatNote.setAttribute('role','status');document.querySelector('.playback-controls').after(formatNote);
  function formatCapability(){const container=$("video-format").value;return V.capabilities({container,compatible:container==='mp4',audio:effectiveMusic()!=='none'});}
  function refreshFormat(){const format=$("video-format").value,supported=formatCapability().supported;$("video-format-label").textContent=musicText('video.format');$("video-format").options[0].textContent=musicText('video.mp4');$("video-format").options[1].textContent=musicText('video.webm');formatNote.textContent=musicText(!supported?'video.formatUnsupported':format==='mp4'?'video.mp4Help':'video.webmHelp');}
  let musicPrefs = {track: "travel", volume: .6}, musicSession = null, fileError = null, importing = false, importRevision = 0;
  try { const saved = JSON.parse(localStorage.getItem("xieyuqing-video-music-v2") || "null"); if (saved) { musicPrefs.track = ["none", "gentle", "travel", "custom"].includes(saved.track) ? saved.track : "travel"; musicPrefs.volume = Math.max(0, Math.min(1, Number.isFinite(saved.volume) ? saved.volume : .6)); } } catch (_) {}
  if (musicPrefs.track === "custom" && !window.SiteMusic?.state().custom) fileError = "music.customMissing";
  const musicControls = document.createElement("section"); musicControls.className = "video-music-options";
  musicControls.innerHTML = '<label><span id="video-music-label"></span><select id="video-music"><option value="travel"></option><option value="gentle"></option><option value="none"></option><option value="custom"></option></select></label><label><span id="video-music-volume-label"></span><input id="video-music-volume" type="range" min="0" max="100" step="5"><output id="video-music-volume-value"></output></label><button id="video-music-preview" type="button"></button><label><span id="video-music-file-label"></span><input id="video-music-file" type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.oga,.flac,.webm"></label><button id="video-music-clear" type="button"></button><p id="video-music-note" role="status" aria-live="polite"></p><p class="music-file-hint" id="video-music-file-hint"></p>';
  document.querySelector(".map-toolbar").after(musicControls);
  // A browser limitation never silently changes an intended soundtrack to None.
  $("video-music").value = musicPrefs.track; $("video-music-volume").value = Math.round(musicPrefs.volume * 100);
  const effectiveMusic = () => musicPrefs.track;
  function refreshMusic() {
    const state = window.SiteMusic?.state(), supported = !!window.SiteMusic?.supported(), previewing = state?.owner === "map", audioCap = formatCapability().supported;
    refreshFormat();
    $("video-music-label").textContent = musicText("music.soundtrack"); musicControls.setAttribute("aria-label", musicText("music.soundtrack"));
    for (const [index, key] of ["music.recommended", "music.gentle", "music.none", "music.custom"].entries()) $("video-music").options[index].textContent = musicText(key);
    $("video-music").options[3].disabled = !state?.custom;
    $("video-music").disabled = busy || importing; for (const option of $("video-music").options) if (option.value !== "none") option.disabled = !supported || (option.value === "custom" && !state?.custom); $("video-music-volume").disabled = busy || !supported;
    $("video-music-volume-label").textContent = musicText("music.volume"); $("video-music-volume-value").textContent = $("video-music-volume").value + "%";
    $("video-music-volume").setAttribute("aria-label", musicText("music.videoVolume")); $("video-music-volume").setAttribute("aria-valuetext", $("video-music-volume").value + "%");
    $("video-music-preview").textContent = musicText(previewing ? "music.mapPause" : "music.mapPlay"); $("video-music-preview").disabled = busy || importing || !supported || (effectiveMusic() === "none" && !previewing); $("video-music-preview").setAttribute("aria-pressed", String(previewing));
    $("video-music-file-label").textContent = musicText("music.addFile"); $("video-music-file").disabled = busy || !supported;
    $("video-music-clear").textContent = musicText("music.clearFile"); $("video-music-clear").hidden = !state?.custom && !importing; $("video-music-clear").disabled = busy;
    $("video-music-file-hint").textContent = musicText("music.fileHint");
    $("video-music-note").textContent = fileError ? musicText(fileError) : importing ? musicText("music.fileLoading") : musicText(!supported ? "music.noAudioSupport" : !audioCap ? "music.noRecordingSupport" : musicPrefs.volume === 0 && musicPrefs.track !== "none" ? "video.zeroExport" : previewing ? "music.playing" : "music.exportHint");
    if (state?.custom && musicPrefs.track === "custom" && !importing && !fileError) $("video-music-note").textContent += " " + musicText("music.fileReady", {name: state.custom.name, seconds: state.custom.duration.toFixed(1)});
    if (!busy && (!audioCap || importing || (musicPrefs.track !== "none" && (!supported || musicPrefs.volume === 0)) || (musicPrefs.track === "custom" && !state?.custom))) $("video-generate").disabled = true;
  }
  function saveMusic() { try { localStorage.setItem("xieyuqing-video-music-v2", JSON.stringify(musicPrefs)); } catch (_) {} }
  function changed() { saveMusic(); clearResult(); rebuild(); refreshMusic(); }
  $("video-music").addEventListener("change", () => { musicPrefs.track = $("video-music").value; fileError = null; if (window.SiteMusic?.state().owner === "map") void window.SiteMusic.stop(); changed(); });
  $("video-music-volume").addEventListener("input", () => { musicPrefs.volume = Number($("video-music-volume").value) / 100; window.SiteMusic?.setVolume("map", musicPrefs.volume); changed(); });
  async function playMapMusic() {
    try { fileError = null; if (window.SiteMusic?.state().owner === "map") await window.SiteMusic.stop(); else if (effectiveMusic() !== "none") await window.SiteMusic?.playMap(musicPrefs.track, musicPrefs.volume); }
    catch (error) { if (error.name !== "AbortError") fileError = error.code || "music.loadError"; }
    refreshMusic();
  }
  $("video-music-preview").addEventListener("click", playMapMusic);
  $("video-music-file").addEventListener("change", async () => {
    const file = $("video-music-file").files[0]; if (!file) return;
    const ticket = ++importRevision; importing = true; fileError = null; refreshMusic();
    try { await window.SiteMusic.importCustom(file); musicPrefs.track = "custom"; $("video-music").value = "custom"; }
    catch (error) { if (error.name !== "AbortError") fileError = error.code || "music.fileDecode"; }
    finally { if (ticket === importRevision) { importing = false; $("video-music-file").value = ""; changed(); } }
  });
  $("video-music-clear").addEventListener("click", async () => { importRevision++; await window.SiteMusic?.clearCustom(); importing = false; fileError = null; musicPrefs.track = "travel"; $("video-music").value = "travel"; changed(); });
  window.SiteMusic?.onChange(refreshMusic);
  preview.addEventListener("play", () => { if (window.SiteMusic?.state().locked) { preview.pause(); return; } window.SiteMusic?.claim("video-player"); });
  window.addEventListener("site:audio:claim", event => { if (event.detail?.owner !== "video-player") preview.pause(); });
  window.addEventListener("footprints:language", refreshMusic);
  refreshMusic();

  const lengthLabel = document.createElement("label");lengthLabel.innerHTML = '<span id="video-length-label"></span><select id="video-length"><option value="full"></option><option value="brief"></option></select>';document.querySelector('.playback-controls').append(lengthLabel);
  function refreshLength(){ $("video-length-label").textContent=musicText("video.length");$("video-length").options[0].textContent=musicText("video.full");$("video-length").options[1].textContent=musicText("video.brief"); }
  refreshLength();window.addEventListener("footprints:language",refreshLength);
  const captionPanel = document.createElement("section");captionPanel.id="video-caption-preview";captionPanel.className="video-caption-preview";captionPanel.hidden=true;
  captionPanel.innerHTML='<p class="video-caption-date"></p><h3 class="video-caption-city"></h3><p class="video-caption-description"></p>';preview.after(captionPanel);
  function refreshPreviewCaption(){
    if(!previewPlan||preview.hidden){captionPanel.hidden=true;return;}
    const frame=J.frameAt(previewPlan,preview.currentTime*1000),record=frame.record;
    const frozen=window.FootprintsI18n?.freeze(previewPlan.language);
    captionPanel.hidden=false;captionPanel.setAttribute("aria-label",musicText("video.captionLabel"));
    captionPanel.querySelector('.video-caption-date').textContent=record?`${frame.index+1}/${frame.count} · ${record.derived?record.dateLabel||record.end||"":M.range(record,previewPlan.language)}`:"";
    captionPanel.querySelector('.video-caption-city').textContent=record?(record.derived?(frozen?frozen("map.video-ui.s012",{p0:record.city},"返回{p0}"):record.city):record.city):A.displayTitle(previewPlan.language);
    captionPanel.querySelector('.video-caption-description').textContent=record?record.description||"":(frozen?frozen("map.video-ui.s010",{},"一路走来，足迹相连"):"");
  }
  for(const event of['loadeddata','timeupdate','seeked'])preview.addEventListener(event,refreshPreviewCaption);

  function seconds(ms) { const value = Math.ceil(ms / 1000); return I("map.video-ui.s003", {p0:(Math.floor(value / 60)),p1:(String(value % 60).padStart(2, "0"))}, "{p0} 分 {p1} 秒"); }
  function wrapped(text,width,font){context.font=font;return captionLines(text,value=>context.measureText(value).width,width);}
  function textPages(text){const layout=captionLayout();context.font=`${layout.fontSizes.description}px sans-serif`;const lines=captionLines(text,value=>context.measureText(value).width,layout.textWidth),pages=[];for(let index=0;index<lines.length;index+=2)pages.push(lines.slice(index,index+2).join(''));return pages;}
  function rebuild() {
    if (busy) return;
    if (!context) {
      plan = null; $("video-generate").disabled = true;
      $("video-capability").textContent = I("map.video-ui.s004", {}, "此浏览器未提供视频画布，无法生成视频。可继续下载 SVG 图片；PNG 取决于浏览器画布支持。");
      $("video-estimate").textContent = ""; return;
    }
    const records = A.records();
    // Confirmed baseReturn metadata remains authoritative. Visitor data is never
    // given the author's city and unconfirmed multi-city bases stay unresolved.
    const panel = $("journey-options"); panel.replaceChildren(); panel.hidden = true;
    const journey = J.build(records);
    const language = window.FootprintsI18n?.lang() || "zh-CN";
    plan = J[$("video-length").value === "brief" ? "briefPlan" : "plan"](journey.scenes.map(item => A.displayRecord(item, language)), { pace: $("video-pace").value, maxPageChars: 100, textPaginator: textPages, introMs: 1400, minStayMs: 2600, movementMs: 1500, distanceMs: 20, outroMs: 6200, outroZoomMs: 3600, targetMs:90000 });
    plan.language = language;
    $("journey-warnings").textContent = [...new Set(journey.warnings.map(value => typeof value === "string" ? value : value.message || "").filter(Boolean))].join("；");
    $("video-estimate").textContent = musicText("video.estimate", {duration:seconds(plan.durationMs),count:plan.scenes.length,total:plan.totalSceneCount||plan.scenes.length,mode:musicText(plan.brief?"video.brief":"video.full")});
    $("video-generate").disabled = !cap.supported || !context || !plan.scenes.length || !A.assetsReady();
    refreshMusic();
    $("video-generate").title = !A.assetsReady() ? I("map.video-ui.s006", {}, "请等待本地底图与头像加载；加载失败时请重选头像或刷新。") : "";
  }
  function clearResult() {
    preview.pause(); preview.removeAttribute("src"); preview.load(); preview.hidden = true; previewPlan = null; captionPanel.hidden=true;
    if (resultUrl) URL.revokeObjectURL(resultUrl); resultUrl = null;
    $("video-download").hidden = true; $("video-download").removeAttribute("href"); $("video-download").removeAttribute("download");
  }
  function setBusy(value) {
    busy = value; $("video-cancel").hidden = !value; $("video-progress").hidden = !value;
    if (value) {
      lock = Array.from(document.querySelectorAll(".map-main button, .map-main input, .map-main select, .map-main textarea, #theme-toggle")).filter(node => !["video-cancel", "map-expanded-close"].includes(node.id)).map(node => [node, node.disabled]);
      for (const [node] of lock) node.disabled = true;
      $("video-cancel").focus({ preventScroll: true });
    } else { for (const [node, disabled] of lock) node.disabled = disabled; lock = []; }
    // Snapshot ordinary draft controls before the map applies its recording
    // state, then let that state refresh undo/clear after the snapshot restores.
    A.setRecording(value); refreshMusic();
    if (!value) rebuild();
  }
  function palette() { const style = getComputedStyle(document.documentElement); return Object.fromEntries(["paper", "surface", "ink", "muted", "accent", "line", "soft"].map(key => [key, style.getPropertyValue("--" + key).trim()])); }
  async function imageFrom(blob) { const url = URL.createObjectURL(blob); try { const image = new Image(); image.src = url; await image.decode(); return image; } finally { URL.revokeObjectURL(url); } }
  function routePoints(frame) { return frame.cumulativePath || []; }
  async function makeRenderer(frozenPlan) {
    // The rendered file retains its starting language even if the page changes.
    const I = window.FootprintsI18n ? window.FootprintsI18n.freeze(frozenPlan.language) : (key, values, fallback) => fallback.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
    if (!A.assetsReady()) throw new Error(I("map.video-ui.s007", {}, "底图或头像尚未准备好，请等待加载完成后重试。"));
    await document.fonts.ready;
    const colors = palette(), assets = A.videoAssets(), View = window.FootprintsView;
    const mode = $("video-camera").value, showRoute = $("map-route").checked, showLabels = $("map-labels").checked;
    const layout=captionLayout(), {mapBottom}=layout, width = canvas.width, height = canvas.height;
    const allScenes = frozenPlan.fullScenes || frozenPlan.scenes, overviewLabel = musicText("video.briefLabel");
    const track = J.cameraTrack(allScenes, { aspect: width / mapBottom, followSpan:36, bounds: A.projection().bounds });
    const terrain = assets.layer === "terrain" && assets.terrain ? await imageFrom(await (await fetch(assets.terrain)).blob()) : null;
    const source = A.avatarSource(), avatar = source ? await imageFrom(await (await fetch(source)).blob()) : null;
    const markers = Array.from(new Map(allScenes.filter(item => !item.derived).map(item => [M.cityKey(item), item])).entries());
    const title = A.displayTitle(frozenPlan.language) || I("map.video-ui.s008", {}, "我的足迹");
    function polygons(value) {
      if (!value) return [];
      if (value.type === "FeatureCollection") return value.features.flatMap(polygons);
      if (value.type === "Feature") return polygons(value.geometry);
      if (value.type === "GeometryCollection") return value.geometries.flatMap(polygons);
      return value.type === "Polygon" ? [value.coordinates] : value.type === "MultiPolygon" ? value.coordinates : [];
    }
    const land = polygons(assets.land);
    function basemap(project) {
      context.fillStyle = colors.soft; context.fillRect(0, 0, width, mapBottom);
      if (terrain) {
        const area = project.bounds, sx = (area[0] + 180) / 360 * terrain.naturalWidth, sy = (90 - area[3]) / 180 * terrain.naturalHeight;
        context.drawImage(terrain, sx, sy, (area[2] - area[0]) / 360 * terrain.naturalWidth, (area[3] - area[1]) / 180 * terrain.naturalHeight, 0, 0, width, mapBottom);
        context.globalAlpha=.28;context.fillStyle=colors.surface;context.fillRect(0,0,width,mapBottom);context.globalAlpha=1;
      } else {
        context.strokeStyle = colors.muted; context.lineWidth = 1; context.globalAlpha = .16; context.beginPath();
        for (let lon = -180; lon <= 180; lon += 30) { const a = project.point(lon, -90), b = project.point(lon, 90); context.moveTo(...a); context.lineTo(...b); }
        for (let lat = -60; lat <= 60; lat += 30) { const a = project.point(-180, lat), b = project.point(180, lat); context.moveTo(...a); context.lineTo(...b); }
        context.stroke(); context.globalAlpha = 1; context.fillStyle = colors.line; context.strokeStyle = colors.surface; context.lineWidth = .7;
        for (const polygon of land) { context.beginPath(); for (const ring of polygon) { ring.forEach((p, i) => { const xy = project.point(p[0], p[1]); if (i) context.lineTo(...xy); else context.moveTo(...xy); }); context.closePath(); } context.fill("evenodd"); context.stroke(); }
      }
    }
    function path(points, project, color, lineWidth, alpha, dashed) {
      context.strokeStyle = color; context.lineWidth = lineWidth; context.globalAlpha = alpha; context.setLineDash(dashed ? [7, 7] : []);
      context.lineCap = "round"; context.lineJoin = "round"; context.beginPath(); let previous = null;
      for (const point of points) { const xy = project.point(point.lon, point.lat); if (!previous || Math.abs(point.lon - previous.lon) > 180) context.moveTo(...xy); else context.lineTo(...xy); previous = point; }
      context.stroke(); context.setLineDash([]); context.globalAlpha = 1;
    }
    return time => {
      const frame = J.frameAt(frozenPlan, time), item = frame.record, unlocked = J.unlocked(allScenes, Object.assign({},frame,{index:frame.revealedIndex??frame.index}));
      const bounds = J.cameraAt(track, frame, frozenPlan.scenes, mode), project = View.projection(bounds, { width, height: mapBottom });
      context.fillStyle = colors.surface; context.fillRect(0, 0, width, height);
      context.save(); context.beginPath(); context.rect(0, 0, width, mapBottom); context.clip();
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high"; basemap(project);
      if (showRoute) {
        const points = routePoints(frame), summary = frame.phase === "outro";
        path(points, project, colors.accent, summary ? 3.2 : 2.6, summary ? .60 : .16, true);
        const active = frame.next ? [item, frame.point] : frame.index > 0 ? [frozenPlan.scenes[frame.index - 1], item] : [];
        if (!summary && active.length) { path(active, project, colors.surface, 7, .9, false); path(active, project, colors.accent, 4.5, 1, false); }
      }
      for (const [key, city] of markers) {
        if (!unlocked.has(key) || !project.contains(city)) continue;
        const xy = project.point(city.lon, city.lat); context.fillStyle = colors.accent; context.strokeStyle = colors.surface; context.lineWidth = 2;
        context.beginPath(); context.arc(...xy, 4.6, 0, Math.PI * 2); context.fill(); context.stroke();
      }
      if (showLabels && L) {
        const currentKey = item ? M.cityKey(item) : null;
        context.font = "600 24px sans-serif";
        const recent = new Set(allScenes.slice(0,(frame.revealedIndex??frame.index)+1).slice(-10).map(M.cityKey));
        const candidates = markers.filter(([key, city]) => unlocked.has(key) && project.contains(city) && (frame.phase === "outro" || key === currentKey || recent.has(key))).map(([key, city]) => { const xy = project.point(city.lon, city.lat); return { key, name: city.city, x: xy[0], y: xy[1], priority: key === currentKey ? 1 : 0, markerRadius: key === currentKey ? 28 : 5 }; });
        const labels = L.layout(candidates, { width, height: mapBottom, visibleSet: unlocked, reserved:[{x:24,y:558,width:1232,height:106}], fontSize: 24, lineHeight: 30, measure: text => context.measureText(text).width });
        for (const label of labels) { context.strokeStyle = colors.surface; context.lineWidth = 3; context.strokeText(label.text, label.x, label.y); context.fillStyle = colors.ink; context.fillText(label.text, label.x, label.y); }
      }
      const point = frame.point;
      if (point && project.contains(point) && frame.phase !== "outro") {
        const [x, y] = project.point(point.lon, point.lat); context.fillStyle = colors.surface; context.strokeStyle = colors.accent; context.lineWidth = 3;
        context.beginPath(); context.arc(x, y, 26, 0, Math.PI * 2); context.fill(); context.stroke();
        context.save(); context.beginPath(); context.arc(x, y, 22, 0, Math.PI * 2); context.clip();
        if (avatar) context.drawImage(avatar, x - 22, y - 22, 44, 44); context.restore();
      }
      context.restore();
      // Transparent caption overlay: map pixels continue behind every line.
      // Stroke and a soft shadow provide contrast without an opaque footer.
      const {left,textWidth,fontSizes}=layout;
      function caption(text,x,y,font,maxWidth=textWidth){
        context.save();context.font=font;context.lineJoin="round";context.lineWidth=2.5;
        context.strokeStyle="rgba(12,24,29,.88)";context.fillStyle="#fff";
        context.shadowColor="rgba(0,0,0,.6)";context.shadowBlur=3;context.shadowOffsetY=1;
        context.strokeText(text,x,y,maxWidth);context.shadowBlur=0;context.shadowOffsetY=0;
        context.fillText(text,x,y,maxWidth);context.restore();
      }
      if (frame.phase === "outro" || frame.phase === "intro") {
        const heading = layoutOutroTitle(title, (text, fontSize) => { context.font = `bold ${fontSize}px sans-serif`; return context.measureText(text).width; }, {width:textWidth,height,mapBottom,overlay:true});
        caption(I("map.video-ui.s009", {p0:markers.length,p1:allScenes.filter(record => !record.derived).length}, "{p0} 座城市 · {p1} 段经历") + (frozenPlan.brief ? " · " + overviewLabel : ""),left,heading.baselines[0]-36,"600 22px sans-serif");
        heading.lines.forEach((line,index)=>caption(line,left,heading.baselines[index],`bold ${heading.fontSize}px sans-serif`));
        caption(I("map.video-ui.s010", {}, "一路走来，足迹相连"),left,heading.closingBaseline,"22px sans-serif");
      } else if (item) {
        const date = item.derived ? item.dateLabel || item.end || "" : M.range(item, frozenPlan.language), pages = frame.pageCount > 1 ? I("map.video-ui.s011", {p0:frame.pageIndex + 1,p1:frame.pageCount}, " · {p0}/{p1} 页") : "";
        const place = item.derived ? I("map.video-ui.s012", {p0:item.city}, "返回{p0}") : item.city;
        const lines = wrapped(frame.pageText || "",textWidth,`${fontSizes.description}px sans-serif`);
        if (lines.at(-1) === "") lines.pop();
        const textLayout=captionLayout(lines.length),cityFont=`bold ${fontSizes.city}px sans-serif`;
        context.font=cityFont;const cityWidth=Math.min(context.measureText(place).width,textWidth*.45),metadataX=left+cityWidth+18;
        caption(place,left,textLayout.headerY,cityFont,textWidth*.45);
        caption(`${frame.index + 1}/${frame.count}${date ? ` · ${date}` : ""}${pages}${frozenPlan.brief ? " · " + overviewLabel : ""}`,metadataX,textLayout.headerY,`600 ${fontSizes.date}px sans-serif`,textWidth-cityWidth-18);
        lines.forEach((line,index)=>caption(line,left,textLayout.descriptionYs[index],`${fontSizes.description}px sans-serif`));
        if (point && !project.contains(point)) caption(I("map.video-ui.s013", {}, "本幕地点在固定视野外"),left,textLayout.headerY-36,"20px sans-serif");
      }
      // Recording and native video seeking never write to the editable SVG map.
      $("video-canvas").dataset.phase = frame.phase;
      $("video-canvas").dataset.camera = JSON.stringify(project.bounds);
    };
  }
  let activeGeneration = null, lastAudioEvidence = null, lastResultType = null;
  function generate() { if (activeGeneration) return activeGeneration; activeGeneration = generateVideo().finally(() => { activeGeneration = null; }); return activeGeneration; }
  async function generateVideo() {
    if (busy || $("video-generate").disabled || !plan) return;
    clearResult(); lastAudioEvidence=null;lastResultType=null;const desiredContainer=$("video-format").value; const frozenPlan = plan; controller = new AbortController(); setBusy(true); $("video-canvas").hidden = false; $("video-progress").value = 0; lastProgress = "";
    try {
      $("playback-progress").textContent = I("map.video-ui.s014", {}, "正在准备本地地图画面…");
      // Reserve the audio context within the original user click. No autoplay.
      const audioPreparation = window.SiteMusic?.prepareExport(effectiveMusic(), musicPrefs.volume, frozenPlan.durationMs, controller.signal);
      musicSession = audioPreparation ? await audioPreparation : null;
      if ((!musicSession || !musicSession.audioTrack) && effectiveMusic() !== "none") throw new Error(musicText("music.noAudioSupport"));
      const renderFrame = await makeRenderer(frozenPlan);
      if (controller.signal.aborted) throw new DOMException(I("map.video-ui.s015", {}, "已取消生成。"), "AbortError");
      const result = await V.record({ canvas, container:desiredContainer, compatible:desiredContainer==='mp4', durationMs: frozenPlan.durationMs, audioTrack: musicSession?.audioTrack || null, startAudio: () => musicSession?.start(), renderFrame, signal: controller.signal, fps: 30, onProgress(value) {
        $("video-progress").value = value.progress; musicSession?.measure?.();
        const label = value.state === "finalizing" ? I("map.video-ui.s016", {}, "正在封装视频…") : musicText("video.progress", {percent:Math.floor(value.progress*100),elapsed:seconds(value.elapsedMs),duration:seconds(value.durationMs),remaining:seconds(Math.max(0,value.durationMs-value.elapsedMs))});
        if (label !== lastProgress) { lastProgress = label; $("playback-progress").textContent = label; }
      } });
      const container = await V.inspectTracks(result.blob,{details:true}), signalEvidence = musicSession?.evidence?.();
      if (effectiveMusic() !== "none" && (container.audioTracks < 1 || (signalEvidence?.windows > 0 && signalEvidence.maxRms < 1e-7))) throw new Error(musicText("video.missingAudio"));
      if (effectiveMusic() === "none" && container.audioTracks) throw new Error(musicText("video.unexpectedAudio"));
      if(desiredContainer==='mp4' && (!container.codecs?.some(codec=>['avc1','avc3'].includes(codec)) || (effectiveMusic()!=='none' && !container.codecs.includes('mp4a'))))throw new Error(musicText('video.notCompatible'));
      lastResultType={mimeType:result.mimeType,extension:result.extension};
      lastAudioEvidence = {container,signal:signalEvidence||null,track:effectiveMusic()};
      resultUrl = URL.createObjectURL(result.blob); previewPlan = frozenPlan; preview.src = resultUrl; preview.muted = !result.hasAudio; preview.dataset.hasAudio = String(result.hasAudio); preview.hidden = false;refreshPreviewCaption();
      const link = $("video-download"); link.href = resultUrl; link.download = `${window.FootprintsI18n ? window.FootprintsI18n.text("map.video.filename", {}, "足迹地图", frozenPlan.language) : "footprints"}.${result.extension}`; link.textContent = I("map.video-ui.s018", {p0:(result.extension.toUpperCase()),p1:((result.blob.size / 1048576).toFixed(1))}, "↓ 下载 {p0} 视频（{p1} MB）"); link.hidden = false;
      $("playback-progress").textContent = I("map.video-ui.s019", {p0:(result.extension.toUpperCase()),p1:(seconds(result.durationMs))}, "已生成 {p0} · {p1}。可预览、定位并下载。");
      if (result.hasAudio) $("playback-progress").textContent += " " + musicText("music.written", {track: window.SiteMusic.label(musicPrefs.track)});
      A.status(I("map.video-ui.s020", {}, "视频已在本机生成。点击下载保存；视频文件不会自动保存到浏览器草稿。"));
    } catch (error) {
      $("playback-progress").textContent = error.name === "AbortError" ? I("map.video-ui.s021", {}, "已取消生成，未保留半成品。可重新生成。") : I("map.video-ui.s022", {p0:(error.message || I("map.video-ui.s023", {}, "视频生成失败"))}, "{p0} 可重试，或下载 PNG / SVG 图片。");
      if (error.name !== "AbortError") A.status($("playback-progress").textContent, true);
    } finally { if (musicSession) await musicSession.close(); musicSession = null; controller = null; setBusy(false); $("video-canvas").hidden = true; $("video-generate").focus({ preventScroll: true }); }
  }
  function cancel() { if (controller) controller.abort(); }
  $("video-generate").addEventListener("click", generate); $("video-cancel").addEventListener("click", cancel);
  $("video-format").addEventListener("change", () => { clearResult(); rebuild(); });
  $("video-length").addEventListener("change", () => { clearResult(); rebuild(); });
  $("video-pace").addEventListener("change", () => { clearResult(); rebuild(); });
  $("video-camera").addEventListener("change", () => { clearResult(); rebuild(); });
  window.addEventListener("footprints:reset", () => { if (!busy) { clearResult(); rebuild(); } });
  window.addEventListener("footprints:assets", rebuild);
  window.addEventListener("footprints:labels", () => { if (!busy) { clearResult(); rebuild(); } });
  window.addEventListener("footprints:avatar", () => { if (!busy) { clearResult(); rebuild(); } });
  window.addEventListener("pagehide", () => { cancel(); clearResult(); });
  window.SiteNavigation?.onLeave(async () => { cancel(); await activeGeneration; clearResult(); importRevision++; window.SiteMusic?.cancelImport(); });
  window.addEventListener("footprints:language", () => {
    const currentCapability = V.capabilities();
    $("video-capability").textContent = currentCapability.supported ? "" : I("map.video-ui.s001", {p0:currentCapability.reason || I("map.video-ui.s002", {}, "此浏览器不能生成视频。")}, "{p0} 可继续下载 PNG / SVG 图片；建议使用新版 Chrome 或 Edge。");
    if (!busy) rebuild();
    else {
      // Repaint framework messages without rebuilding the frozen recording plan.
      $("journey-warnings").textContent = [...new Set(J.build(A.records()).warnings.map(value => typeof value === "string" ? value : value.message || "").filter(Boolean))].join(window.FootprintsI18n?.lang() === "en" ? "; " : "；");
      $("video-estimate").textContent = I("map.video-ui.s005", {p0:seconds(plan.durationMs)}, "预计 {p0}");
    }
    if (window.FootprintsI18n) window.FootprintsI18n.refreshMessages(["video-download", "playback-progress"]);
  });
  window.FootprintsVideoUI = { generate, cancel, layoutOutroTitle, getPlan: () => plan, getState: () => ({ version:"2026-10-24.5", audioEvidence:lastAudioEvidence, busy, ready: !!resultUrl, mimeType:lastResultType?.mimeType||formatCapability().mimeType,extension:lastResultType?.extension||formatCapability().extension }) };
  rebuild();
})();
