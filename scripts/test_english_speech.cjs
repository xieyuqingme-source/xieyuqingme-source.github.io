'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const moduleFile=process.env.ENGLISH_SPEECH_MODULE||path.join(__dirname,'../home/assets/english-speech.js');
const speech=require(moduleFile);
class Events {
  constructor(){this.events=new Map();}
  addEventListener(type,fn){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(fn);}
  removeEventListener(type,fn){this.events.get(type)?.delete(fn);}
  fire(type,values={}){for(const fn of [...(this.events.get(type) || [])])fn({target:this,...values});}
  count(){return [...this.events.values()].reduce((n,set)=>n+set.size,0);}
}
class Element extends Events {
  constructor(tag='DIV',text=''){super();this.tagName=tag;this.nodeType=1;this.textContent=text;this.childNodes=[];this.dataset={};this.attrs={};this.hidden=true;}
  add(...nodes){this.childNodes.push(...nodes);return this;}
  contains(target){return target===this || this.childNodes.some(child=>child.contains?.(target));}
  hasAttribute(name){return Object.hasOwn(this.attrs,name);}
  setAttribute(name,value){this.attrs[name]=String(value);}
  getAttribute(name){return this.attrs[name] ?? null;}
}
const text=value=>({nodeType:3,nodeValue:value,textContent:value});
const local=(lang='en-GB',name='Local '+lang)=>({lang,name,voiceURI:name,localService:true});
function fixture(voices=[local()]){
  const win=new Events(),synth=new Events(),owned=[],utterances=[],ids=new Map();
  const root=new Element('MAIN'),notice=new Element('P'),original=new Element('BLOCKQUOTE','A little learning is a dangerous thing.');
  const buttons=[new Element('BUTTON'),new Element('BUTTON')];buttons[0].dataset.speechTarget='original-verse';buttons[1].dataset.speechText='serendipity';
  ids.set('original-verse',original);root.add(original,...buttons,notice);
  root.querySelectorAll=selector=>selector==='button[data-english-speech]'?buttons:[];
  root.querySelector=selector=>selector==='[data-english-speech-note]'?notice:null;
  const doc={querySelector:selector=>selector==='[data-english-corner]'?root:null,getElementById:id=>ids.get(id)};
  let cancellations=0,resumptions=0;synth.voices=voices;synth.getVoices=()=>synth.voices;
  synth.speak=utterance=>utterances.push(utterance);synth.cancel=()=>{cancellations++;};synth.resume=()=>{resumptions++;synth.paused=false;};
  win.document=doc;win.speechSynthesis=synth;win.SpeechSynthesisUtterance=class {constructor(value){this.text=value;}};
  win.SiteNavigation={own:fn=>owned.push(fn)};
  return {win,doc,synth,root,notice,original,buttons,owned,utterances,ids,cancellations:()=>cancellations,resumptions:()=>resumptions,
    listeners:()=>[win,synth,...buttons].reduce((n,item)=>n+item.count(),0)};
}
const mount=f=>speech.mount({window:f.win,document:f.doc});

test('voice choice requires an explicit local English voice, preferring British then US',()=>{
  const gb=local(),us=local('en-US'),au=local('en-AU');
  const remote={...gb,localService:false},unknown={...gb};delete unknown.localService;
  assert.equal(speech.selectVoice([au,us,gb]),gb);assert.equal(speech.selectVoice([au,us]),us);assert.equal(speech.selectVoice([au]),au);
  assert.equal(speech.selectVoice([remote,unknown,{...gb,localService:'true'},local('fr-FR')]),null);
  assert.equal(speech.selectVoice([]),null);assert.equal(speech.selectVoice(null),null);
});
test('only learning pages are scanned; Today is not changed or listened to',()=>{
  const f=fixture();f.buttons[0].hidden=false;f.doc.querySelector=()=>null;mount(f);
  assert.equal(f.buttons[0].hidden,false);assert.equal(f.listeners(),0);assert.equal(f.owned.length,0);assert.equal(f.utterances.length,0);
});
test('unsupported devices and remote-only voices hide controls and expose concise dynamic feedback',()=>{
  const unsupported=fixture();delete unsupported.win.speechSynthesis;assert.equal(mount(unsupported).available(),false);
  assert.equal(unsupported.buttons.every(button=>button.hidden),true);assert.equal(unsupported.notice.hidden,false);assert.match(unsupported.notice.textContent,/不支持/);
  const remote=fixture([{...local(),localService:false}]);assert.equal(mount(remote).available(),false);
  assert.equal(remote.buttons.every(button=>button.hidden),true);assert.equal(remote.notice.hidden,false);assert.match(remote.notice.textContent,/没有可用/);assert.equal(remote.utterances.length,0);
});
test('a later voiceschanged event reveals local controls and clears temporary feedback',()=>{
  const f=fixture([]),api=mount(f);assert.equal(api.available(),false);f.synth.voices=[local('en-US')];f.synth.fire('voiceschanged');
  assert.equal(api.available(),true);assert.equal(f.buttons.every(button=>!button.hidden),true);assert.equal(f.notice.hidden,true);assert.equal(f.notice.textContent,'');
  assert.equal(f.utterances.length,0);assert.equal(f.cancellations(),0);
});
test('click uses the chosen local voice, language, and reviewed English text',()=>{
  const gb=local(),f=fixture([local('en-US'),gb]);mount(f);f.buttons[0].fire('click');
  assert.equal(f.utterances.length,1);assert.equal(f.utterances[0].voice,gb);assert.equal(f.utterances[0].lang,'en-GB');
  assert.equal(f.utterances[0].rate,1);assert.equal(f.utterances[0].text,'A little learning is a dangerous thing.');
  assert.equal(f.buttons[0].getAttribute('aria-pressed'),'true');assert.equal(f.buttons[1].getAttribute('aria-pressed'),'false');
});
test('repeated click stops; a different button stops the previous utterance',()=>{
  const f=fixture();mount(f);f.buttons[0].fire('click');const first=f.utterances[0];
  f.buttons[0].fire('click');assert.equal(f.cancellations(),1);assert.equal(f.utterances.length,1);assert.equal(first.onend,null);
  f.buttons[0].fire('click');const oldEnd=f.utterances[1].onend;f.buttons[1].fire('click');
  assert.equal(f.cancellations(),2);assert.equal(f.utterances.length,3);assert.equal(f.utterances[2].text,'serendipity');
  oldEnd();assert.equal(f.buttons[1].getAttribute('aria-pressed'),'true');
  f.utterances[2].onend();assert.equal(f.buttons[1].getAttribute('aria-pressed'),'false');
});
test('current voices are checked again at click time; never use a remote default',()=>{
  const f=fixture();mount(f);f.synth.voices=[{...local(),localService:false}];f.buttons[0].fire('click');
  assert.equal(f.utterances.length,0);assert.equal(f.buttons.every(button=>button.hidden),true);assert.equal(f.notice.hidden,false);assert.match(f.notice.textContent,/没有可用/);
});
test('removing the active local voice cancels reading, and can show another local voice',()=>{
  const f=fixture();mount(f);f.buttons[0].fire('click');f.synth.voices=[local('en-US')];f.synth.fire('voiceschanged');
  assert.equal(f.cancellations(),1);assert.equal(f.buttons[0].getAttribute('aria-pressed'),'false');assert.equal(f.buttons[0].hidden,false);
  f.buttons[0].fire('click');assert.equal(f.utterances.at(-1).lang,'en-US');
});
test('pagehide cancels but allows bfcache reuse; PageScope cleanup removes everything',()=>{
  const f=fixture(),api=mount(f),count=f.listeners();assert.equal(mount(f),api);assert.equal(f.listeners(),count);assert.equal(f.owned.length,1);
  f.buttons[0].fire('click');f.win.fire('pagehide');assert.equal(f.cancellations(),1);assert.equal(f.buttons[0].getAttribute('aria-pressed'),'false');
  f.buttons[1].fire('click');assert.equal(f.utterances.length,2);f.owned[0]();f.owned[0]();
  assert.equal(f.cancellations(),2);assert.equal(f.listeners(),0);assert.equal(f.notice.hidden,true);assert.equal(f.buttons.every(button=>button.hidden),true);
  f.buttons[0].fire('click');assert.equal(f.utterances.length,2);
  const next=mount(f);assert.notEqual(next,api);assert.equal(f.listeners(),count);next.destroy();assert.equal(f.listeners(),0);
});
test('new user reading resumes a previously paused native queue',()=>{
  const f=fixture();f.synth.paused=true;mount(f);f.buttons[0].fire('click');assert.equal(f.resumptions(),1);assert.equal(f.synth.paused,false);
});
test('plain-text extraction preserves poem breaks and annotated words, and skips controls',()=>{
  const original=new Element('BLOCKQUOTE').add(text('To see a '),new Element('SPAN').add(text('World')),new Element('BR'),text('in a Grain of Sand'),new Element('BUTTON','朗读'),new Element('SCRIPT','unreviewed'));
  assert.match(speech.plainText(original),/To see a World\nin a Grain of Sand/);assert.doesNotMatch(speech.plainText(original),/朗读|unreviewed/);
  const f=fixture();f.original.childNodes=original.childNodes;assert.equal(speech.speechText(f.buttons[0],f.root,f.doc),'To see a World in a Grain of Sand');
});
test('filtered library rows remain readable when shown again without needing voice refresh',()=>{
  const f=fixture();f.original.hidden=true;mount(f);assert.equal(f.buttons[0].hidden,false);
  f.original.hidden=false;f.buttons[0].fire('click');assert.equal(f.utterances.length,1);
});
test('invalid, oversized, markup, and targets outside the learning page are never spoken',()=>{
  const f=fixture();f.buttons[0].dataset.speechTarget='other';f.ids.set('other',new Element('DIV','Outside private note'));
  f.buttons[1].dataset.speechText='<speak>not plain text</speak>';mount(f);f.buttons.forEach(button=>button.fire('click'));
  assert.equal(f.utterances.length,0);assert.equal(f.buttons.every(button=>button.hidden),true);
  for(const value of ['x'.repeat(4001),'   ','12345','hello\u0000']){f.buttons[1].dataset.speechText=value;assert.equal(speech.speechText(f.buttons[1],f.root,f.doc),'');}
  f.buttons[0].dataset.speechTarget='original-verse]';assert.equal(speech.speechText(f.buttons[0],f.root,f.doc),'');
});
test('native failures hide unusable reading controls and never fall back to default speech',()=>{
  const f=fixture();f.synth.speak=()=>{throw new Error('unavailable');};mount(f);f.buttons[0].fire('click');
  assert.equal(f.cancellations(),1);assert.equal(f.buttons.every(button=>button.hidden),true);assert.equal(f.notice.hidden,false);assert.match(f.notice.textContent,/未能完成/);
  const g=fixture();mount(g);g.buttons[0].fire('click');g.utterances[0].onerror({error:'voice-unavailable'});
  assert.equal(g.buttons.every(button=>button.hidden),true);assert.equal(g.buttons[0].getAttribute('aria-pressed'),'false');
  g.synth.fire('voiceschanged');assert.equal(g.buttons[0].hidden,false);
});
test('device list failures are treated as unavailable voices',()=>{
  const f=fixture();f.synth.getVoices=()=>{throw new Error('blocked');};assert.equal(mount(f).available(),false);assert.equal(f.buttons.every(button=>button.hidden),true);
});
test('browser reevaluation cannot stack click handlers or native listeners',()=>{
  const f=fixture(),source=fs.readFileSync(moduleFile,'utf8'),context=vm.createContext({window:f.win});
  vm.runInContext(source,context);const count=f.listeners();vm.runInContext(source,context);
  assert.equal(f.listeners(),count);assert.equal(f.owned.length,1);f.buttons[0].fire('click');assert.equal(f.utterances.length,1);
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage)\b/);
});

test('normal local reading keeps the feedback region empty and hidden with accessible status semantics',()=>{
  const f=fixture(),api=mount(f);assert.equal(api.available(),true);assert.equal(f.notice.hidden,true);assert.equal(f.notice.textContent,'');
  assert.equal(f.notice.getAttribute('role'),'status');assert.equal(f.notice.getAttribute('aria-live'),'polite');assert.equal(f.notice.getAttribute('aria-atomic'),'true');
  f.buttons[0].fire('click');f.buttons[0].fire('click');assert.equal(f.cancellations(),1);assert.equal(f.notice.hidden,true);assert.equal(f.notice.textContent,'');
});
test('unsupported mounts own their empty-state cleanup without adding native listeners or invoking speech',()=>{
  const f=fixture();delete f.win.SpeechSynthesisUtterance;const api=mount(f);assert.equal(api.available(),false);assert.equal(f.listeners(),0);assert.equal(f.owned.length,1);assert.match(f.notice.textContent,/不支持/);
  assert.equal(mount(f),api);assert.equal(f.owned.length,1);f.owned[0]();assert.equal(f.notice.hidden,true);assert.equal(f.notice.textContent,'');assert.equal(f.utterances.length,0);assert.equal(f.cancellations(),0);
});
test('native errors expose concise feedback, voice recovery clears it, and cancellation is not a failure',()=>{
  const f=fixture();mount(f);f.buttons[0].fire('click');f.utterances[0].onerror({error:'canceled'});assert.equal(f.notice.hidden,true);assert.equal(f.notice.textContent,'');
  f.buttons[0].fire('click');f.utterances[1].onerror({error:'voice-unavailable'});assert.equal(f.notice.hidden,false);assert.match(f.notice.textContent,/未能完成/);assert.equal(f.buttons.every(button=>button.hidden),true);
  f.synth.fire('voiceschanged');assert.equal(f.notice.hidden,true);assert.equal(f.notice.textContent,'');assert.equal(f.buttons.every(button=>!button.hidden),true);
});
test('disposed speech cannot revive feedback through a previously captured voiceschanged callback',()=>{
  const f=fixture(),api=mount(f),stale=[...f.synth.events.get('voiceschanged')][0];f.buttons[0].fire('click');api.destroy();assert.equal(f.cancellations(),1);assert.equal(f.listeners(),0);
  f.synth.voices=[];stale();api.refresh();assert.equal(f.notice.hidden,true);assert.equal(f.notice.textContent,'');assert.equal(f.buttons.every(button=>button.hidden),true);
});
test('a missing optional feedback node never disables local reading or PageScope cleanup',()=>{
  const f=fixture();f.root.querySelector=()=>null;const api=mount(f);assert.equal(api.available(),true);f.buttons[0].fire('click');assert.equal(f.utterances.length,1);f.owned[0]();assert.equal(f.cancellations(),1);assert.equal(f.listeners(),0);
});
