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
