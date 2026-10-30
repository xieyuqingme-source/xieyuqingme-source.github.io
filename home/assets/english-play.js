/* Local, untimed English quizzes. Pure round/game APIs are also available to Node. */
(function(factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{window.EnglishPlay=api;api.mount({window,document});}
})(function(){
  'use strict';
  const MODES=Object.freeze(['origins','etymology','usage','authors']),ROUND_SIZE=10;
  class QuizDataError extends Error{constructor(message){super(message);this.name='QuizDataError';}}
  function fail(message){throw new QuizDataError(message);}
  function text(value,label,max=4000,multiline=false){
    const controls=multiline?/[\u0000-\u0009\u000b-\u001f\u007f]/:/[\u0000-\u001f\u007f]/;
    if(typeof value!=='string'||!value.trim()||value.length>max||controls.test(value))fail(label+'不是有效文本。');
    return value;
  }
  function link(value,relativeOnly=false){
    if(typeof value!=='string'||value.length>3000||/[\s\\<>"'\u0000-\u001f\u007f]/.test(value))fail('来源链接格式有误。');
    const relative=value.startsWith('/')&&!value.startsWith('//');
    let parsed;try{parsed=new URL(value,'https://local.invalid');}catch(_){fail('来源链接格式有误。');}
    if(parsed.username||parsed.password||relative&&parsed.origin!=='https://local.invalid'||!relative&&(relativeOnly||!value.startsWith('https://')||parsed.protocol!=='https:'))fail('来源链接须为安全的根相对地址或HTTPS网址。');
    return value;
  }
  function normalizeQuestion(value,mode){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.mode!==mode)fail('题目模式不匹配。');
    const id=text(value.id,'题目标识',160),prompt=text(value.text,'题干',2000,true);
    if(!Array.isArray(value.choices)||(mode==='usage'?![2,3].includes(value.choices.length):value.choices.length!==4))fail('用法题须有两至三个选项，其他题须有四个选项。');
    const choices=value.choices.map(choice=>text(choice,'选项',500));
    if(new Set(choices).size!==choices.length||!choices.includes(value.answer))fail('选项须各不相同，并包含正确答案。');
    if(mode==='authors'&&value.warmup!==undefined&&typeof value.warmup!=='boolean')fail('入门题标记须为布尔值。');
    if(!Array.isArray(value.sources)||!value.sources.length||value.sources.length>20)fail('题目缺少有效出处。');
    const sources=value.sources.map(source=>{
      if(!source||typeof source!=='object'||Array.isArray(source))fail('题目出处格式有误。');
      return Object.freeze({label:text(source.label,'来源名称',500),url:link(source.url)});
    });
    return Object.freeze({id,mode,text:prompt,choices:Object.freeze(choices),answer:value.answer,
      explanation:text(value.explanation,'答案解释',6000,true),reading:link(value.reading,true),sources:Object.freeze(sources),
      english:mode==='authors'?text(value.english,'英文原句',4000,true):null,
      translation:mode==='authors'?text(value.translation,'中文译文',4000,true):null,
      warmup:mode==='authors'&&value.warmup===true,
      hint:mode==='authors'&&value.hint!==undefined?text(value.hint,'作品提示',500):null});
  }
  function validateData(value){
    if(!value||typeof value!=='object'||Array.isArray(value))fail('题库格式有误。');
    const data={};
    for(const mode of MODES){
      if(!Object.prototype.hasOwnProperty.call(value,mode)||!Array.isArray(value[mode])||value[mode].length>3000)fail('题库模式缺失或题目过多。');
      const questions=value[mode].map(question=>normalizeQuestion(question,mode));
      if(new Set(questions.map(question=>question.id)).size!==questions.length)fail('同一模式中出现了重复题目标识。');
      data[mode]=Object.freeze(questions);
    }
    return Object.freeze(data);
  }
  function shuffle(values,rng){
    const result=values.slice();
    for(let index=result.length-1;index>0;index--){
      const random=rng();if(typeof random!=='number'||!Number.isFinite(random)||random<0||random>=1)fail('随机数须介于0和1之间。');
      const other=Math.floor(random*(index+1));[result[index],result[other]]=[result[other],result[index]];
    }
    return result;
  }
  function createRound(input,mode='origins',options={}){
    if(!MODES.includes(mode))fail('未知的小测验模式。');
    const data=validateData(input),rng=options.rng===undefined?Math.random:options.rng;
    if(typeof rng!=='function')fail('随机数生成器须为函数。');
    if(data[mode].length<ROUND_SIZE)fail('这个模式还没有十道可用题目。');
    let candidates=shuffle(data[mode],rng);
    if(mode==='authors'){
      const authors=new Set(),warmup=[],different=[],remaining=[];
      for(const question of candidates){if(warmup.length===3)break;if(question.warmup&&!authors.has(question.answer)){authors.add(question.answer);warmup.push(question);}}
      const warmupIds=new Set(warmup.map(question=>question.id));
      for(const question of candidates){if(warmupIds.has(question.id))continue;if(authors.has(question.answer))remaining.push(question);else{authors.add(question.answer);different.push(question);}}
      candidates=warmup.concat(different,remaining).slice(0,ROUND_SIZE);
    }else candidates=shuffle(candidates.slice(0,ROUND_SIZE),rng);
    return Object.freeze(candidates.map(question=>Object.freeze({...question,choices:Object.freeze(shuffle(question.choices,rng))})));
  }
  function copyQuestion(question){return question?{...question,choices:question.choices.slice(),sources:question.sources.map(source=>({...source}))}:null;}
  function createGame(input,mode='origins',options={}){
    const round=createRound(input,mode,options),answers=[],assistance=round.map(()=>({translation:false,hint:false}));let index=0,score=0;
    function state(){
      const finished=index===round.length,result=answers[index];
      return {mode,index,total:round.length,score,finished,answered:!finished&&!!result,answeredCount:answers.length,
        question:finished?null:copyQuestion(round[index]),
        assistance:!finished?{...assistance[index]}:null,
        result:result?{...result,assistance:{...result.assistance},question:copyQuestion(result.question)}:null,
        review:answers.map(answer=>({...answer,assistance:{...answer.assistance},question:copyQuestion(answer.question)}))};
    }
    function answer(choice){
      if(index===round.length||answers[index]||!round[index].choices.includes(choice))return false;
      const question=round[index],correct=choice===question.answer;
      answers.push({index,chosen:choice,correct,question,assistance:{...assistance[index]}});if(correct)score++;return true;
    }
    function next(){if(index===round.length||!answers[index])return false;index++;return true;}
    function reveal(kind){if(mode!=='authors'||index===round.length||answers[index]||!['translation','hint'].includes(kind)||kind==='hint'&&!round[index].hint||assistance[index][kind])return false;assistance[index][kind]=true;return true;}
    return {state,answer,next,reveal};
  }
  function mount(options={}){
    const win=options.window,doc=options.document,root=doc?.querySelector?.('[data-english-play]');
    if(!win||!root)return {destroy(){},getState(){return null;}};
    const query=selector=>root.querySelector(selector),ui=query('[data-quiz-ui]'),prompt=query('[data-quiz-prompt]'),english=query('[data-quiz-english]'),choices=query('[data-quiz-choices]'),feedback=query('[data-quiz-feedback]'),progress=query('[data-quiz-progress]'),next=query('[data-quiz-next]'),results=query('[data-quiz-results]'),restart=query('[data-quiz-restart]'),error=query('[data-quiz-error]'),assistance=query('[data-quiz-assistance]'),showTranslation=query('[data-quiz-show-translation]'),showHint=query('[data-quiz-show-hint]'),previewTranslation=query('[data-quiz-preview-translation]'),previewHint=query('[data-quiz-preview-hint]'),changeMode=query('[data-quiz-change-mode]');
    const modeButtons=Array.from(root.querySelectorAll('[data-quiz-mode]')),dataElement=doc.getElementById('english-quiz-data');
    let disposed=false,game=null,data,available=[];const cleanups=[];
    function listen(element,type,handler){element.addEventListener(type,handler);cleanups.push(()=>element.removeEventListener(type,handler));}
    function element(tag,className,value){const node=doc.createElement(tag);if(className)node.className=className;if(value!==undefined)node.textContent=value;return node;}
    function showError(){if(ui)ui.hidden=true;const message=error||progress;if(message){message.textContent='小测验暂时无法加载，请稍后刷新，或返回学英语阅读。';message.hidden=false;}}
    function destroy(){if(disposed)return;disposed=true;cleanups.splice(0).reverse().forEach(cleanup=>cleanup());}
    function readingLinks(container,question){
      const reading=element('p'),anchor=element('a',null,'查看出处与延伸阅读 →');anchor.setAttribute('href',question.reading);reading.append(anchor);container.append(reading);
      if(!question.reading.startsWith('/english/quotes/')){const library=element('p','ec-meta'),entry=element('a','ec-quiz-library','完整英语名句库 →');entry.setAttribute('href','/english/quotes/');library.append(entry);container.append(library);}
      const list=element('ul','ec-quiz-sources');
      for(const source of question.sources){const item=element('li'),linkElement=element('a',null,source.label);linkElement.setAttribute('href',source.url);if(source.url.startsWith('https://')){linkElement.setAttribute('target','_blank');linkElement.setAttribute('rel','noopener noreferrer');}item.append(linkElement);list.append(item);}
      container.append(list);
    }
    function quoteContent(container,question){
      if(question.english){const original=element('blockquote','ec-quiz-original',question.english);original.lang='en';container.append(original);}
      if(question.translation){const translated=element('p','ec-quiz-translation',question.translation);translated.lang='zh-CN';container.append(translated);}
    }
    function aidLabel(answer){const used=[];if(answer.assistance.translation)used.push('看过中文');if(answer.assistance.hint)used.push('用过作品提示');return used.join('、');}
    function renderResults(current){
      prompt.hidden=true;english.hidden=true;assistance.hidden=true;choices.hidden=true;feedback.hidden=true;next.hidden=true;results.hidden=false;restart.hidden=false;changeMode.hidden=available.length<2;
      results.replaceChildren(element('h2',null,'本轮答对 '+current.score+' / '+current.total+' 题'));
      const wrong=current.review.filter(answer=>!answer.correct);
      results.append(element('p',null,wrong.length?'再看看这些题的解释，下次就会了。':'全部答对！可以再来一轮，换些新问题。'));
      if(wrong.length){const list=element('ol','ec-quiz-review');for(const answer of wrong){const question=answer.question,item=element('li');item.append(element('h3',null,'第 '+(answer.index+1)+' 题：'+question.text));quoteContent(item,question);item.append(element('p',null,'你的选择：'+answer.chosen+'；正确答案：'+question.answer),element('p','ec-quiz-explanation',question.explanation));if(aidLabel(answer))item.append(element('p','ec-meta','本题'+aidLabel(answer)+'，不扣分。'));readingLinks(item,question);list.append(item);}results.append(list);}
      const assisted=current.review.filter(answer=>aidLabel(answer));
      if(assisted.length){const section=element('section','ec-quiz-aid-review'),list=element('ul');section.append(element('h3',null,'用过的帮助 · 不扣分'));for(const answer of assisted)list.append(element('li',null,'第 '+(answer.index+1)+' 题：'+aidLabel(answer)));section.append(list);results.append(section);}
      results.focus();
    }
    function renderQuestion(focus){
      const current=game.state();root.setAttribute('data-quiz-question-id',current.question?.id||'');progress.textContent=current.finished?'本轮结束 · 答对 '+current.score+' 题':'第 '+(current.index+1)+' / '+current.total+' 题 · 答对 '+current.score+' 题';
      for(const button of modeButtons)button.setAttribute('aria-pressed',String(button.getAttribute('data-quiz-mode')===current.mode));
      if(current.finished){renderResults(current);return;}
      const question=current.question;prompt.hidden=false;prompt.textContent=question.text;english.hidden=!question.english;english.textContent=question.english||'';
      assistance.hidden=current.mode!=='authors';showTranslation.disabled=false;showHint.disabled=!question.hint;showTranslation.setAttribute('aria-expanded','false');showHint.setAttribute('aria-expanded','false');previewTranslation.hidden=true;previewTranslation.textContent='';previewHint.hidden=true;previewHint.textContent='';changeMode.hidden=true;
      choices.hidden=false;choices.replaceChildren();feedback.hidden=true;feedback.replaceChildren();results.hidden=true;results.replaceChildren();restart.hidden=true;next.hidden=true;
      question.choices.forEach((choice,index)=>{const button=element('button','ec-quiz-choice',choice);button.type='button';button.setAttribute('data-quiz-choice',String(index));choices.append(button);});
      if(focus)prompt.focus();
    }
    function start(mode,focus=true){game=createGame(data,mode,{rng:options.rng===undefined?Math.random:options.rng});root.setAttribute('data-quiz-current-mode',mode);renderQuestion(focus);}
    try{
      if(![ui,prompt,english,choices,feedback,progress,next,results,restart,dataElement,assistance,showTranslation,showHint,previewTranslation,previewHint,changeMode].every(Boolean)||modeButtons.length!==MODES.length)fail('小测验页面缺少必要控件。');
      const modes=modeButtons.map(button=>button.getAttribute('data-quiz-mode'));if(new Set(modes).size!==MODES.length||modes.some(mode=>!MODES.includes(mode)))fail('小测验模式控件有误。');
      data=validateData(JSON.parse(dataElement.textContent));
      available=MODES.filter(mode=>data[mode].length>=ROUND_SIZE);if(!available.length)fail('暂时没有完整题组。');
      for(const button of modeButtons){button.disabled=!available.includes(button.getAttribute('data-quiz-mode'));if(button.disabled)button.setAttribute('title','这个模式还没有足够的题目。');}
      for(const node of [prompt,feedback,results])node.setAttribute('tabindex','-1');english.lang='en';feedback.setAttribute('aria-live','polite');results.setAttribute('aria-live','polite');progress.setAttribute('aria-live','polite');previewTranslation.setAttribute('aria-live','polite');previewHint.setAttribute('aria-live','polite');
      for(const button of modeButtons)listen(button,'click',()=>{if(!disposed&&!button.disabled)start(button.getAttribute('data-quiz-mode'));});
      listen(choices,'click',event=>{
        if(disposed)return;const button=event.target?.closest?.('[data-quiz-choice]');if(!button||button.parentElement!==choices)return;
        const index=Number(button.getAttribute('data-quiz-choice')),current=game.state();if(!Number.isInteger(index)||index<0||index>=(current.question?.choices.length||0)||!game.answer(current.question?.choices[index]))return;
        const answered=game.state(),question=answered.question,result=answered.result;
        assistance.hidden=true;
        for(const option of Array.from(choices.children)){const value=question.choices[Number(option.getAttribute('data-quiz-choice'))];option.disabled=true;option.setAttribute('aria-pressed',String(value===result.chosen));if(value===question.answer)option.className+=' is-correct';else if(value===result.chosen)option.className+=' is-incorrect';}
        feedback.hidden=false;feedback.setAttribute('data-correct',String(result.correct));feedback.replaceChildren(element('h3',null,result.correct?'答对了！':'答案是：'+question.answer));
        if(question.translation){const translated=element('p','ec-quiz-translation',question.translation);translated.lang='zh-CN';feedback.append(translated);}
        feedback.append(element('p','ec-quiz-explanation',question.explanation));readingLinks(feedback,question);
        progress.textContent='第 '+(answered.index+1)+' / '+answered.total+' 题 · 答对 '+answered.score+' 题';next.textContent=answered.index===answered.total-1?'查看成绩':'下一题';next.hidden=false;feedback.focus();
      });
      listen(next,'click',()=>{if(!disposed&&game.next())renderQuestion(true);});
      listen(restart,'click',()=>{if(!disposed)start(game.state().mode);});
      listen(changeMode,'click',()=>{if(disposed)return;const position=available.indexOf(game.state().mode);start(available[(position+1)%available.length]);});
      listen(showTranslation,'click',()=>{if(disposed||!game.reveal('translation'))return;previewTranslation.textContent=game.state().question.translation;previewTranslation.hidden=false;previewTranslation.lang='zh-CN';showTranslation.disabled=true;showTranslation.setAttribute('aria-expanded','true');});
      listen(showHint,'click',()=>{if(disposed||!game.reveal('hint'))return;previewHint.textContent=game.state().question.hint;previewHint.hidden=false;showHint.disabled=true;showHint.setAttribute('aria-expanded','true');});
      start(available[0],false);ui.hidden=false;if(error)error.hidden=true;
    }catch(_){destroy();showError();}
    win.SiteNavigation?.own?.(destroy);
    return {destroy,getState(){return game?game.state():null;}};
  }
  return {MODES,ROUND_SIZE,QuizDataError,validateData,createRound,createGame,mount};
});
