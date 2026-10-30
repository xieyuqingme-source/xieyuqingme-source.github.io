/* Local quiz, quotation decks, and later biographical browsing. */
(function(root,factory){
  'use strict'; const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root&&root.document){root.ReadMarxPlay=api;api.mount(root.document,root);}
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  function shuffle(values,random=Math.random){
    const result=values.slice();
    for(let i=result.length-1;i>0;i--){const r=random();if(typeof r!=='number'||!Number.isFinite(r)||r<0||r>=1)throw new Error('Invalid random source');const j=Math.floor(r*(i+1));[result[i],result[j]]=[result[j],result[i]];}
    return result;
  }
  function makeRound(pool,random=Math.random){
    if(!Array.isArray(pool)||new Set(pool.map(q=>q.id)).size!==pool.length)throw new Error('Questions need unique IDs');
    return shuffle(pool,random).slice(0,10).map(question=>({...question,choices:shuffle(question.choices,random)}));
  }
  function gradeAnswer(question,chosen){
    if(!question||!Array.isArray(question.choices)||!question.choices.includes(chosen)||!question.choices.includes(question.answer))throw new Error('Choose one of the question answers');
    const correct=chosen===question.answer;
    return {correct,chosen,answer:question.answer,message:correct?'答对了。':'答错了。你选的是'+chosen+'，正确答案是'+question.answer+'。',
      labels:question.choices.map(choice=>({choice,selected:choice===chosen,correct:choice===question.answer,
        text:choice+(choice===question.answer?(correct?' ✓ 你的答案（正确）':' ✓ 正确答案'):choice===chosen?' ✗ 你的答案':'')}))};
  }
  function roundSummary(correct,total){
    if(!Number.isInteger(correct)||!Number.isInteger(total)||total<1||correct<0||correct>total)throw new Error('Invalid round score');
    return '本轮答对 '+correct+' / '+total;
  }
  function mount(doc,win){
    const root=doc.querySelector('[data-marx-engels]');if(!root)return()=>{};
    const cleanups=[],listen=(node,type,fn)=>{node.addEventListener(type,fn);cleanups.push(()=>node.removeEventListener(type,fn));};
    const element=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
    const link=(url,label,external=false)=>{const node=element('a',label);node.href=url;if(external){node.target='_blank';node.rel='noopener noreferrer';}return node;};
    function parse(node){try{return JSON.parse(node.textContent);}catch(_){return null;}}
    const quiz=root.querySelector('[data-me-quiz]');
    if(quiz){
      const pools=parse(quiz.querySelector('[data-me-quiz-data]'));
      const controls=quiz.querySelector('[data-me-quiz-controls]'),stage=quiz.querySelector('[data-me-quiz-stage]'),form=quiz.querySelector('form');
      const result=quiz.querySelector('[data-me-quiz-explanation]'),actions=quiz.querySelector('[data-me-quiz-actions]');
      let round=[],index=0,answered=false,wrong=[],correct=0;
      function appendExplanation(node,question){
        node.append(element('p',question.explanation),link(question.source,'原文出处',true),doc.createTextNode(' · '),link(question.reading,'接着读 →'));
        if(question.version_note){const detail=element('details'),summary=element('summary','版本说明');detail.append(summary,element('p',question.version_note));node.append(detail);}
      }
      function explain(question,chosen){
        result.replaceChildren();
        const grade=gradeAnswer(question,chosen);
        result.append(element('strong',grade.message));appendExplanation(result,question);
        form.querySelectorAll('[data-me-choice]').forEach((label,i)=>{const choice=grade.labels[i];label.querySelector('[data-me-choice-label]').textContent=choice.text;label.dataset.answerState=choice.correct?'correct':choice.selected?'incorrect':'unselected';});
        result.hidden=false;result.focus();
        return grade.correct;
      }
      function show(){
        answered=false;result.hidden=true;result.replaceChildren();actions.replaceChildren();form.replaceChildren();
        if(index>=round.length){
          const summary=element('h2','这一轮读完了');summary.tabIndex=-1;form.append(summary,element('p',roundSummary(correct,round.length)));
          if(wrong.length){const section=element('section');section.append(element('h3','错题回顾'));for(const item of wrong){const detail=element('details'),text=element('summary',item.question.quotation||item.question.text);detail.dataset.meWrongReview='';detail.append(text,element('p','你的答案：'+item.chosen),element('p','正确答案：'+item.question.answer));appendExplanation(detail,item.question);section.append(detail);}form.append(section);}
          const again=element('button','再来一轮');again.type='button';again.dataset.quizRestart='';actions.append(again);summary.focus();return;
        }
        const question=round[index];form.dataset.questionId=question.id;
        const title=element('h2','第'+(index+1)+' / '+round.length+'题：'+question.text);title.tabIndex=-1;
        form.append(title);
        if(question.quotation)form.append(element('p',question.quotation));
        const field=element('fieldset');field.append(element('legend','请选择一个答案'));
        question.choices.forEach((choice,i)=>{const label=element('label'),input=doc.createElement('input'),text=element('span',' '+choice);label.dataset.meChoice='';text.dataset.meChoiceLabel='';input.type='radio';input.name='marx-answer';input.value=String(i);input.required=true;label.append(input,text);field.append(label);});
        const submit=element('button','看解释');submit.type='submit';form.append(field,submit);title.focus();
      }
      let active='source';
      const start=mode=>{if(!pools||!Array.isArray(pools[mode])||pools[mode].length<(mode==='myth'?16:10))return;active=mode;round=makeRound(pools[mode]);index=0;wrong=[];correct=0;stage.hidden=false;show();};
      if(pools&&Object.values(pools).every(Array.isArray)){
        controls.hidden=false;
        listen(controls,'click',event=>{const button=event.target.closest?.('[data-quiz-mode]');if(button&&controls.contains(button))start(button.dataset.quizMode);});
        listen(form,'submit',event=>{event.preventDefault();if(answered||index>=round.length)return;const selected=form.querySelector('input[name="marx-answer"]:checked');if(!selected)return;const question=round[index],chosen=question.choices[Number(selected.value)];if(!chosen)return;answered=true;if(explain(question,chosen))correct++;else wrong.push({question,chosen});form.querySelectorAll('input,button').forEach(node=>{node.disabled=true;});const next=element('button',index===round.length-1?'本轮回顾':'下一题');next.type='button';next.dataset.quizNext='';actions.append(next);});
        listen(actions,'click',event=>{if(event.target.closest?.('[data-quiz-next]')){index++;show();}else if(event.target.closest?.('[data-quiz-restart]'))start(active);});
      }
    }
    const quotesData=root.querySelector('[data-me-quotes-data]');
    if(quotesData&&win.ReadMarx){
      const groups=parse(quotesData);
      if(Array.isArray(groups))root.querySelectorAll('[data-me-quote-group]').forEach((row,index)=>{
        const pool=groups[index];if(!Array.isArray(pool)||!pool.length)return;
        const button=row.querySelector('[data-me-quote-next]'),text=row.querySelector('[data-me-quote-text]'),source=row.querySelector('[data-me-quote-source]'),note=row.querySelector('[data-me-quote-note]');
        const deck=win.ReadMarx.createDeck(pool,win.ReadMarx.beijingKey());
        const show=()=>{const quote=deck.next();text.textContent=quote.text;source.href=quote.url;note.textContent=quote.note;row.dataset.quoteId=quote.id;};
        show();if(pool.length>1){button.hidden=false;listen(button,'click',show);}
      });
    }
    const lifeFilters=root.querySelector('[data-me-life-filters]');
    if(lifeFilters){
      const rows=[...root.querySelectorAll('[data-me-event]')];
      const validTags=['生活','著作','书信','组织'];
      let person='all',tag='all';
      const read=()=>{const params=new URL(win.location.href).searchParams;person=['marx','engels','both'].includes(params.get('person'))?params.get('person'):'all';tag=validTags.includes(params.get('tag'))?params.get('tag'):'all';};
      const show=update=>{
        let count=0;
        rows.forEach(row=>{row.hidden=!(person==='all'||row.dataset.person===person||(person!=='both'&&row.dataset.person==='both'))||!(tag==='all'||(row.dataset.tag||'').split(' ').includes(tag));if(!row.hidden)count++;});
        root.querySelectorAll('[data-me-life-year]').forEach(group=>{group.hidden=![...group.querySelectorAll('[data-me-event]')].some(row=>!row.hidden);});
        const periods=[...root.querySelectorAll('[data-me-life-period]')];
        periods.forEach(period=>{period.hidden=![...period.querySelectorAll('[data-me-event]')].some(row=>!row.hidden);});
        if(person!=='all'||tag!=='all'){
          const first=periods.find(period=>!period.hidden),mobile=Number(win.innerWidth)<=768;
          periods.forEach(period=>{period.open=!period.hidden&&(!mobile||period===first);});
        }
        lifeFilters.querySelectorAll('[data-me-person]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mePerson===person)));
        lifeFilters.querySelectorAll('[data-me-tag]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.meTag===tag)));
        root.querySelector('[data-me-life-count]').textContent='显示'+count+' / '+rows.length+'条';
        if(update){const url=new URL(win.location.href);for(const [name,value] of [['person',person],['tag',tag]])if(value==='all')url.searchParams.delete(name);else url.searchParams.set(name,value);win.history.replaceState(win.history.state,'',url.pathname+url.search+url.hash);}
      };
      read();show(false);lifeFilters.hidden=false;
      listen(lifeFilters,'click',event=>{const button=event.target.closest?.('[data-me-person],[data-me-tag]');if(button&&lifeFilters.contains(button)){if(button.hasAttribute('data-me-person'))person=button.dataset.mePerson;if(button.hasAttribute('data-me-tag'))tag=button.dataset.meTag;show(true);}});
      listen(win,'popstate',()=>{read();show(false);});
    }
    const letterData=root.querySelector('[data-me-letters-data]');
    if(letterData&&win.ReadMarx){
      const letters=parse(letterData),box=root.querySelector('[data-me-letter]');
      if(Array.isArray(letters)&&letters.length&&box){
        const deck=win.ReadMarx.createDeck(letters,win.ReadMarx.beijingKey());
        const show=()=>{const row=deck.next();box.querySelector('[data-me-letter-title]').textContent=row.title;box.querySelector('[data-me-letter-year]').textContent=row.year+'年 · 第'+row.no+'封';box.querySelector('[data-me-letter-summary]').textContent=row.summary;box.querySelector('[data-me-letter-source]').href=row.url;box.dataset.letterNo=String(row.no);};
        show();const button=box.querySelector('[data-me-letter-next]');button.hidden=letters.length<2;listen(button,'click',show);
      }
    }

    root.dataset.mePlayMounted='true';
    let disposed=false;const dispose=()=>{if(!disposed){disposed=true;delete root.dataset.mePlayMounted;cleanups.splice(0).reverse().forEach(fn=>fn());}};
    win.SiteNavigation?.own?.(dispose);return dispose;
  }
  return{shuffle,makeRound,gradeAnswer,roundSummary,mount};
});
