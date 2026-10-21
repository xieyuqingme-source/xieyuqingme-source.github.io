(() => {
  "use strict";
  const english = (document.documentElement.lang || "").toLowerCase().startsWith("en");
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
    const next = english ? (theme === "dark" ? "Light" : "Dark") : (theme === "dark" ? "浅色" : "深色");
    button.querySelector(".theme-label").textContent = next;
    button.setAttribute("aria-label", english ? `Switch to ${next.toLowerCase()} mode` : `切换到${next}模式`);
    button.hidden = false;
  }
  apply();
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
