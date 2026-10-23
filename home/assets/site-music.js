(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.SiteMusic=api.createEngine(root);const mount=()=>api.mount(root,root.SiteMusic);if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();}})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const TRACKS=Object.freeze(['gentle','travel']);
 const volume=value=>Math.max(0,Math.min(1,Number.isFinite(Number(value))?Number(value):.25));
 function fades(seconds,level){const duration=Math.max(.1,Number(seconds)||.1);return{duration,level:volume(level),fadeIn:Math.min(1.5,duration*.18),fadeOut:Math.min(3,duration*.25)};}
 function createEngine(env){
  let session=null,serial=0,locked=false,siteOffset=0,siteTrack='',status='music.off';const buffers=new Map(),contexts=new Set(),listeners=new Set();
  const Constructor=()=>env.AudioContext||env.webkitAudioContext;
  const t=(key,values={})=>env.SiteI18n?.t(key,values,key)||key;
  const problem=key=>{const error=new Error(t(key));error.code=key;return error;};
  const aborted=()=>new (env.DOMException||DOMException)('Cancelled','AbortError');
  function state(){return{owner:session?.owner||null,status,track:session?.id||null,playing:!!session?.started,locked,contexts:contexts.size};}
  function emit(key){if(key)status=key;for(const fn of listeners)fn(state());}
  function claim(owner){if(env.dispatchEvent&&env.CustomEvent)env.dispatchEvent(new env.CustomEvent('site:audio:claim',{detail:{owner}}));}
  async function dispose(s,immediate=false){
   if(!s||s.closing)return s?.closed;s.closing=true;s.abort.abort();if(s.previewTimer)(env.clearTimeout||clearTimeout)(s.previewTimer);
   if(s.owner==='site'&&s.started){siteTrack=s.id;siteOffset=(s.offset+Math.max(0,s.context.currentTime-s.began))%(s.buffer?.duration||1);}
   s.closed=(async()=>{try{
    if(s.source&&s.started&&!immediate&&s.context.state==='running'){
     const now=s.context.currentTime;s.gain.gain.cancelScheduledValues(now);s.gain.gain.setValueAtTime(s.gain.gain.value,now);s.gain.gain.linearRampToValueAtTime(0,now+.04);try{s.source.stop(now+.045);}catch(_){}
     await new Promise(resolve=>(env.setTimeout||setTimeout)(resolve,55));
    }else if(s.source){try{s.source.stop();}catch(_){}}
    if(s.destination)for(const track of s.destination.stream.getTracks())track.stop();
    s.source?.disconnect();s.gain?.disconnect();if(s.context.state!=='closed')await s.context.close();
   }finally{contexts.delete(s.context);emit();}})();return s.closed;
  }
  function stop(key='music.paused',immediate=false){serial++;const old=session;session=null;emit(key);return dispose(old,immediate);}
  async function prepare(owner,id,level,signal){
   if(!TRACKS.includes(id))throw problem('music.badTrack');if(!Constructor())throw problem('music.unsupported');if(locked&&owner!=='export')throw problem('music.busy');
   const ticket=++serial,old=session;
   const context=new (Constructor())();contexts.add(context);const s={ticket,id,owner,level:volume(level),context,abort:new AbortController(),source:null,gain:null,destination:null,started:false,closing:false,offset:owner==='site'&&siteTrack===id?siteOffset:0};session=s;claim(owner);emit('music.loading');
   const cancel=()=>{if(session===s){session=null;serial++;emit('music.stopped');}void dispose(s,true);};
   if(signal)signal.addEventListener('abort',cancel,{once:true});s.removeAbort=()=>signal?.removeEventListener('abort',cancel);
   try{
    // Resume synchronously in the originating click handler, before network awaits.
    const resume=context.resume();await Promise.all([resume,dispose(old)]);
    if(signal?.aborted||session!==s||ticket!==serial)throw aborted();if(context.state!=='running')throw problem('music.blocked');
    let buffer=buffers.get(id);
    if(!buffer){const response=await env.fetch('/assets/music/'+id+'.wav',{signal:s.abort.signal,credentials:'same-origin'});if(!response.ok)throw problem('music.loadError');const bytes=await response.arrayBuffer();buffer=await context.decodeAudioData(bytes);if(!buffer.duration||buffer.numberOfChannels<1)throw problem('music.loadError');if(session!==s||signal?.aborted)throw aborted();buffers.set(id,buffer);}
    if(signal?.aborted||session!==s||ticket!==serial)throw aborted();s.buffer=buffer;s.source=context.createBufferSource();s.source.buffer=buffer;s.source.loop=true;s.gain=context.createGain();s.gain.gain.value=0;s.source.connect(s.gain);
    if(owner==='export'){if(typeof context.createMediaStreamDestination!=='function')throw problem('music.unsupported');s.destination=context.createMediaStreamDestination();s.gain.connect(s.destination);}else s.gain.connect(context.destination);
    context.onstatechange=()=>{if(s.started&&!s.closing&&context.state!=='running'){if(owner==='export')s.destination.stream.getAudioTracks().forEach(track=>track.stop());else void stop('music.interrupted',true);}};
    return s;
   }catch(error){const reported=error.name==='AbortError'||(typeof error.code==='string'&&error.code.startsWith('music.'))?error:problem(error.name==='NotAllowedError'?'music.blocked':'music.loadError');if(session===s){session=null;emit(reported.name==='AbortError'?'music.stopped':reported.code);}await dispose(s,true);s.removeAbort();throw reported;}
  }
  async function play(owner,id,level){
   const s=await prepare(owner,id,level);if(session!==s)throw aborted();const at=s.context.currentTime+.015;s.began=at;s.started=true;s.gain.gain.setValueAtTime(0,at);s.gain.gain.linearRampToValueAtTime(s.level,at+.5);s.source.start(at,s.offset);if(owner==='preview')s.previewTimer=(env.setTimeout||setTimeout)(()=>{if(session===s)void stop('music.stopped');},12000);emit(owner==='site'?'music.playing':'music.previewing');return state();
  }
  async function prepareExport(id,level,durationMs,signal){
   if(locked)throw problem('music.busy');locked=true;claim('export');emit('music.exporting');
   try{
    if(id==='none'||volume(level)===0){await stop('music.exporting');if(signal?.aborted)throw aborted();return{audioTrack:null,start(){},async close(){locked=false;emit('music.off');}};}
    const s=await prepare('export',id,level,signal),track=s.destination.stream.getAudioTracks()[0];if(!track||track.readyState!=='live')throw problem('music.unsupported');
    return{audioTrack:track,start(){
     if(session!==s||s.started||signal?.aborted)throw aborted();const f=fades(durationMs/1000,s.level),at=s.context.currentTime+.015;s.started=true;s.began=at;s.gain.gain.setValueAtTime(0,at);s.gain.gain.linearRampToValueAtTime(f.level,at+f.fadeIn);s.gain.gain.setValueAtTime(f.level,at+Math.max(f.fadeIn,f.duration-f.fadeOut));s.gain.gain.linearRampToValueAtTime(0,at+f.duration-.01);s.source.start(at);s.source.stop(at+f.duration);emit('music.exporting');
    },async close(){if(session===s)session=null;s.removeAbort();await dispose(s,true);locked=false;emit('music.off');}};
   }catch(error){locked=false;if(session?.owner==='export')await stop('music.stopped',true);emit(error.code||'music.stopped');throw error;}
  }
  function setVolume(owner,level){if(session?.owner!==owner||!session.gain||owner==='export')return;session.level=volume(level);const now=session.context.currentTime,param=session.gain.gain,current=param.value;param.cancelScheduledValues(now);param.setValueAtTime(current,now);param.setTargetAtTime(session.level,now,.04);}
  function release(){locked=false;buffers.clear();return stop('music.off',true);}
  if(env.addEventListener){env.addEventListener('pagehide',release);env.addEventListener('site:audio:claim',event=>{if(event.detail?.owner==='video-player'&&!locked)void stop('music.stopped',true);});}
  return Object.freeze({t,supported:()=>!!Constructor(),tracks:TRACKS,state,onChange(fn){listeners.add(fn);return()=>listeners.delete(fn);},playSite:(id,level)=>play('site',id,level),preview:(id,level)=>play('preview',id,level),stop,stopPreview(){return session?.owner==='preview'?stop('music.stopped'):Promise.resolve();},prepareExport,setVolume,release,claim,resetSitePosition(){siteOffset=0;siteTrack='';}});
 }
 function mount(root,engine){
  const header=root.document.querySelector('.site-header');if(!header||!root.SiteI18n||root.document.querySelector('#site-music'))return;
  let prefs={track:'gentle',volume:.25};try{const saved=JSON.parse(root.localStorage.getItem('xieyuqing-site-music-v1')||'null');if(saved){prefs.track=TRACKS.includes(saved.track)?saved.track:'gentle';prefs.volume=volume(saved.volume);}}catch(_){}
  const details=root.document.createElement('details');details.id='site-music';details.className='site-music';details.innerHTML='<summary></summary><div class="music-panel"><label><span class="music-track-label"></span><select class="music-track"><option value="gentle"></option><option value="travel"></option></select></label><div class="music-actions"><button type="button" class="music-play"></button><button type="button" class="music-stop"></button><label><span class="music-volume-label"></span><input class="music-volume" type="range" min="0" max="100" step="5"><output></output></label></div><p class="music-status" role="status" aria-live="polite"></p><small class="music-credit"></small></div>';header.append(details);
  const find=s=>details.querySelector(s),select=find('select'),range=find('input');select.value=prefs.track;range.value=Math.round(prefs.volume*100);
  function save(){try{root.localStorage.setItem('xieyuqing-site-music-v1',JSON.stringify(prefs));}catch(_){}}
  let uiError=null;
  function refresh(){const s=engine.state(),playing=s.owner==='site'&&s.playing,loading=s.owner==='site'&&s.status==='music.loading';find('summary').textContent=engine.t('music.open');find('.music-track-label').textContent=engine.t('music.track');select.options[0].textContent=engine.t('music.gentle');select.options[1].textContent=engine.t('music.travel');find('.music-volume-label').textContent=engine.t('music.volume');range.setAttribute('aria-label',engine.t('music.siteVolume'));range.setAttribute('aria-valuetext',range.value+'%');find('output').textContent=range.value+'%';find('.music-play').textContent=engine.t(loading?'music.cancel':playing?'music.pause':'music.play');find('.music-play').setAttribute('aria-pressed',String(playing));find('.music-play').disabled=!engine.supported()||s.locked;find('.music-status').textContent=engine.t(!engine.supported()?'music.unsupported':uiError||(s.locked?'music.busy':s.owner==='site'?s.status:'music.off'));find('.music-stop').textContent=engine.t('music.stop');find('.music-stop').disabled=s.locked;find('.music-credit').textContent=engine.t('music.credit');}
  find('.music-play').addEventListener('click',async()=>{uiError=null;const s=engine.state();try{if(s.owner==='site')await engine.stop();else await engine.playSite(prefs.track,prefs.volume);}catch(e){if(e.name!=='AbortError')uiError=e.code||'music.loadError';}refresh();});
  find('.music-stop').addEventListener('click',async()=>{uiError=null;engine.claim('site-stop');await engine.stop('music.stopped');engine.resetSitePosition();refresh();});
  select.addEventListener('change',()=>{prefs.track=select.value;uiError=null;engine.resetSitePosition();if(engine.state().owner==='site')void engine.stop('music.stopped');save();refresh();});range.addEventListener('input',()=>{prefs.volume=volume(Number(range.value)/100);engine.setVolume('site',prefs.volume);save();refresh();});
  details.addEventListener('keydown',event=>{if(event.key==='Escape'){details.open=false;find('summary').focus();}});engine.onChange(refresh);root.SiteI18n.onChange(refresh);refresh();
 }
 return Object.freeze({createEngine,volume,fades,tracks:TRACKS,mount});
});
