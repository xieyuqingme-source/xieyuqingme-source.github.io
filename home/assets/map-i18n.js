(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    const read = id => { try { return JSON.parse(root.document.getElementById(id)?.textContent || "{}"); } catch (_) { return {}; } };
    root.FootprintsI18n = api.create({ runtime: root.SiteI18n, catalogue: read("site-i18n-data"), display: read("footprints-display-data") });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function create(options) {
    const o = options || {}, runtime = o.runtime, catalogue = o.catalogue || {}, display = o.display || {}, messages = new Map();
    const lang = () => runtime?.lang() === "en" ? "en" : "zh-CN";
    const interpolate = (template, values) => String(template).replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values || {}, name) ? String(values[name]) : match);
    function text(key, values, fallback, language) {
      const selected = language || lang(), template = catalogue[selected]?.[key] ?? fallback ?? key;
      const value = !language && runtime ? runtime.t(key, values || {}, fallback) : interpolate(template, values);
      messages.set(value, { key, values: { ...values }, fallback });
      if (messages.size > 1200) messages.delete(messages.keys().next().value);
      return value;
    }
    function retranslate(value, depth = 0) {
      const message = messages.get(value); if (!message || depth > 4) return value;
      const values = Object.fromEntries(Object.entries(message.values).map(([key, item]) => [key, typeof item === "string" ? retranslate(item, depth + 1) : item]));
      return text(message.key, values, message.fallback);
    }
    function place(value, language) { return (language || lang()) === "en" ? display.places?.[value] || value : value; }
    function record(item, publicMode, language) {
      if (!item || !publicMode) return item;
      const entry = display.records?.[item.sourceId || item.id]; if (!entry) return item;
      const fields = item.derived ? ["city", "region", "country"] : ["city", "region", "country", "title", "description"];
      if (!fields.every(key => item[key] === entry.source[key] || item[key] === entry.en[key])) return item;
      const result = { ...item }, selected = language || lang();
      for (const key of fields) result[key] = selected === "en" ? entry.en[key] : entry.source[key];
      if (item.derived) result.frameworkLabel = text("map.return", { city: result.city }, "返回{city}", selected);
      return result;
    }
    function documentTitle(document, publicMode, language) {
      return publicMode && (language || lang()) === "en" && document.title === display.document?.source_title ? display.document.title : document.title;
    }
    function refreshMessages(ids) {
      if (typeof document === "undefined") return;
      for (const id of ids) { const node = document.getElementById(id); if (node && node.textContent) node.textContent = retranslate(node.textContent); }
    }
    return { lang, text, retranslate, place, record, documentTitle, refreshMessages, freeze: language => (key, values, fallback) => text(key, values, fallback, language || lang()) };
  }
  return { create };
});
