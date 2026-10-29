/* Shared contextual notes for reviewed reading text; never replaces the source text. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ReadingAnnotations = api;api.mount({window:root,document:root.document}); }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const INSTANCE = Symbol.for('reading-annotations.popup');
  const inert = () => ({show:()=>false,close(){},refresh(){},activeMarker:()=>null,destroy(){}});
  const inside = (container, target) => !!target && typeof target.nodeType === 'number' && container.contains(target);
  function selectedWithin(win, area) {
    const selection = win.getSelection?.();
    return !!selection && !selection.isCollapsed && selection.rangeCount > 0
      && inside(area,selection.anchorNode) && inside(area,selection.focusNode) && !!selection.toString().trim();
  }
  function create(options = {}) {
    const {window:win,document:doc,area,popup,closeButton} = options;
    if (!win || !doc || !area || !popup || !closeButton || typeof options.getEntry !== 'function' || typeof options.paint !== 'function') return inert();
    if (popup[INSTANCE]) return popup[INSTANCE];
    const markers = [...(options.markers || area.querySelectorAll('[data-reading-note-index]'))];
    const known = new Set(markers), cleanups = [];
    const blocked = options.isBlocked || (() => selectedWithin(win,area));
    let disposed=false, active=null, timer=null, pointerMode=false, moved=false, pointerStart=null, skipFocus=false;
    let focusRequest=null, focusFrame=null, focusTimer=null;
    const delay = Number.isFinite(options.clickDelay) ? Math.max(0,options.clickDelay) : 240;
    function listen(target,type,fn,settings) {
      target.addEventListener(type,fn,settings);
      cleanups.push(() => target.removeEventListener(type,fn,settings));
    }
    function clearTimer() { if(timer!==null){win.clearTimeout(timer);timer=null;} }
    function clearFocusWait() {
      if(focusFrame!==null)win.cancelAnimationFrame?.(focusFrame);
      if(focusTimer!==null)win.clearTimeout(focusTimer);
      focusFrame=null;focusTimer=null;
    }
    function cancelFocus() {clearFocusWait();focusRequest=null;}
    function close(restore=false) {
      const returnFocus=restore && active?.isConnected && inside(popup,doc.activeElement);
      clearTimer();cancelFocus();popup.hidden=true;
      for(const marker of markers)marker.setAttribute('aria-expanded','false');
      if(returnFocus) {
        skipFocus=true;active.focus({preventScroll:true});skipFocus=false;
      }
    }
    function show(marker,focus=false) {
      cancelFocus();
      if(disposed || !known.has(marker) || !inside(area,marker) || (!focus && blocked()))return false;
      const entry=options.getEntry(marker);if(!entry)return false;
      clearTimer();options.beforeOpen?.();active=marker;options.paint(entry,marker);
      popup.hidden=false;
      for(const item of markers)item.setAttribute('aria-expanded',String(item===marker));
      if(focus)popup.focus({preventScroll:true});
      return true;
    }
    function queueFocus(marker) {
      close();
      if(typeof win.requestAnimationFrame!=='function'){show(marker);return;}
      const request={marker,finish};focusRequest=request;
      function finish() {if(focusRequest!==request || disposed)return;clearFocusWait();waitFrame();}
      function waitFrame(last=false) {
        focusFrame=win.requestAnimationFrame(()=>{
          if(focusRequest!==request || disposed)return;
          focusFrame=null;
          if(doc.activeElement!==marker || marker.isConnected===false || !inside(area,marker) || blocked()){cancelFocus();return;}
          if(!last){waitFrame(true);return;}
          focusRequest=null;show(marker);
        });
      }
      // Let a native smooth focus-scroll start; its scrollend finishes the wait.
      focusTimer=win.setTimeout(()=>{focusTimer=null;finish();},50);
    }
    function refresh() { if(!disposed && active && !popup.hidden){const entry=options.getEntry(active);if(entry)options.paint(entry,active);else close();} }
    function destroy() {
      if(disposed)return;disposed=true;close();cleanups.splice(0).reverse().forEach(fn=>fn());active=null;
      if(popup[INSTANCE]===api)delete popup[INSTANCE];
    }
    const api={show,close,refresh,activeMarker:()=>active,destroy};popup[INSTANCE]=api;
    for(const marker of markers) {
      marker.setAttribute('aria-expanded','false');
      listen(marker,'focus',()=>{if(!skipFocus && !pointerMode && !blocked())queueFocus(marker);});
      listen(marker,'blur',()=>{if(focusRequest?.marker===marker)cancelFocus();});
      listen(marker,'click',()=>{
        clearTimer();if(disposed || moved || blocked())return;
        timer=win.setTimeout(()=>{timer=null;if(!disposed && !moved && !blocked())show(marker);},delay);
      });
      listen(marker,'keydown',event=>{
        if(event.key==='Enter' || event.key===' '){event.preventDefault();show(marker,true);}
      });
    }
    listen(closeButton,'click',()=>close(true));
    listen(doc,'keydown',event=>{
      pointerMode=false;
      if(event.key==='Escape')close(true);
      else if(focusRequest && ['Enter',' ','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End'].includes(event.key))close();
    });
    listen(doc,'selectionchange',()=>{if(blocked())close();});
    listen(doc,'pointerdown',event=>{
      if(options.keepOpenOnPointer?.(event))return;
      pointerMode=true;
      if(inside(popup,event.target))return;
      close();moved=false;pointerStart=inside(area,event.target)?[event.clientX,event.clientY]:null;
    });
    listen(doc,'pointerup',event=>{if(pointerStart){moved=Math.hypot(event.clientX-pointerStart[0],event.clientY-pointerStart[1])>4;pointerStart=null;}});
    listen(doc,'pointercancel',()=>{moved=true;pointerStart=null;clearTimer();cancelFocus();});
    listen(doc,'focusin',event=>{
      if(focusRequest && event.target!==focusRequest.marker)cancelFocus();
      if(!popup.hidden && !inside(popup,event.target) && event.target!==active)close();
    });
    listen(win,'scroll',event=>{
      if(options.ignoreScroll?.(event) || inside(popup,event.target))return;
      // Native focus can scroll after focus/focusin; wait for that scroll to settle.
      if(focusRequest && doc.activeElement===focusRequest.marker){
        const request=focusRequest;clearFocusWait();
        focusTimer=win.setTimeout(()=>{focusTimer=null;request.finish();},100);
        return;
      }
      close();
    },{passive:true,capture:true});
    listen(win,'scrollend',event=>{
      if(options.ignoreScroll?.(event) || inside(popup,event.target))return;
      if(focusRequest && doc.activeElement===focusRequest.marker)focusRequest.finish();
    },{passive:true,capture:true});
    for(const type of ['wheel','touchmove'])listen(win,type,()=>{if(focusRequest)close();},{passive:true,capture:true});
    listen(win,'pagehide',()=>close());
    win.SiteNavigation?.own?.(destroy);
    return api;
  }
  function safeSource(value) {
    if(typeof value!=='string' || !/^https:\/\//.test(value) || /[\s<>\\\u0000-\u001f\u007f]/.test(value))return '';
    try {const url=new URL(value);return url.hostname && !url.username && !url.password?url.href:'';}catch(_){return '';}
  }
  function mount(options = {}) {
    const win=options.window,doc=options.document;
    const root=doc?.querySelector?.('[data-reading-annotations]');if(!win || !root)return inert();
    const area=root.querySelector('[data-reading-area]'),popup=root.querySelector('[data-reading-note-popup]');
    const data=root.querySelector('[data-reading-notes]'),closeButton=root.querySelector('[data-reading-note-close]');
    const title=root.querySelector('[data-reading-note-title]'),explanation=root.querySelector('[data-reading-note-explanation]');
    const source=root.querySelector('[data-reading-note-source]'),link=root.querySelector('[data-reading-note-link]');
    if(!area || !popup || !data || !closeButton || !title || !explanation || !source || !link)return inert();
    let entries;try{entries=JSON.parse(data.textContent);}catch(_){return inert();}
    if(!Array.isArray(entries) || entries.length>1000)return inert();
    return create({window:win,document:doc,area,popup,closeButton,
      getEntry(marker) {
        const index=marker.dataset.readingNoteIndex;
        if(!/^(0|[1-9]\d*)$/.test(index))return null;
        const entry=entries[Number(index)];
        return entry && ['term','explanation','source'].every(key=>typeof entry[key]==='string' && entry[key].trim())?entry:null;
      },
      paint(entry) {
        title.textContent=entry.term;explanation.textContent=entry.explanation;
        source.textContent=[entry.source,entry.edition,entry.page?'第'+entry.page+'页':'',entry.checked_on?'核对于'+entry.checked_on:''].filter(Boolean).join(' · ');
        const url=safeSource(entry.source_url);link.hidden=!url;
        if(url){link.href=url;link.target='_blank';link.rel='noopener noreferrer';}
        else link.removeAttribute('href');
      }
    });
  }
  return {create,mount,selectedWithin,safeSource};
});
