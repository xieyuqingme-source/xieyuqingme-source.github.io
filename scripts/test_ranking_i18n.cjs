'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const catalogue=JSON.parse(fs.readFileSync(path.join(__dirname,'../home/locales/games.json'),'utf8'));
let language='zh-CN';const listeners=[];
global.SiteI18n={lang:()=>language,t:(key,values={},fallback)=>String(catalogue[language][key]??fallback??key).replace(/\{(\w+)\}/g,(all,name)=>Object.hasOwn(values,name)?String(values[name]):all),onChange:fn=>listeners.push(fn)};
const M=require('../home/assets/ranking-model.js'),E=require('../home/assets/ranking-export.js');
function change(next){language=next;listeners.forEach(fn=>fn(next));}
test('catalogue is flat, complete and preserves interpolation parameters',()=>{
 assert.deepEqual(Object.keys(catalogue.en).sort(),Object.keys(catalogue['zh-CN']).sort());
 for(const key of Object.keys(catalogue.en)){
  assert.equal(typeof catalogue.en[key],'string');assert.ok(catalogue.en[key].trim());
  assert.deepEqual([...catalogue.en[key].matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort(),[...catalogue['zh-CN'][key].matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort(),key);
 }
});
test('English display and PNG layout leave raw v3 saves and all user labels intact',()=>{
 const state=M.createDefaultState(),before=M.serialize(state);change('en');
 assert.equal(M.displayTitle(state),'Food: Rank It Your Way');assert.equal(M.displayState(state).rows[0].name,'Awesome');
 const first=state.rows[0].itemIds[0];assert.equal(M.displayItemName(state.items[first]),'Sichuan hot pot');
 const layout=E.planLayout(state);assert.equal(layout.title.lines.join(''),'Food: Rank It Your Way');assert.equal(layout.rows[0].name,'Awesome');
 assert.equal(M.serialize(state),before);
 state.title='自定义标题';state.rows[0].name='设置';state.items[first].name='图片';
 const custom=M.serialize(state);assert.equal(M.displayTitle(state),'自定义标题');assert.equal(M.displayRowName(state.rows[0],state),'设置');assert.equal(M.displayItemName(state.items[first]),'图片');
 for(const lang of ['zh-CN','en','zh-CN','en']){change(lang);M.displayState(state);E.planLayout(state);assert.equal(M.serialize(state),custom);}
});
test('default item identity survives replacing its picture without rewriting its name',()=>{
 change('en');const item=M.createDefaultState().items['food-sichuan-hotpot'];item.art=null;
 assert.equal(M.displayItemName(item),'Sichuan hot pot');assert.equal(item.name,'四川火锅');
 assert.equal(M.displayItemName({...item,id:'custom-id'}),'四川火锅');
 assert.equal(M.displayItemName({...item,id:'custom-id',art:'sichuan-hotpot'}),'四川火锅');
});
test('validation, storage, dynamic confirmations and progress messages translate reversibly',()=>{
 change('en');
 assert.equal(M.localize('第 2 / 5 项 · 保存后生效'),'Item 2 of 5 · applies when saved');
 assert.equal(M.localize('恢复默认美食排行'),'Reset food example');
 assert.match(M.localize('排行标题须为 1–100 个字符，且不能含控制字符。'),/list title must contain 1–100 characters/);
 assert.match(M.localize('已保存的排行无法读取，原记录仍保留。可导入其他 JSON 备份，或确认重置。备份不是有效的 JSON 文件。'),/The backup is not valid JSON/);
 assert.match(M.localize('导入“运动排行”备份？将替换此模板的内容，其他模板内容保留。请先导出 JSON 备份。'),/Import the sports example backup/);
 const element={isConnected:true,textContent:'',setAttribute(k,v){this[k]=v;}};
 const source='浏览器本地存储空间不足，本次修改尚未自动保存。请先导出 JSON 备份，再减少图片。';
 M.uiText(element,source);assert.match(element.textContent,/storage is full/);change('zh-CN');assert.equal(element.textContent,source);change('en');assert.match(element.textContent,/not been saved/);
});
test('language switching retains focused input drafts and maps unchanged translated inputs back to raw data',()=>{
 const state=M.createDefaultState();change('en');const element={isConnected:true,value:''};global.document={activeElement:null};
 M.bindDisplayInput(element,state.title,()=>M.displayTitle(state));assert.equal(element.value,'Food: Rank It Your Way');assert.equal(M.inputValue(element),'美食从夯到拉');
 change('zh-CN');assert.equal(element.value,'美食从夯到拉');change('en');
 element.value='未保存草稿';global.document.activeElement=element;change('zh-CN');change('en');assert.equal(element.value,'未保存草稿');assert.equal(M.inputValue(element),'未保存草稿');
 delete global.document;
});
test('all old save schema and storage identity constants remain compatible',()=>{
 change('en');const state=M.createDefaultState('sport');assert.equal(JSON.parse(M.serialize(state)).version,3);assert.equal(M.deserialize(M.serialize(state)).templateId,'sport');
 const source=fs.readFileSync(path.join(__dirname,'../home/assets/ranking-storage.js'),'utf8');assert.match(source,/'xieyuqing-ranking-v1'/);assert.match(source,/storeName = 'rankings'/);assert.match(source,/key = 'current'/);
});

test('PNG wrapping prefers English word boundaries and keeps mixed Chinese text intact',()=>{
 const measure=text=>Array.from(text).reduce((sum,char)=>sum+(/^[\x00-\x7f]$/.test(char)?1:2),0);
 assert.deepEqual(E.wrapText('Mianyang rice noodles',9,10,measure),['Mianyang ','rice ','noodles']);
 assert.deepEqual(E.wrapText('Eight-treasure tofu',9,10,measure),['Eight-','treasure ','tofu']);
 const mixed='中文 rice 面条';
 assert.deepEqual(E.wrapText(mixed,9,10,measure),['中文 rice ','面条']);
 assert.equal(E.wrapText(mixed,9,10,measure).join(''),mixed);
 assert.deepEqual(E.wrapText('中文面条',4,10,measure),['中文','面条']);
 assert.deepEqual(E.wrapText('first\n\nsecond',9,10,measure),['first','','second']);
});

test('PNG wrapping splits only overlong English words and never splits emoji graphemes',()=>{
 const segmenter=new Intl.Segmenter('en',{granularity:'grapheme'});
 const measure=text=>Array.from(segmenter.segment(text)).length;
 const long='Supercalifragilisticexpialidocious';
 const lines=E.wrapText(long,9,10,measure);
 assert.ok(lines.length>1);assert.equal(lines.join(''),long);assert.ok(lines.every(line=>measure(line)<=9));
 const mixed='中文 family 👨‍👩‍👧‍👦 rice';const emojiLines=E.wrapText(mixed,7,10,measure);
 assert.equal(emojiLines.join(''),mixed);assert.ok(emojiLines.some(line=>line.includes('👨‍👩‍👧‍👦')));
});

test('English PNG default tier words fit narrow columns and custom long labels remain complete',()=>{
 change('en');const state=M.createDefaultState(),before=M.serialize(state);
 const measure=(text,size)=>Array.from(text).reduce((sum,char)=>sum+(/^[\x00-\x7f]$/.test(char)?size*.6:size),0);
 for(const skin of ['classic','tech'])for(const width of [640,1200,2000]){
  const input=M.deserialize(before);input.skin=skin;const raw=M.serialize(input);
  const layout=E.planLayout(input,{width,measureText:measure});
  assert.deepEqual(layout.rows[0].labelLines,['Awesome']);
  assert.ok(measure('Awesome',layout.rows[0].labelSize)<=layout.rows[0].labelWidth-(skin==='classic'?20:28));
  const card=layout.rows.flatMap(row=>row.cards).find(card=>card.id==='food-mianyang-rice-noodles');
  assert.deepEqual(card.lines.map(line=>line.trim()),['Mianyang','rice','noodles']);
  input.rows[0].name='Supercalifragilisticexpialido';const longRaw=M.serialize(input);
  const row=E.planLayout(input,{width,measureText:measure}).rows[0];
  assert.ok(row.labelLines.length>1);assert.equal(row.labelLines.join(''),input.rows[0].name);
  assert.equal(M.serialize(input),longRaw);assert.notEqual(raw,longRaw);
 }
 assert.equal(M.serialize(state),before);
});

test('dynamic template disclaimers use the same translatable catalogue phrases as the initial page',()=>{
 const expected={food:'A personal example, not an authoritative assessment.',sport:'The sports example reflects personal preferences, not health or training advice.',book:'An informal ranking of the experience of reading the English originals. Just for fun, not a literary assessment.'};
 for(const [templateId,english] of Object.entries(expected)){
  const source=M.templateNote(templateId);
  const element={isConnected:true,textContent:''};
  change('en');M.uiText(element,() => M.templateNote(templateId));assert.equal(element.textContent,english);
  change('zh-CN');assert.equal(element.textContent,source);
  change('en');assert.equal(element.textContent,english);
 }
});

test('book display names, scene alternatives and PNG layouts translate without changing raw saves',()=>{
 const state=M.createDefaultState('book'),before=M.serialize(state),key='book-alice-in-wonderland',item=state.items['book-'+key];
 change('en');assert.equal(M.displayTitle(state),'Classic Books: Rank It Your Way');
 assert.equal(M.displayItemName(item),'Alice’s Adventures in Wonderland');
 assert.equal(M.displayArtAlt(key),M.BOOK_ART[key].alt_en);
 const image={isConnected:true,setAttribute(name,value){this[name]=value;}};
 M.uiAttr(image,'alt',()=>M.displayArtAlt(key));assert.equal(image.alt,M.BOOK_ART[key].alt_en);
 change('zh-CN');assert.equal(image.alt,M.BOOK_ART[key].alt_zh);assert.equal(M.displayItemName(item),item.name);
 assert.equal(M.displayArtAlt('unknown'),'');assert.equal(M.displayArtAlt('__proto__'),'');
 for(const language of ['en','zh-CN'])for(const skin of ['classic','tech']){
  change(language);const input=M.deserialize(before);M.setSkin(input,skin);const raw=M.serialize(input),layout=E.planLayout(input);
  assert.equal(layout.rows.flatMap(row=>row.cards).length,20);assert.equal(M.serialize(input),raw);
  const first=layout.rows[0].cards[0];assert.equal(first.lines.join(''),language==='en'?'Alice’s Adventures in Wonderland':item.name);
 }
 assert.equal(M.serialize(state),before);
 change('en');assert.equal(M.displayItemName({...item,id:'custom-book'}),item.name);
 assert.equal(M.displayItemName({...item,name:'个人阅读笔记'}),'个人阅读笔记');
 assert.match(M.localize('恢复默认名著排行'),/Reset books example/);
 assert.match(M.localize('导入“名著排行”备份？将替换此模板的内容，其他模板内容保留。请先导出 JSON 备份。'),/Import the books example backup/);
});
