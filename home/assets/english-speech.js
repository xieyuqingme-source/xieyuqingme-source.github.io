/* Optional device-local English reading. No default or remote voices are used. */
(function (root, factory) {
  'use strict';
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else {root.EnglishSpeech=api;api.mount({window:root,document:root.document});}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const INSTANCE=Symbol.for('english-speech.page');
  function selectVoice(voices) {
    const english=Array.from(voices || []).filter(voice=>voice?.localService===true && /^en(?:-|$)/i.test(voice.lang || ''));
    const rank=voice=>/^en-GB(?:-|$)/i.test(voice.lang)?0:/^en-US(?:-|$)/i.test(voice.lang)?1:2;
    return english.sort((a,b)=>rank(a)-rank(b))[0] || null;
  }
  function plainText(node) {
    if(!node)return '';
    if(node.nodeType===3)return node.nodeValue ?? node.textContent ?? '';
    const tag=(node.tagName || node.nodeName || '').toUpperCase();
    if(['SCRIPT','STYLE','BUTTON','NOSCRIPT'].includes(tag) || node.hasAttribute?.('data-english-speech'))return '';
    if(tag==='BR')return '\n';
    const text=node.childNodes?.length?[...node.childNodes].map(plainText).join(''):node.textContent || '';
    return /^(?:P|DIV|BLOCKQUOTE|LI|SECTION|H[1-6])$/.test(tag)?'\n'+text+'\n':text;
  }
  function speechText(button,root,doc) {
    let text=button.dataset.speechText;
    if(typeof text!=='string') {
      const id=button.dataset.speechTarget;
      if(typeof id!=='string' || !/^[A-Za-z][\w:.-]*$/.test(id))return '';
      const target=doc.getElementById(id);
      if(!target || !root.contains(target))return '';
      text=plainText(target);
    }
    if(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))return '';
    text=text.replace(/\s+/g,' ').trim();
    return text.length && text.length<=4000 && /[A-Za-z]/.test(text)?text:'';
  }
  function mount(options={}) {
    const win=options.window,doc=options.document;
    const root=doc?.querySelector?.('[data-english-corner]');
    const idle={stop(){},refresh(){},destroy(){},available:()=>false};
    if(!win || !root)return idle;
    if(root[INSTANCE])return root[INSTANCE];
    const buttons=[...root.querySelectorAll('button[data-english-speech]')];
    const notice=root.querySelector('[data-english-speech-note]');
    for(const button of buttons){button.hidden=true;button.setAttribute('aria-pressed','false');}
    if(notice)notice.hidden=true;
    const synth=win.speechSynthesis,Utterance=win.SpeechSynthesisUtterance;
    if(!buttons.length)return idle;
    const supported=typeof Utterance==='function' && !!synth
      && ['speak','cancel','getVoices','addEventListener','removeEventListener'].every(key=>typeof synth[key]==='function');
    const listeners=[];
    let current=null,disposed=false,failed=false,available=false;
    function listen(target,type,handler){target.addEventListener(type,handler);listeners.push(()=>target.removeEventListener(type,handler));}
    function feedback(message='') {
      if(!notice)return;
      notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.setAttribute('aria-atomic','true');
      notice.textContent=message;notice.hidden=!message;
    }
    function voices(){try{return Array.from(synth.getVoices() || []);}catch(_){return [];}}
    const voiceKey=voice=>[voice?.voiceURI,voice?.name,voice?.lang].join('|');
    function reset(record) {
      record.button.setAttribute('aria-pressed','false');
      record.utterance.onend=null;record.utterance.onerror=null;
    }
    function stop() {
      if(!current)return;
      const record=current;current=null;reset(record);
      try{synth.cancel();}catch(_){}
    }
    function refresh() {
      if(disposed)return;
      const local=supported?voices().filter(voice=>voice?.localService===true && /^en(?:-|$)/i.test(voice.lang || '')):[];
      const voice=failed?null:selectVoice(local);available=false;
      for(const button of buttons) {
        const usable=!!voice && !!speechText(button,root,doc);button.hidden=!usable;available ||= usable;
        if(!usable && current?.button===button)stop();
      }
      if(current && !local.some(item=>voiceKey(item)===voiceKey(current.voice)))stop();
      feedback(!supported?'此浏览器暂不支持本地英语朗读。'
        :failed?'朗读未能完成，请稍后重新打开本页再试。'
        :!voice?'此设备暂没有可用的本地英语语音。'
        :!available?'这段内容暂时无法朗读。':'');
    }
    function speak(button) {
      if(disposed || failed)return;
      if(current?.button===button){stop();return;}
      const voice=selectVoice(voices()),text=speechText(button,root,doc);
      if(!voice || !text){refresh();return;}
      stop();
      try {
        const utterance=new Utterance(text);
        utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=1;
        const record={button,utterance,voice};current=record;
        button.setAttribute('aria-pressed','true');
        utterance.onend=()=>{if(current===record){current=null;reset(record);}};
        utterance.onerror=event=>{
          if(current!==record)return;
          current=null;reset(record);
          if(!['canceled','cancelled','interrupted'].includes(event?.error)){failed=true;refresh();}
        };
        synth.speak(utterance);
        if(current===record && synth.paused && typeof synth.resume==='function')synth.resume();
      } catch(_) {stop();failed=true;refresh();}
    }
    function destroy() {
      if(disposed)return;disposed=true;stop();listeners.splice(0).reverse().forEach(fn=>fn());available=false;
      for(const button of buttons){button.hidden=true;button.setAttribute('aria-pressed','false');}
      feedback();
      if(root[INSTANCE]===api)delete root[INSTANCE];
    }
    const api={stop,refresh,destroy,available:()=>available};root[INSTANCE]=api;
    if(supported) {
      for(const button of buttons)listen(button,'click',()=>speak(button));
      listen(synth,'voiceschanged',()=>{failed=false;refresh();});
      listen(win,'pagehide',stop);
    }
    win.SiteNavigation?.own?.(destroy);refresh();
    return api;
  }
  return {selectVoice,plainText,speechText,mount};
});
