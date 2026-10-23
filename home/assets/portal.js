(() => {
  "use strict";
  const key = "xieyuqing-blog-theme";
  const button = document.querySelector("#theme-toggle");
  let preferredTheme = null;
  try {
    const saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark") preferredTheme = saved;
  } catch (_) { /* System preference still works when storage is unavailable. */ }
  let systemTheme = null;
  try { systemTheme = window.matchMedia("(prefers-color-scheme: dark)"); } catch (_) {}
  let theme = preferredTheme || (systemTheme && systemTheme.matches ? "dark" : "light");
  function apply() {
    document.documentElement.dataset.theme = theme;
    if (!button) return;
    const english = (window.SiteI18n?.lang() || document.documentElement.lang || "").toLowerCase().startsWith("en");
    const next = theme === "dark" ? "light" : "dark";
    const translate = window.SiteI18n?.t;
    button.querySelector(".theme-label").textContent = translate ? translate("common.theme." + next) : (english ? (next === "light" ? "Light" : "Dark") : (next === "light" ? "浅色" : "深色"));
    button.setAttribute("aria-label", translate ? translate(next === "light" ? "common.theme.switchLight" : "common.theme.switchDark") : (english ? `Switch to ${next} mode` : `切换为${next === "light" ? "浅色" : "深色"}模式`));
    button.hidden = false;
  }
  apply();
  window.SiteI18n?.onChange(apply);
  const followSystem = (event) => {
    if (preferredTheme) return;
    theme = event.matches ? "dark" : "light";
    apply();
  };
  if (systemTheme) {
    if (systemTheme.addEventListener) systemTheme.addEventListener("change", followSystem);
    else if (systemTheme.addListener) systemTheme.addListener(followSystem);
  }
  if (button) button.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    preferredTheme = theme;
    apply();
    try { localStorage.setItem(key, theme); } catch (_) {}
  });
})();
