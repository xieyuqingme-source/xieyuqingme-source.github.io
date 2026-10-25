(() => {
  "use strict";
  if (!window.SiteMenus) {
    document.addEventListener('toggle', event => { const menu=event.target; if(!menu.matches?.('.nav-group')||!menu.open)return; document.querySelectorAll('.nav-group[open]').forEach(other=>{if(other!==menu)other.open=false;}); }, true);
    document.addEventListener('click', event => { document.querySelectorAll('.nav-group[open]').forEach(menu=>{if(!menu.contains(event.target)||event.target.closest('a'))menu.open=false;}); });
    document.addEventListener('keydown', event => { if(event.key==='Escape') document.querySelectorAll('.nav-group[open]').forEach(menu=>{menu.open=false;menu.querySelector('summary').focus();}); });
    window.SiteMenus=true;
  }
  if (window.SiteTheme) { window.SiteTheme.apply(); return; }
  const key = "xieyuqing-blog-theme", skinKey = "xieyuqing-site-skin";
  let mode = "system", media = null, skin = "emerald", savedSkin = null;
  try { const saved = localStorage.getItem(key); if (saved === "light" || saved === "dark") mode = saved; } catch (_) {}
  try { savedSkin = localStorage.getItem(skinKey); } catch (_) {}
  skin = savedSkin === "emerald" || savedSkin === "sea" ? savedSkin : (mode === "dark" ? "sea" : "emerald");
  // Preserve the previous explicit appearance once; all subsequent changes are independent.
  if (savedSkin !== "emerald" && savedSkin !== "sea") try { localStorage.setItem(skinKey, skin); } catch (_) {}
  try { media = window.matchMedia("(prefers-color-scheme: dark)"); } catch (_) {}
  function state() { return {skin, mode, theme: mode === "system" ? (media?.matches ? "dark" : "light") : mode}; }
  function apply() {
    const current = state();
    document.documentElement.dataset.theme = current.theme;
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.dataset.skin = skin;
    const english = (window.SiteI18n?.lang() || document.documentElement.lang || "").startsWith("en");
    const name = english ? (skin === "emerald" ? "Emerald Paper" : "Deep Sea Tech") : (skin === "emerald" ? "墨绿纸白" : "深海科技");
    const tone = english ? (current.theme === "light" ? "Light" : "Dark") : (current.theme === "light" ? "浅色" : "深色");
    const source = tone + (mode === "system" ? (english ? " · System" : " · 跟随系统") : "");
    const button = document.querySelector("#theme-toggle"), control = document.querySelector("#theme-control");
    if (button) {
      const label=button.querySelector(".theme-label"), status=button.querySelector(".theme-mode");
      if(label)label.textContent=name;if(status)status.textContent=source;
      button.setAttribute("aria-label",english ? `Appearance: ${name}, ${source}. Choose skin and brightness` : `外观：${name}，${source}。选择皮肤与明暗`);
      button.setAttribute("title",english ? `Theme: ${name} (${source})` : `配色：${name}（${source}）`);
      button.hidden=false;
    }
    if(control)control.hidden=false;
    document.querySelectorAll("[data-theme-choice]").forEach(option => option.setAttribute("aria-pressed",String(option.dataset.themeChoice===mode)));
    document.querySelectorAll("[data-skin-choice]").forEach(option => option.setAttribute("aria-pressed",String(option.dataset.skinChoice===skin)));
  }
  function choose(value, persist=true) {
    if(!["system","light","dark"].includes(value))return;
    mode=value;apply();
    if(persist)try{if(mode==="system")localStorage.removeItem(key);else localStorage.setItem(key,mode);}catch(_){}
  }
  function chooseSkin(value, persist=true) {
    if (!["emerald", "sea"].includes(value)) return;
    skin=value; apply();
    if (persist) try { localStorage.setItem(skinKey, skin); } catch (_) {}
  }
  document.addEventListener("click",event=>{
    const option=event.target.closest?.("[data-theme-choice],[data-skin-choice]");
    const control=document.querySelector("#theme-control");
    if(option){if(option.dataset.skinChoice)chooseSkin(option.dataset.skinChoice);else choose(option.dataset.themeChoice);if(control)control.open=false;document.querySelector("#theme-toggle")?.focus();}
    else if(control&&!control.contains(event.target))control.open=false;
  });
  document.addEventListener("keydown",event=>{const control=document.querySelector("#theme-control");if(event.key==="Escape"&&control?.open){control.open=false;document.querySelector("#theme-toggle")?.focus();}});
  if(media){const changed=()=>{if(mode==="system")apply();};if(media.addEventListener)media.addEventListener("change",changed);else if(media.addListener)media.addListener(changed);}
  window.addEventListener?.("storage",event=>{if(event.key===key)choose(event.newValue==="light"||event.newValue==="dark"?event.newValue:"system",false);if(event.key===skinKey)chooseSkin(event.newValue==="sea"?"sea":"emerald",false);});
  window.SiteI18n?.onChange(apply,{persistent:true});
  window.SiteTheme=Object.freeze({apply,choose,chooseSkin,state});
  apply();
})();
