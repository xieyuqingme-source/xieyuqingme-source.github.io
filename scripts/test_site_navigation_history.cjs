'use strict';
// Exercise the production navigation code with browser-like history and document state.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'../home/assets/site-navigation.js'),'utf8');

function harness({initial='/articles/example.html',bodyId='top',feature=false,languageSwitcher=false}={}){
 const windowEvents=new Map(),documentEvents=new Map(),timers=new Map(),requests=[],assigned=[];
 let timerId=0,currentURL=new URL(initial,'https://example.test'),position=[0,0],document;
 const listen=(events,type,fn,options)=>{if(!events.has(type))events.set(type,[]);events.get(type).push({fn,once:!!options?.once});};
 const emit=(events,type,event={})=>{for(const entry of [...events.get(type)||[]]){entry.fn(event);if(entry.once)events.set(type,events.get(type).filter(item=>item!==entry));}};
 class Element{
  constructor(tag='div',attributes={}){this.tagName=tag.toUpperCase();this.nodeType=1;this.attributes={...attributes};this.childNodes=[];this.style={cssText:''};this.events=new Map();this.parentNode=null;this.textContent='';this.y=0;}
  get id(){return this.attributes.id||'';}set id(value){if(value)this.attributes.id=value;else delete this.attributes.id;}
  get className(){return this.attributes.class||'';}set className(value){this.attributes.class=value;}
  hasAttribute(name){return Object.hasOwn(this.attributes,name);}getAttribute(name){return this.attributes[name]??null;}
  setAttribute(name,value){this.attributes[name]=String(value);}removeAttribute(name){delete this.attributes[name];}
  addEventListener(type,fn,options){listen(this.events,type,fn,options);}removeEventListener(type,fn){this.events.set(type,(this.events.get(type)||[]).filter(entry=>entry.fn!==fn));}
  emit(type){emit(this.events,type);}
  matches(selector){return selector.split(',').some(part=>{part=part.trim();if(part.startsWith('#'))return this.id===part.slice(1);if(part.startsWith('.'))return this.className.split(/\s+/).includes(part.slice(1));const match=part.match(/^([a-z]+)?(?:\[([^=\]]+)(?:="([^"]*)")?\])?$/i);return !!match&&(!match[1]||this.tagName===match[1].toUpperCase())&&(!match[2]||(this.hasAttribute(match[2])&&(match[3]===undefined||this.getAttribute(match[2])===match[3])));});}
  querySelectorAll(selector){const found=[];for(const node of this.childNodes){if(node.matches?.(selector))found.push(node);if(node.querySelectorAll)found.push(...node.querySelectorAll(selector));}return found;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  append(node){node.remove();node.parentNode=this;this.childNodes.push(node);}
  prepend(node){node.remove();node.parentNode=this;this.childNodes.unshift(node);}
  remove(){if(this.parentNode){this.parentNode.childNodes=this.parentNode.childNodes.filter(node=>node!==this);this.parentNode=null;}}
  replaceWith(node){const parent=this.parentNode;if(!parent)return;const index=parent.childNodes.indexOf(this);node.remove();parent.childNodes[index]=node;node.parentNode=parent;this.parentNode=null;}
  cloneNode(deep){const copy=new Element(this.tagName,this.attributes);copy.textContent=this.textContent;copy.y=this.y;if(deep)for(const child of this.childNodes)copy.append(child.cloneNode(true));return copy;}
  focus(){if(document.activeElement!==this){document.activeElement?.emit('blur');document.activeElement=this;}}
  scrollIntoView(options){this.lastScrollOptions=options;position=[0,this.y];}
 }
 function page(url='/',id=''){
  const doc={readyState:'complete',title:'test'};doc.head=new Element('head');doc.body=new Element('body',{id});doc.documentElement=new Element('html');doc.documentElement.lang='zh-CN';
  const header=new Element('header',{class:'site-header'}),main=new Element('main',{id:'main'}),a=new Element('h2',{id:'section-a'}),b=new Element('h2',{id:'section-b'}),data=new Element('script',{id:'site-i18n-data'});
  if(languageSwitcher){const tools=new Element('div',{class:'header-tools'});tools.append(new Element('button',{id:'theme-toggle'}));header.append(tools);if(!url.startsWith('/marx/')&&!url.startsWith('/english/'))tools.prepend(new Element('a',{class:'site-language-switch',href:'/en/about/'}));}
  a.y=1200;b.y=2400;main.append(a);main.append(b);data.textContent=JSON.stringify({page:{route:url,switchMode:'navigate'}});doc.body.append(header);doc.body.append(main);doc.body.append(data);
  doc.querySelectorAll=selector=>[...doc.head.querySelectorAll(selector),...doc.body.querySelectorAll(selector)];doc.querySelector=selector=>doc.querySelectorAll(selector)[0]||null;
  doc.getElementById=id=>doc.body.id===id?doc.body:doc.querySelector('#'+id);
  doc.createElement=tag=>new Element(tag);doc.importNode=(node,deep)=>node.cloneNode(deep);doc.implementation={createHTMLDocument:()=>page()};
  doc.addEventListener=(type,fn,options)=>listen(documentEvents,type,fn,options);doc.removeEventListener=(type,fn)=>documentEvents.set(type,(documentEvents.get(type)||[]).filter(entry=>entry.fn!==fn));return doc;
 }
 document=page(currentURL.pathname,bodyId);
 const location={assign:url=>assigned.push(String(url))};for(const key of ['href','origin','pathname','search','hash'])Object.defineProperty(location,key,{get:()=>currentURL[key],set:value=>{currentURL[key]=value;}});
 const entries=[{href:currentURL.href,state:{gallery:{opened:true}}}];let index=0;
 const history={scrollRestoration:'auto',get state(){return entries[index].state;},replaceState(state,_,url){entries[index]={state,href:new URL(url,currentURL).href};currentURL=new URL(entries[index].href);},pushState(state,_,url){entries.splice(index+1);entries.push({state,href:new URL(url,currentURL).href});index++;currentURL=new URL(entries[index].href);}};
 const window={location,history,fetch:async url=>{const target=new URL(url,currentURL);requests.push(target.href);return{ok:true,headers:{get:()=> 'text/html'},text:async()=>target.pathname};},requestAnimationFrame:fn=>{fn();return 0;},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),scrollTo(...args){const value=args[0];position=typeof value==='object'?[value.left||0,value.top||0]:args;},addEventListener:(type,fn,options)=>listen(windowEvents,type,fn,options),removeEventListener:(type,fn)=>windowEvents.set(type,(windowEvents.get(type)||[]).filter(entry=>entry.fn!==fn)),dispatchEvent:event=>emit(windowEvents,event.type,event),SiteI18n:{page:()=>({route:'/map/',switchMode:feature?'history':'navigate'}),localizedPath:(route,lang)=>lang==='en'?'/en'+route:route,loadPage(){}},SiteTheme:{apply(){}}};
 const context={window,document,location,history,URL,AbortController,AbortSignal,queueMicrotask,console,clearTimeout:window.clearTimeout,clearInterval(){},cancelAnimationFrame(){},Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},DOMParser:class{parseFromString(url){return page(url,url.startsWith('/articles/')?'top':'');}}};
 Object.defineProperties(context,{scrollX:{get:()=>position[0]},scrollY:{get:()=>position[1]}});
 vm.runInNewContext(source,context,{timeout:1000});
 async function flush(){for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));}
 return{window,document,history,location,requests,assigned,entries,get position(){return [...position];},setPosition(x,y,{save=false}={}){position=[x,y];if(save)emit(windowEvents,'scroll');},flushTimers(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());},visit:async url=>{await window.SiteNavigation.visit(url);await flush();},async pop(delta){index+=delta;assert(index>=0&&index<entries.length);currentURL=new URL(entries[index].href);emit(windowEvents,'popstate');await flush();},emitLanguage(){emit(windowEvents,'site:languagechange');},get rendered(){return window.SiteNavigation.state().rendered;}};
}

test('directory Back restores the prior reading position, and Forward reaches the section',async()=>{
 const ui=harness();ui.setPosition(0,480);await ui.visit('#section-a');assert.equal(ui.location.hash,'#section-a');assert.deepEqual(ui.position,[0,1200]);assert.equal(ui.requests.length,0);
 await ui.pop(-1);assert.equal(ui.location.hash,'');assert.deepEqual(ui.position,[0,480]);
 await ui.pop(1);assert.equal(ui.location.hash,'#section-a');assert.deepEqual(ui.position,[0,1200]);
});
test('scrolling after a directory jump is saved for a later Forward',async()=>{
 const ui=harness();await ui.visit('#section-a');ui.setPosition(0,1630,{save:true});ui.flushTimers();await ui.pop(-1);assert.deepEqual(ui.position,[0,0]);await ui.pop(1);assert.deepEqual(ui.position,[0,1630]);assert.equal(ui.history.state.gallery,undefined);
});
test('anchor targets receive temporary keyboard focus without changing an existing tabindex',async()=>{
 const ui=harness(),a=ui.document.getElementById('section-a'),b=ui.document.getElementById('section-b');b.setAttribute('tabindex','0');await ui.visit('#section-a');assert.equal(ui.document.activeElement,a);assert.equal(a.getAttribute('tabindex'),'-1');assert.equal(a.lastScrollOptions.behavior,'instant');await ui.visit('#section-b');assert.equal(a.hasAttribute('tabindex'),false);assert.equal(ui.document.activeElement,b);b.emit('blur');assert.equal(b.getAttribute('tabindex'),'0');
});
test('home to article synchronizes body.id, so #top works after progressive navigation',async()=>{
 const ui=harness({initial:'/',bodyId:''});await ui.visit('/articles/example.html#section-a');assert.equal(ui.document.body.id,'top');assert.deepEqual(ui.position,[0,1200]);await ui.visit('#top');assert.deepEqual(ui.position,[0,0]);assert.equal(ui.document.activeElement,ui.document.querySelector('main'));await ui.visit('/');assert.equal(ui.document.body.id,'');assert.deepEqual(ui.position,[0,0]);
});
test('cross-page Back restores a saved position rather than overriding it with the URL fragment',async()=>{
 const ui=harness();await ui.visit('#section-a');ui.setPosition(0,1720);await ui.visit('/about/');assert.equal(ui.document.body.id,'');await ui.pop(-1);assert.equal(ui.document.body.id,'top');assert.equal(ui.location.hash,'#section-a');assert.deepEqual(ui.position,[0,1720]);
});
test('malformed or missing fragments are safe, and a bare same-page link returns to the start',async()=>{
 const ui=harness();await assert.doesNotReject(ui.visit('#%E0%A4%A'));await assert.doesNotReject(ui.visit('/about/#missing'));assert.deepEqual(ui.position,[0,0]);ui.setPosition(0,600);await ui.visit('/about/');assert.deepEqual(ui.position,[0,0]);
});
test('same-feature language history keeps application state and does not fetch a replacement page',async()=>{
 const ui=harness({initial:'/map/',bodyId:'',feature:true});ui.setPosition(0,420);const state=ui.history.state;ui.history.pushState(state,'','/en/map/');ui.emitLanguage();await ui.pop(-1);assert.equal(ui.requests.length,0);assert.deepEqual(ui.position,[0,420]);assert.equal(ui.history.state,state);assert.equal(ui.rendered,ui.location.href);
});
test('a Chinese-only reader removes the prior switch, and returning restores exactly one switch',async()=>{
 const ui=harness({initial:'/about/',bodyId:'',languageSwitcher:true});
 const theme=ui.document.querySelector('#theme-toggle');
 assert.equal(ui.document.querySelectorAll('.site-language-switch').length,1);
 await ui.visit('/marx/');assert.equal(ui.document.querySelectorAll('.site-language-switch').length,0);
 await ui.visit('/marx/commodity/');assert.equal(ui.document.querySelectorAll('.site-language-switch').length,0);
 await ui.visit('/about/');assert.equal(ui.document.querySelectorAll('.site-language-switch').length,1);
 assert.equal(ui.document.querySelector('#theme-toggle'),theme);
 assert.equal(ui.document.querySelectorAll('#theme-toggle').length,1);
 await ui.visit('/english/');assert.equal(ui.document.querySelectorAll('.site-language-switch').length,0);
 await ui.visit('/about/');assert.equal(ui.document.querySelectorAll('.site-language-switch').length,1);
});
