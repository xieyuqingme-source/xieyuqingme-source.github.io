'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const notes=require('../home/assets/reading-annotations.js');

class Events {
  constructor(){this.events=new Map();}
  addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(fn);}
  removeEventListener(type,fn){this.events.get(type)?.delete(fn);}
  fire(type,values={}){const event={target:this,preventDefault(){this.defaultPrevented=true;},...values};for(const fn of [...(this.events.get(type) || [])])fn(event);return event;}
  count(){return [...this.events.values()].reduce((total,set)=>total+set.size,0);}
}
class Element extends Events {
  constructor(doc,tag='SPAN'){super();this.doc=doc;this.nodeType=1;this.tagName=tag;this.childNodes=[];this.dataset={};this.attrs={};this.hidden=true;this.isConnected=true;this.selectors=new Map();this.textContent='';}
  add(...children){this.childNodes.push(...children);return this;}
  contains(target){return target===this || this.childNodes.some(child=>child.contains?.(target));}
  setAttribute(key,value){this.attrs[key]=String(value);}
  removeAttribute(key){delete this.attrs[key];if(key==='href')delete this.href;}
  getAttribute(key){return this.attrs[key] ?? null;}
  querySelector(key){return this.selectors.get(key) || null;}
  querySelectorAll(key){return this.selectors.get(key) || [];}
  focus(){this.doc.activeElement=this;this.fire('focus');this.doc.fire('focusin',{target:this});}
}
function fixture(){
  const doc=new Events(),win=new Events(),timers=new Map(),owned=[];let serial=0,selection=null;
  doc.nodeType=9;doc.querySelector=()=>null;win.document=doc;win.getSelection=()=>selection;
  win.setTimeout=fn=>{const id=++serial;timers.set(id,fn);return id;};win.clearTimeout=id=>timers.delete(id);
  win.SiteNavigation={own:fn=>owned.push(fn)};
  const area=new Element(doc,'DIV'),popup=new Element(doc,'SECTION'),closeButton=new Element(doc,'BUTTON');popup.add(closeButton);
  const markers=[new Element(doc),new Element(doc)];markers.forEach((marker,index)=>{marker.dataset.readingNoteIndex=String(index);});area.add(...markers);
  area.selectors.set('[data-reading-note-index]',markers);
  let message='A reviewed meaning';const paints=[];
  const options={window:win,document:doc,area,popup,closeButton,getEntry:marker=>({term:marker.dataset.readingNoteIndex,explanation:message}),paint:(entry,marker)=>paints.push({entry,marker})};
  const all=[win,doc,area,popup,closeButton,...markers];
  return {win,doc,area,popup,closeButton,markers,owned,timers,options,paints,
    select(value){selection=value;},message(value){message=value;},listeners:()=>all.reduce((n,target)=>n+target.count(),0),
    flush(){for(const [id,fn] of [...timers]){timers.delete(id);fn();}}
  };
}
function selected(f){return {isCollapsed:false,rangeCount:1,anchorNode:f.markers[0],focusNode:f.markers[0],toString:()=> 'a word'};}
function frameFixture(){
  const f=fixture(),frames=new Map();let serial=0;
  f.win.requestAnimationFrame=fn=>{const id=++serial;frames.set(id,fn);return id;};
  f.win.cancelAnimationFrame=id=>frames.delete(id);
  return {...f,frames,frame(){for(const [id,fn] of [...frames]){frames.delete(id);fn();}}};
}
function learningFixture(){
  const f=fixture(),root=new Element(f.doc,'MAIN'),data=new Element(f.doc,'SCRIPT');
  const title=new Element(f.doc,'H2'),explanation=new Element(f.doc,'P'),source=new Element(f.doc,'P'),link=new Element(f.doc,'A');
  f.popup.add(title,explanation,source,link);root.add(f.area,f.popup,data);
  const entries=[{term:'<duty>',explanation:'An obligation',source:'A dictionary',source_url:'https://example.org/duty',checked_on:'2026-10-29'}];data.textContent=JSON.stringify(entries);
  for(const [selector,node] of Object.entries({'[data-reading-area]':f.area,'[data-reading-note-popup]':f.popup,'[data-reading-notes]':data,'[data-reading-note-close]':f.closeButton,'[data-reading-note-title]':title,'[data-reading-note-explanation]':explanation,'[data-reading-note-source]':source,'[data-reading-note-link]':link}))root.selectors.set(selector,node);
  f.doc.querySelector=selector=>selector==='[data-reading-annotations]'?root:null;
  return {...f,root,data,title,explanation,source,link,entries};
}

test('only explicit HTTPS note sources are clickable',()=>{
  assert.equal(notes.safeSource('https://example.org/word#meaning'),'https://example.org/word#meaning');
  for(const url of ['javascript:alert(1)','data:text/html,word','file:///C:/word','http://example.org','https://name:pass@example.org','https://example.org/a b','https://example.org/<word>','https://example.org/\nword','https://example.org/\\word'])assert.equal(notes.safeSource(url),'');
});
test('incomplete markup leaves readable content alone',()=>{
  assert.equal(notes.create().show(null),false);assert.equal(notes.mount().show(null),false);
});
test('focus opens; Enter focuses the popup; Escape restores the marker without reopening',()=>{
  const f=fixture(),api=notes.create(f.options),marker=f.markers[0];marker.focus();
  assert.equal(f.popup.hidden,false);assert.equal(marker.getAttribute('aria-expanded'),'true');
  assert.equal(marker.fire('keydown',{key:'Enter'}).defaultPrevented,true);assert.equal(f.doc.activeElement,f.popup);
  f.doc.fire('keydown',{key:'Escape'});assert.equal(f.popup.hidden,true);assert.equal(f.doc.activeElement,marker);
  assert.equal(marker.getAttribute('aria-expanded'),'false');assert.equal(api.activeMarker(),marker);
});
test('Space opens an accessible popup and its close button restores focus',()=>{
  const f=fixture();notes.create(f.options);f.markers[1].fire('keydown',{key:' '});
  assert.equal(f.doc.activeElement,f.popup);f.closeButton.focus();f.closeButton.fire('click');
  assert.equal(f.popup.hidden,true);assert.equal(f.doc.activeElement,f.markers[1]);
});

test('Escape and close restore focus even when hiding a real dialog first blurs it',()=>{
  const f=fixture();let hidden=true;
  Object.defineProperty(f.popup,'hidden',{get:()=>hidden,set(value){hidden=value;if(value&&f.popup.contains(f.doc.activeElement))f.doc.activeElement=f.area;}});
  notes.create(f.options);const marker=f.markers[0];marker.focus();marker.fire('keydown',{key:'Enter'});
  assert.equal(f.doc.activeElement,f.popup);f.doc.fire('keydown',{key:'Escape'});
  assert.equal(f.popup.hidden,true);assert.equal(f.doc.activeElement,marker);
  marker.fire('keydown',{key:' '});f.closeButton.focus();f.closeButton.fire('click');
  assert.equal(f.popup.hidden,true);assert.equal(f.doc.activeElement,marker);
});
test('keyboard focus survives native focus/focusin then viewport scroll before opening',()=>{
  const f=frameFixture();notes.create(f.options);const marker=f.markers[0];marker.focus();
  assert.equal(f.popup.hidden,true);assert.equal(f.frames.size,0);assert.equal(f.timers.size,1);
  f.win.fire('scroll');f.win.fire('scrollend');f.frame();assert.equal(f.popup.hidden,true);
  // A second native scroll resets the bounded two-frame wait.
  f.win.fire('scroll');f.win.fire('scrollend');f.frame();assert.equal(f.popup.hidden,true);f.frame();
  assert.equal(f.popup.hidden,false);assert.equal(f.doc.activeElement,marker);assert.equal(f.frames.size,0);
  f.win.fire('scroll');assert.equal(f.popup.hidden,true,'later user scrolling still closes an open note');
});
test('focusin for the pending marker preserves it; focus leaving cancels both frames',()=>{
  const f=frameFixture();notes.create(f.options);f.markers[0].focus();f.flush();f.frame();
  f.doc.fire('focusin',{target:f.markers[0]});assert.equal(f.frames.size,1);f.frame();assert.equal(f.popup.hidden,false);
  f.markers[1].focus();assert.equal(f.popup.hidden,true);f.doc.activeElement=f.area;f.doc.fire('focusin',{target:f.area});
  assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);f.frame();f.frame();assert.equal(f.popup.hidden,true);
});
test('Escape, selection, outside pointer, blur, pagehide and destroy cancel delayed focus',()=>{
  const actions=[
    f=>f.doc.fire('keydown',{key:'Escape'}),
    f=>{f.select(selected(f));f.doc.fire('selectionchange');},
    f=>f.doc.fire('pointerdown',{target:f.area}),
    f=>f.markers[0].fire('blur'),
    f=>f.win.fire('pagehide'),
    f=>f.owned[0]()
  ];
  for(const action of actions){const f=frameFixture();notes.create(f.options);f.markers[0].focus();f.flush();f.frame();action(f);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);f.frame();f.frame();assert.equal(f.popup.hidden,true);}
});
test('wheel, touch and scrolling keys cancel pending focus instead of reopening after a user scroll',()=>{
  const actions=[f=>f.win.fire('wheel'),f=>f.win.fire('touchmove'),f=>f.doc.fire('keydown',{key:'PageDown'}),f=>f.doc.fire('keydown',{key:'ArrowDown'})];
  for(const action of actions){const f=frameFixture();notes.create(f.options);f.markers[0].focus();action(f);f.win.fire('scroll');f.flush();f.frame();f.frame();assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);assert.equal(f.popup.hidden,true);}
});
test('Enter supersedes a delayed focus request and opens once with popup focus',()=>{
  const f=frameFixture();notes.create(f.options);f.markers[0].focus();f.flush();f.frame();f.markers[0].fire('keydown',{key:'Enter'});f.doc.fire('keydown',{key:'Enter'});
  assert.equal(f.frames.size,0);assert.equal(f.popup.hidden,false);assert.equal(f.doc.activeElement,f.popup);f.frame();f.frame();assert.equal(f.paints.length,1);
});
test('new marker focus cancels an old request and cleanup leaves no animation callbacks',()=>{
  const f=frameFixture(),api=notes.create(f.options);f.markers[0].focus();f.flush();f.frame();f.markers[1].focus();f.flush();f.frame();f.frame();
  assert.equal(api.activeMarker(),f.markers[1]);assert.equal(f.paints.length,1);
  f.markers[0].focus();api.destroy();assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);assert.equal(f.listeners(),0);f.frame();assert.equal(f.popup.hidden,true);
});
test('smooth native focus scrolling waits for scrollend without an animation polling loop',()=>{
  const f=frameFixture();notes.create(f.options);f.markers[0].focus();
  for(let i=0;i<30;i++){f.win.fire('scroll');assert.equal(f.frames.size,0);assert.equal(f.timers.size,1);}
  f.win.fire('scrollend');assert.equal(f.timers.size,0);f.frame();f.frame();assert.equal(f.popup.hidden,false);assert.equal(f.frames.size,0);
});
test('browsers without scrollend use a bounded quiet-scroll fallback',()=>{
  const f=frameFixture();notes.create(f.options);f.markers[0].focus();f.win.fire('scroll');f.flush();f.frame();f.frame();
  assert.equal(f.popup.hidden,false);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
});
test('touch/click opens after the selection delay, not on pointer focus',()=>{
  const f=fixture();notes.create(f.options);const marker=f.markers[0];
  f.doc.fire('pointerdown',{target:marker,clientX:20,clientY:30});marker.focus();
  assert.equal(f.popup.hidden,true);f.doc.fire('pointerup',{target:marker,clientX:20,clientY:30});marker.fire('click');
  assert.equal(f.popup.hidden,true);assert.equal(f.timers.size,1);f.flush();assert.equal(f.popup.hidden,false);
});
test('dragging across original text never opens an annotation',()=>{
  const f=fixture();notes.create(f.options);const marker=f.markers[0];
  f.doc.fire('pointerdown',{target:marker,clientX:20,clientY:30});f.doc.fire('pointerup',{target:marker,clientX:40,clientY:30});
  marker.fire('click');f.flush();assert.equal(f.popup.hidden,true);assert.equal(f.paints.length,0);
});
test('word selection cancels pending clicks and closes visible notes',()=>{
  const f=fixture(),api=notes.create(f.options);f.markers[0].fire('click');assert.equal(f.timers.size,1);
  f.select(selected(f));f.doc.fire('selectionchange');f.flush();assert.equal(f.popup.hidden,true);assert.equal(api.show(f.markers[0]),false);
  f.select(null);api.show(f.markers[0]);assert.equal(f.popup.hidden,false);
  f.select(selected(f));f.doc.fire('selectionchange');assert.equal(f.popup.hidden,true);
});
test('an explicit keyboard request can open a note while text remains selected',()=>{
  const f=fixture();notes.create(f.options);f.select(selected(f));f.markers[0].fire('keydown',{key:'Enter'});
  assert.equal(f.popup.hidden,false);assert.equal(f.doc.activeElement,f.popup);
  f.doc.fire('keydown',{key:'Escape'});assert.equal(f.popup.hidden,true);
});
test('only a nonempty selection within the original area blocks notes',()=>{
  const f=fixture();f.select(selected(f));assert.equal(notes.selectedWithin(f.win,f.area),true);
  f.select({...selected(f),focusNode:f.closeButton});assert.equal(notes.selectedWithin(f.win,f.area),false);
  f.select({...selected(f),toString:()=> '  '});assert.equal(notes.selectedWithin(f.win,f.area),false);
});
test('outside pointer/focus/scroll close; internal popup scrolling stays open',()=>{
  const f=fixture(),api=notes.create(f.options),marker=f.markers[0];
  api.show(marker);f.win.fire('scroll',{target:f.popup});assert.equal(f.popup.hidden,false);
  f.win.fire('scroll');assert.equal(f.popup.hidden,true);
  api.show(marker);f.closeButton.focus();assert.equal(f.popup.hidden,false);
  f.doc.fire('focusin',{target:f.area});assert.equal(f.popup.hidden,true);
  api.show(marker);f.doc.fire('pointerdown',{target:f.closeButton});assert.equal(f.popup.hidden,false);
  f.doc.fire('pointerdown',{target:f.area});assert.equal(f.popup.hidden,true);
});
test('adapter hooks preserve language switching and selection-menu scrolling',()=>{
  const f=fixture();let preserve=false,opened=0;
  const api=notes.create({...f.options,beforeOpen:()=>opened++,keepOpenOnPointer:()=>preserve,ignoreScroll:()=>preserve});
  api.show(f.markers[0]);preserve=true;f.doc.fire('pointerdown',{target:f.area});f.win.fire('scroll');
  assert.equal(f.popup.hidden,false);f.message('Updated language');api.refresh();assert.equal(f.paints.at(-1).entry.explanation,'Updated language');
  assert.equal(opened,1);preserve=false;f.win.fire('scroll');assert.equal(f.popup.hidden,true);
});
test('invalid and removed markers cannot open stale content',()=>{
  const f=fixture(),api=notes.create({...f.options,getEntry:marker=>marker===f.markers[0]?{term:'word'}:null});
  assert.equal(api.show(f.markers[1]),false);assert.equal(api.show(new Element(f.doc)),false);
  f.area.childNodes=[];assert.equal(api.show(f.markers[0]),false);
});
test('pagehide closes and cleanup cancels timers/listeners; reentry never stacks them',()=>{
  const f=fixture(),api=notes.create(f.options),count=f.listeners();assert.equal(notes.create(f.options),api);
  assert.equal(f.owned.length,1);assert.equal(f.listeners(),count);
  api.show(f.markers[0]);f.win.fire('pagehide');assert.equal(f.popup.hidden,true);
  f.markers[0].fire('click');assert.equal(f.timers.size,1);f.owned[0]();f.owned[0]();
  assert.equal(f.timers.size,0);assert.equal(f.listeners(),0);f.flush();assert.equal(f.popup.hidden,true);assert.equal(api.show(f.markers[0]),false);
  const next=notes.create(f.options);assert.notEqual(next,api);assert.equal(f.listeners(),count);next.destroy();assert.equal(f.listeners(),0);
});
test('learning adapter paints reviewed JSON as text and exposes its checked source',()=>{
  const f=learningFixture();const api=notes.mount({window:f.win,document:f.doc});
  assert.equal(api.show(f.markers[0]),true);assert.equal(f.title.textContent,'<duty>');assert.equal(f.title.innerHTML,undefined);
  assert.equal(f.explanation.textContent,'An obligation');assert.match(f.source.textContent,/A dictionary · 核对于2026-10-29/);
  assert.equal(f.link.href,'https://example.org/duty');assert.equal(f.link.hidden,false);assert.equal(f.link.rel,'noopener noreferrer');
  assert.equal(api.show(f.markers[1]),false);f.markers[0].dataset.readingNoteIndex='0e0';assert.equal(api.show(f.markers[0]),false);
});
test('broken JSON is inert and unsafe source URLs never become links',()=>{
  const f=learningFixture();f.data.textContent='not JSON';assert.equal(notes.mount({window:f.win,document:f.doc}).show(f.markers[0]),false);assert.equal(f.owned.length,0);
  f.entries[0].source_url='javascript:alert(1)';f.data.textContent=JSON.stringify(f.entries);
  notes.mount({window:f.win,document:f.doc}).show(f.markers[0]);assert.equal(f.link.hidden,true);assert.equal(f.link.getAttribute('href'),null);
});
test('browser bootstrap and script reevaluation share one controller',()=>{
  const f=learningFixture(),source=fs.readFileSync(path.join(__dirname,'../home/assets/reading-annotations.js'),'utf8');
  const context=vm.createContext({window:f.win,URL});vm.runInContext(source,context);const count=f.listeners();
  vm.runInContext(source,context);assert.equal(f.listeners(),count);assert.equal(f.owned.length,1);
  assert.equal(f.win.ReadingAnnotations.mount({window:f.win,document:f.doc}).show(f.markers[0]),true);
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage)\b/);
});
