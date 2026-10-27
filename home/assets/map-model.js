(function (root, factory) {
  "use strict";
  const I = (key, values, fallback) => globalThis.FootprintsI18n ? globalThis.FootprintsI18n.text(key, values, fallback) : fallback.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.FootprintsModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const I = (key, values, fallback) => globalThis.FootprintsI18n ? globalThis.FootprintsI18n.text(key, values, fallback) : fallback.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
  const RECORD_KEYS = ["id", "start", "end", "city", "region", "country", "lat", "lon", "title", "description", "album", "certainty"];
  const MAX_RECORDS = 500, MAX_BYTES = 1048576;
  function fail(message) { throw new Error(message); }
  function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
  function field(object, key, max, required) {
    const value = object[key];
    if (typeof value !== "string") fail(I("map.model.s001", {p0:(key)}, "{p0} 必须是文字。"));
    if (value.length > max) fail(I("map.model.s002", {p0:(key),p1:(max)}, "{p0} 超过 {p1} 字限制。"));
    if (required && !value.trim()) fail(I("map.model.s003", {p0:(key)}, "{p0} 不能为空。"));
    return value.trim();
  }
  function publicReferenceUrl(value) {
    if (typeof value !== "string" || !/^https:\/\/[^/\\]/i.test(value) || /^https:\/\/[^/?#]*@/i.test(value) || value.includes("\\") || value.length > 2048 || value !== value.trim() || /[\s\u0000-\u001f\u007f-\u009f<>]/.test(value)) return false;
    let parsed;
    try {
      parsed = new URL(value);
      if (/[\u0000-\u001f\u007f-\u009f]/.test(decodeURIComponent(value))) return false;
    } catch (_) { return false; }
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && (!parsed.port || parsed.port === "443")
      && host.includes(".") && !host.includes(":") && !/^\d+(?:\.\d+){3}$/.test(host)
      && !/(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(host)
      && host.split(".").every(part => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part));
  }
  function referenceList(value, maximum = 6, empty = false) {
    if (!Array.isArray(value) || value.length < (empty ? 0 : 1) || value.length > maximum) fail(I("map.references.invalid", {}, "来源需要有效的 HTTPS 公开链接和简短标题。"));
    return value.map(item => {
      if (!plain(item) || Object.keys(item).length !== 2 || !Object.hasOwn(item, "label") || !Object.hasOwn(item, "url")) fail(I("map.references.invalid", {}, "来源需要有效的 HTTPS 公开链接和简短标题。"));
      const label = field(item, "label", 120, true);
      if (/[\u0000-\u001f\u007f-\u009f<>]/.test(item.label) || /(?:[A-Za-z]:[\\/]|file:\/\/|\\\\|\/(?:Users|home|mnt|tmp)\/)/i.test(label) || !publicReferenceUrl(item.url)) fail(I("map.references.invalid", {}, "来源需要有效的 HTTPS 公开链接和简短标题。"));
      return {label,url:item.url};
    });
  }
  function dateBounds(value) {
    if (value === "") return null;
    if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) fail(I("map.model.s004", {}, "日期请使用 YYYY、YYYY-MM 或 YYYY-MM-DD；未知请留空。"));
    const parts = value.split("-").map(Number), year = parts[0], month = parts[1], day = parts[2];
    if (year < 1 || year > 9999 || (month !== undefined && (month < 1 || month > 12))) fail(I("map.model.s005", {p0:(value)}, "日期无效：{p0}"));
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day !== undefined && (day < 1 || day > days[month - 1])) fail(I("map.model.s006", {p0:(value)}, "日期无效：{p0}"));
    return { min: year * 10000 + (month || 1) * 100 + (day || 1), max: year * 10000 + (month || 12) * 100 + (day || (month ? days[month - 1] : 31)) };
  }
  function record(value, index) {
    if (!plain(value)) fail(I("map.model.s007", {p0:(index + 1)}, "第 {p0} 条经历必须是对象。"));
    // Maintenance flags and private notes never enter the returned public fields.
    if (Object.prototype.hasOwnProperty.call(value, "approved") && typeof value.approved !== "boolean") fail(I("map.model.s008", {}, "approved 必须为 true 或 false。"));
    const output = {
      id: field(value, "id", 80, true), start: field(value, "start", 10), end: field(value, "end", 10),
      city: field(value, "city", 160, true), region: field(value, "region", 200), country: field(value, "country", 160, true),
      lat: value.lat, lon: value.lon, title: field(value, "title", 160, true),
      description: field(value, "description", 12000), album: field(value, "album", 200), certainty: value.certainty
    };
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(output.id)) fail(I("map.model.s009", {}, "id 只能包含英文字母、数字、下划线和短横线，并以字母或数字开始。"));
    const start = dateBounds(output.start), end = dateBounds(output.end);
    if (start && end && end.max < start.min) fail(I("map.model.s010", {p0:(output.title)}, "“{p0}”的结束日期早于开始日期。"));
    if (typeof output.lat !== "number" || !Number.isFinite(output.lat) || output.lat < -90 || output.lat > 90 || typeof output.lon !== "number" || !Number.isFinite(output.lon) || output.lon < -180 || output.lon > 180) fail(I("map.model.s011", {p0:(output.title)}, "“{p0}”需要有效城市中心坐标（纬度 -90～90，经度 -180～180）。"));
    if (output.album && !/^\/photos\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*\/$/.test(output.album)) fail(I("map.model.s012", {}, "相册只允许本站 /photos/相册标识/ 链接，或留空。"));
    if (!["confirmed", "approximate"].includes(output.certainty)) fail(I("map.model.s013", {}, "certainty 只能是 confirmed 或 approximate。"));
    if (Object.hasOwn(value, "references")) output.references = referenceList(value.references);
    // Optional journey semantics are public data; their absence preserves legacy files.
    if (Object.prototype.hasOwnProperty.call(value, "stayType")) {
      if (!["base", "visit"].includes(value.stayType)) fail(I("map.model.s014", {}, "stayType 只能是 base 或 visit。"));
      output.stayType = value.stayType;
    }
    if (Object.prototype.hasOwnProperty.call(value, "groupId")) {
      const groupId = field(value, "groupId", 80, true);
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(groupId)) fail(I("map.model.s015", {}, "groupId 只能包含英文字母、数字、下划线和短横线，并以字母或数字开始。"));
      output.groupId = groupId;
    }
    if (Object.prototype.hasOwnProperty.call(value, "sequence")) {
      if (!Number.isInteger(value.sequence) || value.sequence < 0 || value.sequence >= MAX_RECORDS) fail(I("map.model.s016", {p0:(MAX_RECORDS - 1)}, "sequence 必须是 0 到 {p0} 的整数。"));
      output.sequence = value.sequence;
    }
    if (Object.prototype.hasOwnProperty.call(value, "ongoing")) {
      if (typeof value.ongoing !== "boolean") fail(I("map.model.s017", {}, "ongoing 必须为 true 或 false。"));
      if (value.ongoing && (!output.start || output.end)) fail(I("map.model.s018", {}, "ongoing 为 true 时必须填写开始日期，并将结束日期留空。"));
      output.ongoing = value.ongoing;
    }
    for (const [key, requiredStayType] of [["baseReturn", "base"], ["returnAfter", "visit"]]) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (typeof value[key] !== "boolean") fail(I("map.model.s019", {p0:(key)}, "{p0} 必须为 true 或 false。"));
      if (value[key] && output.stayType !== requiredStayType) fail(I("map.model.s020", {p0:(key),p1:(requiredStayType)}, "{p0} 为 true 时 stayType 必须为 {p1}。"));
      output[key] = value[key];
    }
    return output;
  }
  function validate(value, internal) {
    if (!plain(value) || value.version !== 1 || !Array.isArray(value.records)) fail(I("map.model.s021", {}, "需要 version 为 1 且含 records 数组的足迹文档。"));
    if (value.records.length > MAX_RECORDS) fail(I("map.model.s022", {p0:(MAX_RECORDS)}, "每份地图最多 {p0} 条经历。"));
    const title = field(value, "title", 120, true), ids = new Set(), records = [];
    value.records.forEach((item, index) => {
      if (plain(item) && item.certainty === "pending") {
        if (item.approved === true) fail(I("map.model.s023", {}, "待确认经历不能标记为已批准。请先核对并修改确定程度。"));
        return;
      }
      const next = record(item, index); if (ids.has(next.id)) fail(I("map.model.s024", {p0:(next.id)}, "文档内 id 重复：{p0}")); ids.add(next.id); records.push(next);
    });
    return { version: 1, title, records };
  }
  function hasTimelineTable(text) {
    let fence = null;
    for (const line of text.split(/\r?\n/)) {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fence) {
        if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
        continue;
      }
      if (marker) { fence = { character: marker[1][0], length: marker[1].length }; continue; }
      const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
      if (cells.length === 4 && cells.join("|") === "时间|城市层级地点|描述|备注") return true;
    }
    return false;
  }
  function parse(text) {
    if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_BYTES) fail(I("map.model.s025", {}, "导入内容过大，请使用不超过 1 MiB 的足迹文档。"));
    let source = text.trim().replace(/^\uFEFF/, "");
    if (!source.startsWith("{")) {
      if (hasTimelineTable(source)) fail(I("map.model.s026", {}, "这是以时间表为准的表格文档。请先用本地更新器转换为足迹 JSON，或逐条填写并确认城市；不会读取文档内可能过时的 JSON 代码块。"));
      const matches = [...source.matchAll(/^```footprints\s*\r?\n([\s\S]*?)^```\s*$/gm)];
      if (matches.length !== 1) fail(I("map.model.s027", {}, "Markdown 需要恰好一个以 ```footprints 开头的 JSON 代码块。"));
      source = matches[0][1];
    }
    let value;
    try { value = JSON.parse(source); } catch (_) { fail(I("map.model.s028", {}, "JSON 格式有误，请检查双引号、逗号与括号。")); }
    return validate(value);
  }
  function merge(current, incoming) {
    const before = validate(current), next = validate(incoming), ids = new Map(before.records.map(item => [item.id, item]));
    let skipped = 0; const additions = [];
    for (const item of next.records) {
      if (ids.has(item.id)) {
        if (JSON.stringify(ids.get(item.id)) !== JSON.stringify(item)) fail(I("map.model.s029", {p0:(item.id)}, "id “{p0}”与现有经历冲突。本次未导入任何记录；请先修改 id 或编辑原记录。"));
        skipped++;
      } else additions.push(item);
    }
    if (before.records.length + additions.length > MAX_RECORDS) fail(I("map.model.s030", {p0:(MAX_RECORDS)}, "合并后超过 {p0} 条，未更改现有地图。"));
    return { document: { version: 1, title: before.records.length ? before.title : next.title, records: before.records.concat(additions) }, added: additions.length, skipped };
  }
  function peopleManifest(value) {
    if (!plain(value) || value.version !== 1 || !Array.isArray(value.people) || value.people.length > 40) fail(I("map.people.invalid", {}, "人物足迹资料格式无效。"));
    const ids = new Set();
    function localized(value, maximum) {
      if (!plain(value)) fail(I("map.people.invalid", {}, "人物足迹资料格式无效。"));
      const result = {};
      for (const language of ["zh-CN", "en"]) {
        result[language] = field(value, language, maximum, true);
        if (/[\u0000-\u001f\u007f-\u009f<>]/.test(result[language])) fail(I("map.people.invalid", {}, "人物足迹资料格式无效。"));
      }
      return result;
    }
    return {version:1,people:value.people.map(item => {
      if (!plain(item) || typeof item.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(item.id) || ids.has(item.id)
        || !Number.isInteger(item.record_count) || item.record_count < 0 || item.record_count > MAX_RECORDS
        || item.document_url !== "/assets/footprints-people/" + item.id + ".json" || item.markdown !== "/assets/footprints-people/" + item.id + ".md") fail(I("map.people.invalid", {}, "人物足迹资料格式无效。"));
      ids.add(item.id);
      return {id:item.id,label:localized(item.label,120),coverage:localized(item.coverage,1000),record_count:item.record_count,document_url:item.document_url,markdown:item.markdown};
    })};
  }
  function personBundle(value, entry) {
    if (!plain(value) || value.version !== 1 || value.id !== entry.id || !plain(value.documents)) fail(I("map.people.invalid", {}, "人物足迹资料格式无效。"));
    const documents = {};
    for (const language of ["zh-CN", "en"]) {
      documents[language] = validate(value.documents[language]);
      if (documents[language].records.length !== entry.record_count) fail(I("map.people.invalid", {}, "人物足迹资料格式无效。"));
    }
    const factual = ["id","start","end","lat","lon","certainty","stayType","groupId","sequence","ongoing","baseReturn","returnAfter"];
    for (let index = 0; index < entry.record_count; index++) for (const key of factual) if (documents["zh-CN"].records[index][key] !== documents.en.records[index][key]) fail(I("map.people.invalid", {}, "人物足迹资料格式无效。"));
    return {version:1,id:entry.id,documents,sources:referenceList(value.sources || [],40,true)};
  }
  function sorted(records) {
    return records.slice().sort((a, b) => (a.start ? dateBounds(a.start).min : Infinity) - (b.start ? dateBounds(b.start).min : Infinity) ||
      (Number.isSafeInteger(a.sequence) && Number.isSafeInteger(b.sequence) ? a.sequence - b.sequence : 0) || a.id.localeCompare(b.id));
  }
  function range(item, language) {
    const I = globalThis.FootprintsI18n ? globalThis.FootprintsI18n.freeze(language) : (key, values, fallback) => fallback.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
    if (item.ongoing === true) return I("map.model.s031", {p0:(item.start || I("map.model.s032", {}, "起始未知"))}, "{p0} — 至今");
    if (!item.start && !item.end) return I("map.model.s033", {}, "日期待确认");
    if (item.start && item.start === item.end) return item.start;
    return `${item.start || I("map.model.s034", {}, "起始未知")} — ${item.end || I("map.model.s035", {}, "结束未知")}`;
  }
  function cityKey(item) { return JSON.stringify([item.country, item.region, item.city, item.lat.toFixed(4), item.lon.toFixed(4)]); }
  function json(document) { return JSON.stringify(validate(document), null, 2); }
  function markdown(document) { return I("map.model.s036", {p0:(validate(document).title.replace(/[\r\n]/g, " ")),p1:(json(document))}, "# {p0}\n\n日期可用 YYYY、YYYY-MM、YYYY-MM-DD；空白表示未知，不能据此推断“至今”。坐标仅用于城市中心示意。\n\n```footprints\n{p1}\n```\n"); }
  return { MAX_BYTES, MAX_RECORDS, validate, parse, merge, sorted, range, cityKey, json, markdown, dateBounds, publicReferenceUrl, referenceList, peopleManifest, personBundle };
});
