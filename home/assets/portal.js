(() => {
  "use strict";
  if (!window.SiteMenus) {
    document.addEventListener('toggle', event => { const menu=event.target; if(!menu.matches?.('.nav-group')||!menu.open)return; document.querySelectorAll('.nav-group[open]').forEach(other=>{if(other!==menu)other.open=false;}); }, true);
    document.addEventListener('click', event => { document.querySelectorAll('.nav-group[open]').forEach(menu=>{if(!menu.contains(event.target)||event.target.closest('a'))menu.open=false;}); });
    document.addEventListener('keydown', event => { if(event.key==='Escape') document.querySelectorAll('.nav-group[open]').forEach(menu=>{menu.open=false;menu.querySelector('summary').focus();}); });
    window.SiteMenus=true;
  }
  if (window.SiteTheme) { window.SiteTheme.apply(); return; }
  // One palette; the button switches light/dark. Matching the system again returns to "follow system".
  const key = "xieyuqing-blog-theme";
  let mode = "system", media = null;
  try { const saved = localStorage.getItem(key); if (saved === "light" || saved === "dark") mode = saved; } catch (_) {}
  try { media = window.matchMedia("(prefers-color-scheme: dark)"); } catch (_) {}
  const system = () => media?.matches ? "dark" : "light";
  function state() { return {mode, theme: mode === "system" ? system() : mode}; }
  function apply() {
    const current = state();
    document.documentElement.dataset.theme = current.theme;
    document.documentElement.dataset.themeMode = mode;
    delete document.documentElement.dataset.skin;
    const english = (window.SiteI18n?.lang() || document.documentElement.lang || "").startsWith("en");
    const label = current.theme === "dark" ? (english ? "Switch to light mode" : "切换到浅色") : (english ? "Switch to dark mode" : "切换到深色");
    const button = document.querySelector("#theme-toggle");
    if (button) {
      const text = button.querySelector(".theme-label");
      if (text) text.textContent = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.setAttribute("data-theme", current.theme);
      button.hidden = false;
    }
  }
  function choose(value, persist=true) {
    if (!["system", "light", "dark"].includes(value)) return;
    mode = value !== "system" && value === system() ? "system" : value;
    apply();
    if (persist) try { if (mode === "system") localStorage.removeItem(key); else localStorage.setItem(key, mode); } catch (_) {}
  }
  document.addEventListener("click", event => {
    if (!event.target.closest?.("#theme-toggle")) return;
    choose(state().theme === "dark" ? "light" : "dark");
  });
  if (media) { const changed = () => { if (mode === "system") apply(); }; if (media.addEventListener) media.addEventListener("change", changed); else if (media.addListener) media.addListener(changed); }
  window.addEventListener?.("storage", event => { if (event.key === key) choose(event.newValue === "light" || event.newValue === "dark" ? event.newValue : "system", false); });
  window.SiteI18n?.onChange(apply, {persistent: true});
  window.SiteTheme = Object.freeze({apply, choose, state});
  apply();
})();
