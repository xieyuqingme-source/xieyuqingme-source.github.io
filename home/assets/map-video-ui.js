(() => {
  "use strict";
  const I = (key, values, fallback) => globalThis.FootprintsI18n ? globalThis.FootprintsI18n.text(key, values, fallback) : fallback.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
  function layoutOutroTitle(value, measure, options = {}) {
    const original = String(value || ""), text = original.replace(/\s+/gu, " ").trim(), width = options.width || 1152;
    const maximum = 60, minimum = 44, maxLines = 2;
    if (!/[\r\n]/u.test(original) && measure(original, maximum) <= width) return {fontSize:maximum, lines:[original], truncated:false, baselines:[818], closingBaseline:890};
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
    return {fontSize, lines, truncated, baselines:lines.map((_, index) => 818 + index * (fontSize + 6)), closingBaseline:lines.length > 1 ? 946 : 890};
  }
  if (typeof module === "object" && module.exports) { module.exports = {layoutOutroTitle}; return; }
  const A = window.FootprintsMap, J = window.FootprintsJourney, V = window.FootprintsVideo, M = window.FootprintsModel, L = window.FootprintsLabels;
  const $ = id => document.getElementById(id);
  if (!A || !J || !V) return;
  const canvas = $("video-canvas"), context = canvas.getContext("2d"), preview = $("video-preview");
  let plan = null, controller = null, busy = false, resultUrl = null, previewPlan = null, lock = [], lastProgress = "";
  const cap = V.capabilities();
  $("video-capability").textContent = cap.supported ? "" : I("map.video-ui.s001", {p0:(cap.reason || I("map.video-ui.s002", {}, "此浏览器不能生成视频。"))}, "{p0} 可继续下载 PNG / SVG 图片；建议使用新版 Chrome 或 Edge。");
  const musicText = (key, values = {}) => window.SiteI18n?.t(key, values, key) || key;
  let musicPrefs = {track: "travel", volume: .6}, musicSession = null, fileError = null, importing = false, importRevision = 0;
  try { const saved = JSON.parse(localStorage.getItem("xieyuqing-video-music-v2") || "null"); if (saved) { musicPrefs.track = ["none", "gentle", "travel", "custom"].includes(saved.track) ? saved.track : "travel"; musicPrefs.volume = Math.max(0, Math.min(1, Number.isFinite(saved.volume) ? saved.volume : .6)); } } catch (_) {}
  if (musicPrefs.track === "custom" && !window.SiteMusic?.state().custom) fileError = "music.customMissing";
  const musicControls = document.createElement("section"); musicControls.className = "video-music-options";
  musicControls.innerHTML = '<label><span id="video-music-label"></span><select id="video-music"><option value="travel"></option><option value="gentle"></option><option value="none"></option><option value="custom"></option></select></label><label><span id="video-music-volume-label"></span><input id="video-music-volume" type="range" min="0" max="100" step="5"><output id="video-music-volume-value"></output></label><button id="video-music-preview" type="button"></button><label><span id="video-music-file-label"></span><input id="video-music-file" type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.oga,.flac,.webm"></label><button id="video-music-clear" type="button"></button><p id="video-music-note" role="status" aria-live="polite"></p><p class="music-file-hint" id="video-music-file-hint"></p>';
  document.querySelector(".map-toolbar").after(musicControls);
  if (!window.SiteMusic?.supported()) musicPrefs.track = "none";
  $("video-music").value = musicPrefs.track; $("video-music-volume").value = Math.round(musicPrefs.volume * 100);
  const effectiveMusic = () => musicPrefs.volume > 0 ? musicPrefs.track : "none";
  function refreshMusic() {
    const state = window.SiteMusic?.state(), supported = !!window.SiteMusic?.supported(), previewing = state?.owner === "map", audioCap = effectiveMusic() === "none" || V.capabilities({audio: true}).supported;
    $("video-music-label").textContent = musicText("music.soundtrack"); musicControls.setAttribute("aria-label", musicText("music.soundtrack"));
    for (const [index, key] of ["music.recommended", "music.gentle", "music.none", "music.custom"].entries()) $("video-music").options[index].textContent = musicText(key);
    $("video-music").options[3].disabled = !state?.custom;
    $("video-music").disabled = busy || importing || !supported; $("video-music-volume").disabled = busy || !supported;
    $("video-music-volume-label").textContent = musicText("music.volume"); $("video-music-volume-value").textContent = $("video-music-volume").value + "%";
    $("video-music-volume").setAttribute("aria-label", musicText("music.videoVolume")); $("video-music-volume").setAttribute("aria-valuetext", $("video-music-volume").value + "%");
    $("video-music-preview").textContent = musicText(previewing ? "music.mapPause" : "music.mapPlay"); $("video-music-preview").disabled = busy || importing || !supported || (effectiveMusic() === "none" && !previewing); $("video-music-preview").setAttribute("aria-pressed", String(previewing));
    $("video-music-file-label").textContent = musicText("music.addFile"); $("video-music-file").disabled = busy || !supported;
    $("video-music-clear").textContent = musicText("music.clearFile"); $("video-music-clear").hidden = !state?.custom && !importing; $("video-music-clear").disabled = busy;
    $("video-music-file-hint").textContent = musicText("music.fileHint");
    $("video-music-note").textContent = fileError ? musicText(fileError) : importing ? musicText("music.fileLoading") : musicText(!supported ? "music.noAudioSupport" : !audioCap ? "music.noRecordingSupport" : musicPrefs.volume === 0 && musicPrefs.track !== "none" ? "music.zero" : previewing ? "music.playing" : "music.exportHint");
    if (state?.custom && musicPrefs.track === "custom" && !importing && !fileError) $("video-music-note").textContent += " " + musicText("music.fileReady", {name: state.custom.name, seconds: state.custom.duration.toFixed(1)});
    if (!busy && (!audioCap || importing || (musicPrefs.track === "custom" && !state?.custom))) $("video-generate").disabled = true;
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

  function seconds(ms) { const value = Math.ceil(ms / 1000); return I("map.video-ui.s003", {p0:(Math.floor(value / 60)),p1:(String(value % 60).padStart(2, "0"))}, "{p0} 分 {p1} 秒"); }
  function wrapped(text, width, font) {
    context.font = font; const lines = []; let line = "";
    for (const char of Array.from(text)) {
      if (char === "\n") { lines.push(line); line = ""; continue; }
      if (line && context.measureText(line + char).width > width) { lines.push(line); line = char; } else line += char;
    }
    lines.push(line); return lines;
  }
  function textPages(text) {
    context.font = "44px sans-serif";
    const pages = []; let page = "", line = "", lines = 1;
    for (const char of Array.from(text)) {
      if (char === "\n") {
        page += char; line = "";
        if (lines === 2) { pages.push(page); page = ""; lines = 1; } else lines++;
      } else {
        if (line && context.measureText(line + char).width > 1152) {
          line = "";
          if (lines === 2) { pages.push(page); page = ""; lines = 1; } else lines++;
        }
        page += char; line += char;
      }
    }
    if (page || !pages.length) pages.push(page);
    return pages;
  }
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
    plan = J.plan(journey.scenes.map(item => A.displayRecord(item, language)), { pace: $("video-pace").value, maxPageChars: 100, textPaginator: textPages, introMs: 1400, minStayMs: 2600, movementMs: 1500, distanceMs: 20, outroMs: 6200, outroZoomMs: 3600 });
    plan.language = language;
    $("journey-warnings").textContent = [...new Set(journey.warnings.map(value => typeof value === "string" ? value : value.message || "").filter(Boolean))].join("；");
    $("video-estimate").textContent = I("map.video-ui.s005", {p0:(seconds(plan.durationMs))}, "预计 {p0}");
    $("video-generate").disabled = !cap.supported || !context || !plan.scenes.length || !A.assetsReady();
    refreshMusic();
    $("video-generate").title = !A.assetsReady() ? I("map.video-ui.s006", {}, "请等待本地底图与头像加载；加载失败时请重选头像或刷新。") : "";
  }
  function clearResult() {
    preview.pause(); preview.removeAttribute("src"); preview.load(); preview.hidden = true; previewPlan = null;
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
    const mapBottom = 684, width = 1280, height = 960;
    const track = J.cameraTrack(frozenPlan.scenes, { aspect: width / mapBottom, bounds: A.projection().bounds });
    const terrain = assets.layer === "terrain" && assets.terrain ? await imageFrom(await (await fetch(assets.terrain)).blob()) : null;
    const source = A.avatarSource(), avatar = source ? await imageFrom(await (await fetch(source)).blob()) : null;
    const markers = Array.from(new Map(frozenPlan.scenes.filter(item => !item.derived).map(item => [M.cityKey(item), item])).entries());
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
      const frame = J.frameAt(frozenPlan, time), item = frame.record, unlocked = J.unlocked(frozenPlan.scenes, frame);
      const bounds = J.cameraAt(track, frame, frozenPlan.scenes, mode), project = View.projection(bounds, { width, height: mapBottom });
      context.fillStyle = colors.surface; context.fillRect(0, 0, width, height);
      context.save(); context.beginPath(); context.rect(0, 0, width, mapBottom); context.clip();
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high"; basemap(project);
      if (showRoute) {
        const points = routePoints(frame), summary = frame.phase === "outro";
        path(points, project, colors.accent, summary ? 3.2 : 2.6, summary ? .72 : .28, true);
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
        context.font = "24px sans-serif";
        const candidates = markers.filter(([key, city]) => unlocked.has(key) && project.contains(city)).map(([key, city]) => { const xy = project.point(city.lon, city.lat); return { key, name: city.city, x: xy[0], y: xy[1], priority: key === currentKey ? 1 : 0, markerRadius: key === currentKey ? 28 : 5 }; });
        const labels = L.layout(candidates, { width, height: mapBottom, visibleSet: unlocked, fontSize: 24, lineHeight: 30, measure: text => context.measureText(text).width });
        for (const label of labels) { context.strokeStyle = colors.surface; context.lineWidth = 3; context.strokeText(label.text, label.x, label.y); context.fillStyle = colors.ink; context.fillText(label.text, label.x, label.y); }
      }
      const point = frame.point;
      if (point && project.contains(point) && frame.phase !== "outro") {
        const [x, y] = project.point(point.lon, point.lat); context.fillStyle = colors.surface; context.strokeStyle = colors.accent; context.lineWidth = 3;
        context.beginPath(); context.arc(x, y, 28, 0, Math.PI * 2); context.fill(); context.stroke();
        context.save(); context.beginPath(); context.arc(x, y, 24, 0, Math.PI * 2); context.clip();
        if (avatar) context.drawImage(avatar, x - 24, y - 24, 48, 48); context.restore();
      }
      context.restore();
      context.fillStyle = colors.surface; context.fillRect(0, mapBottom, width, height - mapBottom); context.fillStyle = colors.line; context.fillRect(0, mapBottom, width, 2);
      if (frame.phase === "outro") {
        context.fillStyle = colors.accent; context.font = "42px sans-serif"; context.fillText(I("map.video-ui.s009", {p0:(markers.length),p1:(frozenPlan.scenes.filter(record => !record.derived).length)}, "{p0} 座城市 · {p1} 段经历"), 64, 740);
        const heading = layoutOutroTitle(title, (text, fontSize) => { context.font = `bold ${fontSize}px sans-serif`; return context.measureText(text).width; });
        context.fillStyle = colors.ink; context.font = `bold ${heading.fontSize}px sans-serif`;
        heading.lines.forEach((line, index) => context.fillText(line, 64, heading.baselines[index]));
        context.font = "42px sans-serif"; context.fillText(I("map.video-ui.s010", {}, "一路走来，足迹相连"), 64, heading.closingBaseline);
      } else if (item) {
        context.fillStyle = colors.accent; context.font = "42px sans-serif";
        const date = item.derived ? item.dateLabel || item.end || "" : M.range(item, frozenPlan.language), pages = frame.pageCount > 1 ? I("map.video-ui.s011", {p0:(frame.pageIndex + 1),p1:(frame.pageCount)}, " · {p0}/{p1} 页") : "";
        context.fillText(`${frame.index + 1}/${frame.count}${date ? ` · ${date}` : ""}${pages}`, 64, 740, 1152);
        const place = item.derived ? I("map.video-ui.s012", {p0:(item.city)}, "返回{p0}") : item.city;
        context.fillStyle = colors.ink; context.font = "bold 60px sans-serif"; context.fillText(place, 64, 814, 1152);
        context.font = "44px sans-serif";
        const lines = wrapped(frame.pageText || "", 1152, "44px sans-serif");
        if (lines.at(-1) === "") lines.pop();
        lines.forEach((line, index) => context.fillText(line, 64, 872 + index * 54));
        if (point && !project.contains(point)) { context.fillStyle = colors.muted; context.font = "24px sans-serif"; context.fillText(I("map.video-ui.s013", {}, "本幕地点在固定视野外"), 64, 650); }
      }
      // Recording and native video seeking never write to the editable SVG map.
      $("video-canvas").dataset.phase = frame.phase;
      $("video-canvas").dataset.camera = JSON.stringify(project.bounds);
    };
  }
  let activeGeneration = null;
  function generate() { if (activeGeneration) return activeGeneration; activeGeneration = generateVideo().finally(() => { activeGeneration = null; }); return activeGeneration; }
  async function generateVideo() {
    if (busy || $("video-generate").disabled || !plan) return;
    clearResult(); const frozenPlan = plan; controller = new AbortController(); setBusy(true); $("video-canvas").hidden = false; $("video-progress").value = 0; lastProgress = "";
    try {
      $("playback-progress").textContent = I("map.video-ui.s014", {}, "正在准备本地地图画面…");
      // Reserve the audio context within the original user click. No autoplay.
      const audioPreparation = window.SiteMusic?.prepareExport(effectiveMusic(), musicPrefs.volume, frozenPlan.durationMs, controller.signal);
      musicSession = audioPreparation ? await audioPreparation : null;
      if (!musicSession && effectiveMusic() !== "none") throw new Error(musicText("music.noAudioSupport"));
      const renderFrame = await makeRenderer(frozenPlan);
      if (controller.signal.aborted) throw new DOMException(I("map.video-ui.s015", {}, "已取消生成。"), "AbortError");
      const result = await V.record({ canvas, durationMs: frozenPlan.durationMs, audioTrack: musicSession?.audioTrack || null, startAudio: () => musicSession?.start(), renderFrame, signal: controller.signal, fps: 30, onProgress(value) {
        $("video-progress").value = value.progress;
        const label = value.state === "finalizing" ? I("map.video-ui.s016", {}, "正在封装视频…") : I("map.video-ui.s017", {p0:(Math.floor(value.progress * 100)),p1:(seconds(value.elapsedMs)),p2:(seconds(value.durationMs))}, "生成中 {p0}% · {p1} / {p2}");
        if (label !== lastProgress) { lastProgress = label; $("playback-progress").textContent = label; }
      } });
      resultUrl = URL.createObjectURL(result.blob); previewPlan = frozenPlan; preview.src = resultUrl; preview.muted = !result.hasAudio; preview.dataset.hasAudio = String(result.hasAudio); preview.hidden = false;
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
  window.FootprintsVideoUI = { generate, cancel, layoutOutroTitle, getPlan: () => plan, getState: () => ({ busy, ready: !!resultUrl, mimeType: cap.mimeType, extension: cap.extension }) };
  rebuild();
})();
