'use strict';
const assert=require('node:assert/strict');
const {layoutOutroTitle}=require('../home/assets/map-video-ui.js');
const measure=(text,size)=>Array.from(text).reduce((width,unit)=>width+(/[\u3400-\u9fff]/u.test(unit)?size:size*.45),0);
const short=layoutOutroTitle('My footprints',measure);
assert.deepEqual(short,{fontSize:60,lines:['My footprints'],truncated:false,baselines:[818],closingBaseline:890});
assert.equal(layoutOutroTitle('My  footprints',measure).lines[0],'My  footprints','short headings retain their original spacing');
const title='A deliberately long English heading about a remarkable journey through unfamiliar cities and memories';
const long=layoutOutroTitle(title,measure);
assert.equal(long.lines.length,2);assert.equal(long.truncated,false);assert.equal(long.lines.join(' '),title);
assert(long.fontSize>=44&&long.fontSize<=60);assert(long.lines.every(line=>measure(line,long.fontSize)<=1152));
assert(long.lines.every(line=>!line.startsWith(' ')&&!line.endsWith(' ')));
const huge=layoutOutroTitle('A very long heading '.repeat(40),measure);
assert.equal(huge.lines.length,2);assert.equal(huge.fontSize,44);assert(huge.truncated);assert(huge.lines[1].endsWith('…'));
assert(huge.lines.every(line=>measure(line,huge.fontSize)<=1152));
const unbroken=layoutOutroTitle('W'.repeat(400),measure);
assert.equal(unbroken.lines.length,2);assert(unbroken.truncated);assert(unbroken.lines[1].endsWith('…'));
assert(unbroken.lines.every(line=>measure(line,unbroken.fontSize)<=1152));
const chinese=layoutOutroTitle('一次很长的旅程和很多美好回忆'.repeat(8),measure);
assert.equal(chinese.lines.length,2);assert(chinese.truncated);
for(const result of [long,huge,unbroken,chinese]){
 assert(result.baselines[0]-result.fontSize>750,'title stays below the count line');
 assert(result.baselines.at(-1)+result.fontSize*.3<result.closingBaseline-42,'title does not reach the closing line');
 assert(result.closingBaseline+13<960,'closing line fits in the video frame');
}
console.log('PASS outro layout: unchanged short heading; natural-width two-line word wrapping; bounded font sizes; explicit ellipsis; unbroken/CJK fallback; nonoverlapping footer bounds');


for(const heading of ['Xie Yuqing’s Footprints','An English journey through cities, memory and the passage of time','沿着时间一路走过的城市与回忆']){const compact=layoutOutroTitle(heading,measure,{width:1184,height:720,mapBottom:520});assert.equal(compact.truncated,false);assert(compact.baselines[0]-compact.fontSize>554);assert(compact.closingBaseline+9<=720);assert(compact.lines.every(line=>measure(line,compact.fontSize)<=1184));}
console.log('PASS 16:9 footer: complete bilingual headings, readable fixed font bounds and no caption overflow');


const {captionLayout}=require('../home/assets/map-video-ui.js');const safe=captionLayout();assert.equal(safe.height,720);assert.equal(safe.mapBottom,720);assert.equal(safe.overlay,true);assert(safe.descriptionYs.at(-1)+8<=safe.height-safe.safeBottom,'complete event lines fit above the lower margin');assert.equal(safe.dateY,safe.cityY,'city and date share a compact header');assert(safe.cityY<safe.descriptionYs[0]);for(const value of ['谢雨卿的足迹','A deliberately long English title about a journey through unfamiliar cities and lasting memories']){const layout=layoutOutroTitle(value,measure,{width:1184,height:720,mapBottom:safe.mapBottom,overlay:true});assert.equal(layout.truncated,false);assert(layout.closingBaseline+8<=safe.height-safe.safeBottom);}
console.log('PASS encoded captions: date, city, two event lines and complete bilingual outro above bottom safety margin');

const {captionLines}=require('../home/assets/map-video-ui.js');const paragraph='Meaningful details and the end of the sentence stay complete.';const lines=captionLines(paragraph,text=>text.length,20);assert.equal(lines.join(''),paragraph);assert(lines.every(line=>line.length<=20));assert(lines.slice(0,-1).every(line=>/\s$/.test(line)));const cjk='城市、日期和真实事件说明不能丢字。'.repeat(8);assert.equal(captionLines(cjk,text=>Array.from(text).length,15).join(''),cjk);assert.equal(captionLines('first\nsecond',text=>text.length,30).join(''),'first\nsecond');console.log('PASS caption word wrapping: readable English boundaries and exact original Chinese/newline preservation');

const fs=require('node:fs'),path=require('node:path');
const renderer=fs.readFileSync(path.join(__dirname,'../home/assets/map-video-ui.js'),'utf8');
assert.equal(safe.mapBottom/safe.height,1,'map covers the complete encoded frame');
assert.equal(safe.safeBottom,56);assert.equal(safe.overlay,true);
assert(!renderer.includes('fillRect(0, mapBottom, width, height - mapBottom)'), 'no opaque caption footer');
assert(renderer.includes('strokeText(text,x,y,maxWidth)'),'transparent text retains a contrasting outline');
const overlayTitle=layoutOutroTitle('A journey through familiar cities and unexpected memories',measure,{width:1184,height:720,mapBottom:720,overlay:true});
assert(!overlayTitle.truncated);assert(overlayTitle.baselines[0]>=588);assert(overlayTitle.fontSize>=26&&overlayTitle.fontSize<=32);
assert(overlayTitle.baselines.at(-1)+overlayTitle.fontSize*.3<overlayTitle.closingBaseline-18);
assert(overlayTitle.closingBaseline+8<=720-safe.safeBottom);
console.log('PASS transparent overlay: full-height map, outlined captions, safe intro/outro and no opaque footer');

const single=captionLayout(1),double=captionLayout(2);
assert.deepEqual(single.fontSizes,{date:22,city:30,description:26});
assert.equal(single.headerY,624);assert.equal(double.headerY,592);
assert.deepEqual(single.descriptionYs,[656]);assert.deepEqual(double.descriptionYs,[624,656]);
assert.equal(single.cityY,single.dateY);assert(single.headerY>double.headerY,'short descriptions remain anchored at the bottom');
for(const count of [0,1,2,20]){const item=captionLayout(count);assert(item.descriptionYs.length>=1&&item.descriptionYs.length<=2);assert.equal(item.descriptionYs.at(-1),656);}
const outro=layoutOutroTitle('My footprints',measure,{height:720,width:1216,overlay:true});assert.equal(outro.fontSize,32);assert.deepEqual(outro.baselines,[620]);assert.equal(outro.closingBaseline,656);
console.log('PASS smaller bottom captions: shared city/date header, 22/30/26 px type, bottom-anchored one/two-line descriptions, 56 px margin');

const journey=require('../home/assets/map-journey.js'),catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../map/catalog.json'),'utf8'));
const sourceById=new Map(catalog.records.map(record=>[record.id,record]));
const built=journey.build(catalog.records),originalPlan=journey.plan(built.scenes,{textPaginator:text=>captionLines(text,value=>measure(value,26),1216)});
for(const scene of originalPlan.scenes){
 if(scene.derived)assert.equal(scene.description,'','automatic returns add no event description');
 else assert.equal(scene.description,sourceById.get(scene.id).description,'journey preserves exact authored notes');
 const text=originalPlan.segments.filter(segment=>segment.phase==='stay'&&originalPlan.scenes[segment.index].id===scene.id).map(segment=>segment.pageText).join('');assert.equal(text,scene.description||'');
}
assert.equal(catalog.records.find(record=>record.city==='衡阳').description,'暑假穷游');
console.log('PASS authored notes: every production scene/paginated event equals source, returns have no added notes, Hengyang remains exactly 暑假穷游');
