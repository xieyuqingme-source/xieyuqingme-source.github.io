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
      function explain(question,chosen){
        result.replaceChildren();
        const verdict=chosen===question.answer;
        result.append(element('strong',verdict?'答对了。':'本题答案：'+question.answer+'。'),element('p',question.explanation),link(question.source,'原文出处',true),doc.createTextNode(' · '),link(question.reading,'接着读 →'));
        result.hidden=false;result.focus();
        return verdict;
      }
      function show(){
        answered=false;result.hidden=true;result.replaceChildren();actions.replaceChildren();form.replaceChildren();
        if(index>=round.length){
          const summary=element('h2','这一轮读完了');summary.tabIndex=-1;form.append(summary,element('p','答对'+correct+' / '+round.length+'题。结果只在本页内存中，离开即结束。'));
          if(wrong.length){const section=element('section');section.append(element('h3','错题回顾'));for(const item of wrong){const detail=element('details'),text=element('summary',item.question.quotation||item.question.text);detail.append(text,element('p','你的选择：'+item.chosen+'；答案：'+item.question.answer),element('p',item.question.explanation),link(item.question.source,'原文出处',true),doc.createTextNode(' · '),link(item.question.reading,'读解释 →'));section.append(detail);}form.append(section);}
          const again=element('button','再来一轮');again.type='button';again.dataset.quizRestart='';actions.append(again);summary.focus();return;
        }
        const question=round[index];form.dataset.questionId=question.id;
        const title=element('h2','第'+(index+1)+' / '+round.length+'题：'+question.text);title.tabIndex=-1;
        form.append(title);
        if(question.quotation)form.append(element('p',question.quotation));
        const field=element('fieldset');field.append(element('legend','请选择一个答案'));
        question.choices.forEach((choice,i)=>{const label=element('label'),input=doc.createElement('input');input.type='radio';input.name='marx-answer';input.value=String(i);input.required=true;label.append(input,doc.createTextNode(' '+choice));field.append(label);});
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
      let person='all';
      const read=()=>{const value=new URL(win.location.href).searchParams.get('person');person=['marx','engels','both'].includes(value)?value:'all';};
      const show=update=>{
        let count=0;
        rows.forEach(row=>{row.hidden=!(person==='all'||row.dataset.person===person||(person!=='both'&&row.dataset.person==='both'));if(!row.hidden)count++;});
        root.querySelectorAll('[data-me-life-year]').forEach(group=>{group.hidden=![...group.querySelectorAll('[data-me-event]')].some(row=>!row.hidden);});
        lifeFilters.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mePerson===person)));
        root.querySelector('[data-me-life-count]').textContent='显示'+count+' / '+rows.length+'条';
        if(update){const url=new URL(win.location.href);if(person==='all')url.searchParams.delete('person');else url.searchParams.set('person',person);win.history.replaceState(win.history.state,'',url.pathname+url.search+url.hash);}
      };
      read();show(false);lifeFilters.hidden=false;
      listen(lifeFilters,'click',event=>{const button=event.target.closest?.('[data-me-person]');if(button&&lifeFilters.contains(button)){person=button.dataset.mePerson;show(true);}});
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

    let disposed=false;const dispose=()=>{if(!disposed){disposed=true;cleanups.splice(0).reverse().forEach(fn=>fn());}};
    win.SiteNavigation?.own?.(dispose);return dispose;
  }
  return{shuffle,makeRound,mount};
});
