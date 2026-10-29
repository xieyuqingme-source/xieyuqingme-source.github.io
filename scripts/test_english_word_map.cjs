'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const MapModel=require('../home/assets/english-word-map.js'),D3=require('../home/assets/vendor/d3-7.9.0.min.js');
const copy=value=>JSON.parse(JSON.stringify(value));
function stop(lon,lat,form='word',period=''){return {language:'测试语言',form,period,place_zh:'测试代表地区',lon,lat,approximate:true};}
function word(slug,journey){return {slug,headword:slug,title:slug+'的测试词卡',reading:'/english/'+slug+'/',summary:'来源与争议见测试词卡。',journey};}
function data(){return {version:1,words:[word('alpha',[stop(118,24,'one'),stop(101,3,'two'),stop(0,51,'three','有来源的时期')]),word('solo',[stop(80,7,'故事地名','具体传播路径仍有争议')]),word('dateline',[stop(179,10,'east'),stop(-179,10,'west')])]};}
const land={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-10,0],[-10,20],[10,20],[10,0],[-10,0]]]}}]};

test('public word data preserves order, uncertain periods and every approximate node without mutating source',()=>{
  const input=data(),before=JSON.stringify(input),normalized=MapModel.validateData(input);assert.equal(JSON.stringify(input),before);assert.equal(normalized.words.length,3);assert.deepEqual(normalized.words[0].journey,input.words[0].journey);
  assert.equal(normalized.words[0].journey[0].period,'');assert.equal(normalized.words[1].journey[0].period,'具体传播路径仍有争议');
  assert.ok(Object.isFrozen(normalized)&&Object.isFrozen(normalized.words)&&Object.isFrozen(normalized.words[0].journey)&&Object.isFrozen(normalized.words[0].journey[0]));input.words[0].journey[0].lon=0;assert.equal(normalized.words[0].journey[0].lon,118);
});
for(const change of [d=>{d.version=2;},d=>{d.words=[];},d=>{d.words[1].slug=d.words[0].slug;},d=>{d.words[0].summary='';},d=>{d.words[0].slug='../unsafe';},d=>{d.words[0].journey=[];},d=>{d.words[0].journey=Array.from({length:9},()=>stop(0,0));}])test('invalid map catalogue is rejected: '+change.toString(),()=>{const input=data();change(input);assert.throws(()=>MapModel.validateData(input),MapModel.WordMapError);});
for(const value of [181,-181,NaN,Infinity,'118',null])test('invalid longitude is rejected: '+String(value),()=>{const input=data();input.words[0].journey[0].lon=value;assert.throws(()=>MapModel.validateData(input),MapModel.WordMapError);});
for(const value of [91,-91,NaN,Infinity,'24'])test('invalid latitude is rejected: '+String(value),()=>{const input=data();input.words[0].journey[0].lat=value;assert.throws(()=>MapModel.validateData(input),MapModel.WordMapError);});
for(const value of [false,1,'true',null,undefined])test('approximate must be the literal true: '+String(value),()=>{const input=data();input.words[0].journey[0].approximate=value;assert.throws(()=>MapModel.validateData(input),MapModel.WordMapError);});
for(const href of ['javascript:alert(1)','https://example.org/english/alpha/','//example.org/english/alpha/','/english/other/','/\\example.org/alpha/','/english/alpha/" onclick="x'])test('reading links must remain the corresponding public card: '+href,()=>{const input=data();input.words[0].reading=href;assert.throws(()=>MapModel.validateData(input),MapModel.WordMapError);});
test('text controls are rejected but HTML-looking text is retained as literal data',()=>{
  const input=data();input.words[0].journey[0].form='<img onerror=x>';assert.equal(MapModel.validateData(input).words[0].journey[0].form,'<img onerror=x>');input.words[0].summary='a\nb';assert.throws(()=>MapModel.validateData(input),MapModel.WordMapError);
});
test('each adjacent pair yields one exact-ended arc; a single story node never invents a predecessor',()=>{
  const input=data(),segments=MapModel.segmentsFor(input.words[0],D3);assert.equal(segments.length,2);assert.deepEqual(segments.map(segment=>[segment.from,segment.to]),[[0,1],[1,2]]);
  segments.forEach((segment,index)=>{assert.equal(segment.coordinates.length,33);const first=input.words[0].journey[index],last=input.words[0].journey[index+1];for(const [actual,expected] of [[segment.coordinates[0],[first.lon,first.lat]],[segment.coordinates.at(-1),[last.lon,last.lat]]]){assert(Math.abs(actual[0]-expected[0])<1e-10);assert(Math.abs(actual[1]-expected[1])<1e-10);}assert.ok(segment.coordinates.flat().every(Number.isFinite));});
  assert.deepEqual(MapModel.segmentsFor(input.words[1],D3),[]);assert.throws(()=>MapModel.segmentsFor(input.words[0],D3,1),MapModel.WordMapError);
});
test('date-line arcs are clipped into local pieces, not a straight line crossing the entire map',()=>{
  const segment=MapModel.segmentsFor(data().words[2],D3)[0],projection=MapModel.projectionFor(D3,640,320),path=D3.geoPath(projection)(segment);
  assert(path&&!/NaN|Infinity/.test(path));assert.equal((path.match(/M/g)||[]).length,2);
  for(let index=1;index<segment.coordinates.length;index++){let delta=Math.abs(segment.coordinates[index][0]-segment.coordinates[index-1][0]);delta=Math.min(delta,360-delta);assert(delta<1);}
});
test('view state bounds zoom and pan while zero zoom never moves the global map',()=>{
  assert.deepEqual(MapModel.viewState({zoom:0,x:999,y:999},300,240),{zoom:1,x:0,y:0});assert.deepEqual(MapModel.viewState({zoom:9,x:9999,y:-9999},300,240),{zoom:4,x:450,y:-360});
  assert.deepEqual(MapModel.viewState({zoom:2,x:NaN,y:Infinity},300,240),{zoom:2,x:0,y:0});assert.throws(()=>MapModel.projectionFor(D3,0,0),MapModel.WordMapError);
});
test('gesture classification preserves vertical touch scrolling and waits for clear horizontal intent',()=>{
  assert.equal(MapModel.gestureIntent(3,2,'touch'),'pending');assert.equal(MapModel.gestureIntent(5,40,'touch'),'scroll');assert.equal(MapModel.gestureIntent(40,5,'touch'),'pan');assert.equal(MapModel.gestureIntent(20,20,'touch'),'pending');assert.equal(MapModel.gestureIntent(1,20,'mouse'),'pan');assert.equal(MapModel.gestureIntent(NaN,2),'pending');
});
test('word query parsing falls back on unknown or repeated values and preserves other query entries',()=>{
  const slugs=['alpha','solo'];assert.equal(MapModel.readSelection('?word=solo',slugs),'solo');assert.equal(MapModel.readSelection('?word=unknown',slugs),'alpha');assert.equal(MapModel.readSelection('?word=solo&word=solo',slugs),'alpha');assert.equal(MapModel.readSelection('?keep=1',slugs),'alpha');
  const params=new URLSearchParams(MapModel.selectionQuery('?keep=1&keep=2&word=alpha&name=%E8%8C%B6','solo'));assert.deepEqual(params.getAll('keep'),['1','2']);assert.equal(params.get('name'),'茶');assert.deepEqual(params.getAll('word'),['solo']);assert.throws(()=>MapModel.selectionQuery('','../unsafe'),MapModel.WordMapError);
});

class Element{
  constructor(tag='div',doc){this.tagName=tag;this.document=doc;this.children=[];this.parentElement=null;this.attributes={};this.className='';this.hidden=false;this.disabled=false;this.listeners=new Map();this._text='';this.captures=[];this.releases=[];this.bounds={width:640,height:320};}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}set textContent(value){this.children.forEach(child=>{child.parentElement=null;});this.children=[];this._text=String(value);}
  set innerHTML(_){assert.fail('Word map content must never enter innerHTML');}
  append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}replaceChildren(...children){this.textContent='';this.append(...children);}
  setAttribute(key,value){this.attributes[key]=String(value);}getAttribute(key){return this.attributes[key]??null;}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  emit(type,options={}){let prevented=false;const event={target:this,cancelable:true,preventDefault(){prevented=true;},...options};for(const fn of this.listeners.get(type)||[])fn(event);return prevented;}
  closest(selector){if(selector==='[data-word-map-slug],[data-word-map-zoom]'&&(this.getAttribute('data-word-map-slug')!==null||this.getAttribute('data-word-map-zoom')!==null))return this;return this.parentElement?.closest(selector)||null;}
  contains(node){while(node){if(node===this)return true;node=node.parentElement;}return false;}
  getBoundingClientRect(){return {...this.bounds,left:0,top:0};}setPointerCapture(id){this.captures.push(id);}releasePointerCapture(id){this.releases.push(id);}focus(){this.document.activeElement=this;}
}
function fixture(input=data(),options={}){
  const document={activeElement:null},root=new Element('section',document),ui=new Element('div',document),words=new Element('nav',document),svg=new Element('svg',document),route=new Element('section',document),status=new Element('p',document),fallback=new Element('section',document),script=new Element('script',document);
  root.append(ui,status,fallback,script);ui.append(words,svg,route);ui.hidden=true;status.hidden=true;fallback.textContent='服务器生成的全部文字路线';script.textContent=JSON.stringify(input);
  const buttons=input.words.map(word=>{const button=new Element('button',document);button.type='button';button.setAttribute('data-word-map-slug',word.slug);words.append(button);return button;});
  const zooms=['in','out','reset'].map(action=>{const button=new Element('button',document);button.type='button';button.setAttribute('data-word-map-zoom',action);ui.append(button);return button;});
  const nodes={ui,words,svg,route,status,fallback};root.querySelector=selector=>nodes[{'[data-word-map-ui]':'ui','[data-word-map-words]':'words','[data-word-map-svg]':'svg','[data-word-map-route]':'route','[data-word-map-status]':'status','[data-word-map-fallback]':'fallback'}[selector]]||null;
  root.querySelectorAll=()=>zooms;words.querySelectorAll=()=>buttons;document.querySelector=()=>root;document.getElementById=()=>script;document.createElement=tag=>new Element(tag,document);document.createElementNS=(namespace,tag)=>{const node=new Element(tag,document);node.namespaceURI=namespace;return node;};
  const window=new Element('window',document),frames=new Map(),requests=[],owned=[],observers=[];let nextFrame=0,resolve,reject;const response=new Promise((res,rej)=>{resolve=res;reject=rej;});
  window.d3=options.d3||D3;window.AbortController=AbortController;window.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame;};window.cancelAnimationFrame=id=>frames.delete(id);window.setTimeout=window.setInterval=()=>assert.fail('A static map must not run timers');window.matchMedia=()=>({matches:options.reducedMotion===true});
  window.ResizeObserver=class{constructor(fn){this.fn=fn;this.disconnected=false;observers.push(this);}observe(node){this.node=node;}disconnect(){this.disconnected=true;}};window.SiteNavigation={own:fn=>owned.push(fn)};
  window.location={pathname:'/english/map/',search:options.search||'',hash:options.hash||''};const historyCalls=[];window.history={state:{saved:'keep',__siteScroll:[0,123]},replaceState(state,unused,url){historyCalls.push({state,unused,url});const parsed=new URL(url,'https://local.invalid');window.location.pathname=parsed.pathname;window.location.search=parsed.search;window.location.hash=parsed.hash;}};window.scrollTo=()=>assert.fail('Word selection must preserve scroll without calling scrollTo');
  window.fetch=(url,settings)=>{requests.push({url,settings});return options.delayed?response:Promise.resolve({ok:options.ok!==false,json:async()=>options.land||land});};
  return {document,window,root,ui,words,svg,route,status,fallback,script,buttons,zooms,frames,requests,owned,observers,historyCalls,resolveLand:value=>resolve({ok:true,json:async()=>value}),rejectLand:reject,flush(){const pending=Array.from(frames.values());frames.clear();pending.forEach(fn=>fn(0));}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const nodes=root=>[root,...root.children.flatMap(nodes)];
const listeners=f=>[f.ui,f.svg,f.window].reduce((sum,node)=>sum+Array.from(node.listeners.values()).reduce((n,set)=>n+set.size,0),0);
function click(f,target){f.ui.emit('click',{target});}
async function readyFixture(options={}){const f=fixture(data(),options),api=MapModel.mount(f);await tick();f.flush();return {f,api};}

test('mount fetches only fixed local land, renders static SVG and keeps full station text and card links',async()=>{
  const {f,api}=await readyFixture();assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'/assets/map-land.json');assert.equal(f.requests[0].settings.credentials,'same-origin');assert.equal(api.getState().land,'ready');assert.equal(f.ui.hidden,false);assert.equal(f.fallback.hidden,true);assert.equal(f.root.getAttribute('data-word-map-ready'),'true');
  assert.equal(f.svg.children.filter(node=>node.getAttribute('class')==='ec-word-map-segment').length,2);assert.equal(f.svg.children.filter(node=>node.getAttribute('class')==='ec-word-map-stop').length,3);assert.ok(nodes(f.route).some(node=>node.tagName==='a'&&node.getAttribute('href')==='/english/alpha/'));assert.match(f.route.textContent,/代表地区示意/);assert.match(f.route.textContent,/有来源的时期/);
  assert.equal(f.route.getAttribute('aria-live'),'polite');assert.equal(f.svg.getAttribute('tabindex'),'0');assert.equal(f.svg.getAttribute('role'),'img');assert.ok(f.svg.children.every(node=>node.namespaceURI==='http://www.w3.org/2000/svg'));assert.equal(f.frames.size,0);
});
test('word selection renders one-node uncertainty without false arcs and keeps native button focus',async()=>{
  const {f,api}=await readyFixture();f.buttons[1].focus();click(f,f.buttons[1]);f.flush();assert.equal(api.getState().selected,'solo');assert.equal(f.root.getAttribute('data-word-map-selected'),'solo');assert.equal(f.document.activeElement,f.buttons[1]);assert.equal(f.buttons[1].getAttribute('aria-pressed'),'true');
  assert.equal(f.svg.children.filter(node=>node.getAttribute('class')==='ec-word-map-segment').length,0);assert.equal(f.svg.children.filter(node=>node.getAttribute('class')==='ec-word-map-stop').length,1);assert.match(f.route.textContent,/具体传播路径仍有争议/);assert.match(f.route.textContent,/只记录了一个节点/);
});
test('initial word links restore the selected route and replacing a word preserves query, hash and history.state',async()=>{
  const {f,api}=await readyFixture({search:'?keep=1&word=solo',hash:'#keep'});assert.equal(api.getState().selected,'solo');assert.equal(f.historyCalls.length,0);
  const state=f.window.history.state;click(f,f.buttons[0]);assert.equal(api.getState().selected,'alpha');assert.equal(f.window.location.search,'?keep=1&word=alpha');assert.equal(f.window.location.hash,'#keep');assert.equal(f.historyCalls.length,1);assert.equal(f.historyCalls[0].state,state);
  f.window.location.search='?keep=1&word=dateline';f.window.emit('popstate');assert.equal(api.getState().selected,'dateline');assert.equal(f.historyCalls.length,1);
  f.window.location.pathname='/today/';f.window.location.search='?word=solo';f.window.emit('popstate');assert.equal(api.getState().selected,'dateline');assert.equal(f.historyCalls.length,1);
});
test('unknown or duplicate word parameters normalize safely while the clean map URL remains clean',async()=>{
  for(const search of ['?keep=1&word=unknown','?keep=1&word=solo&word=solo']){const {f,api}=await readyFixture({search,hash:'#keep'});assert.equal(api.getState().selected,'alpha');assert.equal(f.window.location.search,'?keep=1&word=alpha');assert.equal(f.window.location.hash,'#keep');assert.equal(f.historyCalls.length,1);}
  const {f}=await readyFixture();assert.equal(f.historyCalls.length,0);assert.equal(f.window.location.search,'');
});
test('only geometry APIs are used even when old document-selection, timer and zoom APIs would throw',async()=>{
  const geometry={geoPath:D3.geoPath,geoNaturalEarth1:D3.geoNaturalEarth1,geoInterpolate:D3.geoInterpolate};for(const key of ['select','selectAll','timer','transition','zoom','drag'])Object.defineProperty(geometry,key,{get(){assert.fail('Never consume old scoped D3 '+key);}});
  const {f,api}=await readyFixture({d3:geometry});assert.equal(api.getState().land,'ready');assert.equal(f.frames.size,0);api.destroy();
});
test('zoom buttons and SVG-only keyboard commands pan safely and reset the view',async()=>{
  const {f,api}=await readyFixture();assert.equal(f.zooms[1].disabled,true);click(f,f.zooms[0]);f.flush();assert.equal(api.getState().view.zoom,2);assert.equal(f.svg.getAttribute('data-map-zoom'),'2');const before=api.getState().view.x;
  assert.equal(f.svg.emit('keydown',{key:'ArrowRight'}),true);assert(api.getState().view.x<=before);assert.equal(f.svg.emit('keydown',{key:'Tab'}),false);f.svg.emit('keydown',{key:'Home'});f.flush();assert.deepEqual(api.getState().view,{zoom:1,x:0,y:0});
  f.svg.emit('keydown',{key:'+'});f.svg.emit('keydown',{key:'+'});f.flush();assert.equal(api.getState().view.zoom,4);assert.equal(f.zooms[0].disabled,true);f.svg.emit('keydown',{key:'-'});assert.equal(api.getState().view.zoom,2);assert.equal(f.window.listeners.has('keydown'),false);assert.equal(f.svg.listeners.has('wheel'),false);
});
test('vertical touch movement never prevents page scrolling or moves/captures the map',async()=>{
  const {f,api}=await readyFixture();click(f,f.zooms[0]);f.flush();const before=api.getState().view;
  assert.equal(f.svg.emit('pointerdown',{pointerId:1,pointerType:'touch',button:0,clientX:100,clientY:100}),false);assert.equal(f.svg.captures.length,0);
  assert.equal(f.svg.emit('pointermove',{pointerId:1,pointerType:'touch',clientX:103,clientY:160}),false);assert.deepEqual(api.getState().view,before);assert.equal(f.svg.captures.length,0);f.svg.emit('pointerup',{pointerId:1});
});
test('horizontal touch intent captures only after the threshold, and multitouch cancels map drag',async()=>{
  const {f,api}=await readyFixture();click(f,f.zooms[0]);f.flush();const before=api.getState().view;
  f.svg.emit('pointerdown',{pointerId:1,pointerType:'touch',button:0,clientX:100,clientY:100});assert.equal(f.svg.emit('pointermove',{pointerId:1,pointerType:'touch',clientX:104,clientY:101}),false);assert.equal(f.svg.captures.length,0);
  assert.equal(f.svg.emit('pointermove',{pointerId:1,pointerType:'touch',clientX:150,clientY:103}),true);assert.deepEqual(f.svg.captures,[1]);assert.equal(api.getState().view.y,before.y);assert.notEqual(api.getState().view.x,before.x);
  f.svg.emit('pointerdown',{pointerId:2,pointerType:'touch',isPrimary:false,button:0,clientX:180,clientY:100});const after=api.getState().view;assert.equal(f.svg.emit('pointermove',{pointerId:1,pointerType:'touch',clientX:200,clientY:103}),false);assert.deepEqual(api.getState().view,after);assert(f.svg.releases.includes(1));
});
test('reduced-motion mounting and resizing do not introduce animations or a perpetual frame loop',async()=>{
  const {f,api}=await readyFixture({reducedMotion:true});assert.equal(api.getState().animated,false);assert.equal(f.frames.size,0);f.svg.bounds={width:300,height:240};f.window.emit('resize');assert.equal(f.frames.size,1);f.flush();assert.equal(f.frames.size,0);assert.equal(f.svg.getAttribute('viewBox'),'0 0 300 240');assert.equal(f.observers.length,1);assert.equal(f.observers[0].node,f.svg);
});
test('repeated mounting is idempotent and page cleanup aborts requests, removes listeners and disconnects resize',async()=>{
  const f=fixture(data(),{delayed:true}),api=MapModel.mount(f);assert.equal(MapModel.mount(f),api);assert.equal(f.requests.length,1);assert.equal(listeners(f),9);assert.equal(f.owned.length,1);assert.equal(f.frames.size,1);
  const late=Array.from(f.ui.listeners.get('click'))[0];f.owned[0]();api.destroy();assert.equal(listeners(f),0);assert.equal(f.frames.size,0);assert.equal(f.requests[0].settings.signal.aborted,true);assert.equal(f.observers[0].disconnected,true);
  const selected=api.getState().selected;late({target:f.buttons[1]});assert.equal(api.getState().selected,selected);const before=f.root.getAttribute('data-word-map-ready');f.resolveLand(land);await tick();assert.equal(f.root.getAttribute('data-word-map-ready'),before);assert.equal(f.frames.size,0);
});
test('land failure keeps all server-rendered text readable and does not erase selected station information',async()=>{
  const empty=copy(land),unclosed=copy(land),invalid=copy(land);empty.features[0].geometry.coordinates=[[]];unclosed.features[0].geometry.coordinates[0].pop();invalid.features[0].geometry.coordinates[0][1][0]=181;
  for(const options of [{ok:false},{land:{type:'NotGeoJSON'}},{land:empty},{land:unclosed},{land:invalid}]){const {f,api}=await readyFixture(options);assert.equal(api.getState().land,'error');assert.equal(f.fallback.hidden,false);assert.equal(f.status.hidden,false);assert.match(f.status.textContent,/全部文字路线/);assert.match(f.route.textContent,/测试代表地区/);api.destroy();}
});
test('the existing local Natural Earth land asset passes validation and produces finite SVG geometry',async()=>{
  const actual=require('../home/assets/map-land.json'),{f,api}=await readyFixture({land:actual});assert.equal(api.getState().land,'ready');const path=f.svg.children.find(node=>node.getAttribute('class')==='ec-word-map-land');assert.ok(path.getAttribute('d').length>10000);assert.doesNotMatch(path.getAttribute('d'),/NaN|Infinity/);
});
test('missing geometry or bad data reveal safe fallback outside the UI with no orphan listeners',()=>{
  for(const makeBad of [f=>{f.window.d3={};},f=>{f.script.textContent='{broken';},f=>{f.buttons[0].setAttribute('data-word-map-slug','unknown');}]){const f=fixture();makeBad(f);const api=MapModel.mount(f);assert.equal(f.ui.hidden,true);assert.equal(f.fallback.hidden,false);assert.equal(f.status.hidden,false);assert.equal(f.status.parentElement,f.root);assert.equal(listeners(f),0);api.destroy();}
  assert.doesNotThrow(()=>MapModel.mount().destroy());assert.doesNotThrow(()=>MapModel.mount({window:{},document:{querySelector:()=>null}}).destroy());
});
test('HTML-looking station text is inserted literally into native SVG/HTML without interpreting markup',async()=>{
  const input=data();input.words[0].journey[0].form='<img onerror=x>';input.words[0].summary='<script>literal</script>';const f=fixture(input),api=MapModel.mount(f);await tick();f.flush();assert.match(f.route.textContent,/<img onerror=x>/);assert.match(f.route.textContent,/<script>literal<\/script>/);assert.equal(nodes(f.route).some(node=>node.tagName==='script'||node.tagName==='img'),false);assert.equal(api.getState().land,'ready');
});
