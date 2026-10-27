/* Progressive same-origin navigation. Audio/theme live outside page scopes. */
(() => {
 'use strict';
 if(window.SiteNavigation)return;
 const persistent=new Set(['/assets/site-i18n.js','/assets/site-music.js','/assets/site-navigation.js','/assets/portal.js']);
 const native={fetch:window.fetch.bind(window),raf:window.requestAnimationFrame.bind(window),timeout:window.setTimeout.bind(window)};
 let current,request=null,revision=0,rendered=location.href,transition=false,queued=null;
 const cleanPath=value=>new URL(value,location.href).pathname.replace(/\/index\.html$/,'/');
 class PageScope {
  constructor(){this.active=true;this.cleanups=[];this.leavers=[];this.globals=new Map();this.events=[];this.detached=document.implementation.createHTMLDocument('');this.env=this.createEnv();}
  own(fn){if(this.active)this.cleanups.push(fn);return fn;}
  listen(target,type,fn,options){const wrapped=event=>{if(this.active){if(typeof fn==='function')fn.call(target,event);else fn?.handleEvent(event);}};target.addEventListener(type,wrapped,options);this.events.push({target,type,fn,wrapped,options});return wrapped;}
  unlisten(target,type,fn,options){for(const e of this.events)if(e.target===target&&e.type===type&&e.fn===fn)target.removeEventListener(type,e.wrapped,options);}
  async leave(){for(const fn of this.leavers)await fn();for(const e of this.events)if(e.target===window&&e.type==='pagehide')e.wrapped(new Event('pagehide'));this.active=false;for(const e of this.events)e.target.removeEventListener(e.type,e.wrapped,e.options);for(const fn of this.cleanups.splice(0).reverse()){try{fn();}catch(e){console.warn('Page cleanup',e);}}for(const [key,value]of this.globals)if(window[key]===value)delete window[key];}
  createEnv(){
   const scope=this,doc=new Proxy(document,{get(target,key){
    if(key==='addEventListener')return(type,fn,options)=>{if(type==='DOMContentLoaded'&&document.readyState!=='loading'){queueMicrotask(()=>scope.active&&fn(new Event(type)));return;}scope.listen(target,type,fn,options);};
    if(key==='removeEventListener')return(type,fn,options)=>scope.unlisten(target,type,fn,options);
    const source=scope.active?target:scope.detached,value=Reflect.get(source,key,source);return typeof value==='function'?value.bind(source):value;
   }});
   const resources=new Set(),timers=new Set(),intervals=new Set(),frames=new Set(),controllers=new Set();
   const timersAPI={setTimeout(fn,delay,...args){const id=window.setTimeout(()=>{timers.delete(id);if(scope.active)fn(...args);},delay);timers.add(id);return id;},clearTimeout(id){timers.delete(id);window.clearTimeout(id);},setInterval(fn,delay,...args){const id=window.setInterval(()=>scope.active&&fn(...args),delay);intervals.add(id);return id;},clearInterval(id){intervals.delete(id);window.clearInterval(id);},requestAnimationFrame(fn){const id=native.raf(t=>{frames.delete(id);if(scope.active)fn(t);});frames.add(id);return id;},cancelAnimationFrame(id){frames.delete(id);window.cancelAnimationFrame(id);}};
   this.own(()=>{timers.forEach(clearTimeout);intervals.forEach(clearInterval);frames.forEach(cancelAnimationFrame);controllers.forEach(c=>c.abort());resources.forEach(url=>URL.revokeObjectURL(url));});
   const guard=promise=>promise.then(value=>scope.active?value:new Promise(()=>{}));
   const scopedFetch=(...args)=>{if(!scope.active)return new Promise(()=>{});const controller=new AbortController(),options={...args[1]};controllers.add(controller);options.signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;return guard(native.fetch(args[0],options)).then(response=>new Proxy(response,{get(target,key){if(['json','text','arrayBuffer','blob'].includes(key))return()=>guard(target[key]());const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}));};
   const scopedURL=new Proxy(URL,{get(target,key){if(key==='createObjectURL')return blob=>{const url=target.createObjectURL(blob);resources.add(url);return url;};if(key==='revokeObjectURL')return url=>{resources.delete(url);target.revokeObjectURL(url);};return Reflect.get(target,key);}});
   const observer=kind=>window[kind]&&class extends window[kind]{constructor(fn,...args){super((...values)=>{if(scope.active)fn(...values);},...args);scope.own(()=>this.disconnect());}};
   const historyProxy=new Proxy(history,{get(target,key){if(key==='pushState'||key==='replaceState')return(...args)=>{if(scope.active)target[key](...args);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
   const locationProxy=new Proxy(location,{get(target,key){if(key==='assign'||key==='replace')return url=>scope.active&&visit(url,{replace:key==='replace'});const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;},set(target,key,value){if(scope.active){if(key==='href')void visit(value);else target[key]=value;}return true;}});
   const specials={document:doc,fetch:scopedFetch,URL:scopedURL,history:historyProxy,location:locationProxy,...timersAPI};
   for(const kind of ['ResizeObserver','MutationObserver','IntersectionObserver'])specials[kind]=observer(kind);
   const win=new Proxy(window,{get(target,key){if(['window','self','globalThis'].includes(key))return win;if(key in specials)return specials[key];if(key==='addEventListener')return(type,fn,options)=>scope.listen(target,type,fn,options);if(key==='removeEventListener')return(type,fn,options)=>scope.unlisten(target,type,fn,options);if(key==='matchMedia')return query=>{const media=target.matchMedia(query);return new Proxy(media,{get(m,k){if(k==='addEventListener')return(type,fn,options)=>scope.listen(m,type,fn,options);if(k==='addListener')return fn=>scope.listen(m,'change',fn);const value=Reflect.get(m,k,m);return typeof value==='function'?value.bind(m):value;}});};if(scope.globals.has(key))return scope.globals.get(key);const value=Reflect.get(target,key,target);return typeof value==='function'&&/^[a-z]/.test(String(key))?value.bind(target):value;},set(target,key,value){if(scope.active){target[key]=value;scope.globals.set(key,value);}return true;}});
   return{document:doc,window:win};
  }
 }
 function own(fn){return current.own(fn);}
 function onLeave(fn){current.leavers.push(fn);}
 function sameFeature(url){const data=window.SiteI18n?.page();return data?.switchMode==='history'&&[window.SiteI18n.localizedPath(data.route,'en'),window.SiteI18n.localizedPath(data.route,'zh-CN')].some(path=>cleanPath(path)===cleanPath(url));}
 function saveScroll(){history.replaceState({...history.state,__siteScroll:[scrollX,scrollY]},'',location.href);}
 function restoreScroll(position){if(!Array.isArray(position)||position.length!==2||!position.every(Number.isFinite))return false;window.scrollTo({left:position[0],top:position[1],behavior:'instant'});return true;}
 function focusTarget(target){
  if(!target||typeof target.focus!=='function')return;
  const temporary=!target.matches('a[href],button,input,select,textarea,[tabindex],[contenteditable="true"]');
  if(temporary){target.setAttribute('tabindex','-1');target.addEventListener('blur',()=>{if(target.getAttribute('tabindex')==='-1')target.removeAttribute('tabindex');},{once:true});}
  target.focus({preventScroll:true});
 }
 function scrollFragment(url,focus=false){
  if(!url.hash){window.scrollTo({left:0,top:0,behavior:'instant'});if(focus)focusTarget(document.querySelector('main'));return true;}
  let id;try{id=decodeURIComponent(url.hash.slice(1));}catch(_){return false;}
  const target=document.getElementById(id);if(!target)return false;
  target.scrollIntoView({behavior:'instant',block:'start'});if(focus)focusTarget(target===document.body?document.querySelector('main')||target:target);return true;
 }
 function syncHeader(next){const header=document.querySelector('.site-header'),source=next.querySelector('.site-header');for(const selector of ['.brand','.site-nav','.site-language-switch']){const old=header.querySelector(selector),fresh=source.querySelector(selector);if(old&&fresh)old.replaceWith(fresh);}const skip=document.querySelector('.skip-link'),fresh=next.querySelector('.skip-link');if(skip&&fresh)skip.replaceWith(fresh);document.querySelector('#site-music')?.removeAttribute('open');}
 async function styles(next){
  const target=[...next.head.querySelectorAll('link[rel="stylesheet"]')],old=[...document.head.querySelectorAll('link[rel="stylesheet"]')],href=node=>new URL(node.getAttribute('href'),location.href).href;
  await Promise.all(target.map(node=>{if(old.some(x=>href(x)===href(node)))return;const item=document.importNode(node,true);item.href=href(node);return new Promise(resolve=>{item.onload=resolve;item.onerror=resolve;native.timeout(resolve,4000);document.head.append(item);});}));
  for(const node of old)if(!target.some(x=>href(x)===href(node))&&new URL(node.href,location.href).pathname!=='/assets/site-music.css')node.remove();
  // Move loaded elements into the target cascade order; moving does not reload them.
  const loaded=[...document.head.querySelectorAll('link[rel="stylesheet"]')];
  const moveLast=node=>{if(node===document.head.lastElementChild)return;if(typeof document.head.moveBefore==='function')document.head.moveBefore(node,null);else document.head.append(node);};
  for(const source of target){const node=loaded.find(item=>href(item)===href(source));if(node)moveLast(node);}
  const themes=[...document.head.querySelectorAll('link[rel="stylesheet"]')].find(node=>new URL(node.href,location.href).pathname==='/assets/site-themes.css');
  if(themes)moveLast(themes);
 }

 function metadata(next){for(const node of [...document.head.querySelectorAll('title,meta:not([charset]),link[rel="canonical"],link[rel="alternate"]')])node.remove();for(const node of next.head.querySelectorAll('title,meta:not([charset]),link[rel="canonical"],link[rel="alternate"]'))document.head.append(document.importNode(node,true));}
 async function scripts(next,ticket){for(const source of next.querySelectorAll('script[src]')){const url=new URL(source.getAttribute('src'),location.href);if(url.origin!==location.origin||persistent.has(url.pathname))continue;if(ticket!==revision)return;const node=document.createElement('script');node.src=url.href+(source.type==='module'?(url.search?'&':'?')+'navigation='+ticket:'');if(source.type)node.type=source.type;node.async=false;node.dataset.pageScript='';await new Promise((resolve,reject)=>{node.onload=resolve;node.onerror=()=>reject(new Error('Page script unavailable: '+url.pathname));document.body.append(node);});}}
 async function visit(value,options={}){
  if(transition){queued={value,options};return;}
  const url=new URL(value,location.href);if(url.origin!==location.origin||!/^https?:$/.test(url.protocol)){location.assign(url.href);return;}
  if(!options.pop&&cleanPath(url)===cleanPath(rendered)&&url.search===new URL(rendered).search){if(options.replace)history.replaceState(history.state,'',url);else if(location.href!==url.href){saveScroll();history.pushState(null,'',url);}rendered=url.href;scrollFragment(url,true);return;}
  const ticket=++revision;request?.abort();request=new AbortController();let next;
  try{const response=await native.fetch(url.href,{signal:request.signal,credentials:'same-origin',headers:{'X-Site-Navigation':'1'}});if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw new Error('Not a site page');next=new DOMParser().parseFromString(await response.text(),'text/html');if(!next.querySelector('.site-header')||!next.querySelector('#site-i18n-data'))throw new Error('Unsupported page');}catch(error){if(ticket!==revision||error.name==='AbortError')return;location.assign(url.href);return;}
  if(ticket!==revision)return;
  transition=true;document.documentElement.setAttribute('aria-busy','true');
  try{
   await current.leave();if(ticket!==revision)return;const old=current;
   if(!options.pop)saveScroll();if(options.pop){}else history[options.replace?'replaceState':'pushState'](null,'',url.href);
   syncHeader(next);await styles(next);metadata(next);
   const header=document.querySelector('.site-header');for(const node of [...document.body.childNodes])if(node!==header){if(node.nodeType===1&&node.matches('.skip-link'))continue;old.detached.body.append(node);}
   document.body.className=next.body.className;document.body.id=next.body.id;document.body.removeAttribute('style');document.documentElement.style.cssText=next.documentElement.style.cssText;for(const node of [...next.body.childNodes]){if(node.nodeType===1&&node.matches('.site-header,.skip-link,script[src]'))continue;document.body.append(document.importNode(node,true));}
   document.documentElement.lang=next.documentElement.lang;current=new PageScope();
   const data=JSON.parse(next.querySelector('#site-i18n-data').textContent);document.querySelector('#site-i18n-data')?.remove();const boot=next.querySelector('#site-i18n-data').cloneNode(true);document.body.append(boot);
   window.SiteI18n.loadPage(data,next.documentElement.lang);window.SiteTheme?.apply();await scripts(next,ticket);rendered=url.href;
   if(ticket===revision){if(!(options.pop&&restoreScroll(options.scroll))&&!scrollFragment(url,!options.pop)){restoreScroll([0,0]);if(!options.pop)focusTarget(document.querySelector('main'));}window.dispatchEvent(new CustomEvent('site:navigated',{detail:{url:url.href}}));}
  }catch(error){console.error('Site navigation failed',error);location.assign(url.href);}finally{transition=false;document.documentElement.removeAttribute('aria-busy');if(queued){const next=queued;queued=null;void visit(next.value,next.options);}}
 }
 current=new PageScope();
 window.SiteNavigation=Object.freeze({visit,own,onLeave,environment:()=>current.env,state:()=>({rendered,transition,scopeListeners:current.events.length,scopeCleanups:current.cleanups.length})});
 document.addEventListener('click',event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;const link=event.target.closest?.('a[href]');if(!link||link.target||link.hasAttribute('download')||link.hasAttribute('data-native-navigation')||link.closest('#site-music'))return;const url=new URL(link.href,location.href);if(url.origin!==location.origin||!/^https?:$/.test(url.protocol)||/\.[a-z\d]{2,5}$/i.test(url.pathname)&&!url.pathname.endsWith('.html'))return;event.preventDefault();void visit(url.href);});
 window.addEventListener('site:languagechange',()=>{rendered=location.href;});
 window.addEventListener('popstate',()=>{if(sameFeature(location.href)){rendered=location.href;return;}if(cleanPath(location.href)===cleanPath(rendered)){rendered=location.href;if(!restoreScroll(history.state?.__siteScroll))scrollFragment(new URL(location.href));return;}void visit(location.href,{pop:true,scroll:history.state?.__siteScroll});});
 // Capture the final reading position without replacing history on every animation frame.
 let scrollSaveTimer=null;
 window.addEventListener('scroll',()=>{window.clearTimeout(scrollSaveTimer);scrollSaveTimer=native.timeout(()=>{scrollSaveTimer=null;if(!transition&&location.href===rendered)saveScroll();},160);},{passive:true});
 history.scrollRestoration='manual';
})();
