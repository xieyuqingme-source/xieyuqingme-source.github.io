/* Local illustrative word relationships: D3 geometry, native SVG and scoped events. */
(function(factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{window.EnglishWordMap=api;api.mount({window,document});}
})(function(){
  'use strict';
  const NS='http://www.w3.org/2000/svg',INSTANCE=Symbol.for('english-word-map.mount');
  class WordMapError extends Error{constructor(message){super(message);this.name='WordMapError';}}
  function fail(message){throw new WordMapError(message);}
  function text(value,label,max=300,empty=false){if(typeof value!=='string'||(!empty&&!value.trim())||value.length>max||/[\u0000-\u001f\u007f]/.test(value))fail(label+'不是有效文字。');return value;}
  function normalizeWord(value){
    if(!value||typeof value!=='object'||Array.isArray(value))fail('单词路线格式有误。');
    const slug=text(value.slug,'词卡标识',64);if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))fail('词卡标识格式有误。');
    const reading=text(value.reading,'词卡链接',1000);let url;
    try{url=new URL(reading,'https://local.invalid');}catch(_){fail('词卡链接格式有误。');}
    if(!reading.startsWith('/')||reading.startsWith('//')||/[\s\\<>"']/.test(reading)||url.origin!=='https://local.invalid'||url.pathname!=='/english/'+slug+'/'||url.username||url.password)fail('词卡链接须指向对应的本地词卡。');
    if(!Array.isArray(value.journey)||!value.journey.length||value.journey.length>8)fail('单词路线须有一至八个已核节点。');
    const journey=value.journey.map(stop=>{
      if(!stop||typeof stop!=='object'||Array.isArray(stop)||typeof stop.lon!=='number'||typeof stop.lat!=='number'||!Number.isFinite(stop.lon)||!Number.isFinite(stop.lat)||Math.abs(stop.lon)>180||Math.abs(stop.lat)>90||stop.approximate!==true)fail('地图节点须使用有效的示意经纬度。');
      return Object.freeze({language:text(stop.language,'语言或故事节点',60),form:text(stop.form,'词形',80),period:text(stop.period,'已有时期',100,true),place_zh:text(stop.place_zh,'代表地区',160),lon:stop.lon,lat:stop.lat,approximate:true});
    });
    return Object.freeze({slug,headword:text(value.headword,'单词',80),title:text(value.title,'词卡标题',300),reading,summary:text(value.summary,'词卡摘要',1600),journey:Object.freeze(journey)});
  }
  function validateData(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||!Array.isArray(value.words)||!value.words.length||value.words.length>500)fail('单词地图资料格式有误。');
    const words=value.words.map(normalizeWord);if(new Set(words.map(word=>word.slug)).size!==words.length)fail('单词地图出现重复词卡。');
    return Object.freeze({version:1,words:Object.freeze(words)});
  }
  function geometryAPI(d3){if(!d3||!['geoNaturalEarth1','geoPath','geoInterpolate'].every(key=>typeof d3[key]==='function'))fail('本地地图几何模块不可用。');return d3;}
  function segmentsFor(value,d3,samples=32){
    const word=normalizeWord(value);geometryAPI(d3);if(!Number.isInteger(samples)||samples<2||samples>128)fail('弧线采样数无效。');
    return word.journey.slice(1).map((stop,index)=>{
      const from=word.journey[index],interpolate=d3.geoInterpolate([from.lon,from.lat],[stop.lon,stop.lat]);
      return {from:index,to:index+1,type:'LineString',coordinates:Array.from({length:samples+1},(_,step)=>interpolate(step/samples))};
    });
  }
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function viewState(value={},width=640,height=320){
    width=Number.isFinite(width)&&width>0?width:640;height=Number.isFinite(height)&&height>0?height:320;
    const zoom=clamp(Number.isFinite(value.zoom)?value.zoom:1,1,4),x=(zoom-1)*width/2,y=(zoom-1)*height/2;
    return {zoom,x:clamp(Number.isFinite(value.x)?value.x:0,-x,x)||0,y:clamp(Number.isFinite(value.y)?value.y:0,-y,y)||0};
  }
  function gestureIntent(dx,dy,pointerType='mouse'){
    if(![dx,dy].every(Number.isFinite)||Math.hypot(dx,dy)<8)return 'pending';
    if(pointerType!=='touch')return 'pan';
    if(Math.abs(dy)>Math.abs(dx)*1.15)return 'scroll';if(Math.abs(dx)>Math.abs(dy)*1.15)return 'pan';return 'pending';
  }
  function readSelection(search,slugs){const values=new URLSearchParams(typeof search==='string'?search:'').getAll('word');return values.length===1&&slugs.includes(values[0])?values[0]:slugs[0];}
  function selectionQuery(search,slug){if(typeof slug!=='string'||slug.length>64||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))fail('词卡标识格式有误。');const params=new URLSearchParams(typeof search==='string'?search:'');params.set('word',slug);return '?'+params.toString();}
  function projectionFor(d3,width,height,view={}){
    geometryAPI(d3);if(![width,height].every(value=>Number.isFinite(value)&&value>=40))fail('地图视野尺寸无效。');const state=viewState(view,width,height),projection=d3.geoNaturalEarth1().fitExtent([[12,16],[width-12,height-16]],{type:'Sphere'}),base=projection.translate();
    return projection.scale(projection.scale()*state.zoom).translate([base[0]+state.x,base[1]+state.y]);
  }
  function validLand(value){
    let points=0;
    const ring=value=>Array.isArray(value)&&value.length>=4&&value.length<=20000&&value.every(point=>Array.isArray(point)&&point.length>=2&&point.length<=3&&point.every(Number.isFinite)&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90&&++points<=200000)&&value[0][0]===value.at(-1)[0]&&value[0][1]===value.at(-1)[1];
    const polygon=value=>Array.isArray(value)&&value.length>0&&value.length<=2000&&value.every(ring);
    return !!value&&value.type==='FeatureCollection'&&Array.isArray(value.features)&&value.features.length>0&&value.features.length<=2000&&value.features.every(feature=>feature&&feature.type==='Feature'&&(feature.geometry?.type==='Polygon'?polygon(feature.geometry.coordinates):feature.geometry?.type==='MultiPolygon'&&Array.isArray(feature.geometry.coordinates)&&feature.geometry.coordinates.length>0&&feature.geometry.coordinates.length<=2000&&feature.geometry.coordinates.every(polygon)));
  }
  function mount(options={}){
    const win=options.window,doc=options.document,root=doc?.querySelector?.('[data-english-word-map]');
    if(!win||!root)return {destroy(){},getState(){return null;}};if(root[INSTANCE])return root[INSTANCE];
    const find=selector=>root.querySelector(selector),ui=find('[data-word-map-ui]'),wordsNode=find('[data-word-map-words]'),svg=find('[data-word-map-svg]'),route=find('[data-word-map-route]'),status=find('[data-word-map-status]'),fallback=find('[data-word-map-fallback]'),script=doc.getElementById('english-word-map-data');
    const cleanups=[],touches=new Set(),pathname=win.location?.pathname;let disposed=false,data,d3,selected,land=null,landState='loading',frame=null,pointer=null,controller=null,width=640,height=320,view=viewState();
    const html=(tag,className,value)=>{const node=doc.createElement(tag);if(className)node.className=className;if(value!==undefined)node.textContent=value;return node;};
    const shape=(tag,attributes={},value)=>{const node=doc.createElementNS(NS,tag);for(const [key,content] of Object.entries(attributes))node.setAttribute(key,String(content));if(value!==undefined)node.textContent=value;return node;};
    function listen(target,type,handler,settings){target.addEventListener(type,handler,settings);cleanups.push(()=>target.removeEventListener(type,handler,settings));}
    function message(value){if(status){status.textContent=value;status.hidden=!value;}}
    function failUI(){if(ui)ui.hidden=true;if(fallback)fallback.hidden=false;root.setAttribute('data-word-map-ready','fallback');message('示意地图暂时无法加载，下面的文字路线仍可阅读。');}
    function measure(){const bounds=svg.getBoundingClientRect();width=Math.max(240,Math.round(bounds.width||640));height=Math.max(240,Math.round(bounds.height||width/2));view=viewState(view,width,height);}
    function requestDraw(){if(disposed||frame!==null)return;frame=win.requestAnimationFrame(()=>{frame=null;if(!disposed)draw();});}
    function renderRoute(){
      route.replaceChildren(html('h2',null,selected.title),html('p','ec-word-map-summary',selected.summary));const list=html('ol','ec-word-map-stations');
      for(const stop of selected.journey){const item=html('li');item.append(html('strong',null,stop.language+' · '+stop.form),html('p',null,stop.place_zh+'（代表地区示意）'));if(stop.period)item.append(html('small',null,stop.period));list.append(item);}
      route.append(list);if(selected.journey.length===1)route.append(html('p','ec-meta','当前资料只记录了一个节点。'));
      const paragraph=html('p'),link=html('a',null,'读这张词卡 →');link.setAttribute('href',selected.reading);paragraph.append(link);route.append(paragraph);
      root.setAttribute('data-word-map-selected',selected.slug);
      for(const button of wordsNode.querySelectorAll('[data-word-map-slug]'))button.setAttribute('aria-pressed',String(button.getAttribute('data-word-map-slug')===selected.slug));
    }
    function draw(){
      measure();const projection=projectionFor(d3,width,height,view),path=d3.geoPath(projection),nodes=[];
      nodes.push(shape('title',{},selected.headword+'：语言或故事关联的代表地区示意'),shape('desc',{},'地点和弧线为示意，不能据此推断真实行程或精确传播路线。完整节点文字位于地图下方。'));
      nodes.push(shape('path',{class:'ec-word-map-sphere',d:path({type:'Sphere'}),fill:'var(--soft,#edf2f2)',stroke:'var(--line,#cbd6d8)'}));
      if(land)nodes.push(shape('path',{class:'ec-word-map-land',d:path(land),fill:'var(--line,#cbd6d8)',stroke:'var(--muted,#7e9298)','stroke-width':'.45'}));
      for(const segment of segmentsFor(selected,d3))nodes.push(shape('path',{class:'ec-word-map-segment',d:path(segment)||'',fill:'none',stroke:'var(--accent,#28647a)','stroke-width':2,'stroke-dasharray':'5 4','data-word-map-segment':segment.from+'-'+segment.to}));
      const labels=[];
      selected.journey.forEach((stop,index)=>{
        const point=projection([stop.lon,stop.lat]);if(!point||point.some(value=>!Number.isFinite(value))||point[0]<0||point[0]>width||point[1]<0||point[1]>height)return;
        const [x,y]=point,group=shape('g',{class:'ec-word-map-stop',transform:'translate('+x+','+y+')','data-word-map-stop':index});
        group.append(shape('title',{},(index+1)+'. '+stop.language+' · '+stop.form+' · '+stop.place_zh+'（示意）'),shape('circle',{r:8,fill:'var(--accent,#28647a)',stroke:'var(--surface,#fff)','stroke-width':1.5}),shape('text',{class:'ec-word-map-number','text-anchor':'middle','dominant-baseline':'central','font-size':10,fill:'var(--surface,#fff)'},index+1));nodes.push(group);
        const size=Array.from(stop.form).reduce((sum,char)=>sum+(/[\x00-\x7f]/.test(char)?6.5:12),0);if(size>width-16)return;const candidates=[[12,-13],[12,23],[-size-12,-13],[-size-12,23],[12,-31],[-size-12,41]];
        for(const [dx,dy] of candidates){const left=clamp(x+dx,8,Math.max(8,width-size-8)),baseline=clamp(y+dy,18,height-8),box=[left-3,baseline-13,left+size+3,baseline+3];if(labels.some(other=>box[0]<other[2]&&box[2]>other[0]&&box[1]<other[3]&&box[3]>other[1]))continue;
          labels.push(box);nodes.push(shape('text',{class:'ec-word-map-label',x:left,y:baseline,'font-size':12,fill:'var(--ink,#17333e)',stroke:'var(--paper,#f3f6f6)','stroke-width':3,'paint-order':'stroke', 'stroke-linejoin':'round'},stop.form));break;}
      });
      svg.setAttribute('viewBox','0 0 '+width+' '+height);svg.setAttribute('role','img');svg.setAttribute('tabindex','0');svg.setAttribute('aria-label',selected.headword+'的代表地区关联示意，当前'+view.zoom+'倍。地图聚焦后可用加减号缩放、方向键平移、Home重置。');svg.setAttribute('data-map-zoom',String(view.zoom));svg.replaceChildren(...nodes);
      for(const button of root.querySelectorAll('[data-word-map-zoom]')){const action=button.getAttribute('data-word-map-zoom');button.disabled=action==='in'&&view.zoom>=4||action==='out'&&view.zoom<=1;}
    }
    function reset(){view=viewState();requestDraw();}
    function saveSelection(){
      if(disposed||!win.location||!win.history?.replaceState||win.location.pathname!==pathname)return;
      const next=win.location.pathname+selectionQuery(win.location.search,selected.slug)+(win.location.hash||''),current=win.location.pathname+win.location.search+(win.location.hash||'');
      if(next!==current)try{win.history.replaceState(win.history.state,'',next);}catch(_){}
    }
    function selectWord(slug,updateURL){const word=data.words.find(word=>word.slug===slug);if(!word)return;if(word.slug!==selected.slug){selected=word;stopPointer();reset();renderRoute();}if(updateURL)saveSelection();}
    function zoomBy(factor){
      measure();const next=clamp(view.zoom*factor,1,4);if(next===view.zoom)return;
      if(next===1)view=viewState();
      else if(view.zoom===1){const base=projectionFor(d3,width,height),points=selected.journey.map(stop=>base([stop.lon,stop.lat])),x=(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2,y=(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2;view=viewState({zoom:next,x:(width/2-x)*next,y:(height/2-y)*next},width,height);}
      else view=viewState({zoom:next,x:view.x*next/view.zoom,y:view.y*next/view.zoom},width,height);
      message('地图缩放：'+view.zoom+'倍。');requestDraw();
    }
    function stopPointer(){if(pointer)try{svg.releasePointerCapture?.(pointer.id);}catch(_){}pointer=null;}
    function destroy(){if(disposed)return;disposed=true;controller?.abort();if(frame!==null){win.cancelAnimationFrame(frame);frame=null;}stopPointer();touches.clear();cleanups.splice(0).reverse().forEach(cleanup=>cleanup());if(root[INSTANCE]===api)delete root[INSTANCE];}
    const api={destroy,refresh:requestDraw,getState:()=>({selected:selected?.slug||null,view:{...view},land:landState,disposed,animated:false})};root[INSTANCE]=api;
    try{
      if(![ui,wordsNode,svg,route,status,fallback,script].every(Boolean))fail('单词地图缺少必要容器。');
      data=validateData(JSON.parse(script.textContent));d3=geometryAPI(options.d3||win.d3);
      const buttons=Array.from(wordsNode.querySelectorAll('[data-word-map-slug]')),slugs=buttons.map(button=>button.getAttribute('data-word-map-slug'));
      if(slugs.length!==data.words.length||new Set(slugs).size!==slugs.length||slugs.some(slug=>!data.words.some(word=>word.slug===slug)))fail('单词地图列表与资料不一致。');
      selected=data.words.find(word=>word.slug===readSelection(win.location?.search,data.words.map(word=>word.slug)));route.setAttribute('aria-live','polite');renderRoute();
      const initial=new URLSearchParams(win.location?.search||'');if(initial.has('word')&&(initial.getAll('word').length!==1||initial.get('word')!==selected.slug))saveSelection();
      ui.hidden=false;fallback.hidden=false;root.setAttribute('data-word-map-ready','loading');message('正在加载本地陆地轮廓…');
      listen(ui,'click',event=>{
        if(disposed)return;const button=event.target?.closest?.('[data-word-map-slug],[data-word-map-zoom]');if(!button||!ui.contains(button)||button.disabled)return;
        const slug=button.getAttribute('data-word-map-slug');if(slug){selectWord(slug,true);return;}
        const action=button.getAttribute('data-word-map-zoom');if(action==='reset'){reset();message('已恢复全球视野。');}else if(action==='in')zoomBy(2);else if(action==='out')zoomBy(.5);
      });
      listen(svg,'keydown',event=>{
        if(disposed)return;const key=event.key;if(['+','=','-','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key))event.preventDefault();else return;
        if(key==='+'||key==='=')zoomBy(2);else if(key==='-')zoomBy(.5);else if(key==='Home'){reset();message('已恢复全球视野。');}
        else{const step=event.shiftKey?72:24,delta={ArrowLeft:[step,0],ArrowRight:[-step,0],ArrowUp:[0,step],ArrowDown:[0,-step]}[key];view=viewState({zoom:view.zoom,x:view.x+delta[0],y:view.y+delta[1]},width,height);requestDraw();}
      });
      listen(svg,'pointerdown',event=>{
        if(disposed||event.button!==undefined&&event.button!==0)return;if(event.pointerType==='touch'){touches.add(event.pointerId);if(touches.size>1||event.isPrimary===false){stopPointer();return;}}
        pointer={id:event.pointerId,type:event.pointerType||'mouse',x:event.clientX,y:event.clientY,view:{...view},active:false};
      });
      listen(svg,'pointermove',event=>{
        if(disposed||!pointer||pointer.id!==event.pointerId)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y,intent=gestureIntent(dx,dy,pointer.type);
        if(intent==='scroll'){stopPointer();return;}if(intent!=='pan'&&!pointer.active)return;
        if(!pointer.active){pointer.active=true;svg.setPointerCapture?.(pointer.id);}if(event.cancelable)event.preventDefault();
        view=viewState({zoom:pointer.view.zoom,x:pointer.view.x+dx,y:pointer.view.y+(pointer.type==='touch'?0:dy)},width,height);requestDraw();
      },{passive:false});
      const end=event=>{touches.delete(event.pointerId);if(pointer?.id===event.pointerId)stopPointer();};listen(svg,'pointerup',end);listen(svg,'pointercancel',end);listen(win,'blur',()=>{stopPointer();touches.clear();});listen(win,'resize',requestDraw);
      listen(win,'popstate',()=>{if(disposed||!win.location||win.location.pathname!==pathname)return;selectWord(readSelection(win.location.search,data.words.map(word=>word.slug)),true);});
      if(win.ResizeObserver){const observer=new win.ResizeObserver(requestDraw);observer.observe(svg);cleanups.push(()=>observer.disconnect());}
      controller=new win.AbortController();win.fetch('/assets/map-land.json',{credentials:'same-origin',signal:controller.signal}).then(response=>{if(!response.ok)throw new Error('Local land unavailable');return response.json();}).then(value=>{
        if(disposed)return;if(!validLand(value))throw new Error('Invalid local land');land=value;landState='ready';fallback.hidden=true;root.setAttribute('data-word-map-ready','true');message('');requestDraw();
      }).catch(()=>{if(disposed)return;landState='error';fallback.hidden=false;root.setAttribute('data-word-map-ready','fallback');message('陆地轮廓暂时无法加载，仍可阅读下方全部文字路线。');requestDraw();});requestDraw();
    }catch(_){destroy();failUI();}
    win.SiteNavigation?.own?.(destroy);return api;
  }
  return {WordMapError,validateData,segmentsFor,viewState,gestureIntent,readSelection,selectionQuery,projectionFor,mount};
});
