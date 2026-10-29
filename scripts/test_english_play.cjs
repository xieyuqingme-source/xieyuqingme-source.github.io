'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Play=require('../home/assets/english-play.js');
function rng(seed=29){let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
function question(mode,index){
  const choices=[0,1,2,3].map(offset=>mode==='authors'?'作者'+((index+offset)%12)+'（Author '+((index+offset)%12)+'）':mode+'选项'+index+'-'+offset);
  return {id:mode+'-'+index,mode,text:'测试题干 '+index,choices,answer:choices[0],explanation:'这是第 '+index+' 题的解释。\n请查看来源。',reading:'/english/fixture-'+index+'/',sources:[{label:'测试用来源 '+index,url:'https://example.org/fixture/'+index}],...(mode==='authors'?{english:'A first line.\nA second line.',translation:'第一行。\n第二行。'}:{})};
}
function data(){return {authors:Array.from({length:24},(_,i)=>question('authors',i)),etymology:Array.from({length:12},(_,i)=>question('etymology',i)),origins:Array.from({length:12},(_,i)=>question('origins',i))};}
function clone(value){return JSON.parse(JSON.stringify(value));}

test('a seeded round is reproducible, samples ten unique questions and shuffles choices',()=>{
  const input=data(),before=JSON.stringify(input),first=Play.createRound(input,'authors',{rng:rng(1)}),again=Play.createRound(input,'authors',{rng:rng(1)});
  assert.deepEqual(first,again);assert.notDeepEqual(first,Play.createRound(input,'authors',{rng:rng(2)}));
  assert.equal(first.length,10);assert.equal(new Set(first.map(q=>q.id)).size,10);assert.equal(new Set(first.map(q=>q.answer)).size,10);
  for(const q of first)assert.deepEqual(q.choices.slice().sort(),input.authors.find(original=>original.id===q.id).choices.slice().sort());
  assert.ok(first.some(q=>JSON.stringify(q.choices)!==JSON.stringify(input.authors.find(original=>original.id===q.id).choices)));
  assert.equal(JSON.stringify(input),before);
});
for(const mode of Play.MODES)test('rounds stay inside the selected mode: '+mode,()=>{
  const round=Play.createRound(data(),mode,{rng:rng(17)});assert.equal(round.length,10);assert.equal(new Set(round.map(q=>q.id)).size,10);assert.ok(round.every(q=>q.mode===mode&&q.id.startsWith(mode+'-')));
});
test('authors are diversified as far as the source bank permits without inventing a question',()=>{
  const input=data();input.authors.forEach((q,i)=>{q.answer='作者'+(i%3);q.choices=[q.answer,'测试干扰甲','测试干扰乙','测试干扰丙'];});
  const round=Play.createRound(input,'authors',{rng:rng()});assert.equal(round.length,10);assert.equal(new Set(round.map(q=>q.answer)).size,3);assert.equal(new Set(round.map(q=>q.id)).size,10);
});
test('games cannot advance unanswered questions or accumulate points from duplicate clicks',()=>{
  const game=Play.createGame(data(),'authors',{rng:rng()});assert.equal(game.next(),false);assert.equal(game.state().index,0);assert.equal(game.answer('不是选项'),false);
  const correct=game.state().question.answer;assert.equal(game.answer(correct),true);assert.equal(game.answer(correct),false);assert.equal(game.answer(game.state().question.choices.find(choice=>choice!==correct)),false);
  assert.equal(game.state().score,1);assert.equal(game.state().answeredCount,1);assert.equal(game.next(),true);assert.equal(game.next(),false);assert.equal(game.state().index,1);
});
test('a full round retains every answer, source, explanation and incorrect choice for review',()=>{
  const game=Play.createGame(data(),'authors',{rng:rng(52)}),chosen=[];
  for(let index=0;index<10;index++){
    const q=game.state().question,choice=index%2?q.choices.find(choice=>choice!==q.answer):q.answer;chosen.push({id:q.id,choice});
    assert.equal(game.answer(choice),true);assert.equal(game.next(),true);
  }
  const state=game.state();assert.equal(state.finished,true);assert.equal(state.score,5);assert.equal(state.index,10);assert.equal(state.question,null);assert.equal(state.review.length,10);assert.equal(state.review.filter(answer=>!answer.correct).length,5);
  state.review.forEach((answer,index)=>{assert.equal(answer.index,index);assert.equal(answer.chosen,chosen[index].choice);assert.equal(answer.question.id,chosen[index].id);assert.ok(answer.question.explanation&&answer.question.reading);assert.ok(answer.question.sources.length);assert.equal(answer.question.english,'A first line.\nA second line.');assert.equal(answer.question.translation,'第一行。\n第二行。');});
  assert.equal(game.answer(chosen[0].choice),false);assert.equal(game.next(),false);assert.equal(game.state().score,5);
});
test('caller mutation cannot alter an active game or its later review',()=>{
  const input=data(),game=Play.createGame(input,'authors',{rng:rng()}),snapshot=game.state(),original=clone(snapshot.question);
  input.authors.forEach(q=>{q.answer='被修改';q.sources[0].url='https://example.org/changed';});snapshot.question.choices[0]='外部改动';snapshot.question.sources[0].label='外部改动';
  assert.deepEqual(game.state().question,original);game.answer(original.answer);const answered=game.state();answered.result.question.answer='外部改动';answered.review[0].chosen='外部改动';assert.equal(game.state().result.chosen,original.answer);
  const round=Play.createRound(data(),'authors',{rng:rng()});assert.ok(Object.isFrozen(round)&&Object.isFrozen(round[0])&&Object.isFrozen(round[0].choices)&&Object.isFrozen(round[0].sources[0]));
});
for(const value of [1,-.1,NaN,Infinity,'0.5'])test('invalid injected random values fail clearly: '+String(value),()=>assert.throws(()=>Play.createRound(data(),'authors',{rng:()=>value}),Play.QuizDataError));
test('unknown modes, short banks and duplicate IDs are rejected',()=>{
  assert.throws(()=>Play.createRound(data(),'__proto__'),Play.QuizDataError);assert.throws(()=>Play.createRound(data(),'authors',{rng:1}),Play.QuizDataError);
  const short=data();short.origins=short.origins.slice(0,9);assert.throws(()=>Play.createRound(short,'origins'),/十道/);
  const duplicate=data();duplicate.etymology[1].id=duplicate.etymology[0].id;assert.throws(()=>Play.validateData(duplicate),/重复/);
});
for(const change of [
  q=>{q.choices=q.choices.slice(0,3);},q=>{q.choices[1]=q.choices[0];},q=>{q.answer='不存在的答案';},q=>{q.mode='origins';},q=>{q.explanation='';},q=>{q.sources=[];},q=>{q.english='one\rtwo';},q=>{q.translation='one\ttwo';},q=>{q.id='a'.repeat(161);}
])test('malformed question data cannot start a round: '+change.toString(),()=>{const input=data();change(input.authors[0]);assert.throws(()=>Play.createRound(input,'authors'),Play.QuizDataError);});
for(const url of ['javascript:alert(1)','data:text/html,test','http://example.org/x','//example.org/x','https://name:password@example.org/x','/\\example.org/x','https://example.org/" onclick="x'])test('unsafe source link is rejected: '+url,()=>{const input=data();input.authors[0].sources[0].url=url;assert.throws(()=>Play.validateData(input),Play.QuizDataError);});
for(const url of ['https://example.org/english/','//example.org/x','relative/path','javascript:alert(1)'])test('reading link must be a safe root-relative URL: '+url,()=>{const input=data();input.origins[0].reading=url;assert.throws(()=>Play.validateData(input),Play.QuizDataError);});
test('long author IDs, exact LF and safe public/internal source URLs are preserved',()=>{
  const input=data();input.authors[0].id='author-'+('q'.repeat(93));input.authors[0].sources.push({label:'内部来源',url:'/english/source/#note'});
  const normalized=Play.validateData(input);assert.equal(normalized.authors[0].id.length,100);assert.equal(normalized.authors[0].english,input.authors[0].english);assert.equal(normalized.authors[0].sources[1].url,'/english/source/#note');
});

class Element{
  constructor(tag='div',document){this.tagName=tag;this.document=document;this.children=[];this.attributes={};this.listeners=new Map();this.hidden=false;this.disabled=false;this._text='';this.className='';this.parentElement=null;}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  set textContent(value){this.children.forEach(child=>{child.parentElement=null;});this.children=[];this._text=String(value);}
  set innerHTML(_){assert.fail('Untrusted quiz text must never enter innerHTML');}
  append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
  replaceChildren(...children){this.textContent='';this.append(...children);}
  setAttribute(key,value){this.attributes[key]=String(value);}
  getAttribute(key){return this.attributes[key]??null;}
  addEventListener(type,handler){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(handler);}
  removeEventListener(type,handler){this.listeners.get(type)?.delete(handler);}
  emit(type,event={}){for(const handler of this.listeners.get(type)||[])handler({target:this,...event});}
  closest(selector){if(selector==='[data-quiz-choice]'&&this.getAttribute('data-quiz-choice')!==null)return this;return this.parentElement?.closest(selector)||null;}
  focus(){this.document.activeElement=this;}
}
function fixture(input=data()){
  const document={activeElement:null},root=new Element('section',document),elements={};
  const tags={ui:'div',prompt:'h2',english:'blockquote',choices:'div',feedback:'section',progress:'p',next:'button',results:'section',restart:'button',error:'p'};
  for(const [name,tag] of Object.entries(tags)){const node=new Element(tag,document);if(tag==='button')node.type='button';elements[name]=node;}
  elements.ui.hidden=true;const buttons=Play.MODES.map(mode=>{const node=new Element('button',document);node.type='button';node.setAttribute('data-quiz-mode',mode);return node;});
  root.querySelector=selector=>elements[selector.replace(/^\[data-quiz-|\]$/g,'')]||null;root.querySelectorAll=()=>buttons;
  const script=new Element('script',document);script.textContent=JSON.stringify(input);
  document.querySelector=()=>root;document.getElementById=()=>script;document.createElement=tag=>new Element(tag,document);
  const owned=[],window={SiteNavigation:{own:handler=>owned.push(handler)},setTimeout:()=>assert.fail('The quiz has no timer'),setInterval:()=>assert.fail('The quiz has no timer')};
  return {document,root,window,owned,buttons,script,...elements};
}
function clickChoice(f,index){f.choices.emit('click',{target:f.choices.children[index]});}
function listenerCount(f){return [...f.buttons,f.choices,f.next,f.restart].reduce((sum,node)=>sum+Array.from(node.listeners.values()).reduce((n,set)=>n+set.size,0),0);}

test('mount uses native buttons, preserves poetry LF, reveals translation only after answering and manages focus',()=>{
  const f=fixture(),mounted=Play.mount({...f,rng:rng(7)});assert.equal(f.ui.hidden,false);assert.equal(f.english.textContent,'A first line.\nA second line.');assert.equal(f.feedback.textContent,'');assert.equal(f.next.hidden,true);
  assert.equal(f.choices.children.length,4);assert.ok(f.choices.children.every(button=>button.tagName==='button'&&button.type==='button'));assert.equal(f.feedback.getAttribute('aria-live'),'polite');assert.equal(f.prompt.getAttribute('tabindex'),'-1');
  f.next.emit('click');assert.equal(mounted.getState().index,0);
  const correct=mounted.getState().question.answer,index=mounted.getState().question.choices.indexOf(correct);clickChoice(f,index);
  assert.equal(mounted.getState().score,1);assert.equal(f.feedback.hidden,false);assert.match(f.feedback.textContent,/第一行。\n第二行。/);assert.equal(f.document.activeElement,f.feedback);assert.equal(f.next.hidden,false);assert.ok(f.choices.children.every(button=>button.disabled));
  clickChoice(f,index);assert.equal(mounted.getState().score,1);f.next.emit('click');assert.equal(f.document.activeElement,f.prompt);assert.equal(mounted.getState().index,1);f.next.emit('click');assert.equal(mounted.getState().index,1);
});
test('mount builds safe source links and treats HTML-looking quote text as literal content',()=>{
  const input=data();input.authors.forEach(q=>{q.text='<img src=x onerror=alert(1)>';q.english='<script>test</script>\nLine two.';q.sources.push({label:'内部链接',url:'/english/source/'});});
  const f=fixture(input),mounted=Play.mount({...f,rng:rng()});assert.equal(f.prompt.textContent,'<img src=x onerror=alert(1)>');assert.match(f.english.textContent,/<script>test<\/script>/);
  clickChoice(f,0);const list=f.feedback.children.find(child=>child.className==='ec-quiz-sources'),external=list.children[0].children[0],internal=list.children[1].children[0];
  assert.equal(external.tagName,'a');assert.equal(external.getAttribute('target'),'_blank');assert.equal(external.getAttribute('rel'),'noopener noreferrer');assert.equal(internal.getAttribute('href'),'/english/source/');assert.equal(internal.getAttribute('target'),null);assert.equal(mounted.getState().answered,true);
});
test('finished UI contains all wrong answers with explanations and replay resets the selected mode',()=>{
  const f=fixture(),mounted=Play.mount({...f,rng:rng(34)});f.buttons[2].emit('click');assert.equal(mounted.getState().mode,'origins');assert.equal(f.english.hidden,true);
  for(let index=0;index<10;index++){const state=mounted.getState(),wrong=state.question.choices.findIndex(choice=>choice!==state.question.answer);clickChoice(f,wrong);f.next.emit('click');}
  assert.equal(mounted.getState().finished,true);assert.equal(f.document.activeElement,f.results);assert.equal(f.results.hidden,false);assert.equal(f.restart.hidden,false);assert.equal(f.choices.hidden,true);
  const review=f.results.children.find(child=>child.className==='ec-quiz-review');assert.equal(review.children.length,10);for(const item of review.children){assert.match(item.textContent,/你的选择/);assert.match(item.textContent,/正确答案/);assert.match(item.textContent,/解释/);assert.ok(item.children.some(child=>child.className==='ec-quiz-sources'));}
  f.restart.emit('click');assert.equal(mounted.getState().mode,'origins');assert.equal(mounted.getState().score,0);assert.equal(mounted.getState().index,0);assert.equal(mounted.getState().review.length,0);assert.equal(f.results.hidden,true);assert.equal(f.document.activeElement,f.prompt);
});
test('changing modes clears the previous answer and does not mix question banks',()=>{
  const f=fixture(),mounted=Play.mount({...f,rng:rng()});clickChoice(f,0);f.buttons[1].emit('click');assert.equal(mounted.getState().mode,'etymology');assert.equal(mounted.getState().answered,false);assert.equal(mounted.getState().score,0);assert.equal(f.feedback.hidden,true);assert.equal(f.buttons[1].getAttribute('aria-pressed'),'true');assert.equal(f.buttons[0].getAttribute('aria-pressed'),'false');
});
test('answers and wrong-answer reviews include a small library entry without duplicating a direct quotation link',()=>{
  const nodes=root=>[root,...root.children.flatMap(nodes)],f=fixture(),mounted=Play.mount({...f,rng:rng()});f.buttons[2].emit('click');
  for(let index=0;index<10;index++){
    const q=mounted.getState().question;clickChoice(f,q.choices.findIndex(choice=>choice!==q.answer));
    const entries=nodes(f.feedback).filter(node=>node.className==='ec-quiz-library');assert.equal(entries.length,1);assert.equal(entries[0].getAttribute('href'),'/english/quotes/');assert.equal(entries[0].textContent,'完整英语名句库 →');
    assert.ok(nodes(f.feedback).some(node=>node.tagName==='a'&&node.getAttribute('href')===q.reading),'The original card reading link stays present');f.next.emit('click');
  }
  assert.equal(nodes(f.results).filter(node=>node.className==='ec-quiz-library').length,10);
  const direct=data();direct.authors.forEach(q=>{q.reading='/english/quotes/#quote-'+q.id;});const d=fixture(direct);Play.mount({...d,rng:rng()});clickChoice(d,0);
  assert.equal(nodes(d.feedback).filter(node=>node.className==='ec-quiz-library').length,0);assert.equal(nodes(d.feedback).filter(node=>node.tagName==='a'&&node.getAttribute('href')?.startsWith('/english/quotes/')).length,1);
});
test('empty author fixtures disable that mode rather than invent authors or block other games',()=>{
  const input=data();input.authors=[];const f=fixture(input),mounted=Play.mount({...f,rng:rng()});assert.equal(f.ui.hidden,false);assert.equal(f.buttons[0].disabled,true);assert.equal(mounted.getState().mode,'etymology');f.buttons[0].emit('click');assert.equal(mounted.getState().mode,'etymology');
});
test('PageScope removes every delegated listener; repeated cleanup and captured late callbacks are safe',()=>{
  const f=fixture(),mounted=Play.mount({...f,rng:rng()});assert.equal(listenerCount(f),6);assert.equal(f.owned.length,1);
  const late=Array.from(f.buttons[1].listeners.get('click'))[0],before=mounted.getState();f.owned[0]();mounted.destroy();assert.equal(listenerCount(f),0);late();f.next.emit('click');assert.deepEqual(mounted.getState(),before);
  const nextMount=Play.mount({...f,rng:rng(19)});assert.equal(listenerCount(f),6);nextMount.destroy();assert.equal(listenerCount(f),0);
});
test('invalid/missing enhancement fails safely and leaves no active listeners',()=>{
  const f=fixture();f.script.textContent='{invalid JSON';const mounted=Play.mount(f);assert.equal(f.ui.hidden,true);assert.equal(f.error.hidden,false);assert.equal(listenerCount(f),0);assert.equal(mounted.getState(),null);mounted.destroy();
  assert.doesNotThrow(()=>Play.mount().destroy());assert.doesNotThrow(()=>Play.mount({window:{},document:{querySelector:()=>null}}).destroy());
});
