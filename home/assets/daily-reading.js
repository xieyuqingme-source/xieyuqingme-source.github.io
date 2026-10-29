/* Local quotations: a Beijing-date opening line, then a non-repeating shuffle. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.DailyReading = api; api.mount({window:root,document:root.document}); }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  function dayNumber(date) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(part => [part.type,part.value]));
    return Math.floor(Date.UTC(+parts.year,+parts.month-1,+parts.day)/86400000);
  }
  function createDeck(length, day, random = Math.random, saved = null) {
    const size = Number.isSafeInteger(length) && length > 0 ? length : 0;
    let selected = size ? ((day % size) + size) % size : -1, bag = [];
    function shuffle(values) {
      for (let index = values.length-1; index > 0; index--) {
        const value = Number(random()), bounded = Number.isFinite(value) ? Math.max(0,Math.min(1-Number.EPSILON,value)) : 0;
        const other = Math.floor(bounded*(index+1)); [values[index],values[other]] = [values[other],values[index]];
      }
      return values;
    }
    function refill(includeSelected) {
      bag = shuffle(Array.from({length:size},(_,index) => index).filter(index => includeSelected || index !== selected));
      if (bag.length > 1 && bag[0] === selected) [bag[0],bag[1]] = [bag[1],bag[0]];
    }
    refill(false);
    if (saved && Number.isInteger(saved.selected) && saved.selected >= 0 && saved.selected < size && Array.isArray(saved.remaining)
      && saved.remaining.length < size && new Set(saved.remaining).size === saved.remaining.length
      && saved.remaining.every(index => Number.isInteger(index) && index >= 0 && index < size && index !== saved.selected)) {
      selected = saved.selected; bag = saved.remaining.slice();
    }
    return {
      current:() => selected,
      snapshot:() => ({selected,remaining:bag.slice()}),
      next() { if (size < 2) return selected; if (!bag.length) refill(true); selected = bag.shift(); return selected; }
    };
  }
  const bilingual = value => value && typeof value === 'object' && ['zh-CN','en'].every(language => typeof value[language] === 'string' && value[language].trim());
  function translatedSourceAllowed(item,language,sourceLanguage) {
    if (typeof item?.id !== 'string') return false;
    return language === 'en' && sourceLanguage === 'zh-CN' && item.author?.['zh-CN'] === '雷锋' && item.id.startsWith('lei-feng-')
      || language === 'zh-CN' && sourceLanguage === 'en' && item.author?.['zh-CN'] === '切·格瓦拉' && item.id.startsWith('che-guevara-');
  }
  function safeSource(value) {
    if (typeof value !== 'string' || !/^https:\/\//.test(value) || /[\s\u0000-\u001f<>\\]/.test(value)) return false;
    try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; } catch (_) { return false; }
  }
  function quotations(value) {
    const seen = new Set();
    return (value?.version === 1 && Array.isArray(value.quotes) ? value.quotes : []).filter(item => {
      const sourcesValid = typeof item?.url === 'string' ? safeSource(item.url) : bilingual(item?.url) && ['zh-CN','en'].every(language => safeSource(item.url[language]));
      const sourceLanguagesValid = item?.source_language === undefined || (bilingual(item.source_language) && ['zh-CN','en'].every(language => item.source_language[language] === language || translatedSourceAllowed(item,language,item.source_language[language])));
      if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id) || !['text','author','work','translation_note'].every(key => bilingual(item[key])) || !sourcesValid || !sourceLanguagesValid) return false;
      seen.add(item.id); return true;
    });
  }
  function englishQuotations(value, date = new Date()) {
    const required = ['id','text','translation','translation_source','author_zh','author_en','work_zh','work_en','locator_zh','first_published','author_died','url','note'];
    const sameKeys = (item,keys,optional=[]) => item && typeof item==='object' && !Array.isArray(item) && keys.every(key=>Object.hasOwn(item,key)) && Object.keys(item).every(key=>keys.includes(key)||optional.includes(key));
    const publicText = (text,maximum,multiline=false) => typeof text==='string' && text.trim() && text.length<=maximum && !/[\u0000-\u001f\u007f]|(?<![A-Za-z0-9])[A-Za-z]:[\\/]|Obsidian Vault/i.test(multiline?text.replace(/\n/g,''):text);
    function publicSource(value) {
      if (!safeSource(value)) return false;
      try {
        const url=new URL(value),host=url.hostname.toLowerCase();
        if (url.search || url.port && url.port!=='443' || !host.includes('.') || host==='localhost' || /\.(local|localhost|internal)$/.test(host) || /[<>\\\u0000-\u001f\u007f]/.test(decodeURIComponent(value))) return false;
        if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
          const [a,b,c]=host.split('.').map(Number);
          if(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113)return false;
        }
        return true;
      } catch (_) { return false; }
    }
    if (!sameKeys(value,['version','quotes']) || value.version!==1 || !Array.isArray(value.quotes) || value.quotes.length>1000) return [];
    const year=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',year:'numeric'}).format(date)),ids=new Set(),texts=new Set();
    return value.quotes.filter(item=>{
      if(!sameKeys(item,required,['related'])||!required.filter(key=>!['translation_source','first_published','author_died','url'].includes(key)).every(key=>publicText(item[key],2000,['text','translation'].includes(key))))return false;
      if(item.text!==item.text.trim()||!/[A-Z“‘"'…]/.test(item.text[0])||!/[.!?…“”‘’"']$/.test(item.text)||['text','translation'].some(key=>item[key].split('\n').length>4||item[key].split('\n').some(line=>!line.trim())))return false;
      const normalized=item.text.replace(/[^\p{L}\p{N}]+/gu,'').toLowerCase();
      if(!/^[a-z][a-z0-9-]{1,63}$/.test(item.id)||ids.has(item.id)||!normalized||texts.has(normalized)||item.text.length>300||(item.text.match(/[A-Za-z]+(?:[’'-][A-Za-z]+)*/g)||[]).length>45||item.translation.length>120||item.note.length>160||!publicSource(item.url))return false;
      if(!Number.isInteger(item.first_published)||item.first_published<1||item.first_published>year-96||!Number.isInteger(item.author_died)||item.author_died<1||item.author_died>year-51)return false;
      const source=item.translation_source;
      if(source?.type==='site'){if(!sameKeys(source,['type']))return false;}
      else if(source?.type==='published'){if(!sameKeys(source,['type','name','url','translator_died'])||!publicText(source.name,250)||!publicSource(source.url)||!Number.isInteger(source.translator_died)||source.translator_died<1||source.translator_died>year-51)return false;}
      else return false;
      if(item.related!==undefined&&(typeof item.related!=='string'||!/^\/english\/[a-z][a-z0-9-]{1,63}\/$/.test(item.related)||['tools','play','quotes','map'].includes(item.related.split('/')[2])))return false;
      ids.add(item.id);texts.add(normalized);return true;
    });
  }
  function mount(options = {}) {
    const win = options.window, doc = options.document;
    if (!win || !doc?.getElementById) return {destroy() {}};
    const find = id => doc.getElementById(id), read = id => { try { return JSON.parse(find(id)?.textContent || 'null'); } catch (_) { return null; } };
    const now = options.now || (() => new Date()), random = options.random || Math.random;
    const classic = find('daily-quote-text') ? quotations(read('daily-content-data')) : [];
    const english = find('english-quote-text') ? englishQuotations(read('english-quotes-data'),now()) : [];
    const lang = () => String(win.SiteI18n?.lang?.() || doc.documentElement?.lang || 'zh-CN').startsWith('en') ? 'en' : 'zh-CN';
    // The persistent document element survives progressive page replacement.
    // This one-use handoff is only created by the language control, never saved.
    const carrier = doc.documentElement, handoff = carrier?.__dailyReadingTransfer;
    if (carrier) delete carrier.__dailyReadingTransfer;
    const poolKey = JSON.stringify(classic.map(item => item.id));
    const englishPoolKey = JSON.stringify(english.map(item=>item.id));
    const carried = handoff?.poolKey === poolKey && handoff.englishPoolKey === englishPoolKey && handoff.day === dayNumber(now()) && handoff.language === lang()
      && Number.isFinite(handoff.created) && now().getTime()-handoff.created >= 0 && now().getTime()-handoff.created < 120000 ? handoff : null;
    let disposed = false, today, language, classicDeck, englishDeck;
    const cleanups = [];
    function listen(target,type,handler,settings) { if (!target?.addEventListener) return; target.addEventListener(type,handler,settings); cleanups.push(() => target.removeEventListener(type,handler,settings)); }
    function write(id,value) { const element = find(id); if (element) element.textContent = value; }
    function renderButton(id,titleId,fallback) {
      const button = find(id); if (!button) return;
      const label = language === 'en' ? 'Another quote' : '换一句';
      button.textContent = label; button.setAttribute('aria-label',label+' · '+(find(titleId)?.textContent || fallback));
    }
    function renderClassic() {
      const item = classic[classicDeck?.current()]; if (!item) return;
      write('daily-quotation-title',language === 'en' ? 'Marxist quotations' : '马克思主义名句');
      write('marx-reading-entry',language === 'en' ? 'Read Marx & Engels (in Chinese) →' : '去读马恩 →');
      write('daily-quote-text',item.text[language]); write('daily-quote-author',item.author[language]); write('daily-quote-note',item.translation_note[language]);
      const link = find('daily-quote-work'); if (link) { link.href = typeof item.url === 'string' ? item.url : item.url[language]; link.textContent = item.work[language]+' ↗'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('hreflang',item.source_language?.[language] || language); link.setAttribute('lang',language); }
      if (find('daily-quote')) find('daily-quote').dataset.quoteId = item.id;
      renderButton('daily-quote-button','daily-quotation-title',language === 'en' ? 'Marxist quotations' : '马克思主义名句');
    }
    function renderEnglish() {
      const item=english[englishDeck?.current()];if(!item)return;
      write('english-quotation-title',language==='en'?'English quotations':'英语名句');
      write('english-quote-library-link',language==='en'?'Browse quotations (in Chinese) →':'名句库 →');
      write('english-quote-text',item.text);write('english-quote-translation',item.translation);
      const link=find('english-quote-work');
      if(link){link.href=item.url;link.textContent=item.author_zh+'（'+item.author_en+'） · '+item.work_zh+item.locator_zh+' ↗';link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('hreflang','en');}
      const source=item.translation_source;
      write('english-quote-note',item.work_en+' · '+item.locator_zh+'。'+item.note+' '+(source.type==='site'?'中文为本站译文（AI 辅助，逐句核对意思）。':'中文采用公版译本：'+source.name+'。'));
      const related=find('english-quote-related');if(related){related.hidden=!item.related;if(item.related){related.href=item.related;related.textContent='延伸阅读：学英语相关卡片 →';}else related.removeAttribute?.('href');}
      const translation=find('english-quote-translation-source');if(translation){translation.hidden=source.type!=='published';if(source.type==='published'){translation.href=source.url;translation.textContent='译文版本 ↗';}else translation.removeAttribute?.('href');}
      if(find('english-quote'))find('english-quote').dataset.quoteId=item.id;
      renderButton('english-quote-button','english-quotation-title',language==='en'?'English quotations':'英语名句');
    }
    function refresh(force) {
      if (disposed) return;
      const day = dayNumber(now()), selectedLanguage = lang();
      if (today !== day) { today = day; classicDeck = createDeck(classic.length,day,random,carried?.day === day ? carried.classic : null); englishDeck=createDeck(english.length,day,random,carried?.day===day?carried.english:null); force = true; }
      if (force || language !== selectedLanguage) { language = selectedLanguage; renderClassic(); renderEnglish(); }
    }
    const button = find('daily-quote-button');
    if (button) {
      button.hidden = classic.length < 2;
      if (classic.length > 1) listen(button,'click',() => { if (disposed) return; refresh(false); classicDeck.next(); renderClassic(); });
    }
    const englishButton=find('english-quote-button');
    if(englishButton){englishButton.hidden=english.length<2;if(english.length>1)listen(englishButton,'click',()=>{if(disposed)return;refresh(false);englishDeck.next();renderEnglish();});}
    refresh(true);
    let timer = null;
    if (classic.length || english.length) {
      timer = win.setInterval(() => refresh(false),60000);
      listen(doc,'visibilitychange',() => { if (!doc.hidden) refresh(false); });
      listen(doc,'click',event => {
        if (disposed || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const control = event.target.closest?.('.site-language-switch, [data-site-language-switch]');
        if (!control || control.getAttribute('target') === '_blank' || control.hasAttribute?.('download')) { if (carrier) delete carrier.__dailyReadingTransfer; return; }
        if (win.SiteI18n?.page?.().switchMode === 'history') return;
        refresh(false);
        const requested = control.getAttribute('data-site-language-switch'), target = ['zh-CN','en'].includes(requested) ? requested : language === 'en' ? 'zh-CN' : 'en';
        if (carrier && target !== language) carrier.__dailyReadingTransfer = {poolKey,englishPoolKey,day:today,language:target,created:now().getTime(),classic:classicDeck.snapshot(),english:englishDeck.snapshot()};
      },true);
      const unsubscribe = win.SiteI18n?.onChange?.(() => refresh(true)); if (typeof unsubscribe === 'function') cleanups.push(unsubscribe);
    }
    function destroy() { if (disposed) return; disposed = true; if (timer !== null) win.clearInterval(timer); cleanups.splice(0).reverse().forEach(cleanup => cleanup()); }
    win.SiteNavigation?.own?.(destroy);
    return {destroy};
  }
  return {dayNumber,createDeck,quotations,englishQuotations,mount};
});
