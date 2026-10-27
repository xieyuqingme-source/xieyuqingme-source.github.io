/* Shared display language. App models, saved content and theme keys stay independent. */
(() => {
  "use strict";
  const languages = ["zh-CN", "en"];
  const catalogues = { "zh-CN": Object.create(null), en: Object.create(null) };
  const subscribers = new Set();
  const preferenceKey = "xieyuqing-site-language";
  const feature = /^\/(?:today|about|projects|photos|map|game|anthology)(?:\/|$)/;
  const resource = /\/(?:assets|images|data)(?:\/|$)|\.(?:png|jpe?g|webp|gif|svg|json|css|js|xml|mp4|webm)$/i;
  const navKeys = { "/": "home", "/today/": "today", "/articles/": "articles", "/anthology/": "anthology", "/projects/": "projects", "/photos/": "photos", "/map/": "map", "/game/": "games", "/about/": "about" };
  let page = {};
  let current = document.documentElement.lang?.toLowerCase().startsWith("en") ? "en" : "zh-CN";
  if (/^\/en(?:\/|$)/.test(window.location.pathname)) current = "en";

  function localizedPath(value, language = current) {
    if (!languages.includes(language)) throw new TypeError("Unknown site language");
    if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return value;
    const match = value.match(/^([^?#]*)([?#][\s\S]*)?$/);
    let route = match[1], suffix = match[2] || "";
    if (route === "/en") route = "/";
    else if (route.startsWith("/en/")) route = route.slice(3);
    if (resource.test(route)) return value;
    if (!(route === "/" || /^\/articles(?:\/|\/index\.html)?$/.test(route) || feature.test(route))) return value;
    if (route === "/articles/index.html") route = "/articles/";
    return (language === "en" ? "/en" : "") + route + suffix;
  }

  function register(namespace, catalogue) {
    if (typeof namespace !== "string") { catalogue = namespace; namespace = ""; }
    if (!catalogue || typeof catalogue !== "object") return;
    for (const language of languages) {
      const values = catalogue[language];
      if (!values || typeof values !== "object") continue;
      for (const [key, value] of Object.entries(values)) {
        if (typeof value !== "string") continue;
        const target = namespace && !key.startsWith(namespace + ".") ? namespace + "." + key : key;
        catalogues[language][target] = value;
      }
    }
  }

  function t(key, values = {}, fallback) {
    const template = catalogues[current][key] ?? fallback ?? key;
    return String(template).replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (original, name) => Object.hasOwn(values, name) ? String(values[name]) : original);
  }

  function elements(root, selector) {
    return [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
  }

  function updateChrome(root) {
    for (const element of elements(root, ".site-header a[href], .site-footer a[href], [data-i18n-link]")) {
      if (element.matches(".site-language-switch, [data-site-language-switch], [data-preserve-language-link]")) continue;
      const original = element.getAttribute("href");
      const target = localizedPath(original);
      if (target !== original) element.setAttribute("href", target);
      const key = navKeys[localizedPath(original, "zh-CN")];
      if (key && !element.classList.contains("brand") && !element.hasAttribute?.("data-i18n") && !element.querySelector("[data-i18n]")) {
        // Older generated navigation may still have a secondary bilingual span.
        element.textContent = t("common.nav." + key, {}, element.textContent);
        element.setAttribute("data-i18n", "common.nav." + key);
      }
    }
    for (const element of elements(root, ".skip-link")) element.textContent = t("common.skip", {}, element.textContent);
    for (const element of elements(root, ".site-nav")) element.setAttribute("aria-label", t("common.nav.label", {}, element.getAttribute("aria-label") || ""));
    for (const element of elements(root, ".site-header .brand")) element.setAttribute("aria-label", t("common.brandHome", {}, element.getAttribute("aria-label") || ""));
  }

  function updateSwitches(root) {
    const target = current === "en" ? "zh-CN" : "en";
    for (const element of elements(root, ".site-language-switch, [data-site-language-switch]")) {
      element.setAttribute("data-site-language-switch", target);
      element.setAttribute("lang", target);
      element.setAttribute("aria-label", t("common.languageSwitchAria", {}, current === "en" ? "Switch site language to Chinese" : "切换网站语言为英语"));
      if (element.tagName === "A") {
        const authored = element.getAttribute("href");
        const route = page.route && localizedPath(page.route, target);
        // Article Original links have distinct content URLs: preserve the authored pair.
        const paired = route && localizedPath(page.route, "en") !== localizedPath(page.route, "zh-CN");
        if (paired) element.setAttribute("href", route + window.location.search + window.location.hash);
        else if (authored) element.setAttribute("href", authored);
      }
      const label = element.querySelector('[data-i18n="common.languageSwitch"]');
      if (label) label.textContent = t("common.languageSwitch", {}, target === "en" ? "EN" : "中文");
      else if (!element.children.length) element.textContent = t("common.languageSwitch", {}, target === "en" ? "EN" : "中文");
    }
  }

  function updateMetadata() {
    if (page.titles?.[current]) {
      document.title = page.titles[current];
      document.querySelector('meta[property="og:title"]')?.setAttribute("content", page.titles[current]);
    }
    if (page.descriptions?.[current]) {
      for (const element of document.querySelectorAll('meta[name="description"], meta[property="og:description"]')) element.setAttribute("content", page.descriptions[current]);
    }
    const imageAlt = document.querySelector('meta[property="og:image:alt"]');
    if (imageAlt && catalogues[current]["common.shareImageAlt"]) imageAlt.setAttribute("content", t("common.shareImageAlt"));
    if (page.route && localizedPath(page.route, "en") !== localizedPath(page.route, "zh-CN")) {
      const route = localizedPath(page.route);
      const canonical = document.querySelector('link[rel="canonical"]');
      const original = canonical?.getAttribute("href");
      if (original) {
        const address = new URL(route, original).href;
        canonical.setAttribute("href", address);
        document.querySelector('meta[property="og:url"]')?.setAttribute("content", address);
      }
    }
  }

  function apply(root = document) {
    updateChrome(root);
    for (const element of elements(root, "[data-i18n]")) {
      // Never remove controls, icons, or editable content as a side effect of language changes.
      if (!element.children.length && !element.isContentEditable && !/^(?:INPUT|TEXTAREA|SELECT)$/.test(element.tagName)) {
        const key = element.getAttribute("data-i18n");
        element.textContent = t(key, {}, element.textContent);
      }
    }
    for (const attribute of ["title", "aria-label", "placeholder", "alt"]) {
      for (const element of elements(root, "[data-i18n-" + attribute + "]")) {
        const key = element.getAttribute("data-i18n-" + attribute);
        element.setAttribute(attribute, t(key, {}, element.getAttribute(attribute) || ""));
      }
    }
    updateSwitches(root);
    if (root === document) updateMetadata();
  }

  function remember() {
    try { window.localStorage.setItem(preferenceKey, current); } catch (_) { /* Session switching works without storage. */ }
  }

  function activate(language, source) {
    if (!languages.includes(language)) throw new TypeError("Unknown site language");
    if (language === current) { apply(); return; }
    const previousLanguage = current;
    const position = { left: window.scrollX, top: window.scrollY };
    const detail = { language, previousLanguage, source };
    window.dispatchEvent(new CustomEvent("site:beforelanguagechange", { detail }));
    current = language;
    document.documentElement.lang = language;
    remember();
    apply();
    for (const callback of subscribers) {
      try { callback(language, detail); } catch (error) { console.error("Language display update failed", error); }
    }
    window.dispatchEvent(new CustomEvent("site:languagechange", { detail }));
    // Translated headings may change height; preserve the current reading position.
    if (window.scrollTo && Number.isFinite(position.left) && Number.isFinite(position.top)) window.scrollTo({ ...position, behavior: "instant" });
  }

  function setLanguage(language, options = {}) {
    if (!languages.includes(language)) throw new TypeError("Unknown site language");
    const otherRoute = page.route && localizedPath(page.route, language);
    const paired = otherRoute && localizedPath(page.route, "en") !== localizedPath(page.route, "zh-CN");
    let target = paired ? otherRoute + window.location.search + window.location.hash : options.href;
    if (!paired && typeof target === "string" && /^\/(?!\/)/.test(target) && !/[?#]/.test(target)) target += window.location.search + window.location.hash;
    if (page.switchMode !== "history" || !paired) {
      if (target) {
        try { window.localStorage.setItem(preferenceKey, language); } catch (_) {}
        if (window.SiteNavigation) void window.SiteNavigation.visit(target); else window.location.assign(target);
      }
      return false;
    }
    if (language !== current) window.history[options.replace ? "replaceState" : "pushState"](window.history.state, "", target);
    activate(language, options.source || "switch");
    return true;
  }

  const bootstrap = document.querySelector("#site-i18n-data");
  if (bootstrap) {
    try { const data = JSON.parse(bootstrap.textContent); register(data); page = data.page || {}; }
    catch (error) { console.error("Invalid site language data", error); }
  }
  window.SiteI18n = Object.freeze({ lang: () => current, t, register, apply, localizedPath, setLanguage,
    page: () => page,
    loadPage(data, language) {
      for (const lang of languages) for (const key of Object.keys(catalogues[lang])) delete catalogues[lang][key];
      register(data); page = data.page || {}; current = language === "en" ? "en" : "zh-CN";
      document.documentElement.lang = current; apply();
      for (const fn of subscribers) fn(current, {source: "navigation"});
    },
    onChange(callback, options = {}) { subscribers.add(callback); const remove = () => subscribers.delete(callback); if (!options.persistent) window.SiteNavigation?.own(remove); return remove; } });

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.(".site-language-switch, [data-site-language-switch]");
    if (!link || link.getAttribute("target") === "_blank" || link.hasAttribute("download")) return;
    const requested = link.getAttribute("data-site-language-switch");
    const language = languages.includes(requested) ? requested : (current === "en" ? "zh-CN" : "en");
    event.preventDefault();
    setLanguage(language, { href: link.getAttribute("href"), source: "switch" });
  });
  window.addEventListener("popstate", () => {
    if (page.switchMode !== "history" || !page.route) return;
    const identity = (value) => value.replace(/\/index\.html$/, "/").replace(/\/+$/, "") || "/";
    const path = identity(window.location.pathname);
    const zhPath = identity(localizedPath(page.route, "zh-CN"));
    const enPath = identity(localizedPath(page.route, "en"));
    if (path === zhPath || path === enPath) activate(path === enPath ? "en" : "zh-CN", "history");
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => apply(), { once: true });
  else apply();
})();
