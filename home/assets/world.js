/* Progressive enhancement for the Chinese World archive and source directory. */
(function (global, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { global.HomeWorld = api; api.mount({window:global,document:global.document}); }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const INSTANCE = Symbol.for('home-world.mount'), BATCH = 50, MAX_INDEX_BYTES = 32 * 1024 * 1024;
  const FIELDS = ['id','date','title','source','url','day_url','lang','origin','date_basis','search_titles'];
  const ORIGINS = {'rss':'自动采集','release-import':'历史快照导入','legacy-manual':'旧人工样刊'};
  const BASIS = {
    published:'按原文发布时间的北京日期归档',
    'first-seen-missing':'原文发布时间缺失，按首次观测的北京日期归档',
    'first-seen-invalid':'原文没有有效的完整发布时间，按首次观测的北京日期归档',
    'first-seen-future':'原文发布时间晚于采集，按首次观测的北京日期归档',
    'legacy-edition':'按旧人工样刊日期归档，不代表当日自动采集'
  };
  // Unicode full case-fold exceptions after lowercasing; NFKC runs first.
  const FOLD = {"µ":"μ","ß":"ss","ŉ":"ʼn","ſ":"s","ǰ":"ǰ","ͅ":"ι","ΐ":"ΐ","ΰ":"ΰ","ς":"σ","ϐ":"β","ϑ":"θ","ϕ":"φ","ϖ":"π","ϰ":"κ","ϱ":"ρ","ϵ":"ε","և":"եւ","ᏸ":"Ᏸ","ᏹ":"Ᏹ","ᏺ":"Ᏺ","ᏻ":"Ᏻ","ᏼ":"Ᏼ","ᏽ":"Ᏽ","ᲀ":"в","ᲁ":"д","ᲂ":"о","ᲃ":"с","ᲄ":"т","ᲅ":"т","ᲆ":"ъ","ᲇ":"ѣ","ᲈ":"ꙋ","ẖ":"ẖ","ẗ":"ẗ","ẘ":"ẘ","ẙ":"ẙ","ẚ":"aʾ","ẛ":"ṡ","ὐ":"ὐ","ὒ":"ὒ","ὔ":"ὔ","ὖ":"ὖ","ᾀ":"ἀι","ᾁ":"ἁι","ᾂ":"ἂι","ᾃ":"ἃι","ᾄ":"ἄι","ᾅ":"ἅι","ᾆ":"ἆι","ᾇ":"ἇι","ᾐ":"ἠι","ᾑ":"ἡι","ᾒ":"ἢι","ᾓ":"ἣι","ᾔ":"ἤι","ᾕ":"ἥι","ᾖ":"ἦι","ᾗ":"ἧι","ᾠ":"ὠι","ᾡ":"ὡι","ᾢ":"ὢι","ᾣ":"ὣι","ᾤ":"ὤι","ᾥ":"ὥι","ᾦ":"ὦι","ᾧ":"ὧι","ᾲ":"ὰι","ᾳ":"αι","ᾴ":"άι","ᾶ":"ᾶ","ᾷ":"ᾶι","ι":"ι","ῂ":"ὴι","ῃ":"ηι","ῄ":"ήι","ῆ":"ῆ","ῇ":"ῆι","ῒ":"ῒ","ΐ":"ΐ","ῖ":"ῖ","ῗ":"ῗ","ῢ":"ῢ","ΰ":"ΰ","ῤ":"ῤ","ῦ":"ῦ","ῧ":"ῧ","ῲ":"ὼι","ῳ":"ωι","ῴ":"ώι","ῶ":"ῶ","ῷ":"ῶι","ꭰ":"Ꭰ","ꭱ":"Ꭱ","ꭲ":"Ꭲ","ꭳ":"Ꭳ","ꭴ":"Ꭴ","ꭵ":"Ꭵ","ꭶ":"Ꭶ","ꭷ":"Ꭷ","ꭸ":"Ꭸ","ꭹ":"Ꭹ","ꭺ":"Ꭺ","ꭻ":"Ꭻ","ꭼ":"Ꭼ","ꭽ":"Ꭽ","ꭾ":"Ꭾ","ꭿ":"Ꭿ","ꮀ":"Ꮀ","ꮁ":"Ꮁ","ꮂ":"Ꮂ","ꮃ":"Ꮃ","ꮄ":"Ꮄ","ꮅ":"Ꮅ","ꮆ":"Ꮆ","ꮇ":"Ꮇ","ꮈ":"Ꮈ","ꮉ":"Ꮉ","ꮊ":"Ꮊ","ꮋ":"Ꮋ","ꮌ":"Ꮌ","ꮍ":"Ꮍ","ꮎ":"Ꮎ","ꮏ":"Ꮏ","ꮐ":"Ꮐ","ꮑ":"Ꮑ","ꮒ":"Ꮒ","ꮓ":"Ꮓ","ꮔ":"Ꮔ","ꮕ":"Ꮕ","ꮖ":"Ꮖ","ꮗ":"Ꮗ","ꮘ":"Ꮘ","ꮙ":"Ꮙ","ꮚ":"Ꮚ","ꮛ":"Ꮛ","ꮜ":"Ꮜ","ꮝ":"Ꮝ","ꮞ":"Ꮞ","ꮟ":"Ꮟ","ꮠ":"Ꮠ","ꮡ":"Ꮡ","ꮢ":"Ꮢ","ꮣ":"Ꮣ","ꮤ":"Ꮤ","ꮥ":"Ꮥ","ꮦ":"Ꮦ","ꮧ":"Ꮧ","ꮨ":"Ꮨ","ꮩ":"Ꮩ","ꮪ":"Ꮪ","ꮫ":"Ꮫ","ꮬ":"Ꮬ","ꮭ":"Ꮭ","ꮮ":"Ꮮ","ꮯ":"Ꮯ","ꮰ":"Ꮰ","ꮱ":"Ꮱ","ꮲ":"Ꮲ","ꮳ":"Ꮳ","ꮴ":"Ꮴ","ꮵ":"Ꮵ","ꮶ":"Ꮶ","ꮷ":"Ꮷ","ꮸ":"Ꮸ","ꮹ":"Ꮹ","ꮺ":"Ꮺ","ꮻ":"Ꮻ","ꮼ":"Ꮼ","ꮽ":"Ꮽ","ꮾ":"Ꮾ","ꮿ":"Ꮿ","ﬀ":"ff","ﬁ":"fi","ﬂ":"fl","ﬃ":"ffi","ﬄ":"ffl","ﬅ":"st","ﬆ":"st","ﬓ":"մն","ﬔ":"մե","ﬕ":"մի","ﬖ":"վն","ﬗ":"մխ"};
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const exact = (value,keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key=>Object.hasOwn(value,key));
  const text = (value,maximum=500,empty=false) => typeof value === 'string' && (empty || value.trim().length > 0)
    && value.length <= maximum * 2 && [...value].length <= maximum && !/[\p{Cc}\p{Cs}<>]/u.test(value);
  const validMonth = value => typeof value === 'string' && /^(?!0000)\d{4}-(?:0[1-9]|1[0-2])$/.test(value);
  function validDay(value) {
    if (typeof value !== 'string' || !/^(?!0000)\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value)) return false;
    const [year,month,day] = value.split('-').map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return day <= [31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
  }
  function fold(value) {
    return [...String(value).normalize('NFKC').toLowerCase()].map(char=>FOLD[char] || char).join('');
  }
  function queryWords(value) {
    if (typeof value !== 'string' || value.length > 160) throw new Error('关键词最多 160 个字符。');
    return [...new Set(fold(value).trim().split(/\s+/u).filter(Boolean))];
  }
  function matchesTitle(item, words) {
    const haystack = (item.search_titles || [item.title]).map(fold).join('\n');
    return words.every(word=>haystack.includes(word));
  }
  function languages(value) { return typeof value === 'string' ? value.trim().split(/\s+/u).filter(Boolean) : []; }
  function matchesSource(item, filters) {
    return (filters.domain === 'all' || item.domain === filters.domain)
      && (filters.type === 'all' || item.type === filters.type)
      && (filters.language === 'all' || languages(item.languages).includes(filters.language));
  }
  function readFilters(search, known) {
    const params = new URLSearchParams(typeof search === 'string' ? search : '');
    return Object.fromEntries(['domain','type','language'].map(key=>{
      const values = params.getAll(key), value = values.length === 1 ? values[0] : 'all';
      return [key,known[key].has(value) ? value : 'all'];
    }));
  }
  function queryString(search, filters) {
    const params = new URLSearchParams(typeof search === 'string' ? search : '');
    for (const key of ['domain','type','language']) {
      params.delete(key);
      if (filters[key] && filters[key] !== 'all') params.set(key,filters[key]);
    }
    const result = params.toString();
    return result ? '?' + result : '';
  }
  function indexURL(value, month, origin) {
    if (!validMonth(month) || value !== '/world/search/' + month + '.json') return null;
    try {
      const url = new URL(value,origin);
      return url.origin === origin && !url.search && !url.hash && !url.username && !url.password ? url.href : null;
    } catch (_) { return null; }
  }
  function publicURL(value) {
    if (!text(value,2048) || !value.startsWith('https://')) return false;
    let decoded = value;
    for (let n=0;n<6;n++) {
      if (/[\u0000-\u0020\u007f\\]/u.test(decoded)) return false;
      const next = decoded.replace(/%([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
      if (next === decoded) break;
      decoded = next;
    }
    if (/[\u0000-\u0020\u007f\\]/u.test(decoded) || /%[0-9a-f]{2}/i.test(decoded)) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.hash && (!url.port || url.port === '443')
        && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname)
        && !/\.(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(url.hostname);
    } catch (_) { return false; }
  }
  function validateMonths(data,origin) {
    if (!exact(data,['version','months','default_month']) || data.version !== 1 || !Array.isArray(data.months)
        || data.months.length > 120000 || typeof data.default_month !== 'string') throw new Error('月份索引不可用。');
    const months = new Map();
    for (const item of data.months) {
      if (!exact(item,['month','url']) || months.has(item.month)) throw new Error('月份索引不可用。');
      const url = indexURL(item.url,item.month,origin);
      if (!url) throw new Error('月份索引不可用。');
      months.set(item.month,url);
    }
    if (months.size && !months.has(data.default_month)) throw new Error('月份索引不可用。');
    if (!months.size && data.default_month !== '') throw new Error('月份索引不可用。');
    return {months,defaultMonth:data.default_month};
  }
  function validateIndex(data,month) {
    if (!validMonth(month) || !exact(data,['version','available','exists','message','month','items']) || data.version !== 1
        || data.month !== month || typeof data.available !== 'boolean' || typeof data.exists !== 'boolean'
        || !text(data.message,500,true) || !Array.isArray(data.items) || data.items.length > 62000
        || (!data.available && data.exists) || ((!data.available || !data.exists) && data.items.length))
      throw new Error('标题索引格式不正确。');
    const ids = new Set();
    for (const item of data.items) {
      if (!exact(item,FIELDS) || typeof item.id !== 'string' || !/^news-[0-9a-f]{20}$/.test(item.id) || ids.has(item.id)
          || !validDay(item.date) || !item.date.startsWith(month+'-') || !text(item.title) || !text(item.source,100)
          || !publicURL(item.url) || item.day_url !== '/world/' + item.date.replace(/-/g,'/') + '/'
          || !['zh-CN','zh-Hant','en'].includes(item.lang) || !Object.hasOwn(ORIGINS,item.origin) || !Object.hasOwn(BASIS,item.date_basis)
          || (item.date_basis === 'legacy-edition' && item.origin !== 'legacy-manual')
          || !Array.isArray(item.search_titles) || !item.search_titles.length || item.search_titles.length > 121
          || !item.search_titles.every(title=>text(title)) || !item.search_titles.includes(item.title)
          || new Set(item.search_titles).size !== item.search_titles.length) throw new Error('标题索引格式不正确。');
      ids.add(item.id);
    }
    return data;
  }
  async function readResponse(response, limit=MAX_INDEX_BYTES) {
    async function reject(message) {
      try { await response.body?.cancel?.(); } catch (_) { /* The request may already have ended. */ }
      throw new Error(message);
    }
    if (!response.ok) return reject('标题索引暂时无法读取。');
    const type = response.headers?.get?.('content-type') || '';
    if (!/^(?:application|text)\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(type)) return reject('标题索引格式不正确。');
    const length = response.headers?.get?.('content-length');
    if (length !== null && length !== undefined && length !== '' && (!/^\d+$/.test(length) || Number(length) > limit))
      return reject('标题索引超过读取上限。');
    let raw;
    if (response.body?.getReader) {
      const reader = response.body.getReader(), decoder = new TextDecoder('utf-8',{fatal:true}), chunks = [];
      let size = 0;
      try {
        while (true) {
          const {done,value} = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) { await reader.cancel(); throw new Error('标题索引超过读取上限。'); }
          chunks.push(decoder.decode(value,{stream:true}));
        }
        chunks.push(decoder.decode());
        raw = chunks.join('');
      } finally { reader.releaseLock?.(); }
    } else {
      raw = await response.text();
      if (new TextEncoder().encode(raw).byteLength > limit) throw new Error('标题索引超过读取上限。');
    }
    try { return JSON.parse(raw); } catch (_) { throw new Error('标题索引格式不正确。'); }
  }
  function mount(options={}) {
    const win = options.window, doc = options.document, root = options.root || doc?.querySelector?.('[data-world]');
    if (!win || !doc || !root) return {refresh(){},state(){return {};},destroy(){}};
    if (root[INSTANCE]) return root[INSTANCE];
    const pathname = win.location?.pathname, cleanups = [], restores = [], caches = new Map();
    let disposed = false, ticket = 0, controller = null, directoryState = null, searchState = null;
    const active = () => !disposed && (pathname === undefined || win.location?.pathname === pathname);
    function listen(target,type,fn) {
      target.addEventListener(type,fn); cleanups.push(()=>target.removeEventListener(type,fn));
    }
    function hideLater(node) { const hidden = node.hidden; restores.push(()=>{node.hidden=hidden;}); }
    function restoreValue(node) { const value = node.value; restores.push(()=>{node.value=value;}); }
    function restoreText(node) { const value = node.textContent; restores.push(()=>{node.textContent=value;}); }
    function stopSearch() { ticket++; controller?.abort(); controller=null; if (searchState) searchState.loading=false; }
    const directory = root.querySelector('[data-source-directory]');
    let refreshDirectory = ()=>{};
    if (directory) {
      const form = directory.querySelector('[data-source-filters]'), count = directory.querySelector('[data-source-count]'), empty = directory.querySelector('[data-source-empty]');
      const fields = form && Object.fromEntries(['domain','type','language'].map(key=>[key,form.querySelector('select[name="'+key+'"]')]));
      if (form && count && empty && Object.values(fields).every(Boolean)) {
        const cards = [...directory.querySelectorAll('[data-source-card]')], cells = [...directory.querySelectorAll('[data-source-cell]')], domains = [...directory.querySelectorAll('[data-source-domain]')];
        const known = Object.fromEntries(Object.entries(fields).map(([key,select])=>[key,new Set(['all',...[...select.options].map(option=>option.value)])]));
        let filters = readFilters(win.location?.search,known);
        directoryState = filters;
        const typeFilter=directory.getAttribute('data-source-type-filter');
        restores.push(()=>{if(typeFilter===null)directory.removeAttribute('data-source-type-filter');else directory.setAttribute('data-source-type-filter',typeFilter);});
        [form,empty,...cards,...cells,...domains].forEach(hideLater); restoreText(count); Object.values(fields).forEach(restoreValue);
        function apply(save=false) {
          if (!active()) return;
          let matched=0;
          for (const card of cards) { card.hidden=!matchesSource(card.dataset,filters); if(!card.hidden)matched++; }
          for (const cell of cells) cell.hidden=![...cell.querySelectorAll('[data-source-card]')].some(card=>!card.hidden);
          for (const section of domains) section.hidden=![...section.querySelectorAll('[data-source-card]')].some(card=>!card.hidden);
          for (const key of ['domain','type','language']) fields[key].value=filters[key];
          count.textContent='显示 '+matched+' / '+cards.length+' 个来源'; empty.hidden=matched!==0;
          directory.setAttribute('data-source-type-filter',filters.type);
          form.hidden=false;
          if (save && win.history?.replaceState && win.location) {
            const next=win.location.pathname+queryString(win.location.search,filters)+(win.location.hash||'');
            const current=win.location.pathname+win.location.search+(win.location.hash||'');
            if(next!==current)try{win.history.replaceState(win.history.state,'',next);}catch(_){/* Local filtering also works without history access. */}
          }
        }
        function change() {
          filters=Object.fromEntries(Object.entries(fields).map(([key,select])=>[key,known[key].has(select.value)?select.value:'all']));
          directoryState=filters;apply(true);
        }
        Object.values(fields).forEach(field=>listen(field,'change',change));
        listen(form,'submit',event=>{event.preventDefault();change();});
        listen(form,'reset',event=>{event.preventDefault();filters={domain:'all',type:'all',language:'all'};directoryState=filters;apply(true);});
        listen(win,'popstate',()=>{filters=readFilters(win.location?.search,known);directoryState=filters;apply();});
        refreshDirectory=()=>apply(); apply();
      }
    }
    const form = root.querySelector('[data-world-search]'), status = root.querySelector('[data-world-search-status]'), results = root.querySelector('[data-world-search-results]');
    const month = form?.querySelector('select[name="month"]'), query = form?.querySelector('input[name="q"]'), manifest = root.querySelector('#world-search-months');
    if (form && status && results && month && query && manifest) {
      let config;
      try { config=validateMonths(JSON.parse(manifest.textContent),win.location.origin); } catch (_) { config=null; }
      if (config?.months.size && typeof win.fetch === 'function') {
        [form].forEach(hideLater); [month,query].forEach(restoreValue); restoreText(status);
        const children=[...results.childNodes], busy=results.getAttribute('aria-busy');
        restores.push(()=>{results.replaceChildren(...children);if(busy===null)results.removeAttribute('aria-busy');else results.setAttribute('aria-busy',busy);});
        let more=root.querySelector('[data-world-search-more]'), createdMore=false, hits=[], shown=0;
        if (!more) {
          more=doc.createElement('button');more.type='button';more.className='world-search-more';more.setAttribute('data-world-search-more','');more.hidden=true;
          results.insertAdjacentElement('afterend',more);createdMore=true;
        } else { hideLater(more);restoreText(more); }
        if(createdMore)restores.push(()=>more.remove());
        month.value=config.defaultMonth; form.hidden=false;
        searchState={month:month.value,query:'',shown:0,total:0,loading:false,status:'idle'};
        function clear() {hits=[];shown=0;results.replaceChildren();more.hidden=true;results.removeAttribute('aria-busy');searchState.shown=0;searchState.total=0;}
        function message(value,fallback=false) {
          status.replaceChildren(doc.createTextNode(value));
          if (fallback && config.months.has(month.value)) {
            const link=doc.createElement('a');link.href='/world/'+month.value.replace('-','/')+'/';link.textContent='查看该月全部存档';link.className='world-search-fallback';
            status.appendChild(doc.createTextNode(' '));status.appendChild(link);
          }
        }
        function renderMore() {
          if(!active())return;
          const end=Math.min(shown+BATCH,hits.length);
          for(const item of hits.slice(shown,end)) {
            const li=doc.createElement('li');li.className='world-search-result';
            const title=doc.createElement('a');title.className='world-search-title';title.href=item.url;title.target='_blank';title.rel='noopener noreferrer';title.lang=item.lang;title.textContent=item.title;
            const meta=doc.createElement('p');meta.className='world-search-meta';meta.appendChild(doc.createTextNode(item.source+' · '));
            const date=doc.createElement('time');date.dateTime=item.date;date.textContent='归档 '+item.date;meta.appendChild(date);meta.appendChild(doc.createTextNode(' · '));
            const archive=doc.createElement('a');archive.href=item.day_url;archive.textContent='当天存档';meta.appendChild(archive);
            const note=doc.createElement('p');note.className='world-search-note';note.textContent=ORIGINS[item.origin]+' · '+BASIS[item.date_basis]+(item.origin==='legacy-manual'?' · 标题沿用旧人工样刊':'');
            li.appendChild(title);li.appendChild(meta);li.appendChild(note);results.appendChild(li);
          }
          shown=end;searchState.shown=shown;searchState.total=hits.length;more.hidden=shown===hits.length;
          more.textContent='再显示 '+Math.min(BATCH,hits.length-shown)+' 条';
          message('找到 '+hits.length+' 条标题，已显示 '+shown+' 条。');
        }
        async function submit(event) {
          event.preventDefault();if(!active())return;
          stopSearch();clear();searchState.month=month.value;searchState.query=query.value;searchState.status='idle';
          let words;
          try {words=queryWords(query.value);} catch(error) {searchState.status='invalid-query';message(error.message);return;}
          if(!words.length){message('请输入要查找的标题关键词。');return;}
          if(!config.months.has(month.value)){searchState.status='invalid-month';message('请选择已收录的月份。');return;}
          const selected=month.value, revision=ticket;
          controller=new win.AbortController();searchState.loading=true;searchState.status='loading';results.setAttribute('aria-busy','true');message('正在检索 '+selected+'…');
          try {
            let data=caches.get(selected);
            if(!data){
              const response=await win.fetch(config.months.get(selected),{credentials:'same-origin',redirect:'error',signal:controller.signal});
              if(!active()||revision!==ticket){try{await response.body?.cancel?.();}catch(_){}return;}
              const raw=await readResponse(response);
              if(!active()||revision!==ticket)return;
              data=validateIndex(raw,selected);
              if(!active()||revision!==ticket)return;
              if(data.available&&data.exists)caches.set(selected,data);
            }
            if(!active()||revision!==ticket)return;
            results.removeAttribute('aria-busy');searchState.loading=false;controller=null;
            if(!data.available){searchState.status='unavailable';message('存档暂不可用，请稍后重试。',true);return;}
            if(!data.exists){searchState.status='no-archive';message('该月无存档。',true);return;}
            hits=data.items.filter(item=>matchesTitle(item,words));
            if(!hits.length){searchState.status='empty';message(data.items.length?'没有找到同时包含这些关键词的标题。':'本月有存档，但没有可检索的标题。',true);return;}
            searchState.status='results';renderMore();
          }catch(error){
            if(!active()||revision!==ticket)return;
            results.removeAttribute('aria-busy');searchState.loading=false;controller?.abort();controller=null;searchState.status='error';
            message(error.message==='标题索引超过读取上限。'?error.message:'标题检索暂不可用，请按月份浏览。',true);
          }
        }
        listen(form,'submit',submit);listen(more,'click',renderMore);
        listen(month,'change',()=>{if(!active())return;stopSearch();clear();searchState.month=month.value;searchState.status='idle';message('月份已切换，请输入关键词后检索。');});
        listen(form,'reset',event=>{event.preventDefault();if(!active())return;stopSearch();clear();month.value=config.defaultMonth;query.value='';Object.assign(searchState,{month:month.value,query:'',status:'idle'});message('请输入标题关键词，检索所选月份。');});
      }
    }
    function destroy() {
      if(disposed)return;disposed=true;stopSearch();caches.clear();
      cleanups.splice(0).reverse().forEach(fn=>fn());restores.splice(0).reverse().forEach(fn=>fn());
      if(root[INSTANCE]===api)delete root[INSTANCE];
    }
    const api={refresh(){if(active())refreshDirectory();},state(){return {sources:directoryState&&{...directoryState},search:searchState&&{...searchState}};},destroy};
    root[INSTANCE]=api;
    if(options.scope?.own)options.scope.own(destroy);else win.SiteNavigation?.own?.(destroy);
    return api;
  }
  return {BATCH,MAX_INDEX_BYTES,fold,queryWords,matchesTitle,matchesSource,readFilters,queryString,indexURL,publicURL,validateMonths,validateIndex,readResponse,mount};
});

