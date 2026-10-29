/* Exact, local conversion between Chinese and English number groupings. */
(function (factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { window.EnglishNumbers = api; api.mount({window,document}); }
})(function () {
  'use strict';
  const SCALE = 10000n, LIMIT = 10000000000000000n * SCALE;
  const CHINESE_UNITS = {十:10n,百:100n,千:1000n,万:10000n,亿:100000000n};
  const ENGLISH_UNITS = {thousand:1000n,million:1000000n,billion:1000000000n,trillion:1000000000000n};
  class NumberInputError extends Error { constructor(message) { super(message); this.name = 'NumberInputError'; } }
  function fail(message) { throw new NumberInputError(message); }
  function coefficient(value) {
    const input = value.trim();
    const match = /^(\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?: \d{3})+)(?:\.(\d{1,4}))?$/.exec(input);
    if (!match) fail('请输入有效数字；逗号或空格须按三位分节，小数最多4位。');
    return BigInt(match[1].replace(/[, ]/g,'')) * SCALE + BigInt((match[2] || '').padEnd(4,'0'));
  }
  function parse(value) {
    if (typeof value !== 'string') fail('请输入数字，例如14亿或1.4 billion。');
    let input = value.normalize('NFKC').trim();
    if (!input) fail('请输入数字，例如14亿或1.4 billion。');
    if (input.length > 160) fail('输入太长，请使用数字和单位的简短写法。');
    if (input.includes('兆')) fail('“兆”在不同地区含义不同，请改用万、亿或trillion。');
    if (/[零〇一二两三四五六七八九]/.test(input)) fail('请用阿拉伯数字加单位，例如14亿；暂不识别纯汉字数词。');
    if (/^-/.test(input)) fail('请输入大于或等于0的数字。');
    let scaled;
    const english = /^(a|[\d., ]+)\s*(thousand|million|billion|trillion)$/i.exec(input);
    if (english) {
      scaled = (english[1].toLowerCase() === 'a' ? SCALE : coefficient(english[1])) * ENGLISH_UNITS[english[2].toLowerCase()];
    } else if (/[十百千万亿]/.test(input)) {
      input = input.replace(/\s*([十百千万亿])\s*/g,'$1');
      const token = /([0-9][0-9., ]*)([十百千万亿]?)/gy;
      let offset = 0, previousUnit = null;
      scaled = 0n;
      while (offset < input.length) {
        token.lastIndex = offset;
        const part = token.exec(input);
        if (!part || !part[0]) fail('中文单位写法有误，请参考1亿2000万或2万5千。');
        const unit = part[2] ? CHINESE_UNITS[part[2]] : 1n;
        if (previousUnit !== null && unit >= previousUnit) fail('请按从大到小的顺序写单位，例如1亿2000万。');
        scaled += coefficient(part[1]) * unit;
        previousUnit = unit;
        offset = token.lastIndex;
        if (!part[2] && offset !== input.length) fail('中文单位写法有误，请参考1亿2000万或2万5千。');
      }
    } else scaled = coefficient(input);
    if (scaled < 0n || scaled >= LIMIT) fail('支持的范围是0到小于10¹⁶；请缩小数字。');
    return scaled;
  }
  function ratio(value,denominator) {
    const integer = value / denominator, remainder = value % denominator;
    if (!remainder) return integer.toString();
    return integer + '.' + remainder.toString().padStart(denominator.toString().length - 1,'0').replace(/0+$/,'');
  }
  function grouped(value,size) {
    const [integer,fraction] = ratio(value,SCALE).split('.');
    const groups = [];
    for (let end = integer.length; end > 0; end -= size) groups.unshift(integer.slice(Math.max(0,end-size),end));
    return groups.join(',') + (fraction ? '.' + fraction : '');
  }
  function grouping(value,size) {
    const [integer,fraction] = ratio(value,SCALE).split('.'), groups = [];
    const labels = size === 4 ? ['个','万','亿','万亿'] : ['ones','thousand','million','billion','trillion','quadrillion'];
    for (let end = integer.length; end > 0; end -= size) groups.unshift(integer.slice(Math.max(0,end-size),end));
    return groups.map((digits,index) => ({digits:digits + (index === groups.length - 1 && fraction ? '.' + fraction : ''),label:labels[groups.length - index - 1]}));
  }
  function chineseShort(scaled) {
    if (scaled < CHINESE_UNITS.万 * SCALE) return ratio(scaled,SCALE);
    const integer = scaled / SCALE, fraction = scaled % SCALE;
    const yi = integer / CHINESE_UNITS.亿, wan = integer % CHINESE_UNITS.亿 / CHINESE_UNITS.万;
    const ones = integer % CHINESE_UNITS.万;
    let text = yi ? yi + '亿' : '';
    if (wan) text += wan + '万';
    if (ones || fraction) text += ratio(ones * SCALE + fraction,SCALE);
    return text;
  }
  function chineseApprox(scaled) {
    const unit = scaled >= CHINESE_UNITS.亿 * SCALE ? ['亿',CHINESE_UNITS.亿] : scaled >= CHINESE_UNITS.万 * SCALE ? ['万',CHINESE_UNITS.万] : ['',1n];
    const denominator = unit[1] * SCALE;
    return scaled % denominator ? '约' + (scaled + denominator / 2n) / denominator + unit[0] : null;
  }
  function chineseWords(integer) {
    if (integer === 0n) return '零';
    const digits = '零一二三四五六七八九', smallUnits = ['','十','百','千'], largeUnits = ['','万','亿','万亿'];
    function block(value) {
      let result = '', zero = false;
      for (let power = 3; power >= 0; power--) {
        const divisor = 10n ** BigInt(power), digit = value / divisor;
        value %= divisor;
        if (digit) { if (zero && result) result += '零'; result += digits[Number(digit)] + smallUnits[power]; zero = false; }
        else if (result && value) zero = true;
      }
      return result;
    }
    const blocks = [];
    while (integer) { blocks.push(integer % 10000n); integer /= 10000n; }
    let result = '', skipped = false;
    for (let index = blocks.length - 1; index >= 0; index--) {
      if (!blocks[index]) { if (result) skipped = true; continue; }
      if (result && (skipped || blocks[index] < 1000n)) result += '零';
      result += block(blocks[index]) + largeUnits[index];
      skipped = false;
    }
    return result.replace(/^一十/,'十');
  }
  function englishWords(integer) {
    if (integer === 0n) return 'zero';
    const units = ['','thousand','million','billion','trillion'];
    const small = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
    const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
    function block(value) {
      const words = [];
      if (value >= 100) { words.push(small[Math.floor(value / 100)] + ' hundred'); value %= 100; }
      if (value >= 20) words.push(tens[Math.floor(value / 10)] + (value % 10 ? '-' + small[value % 10] : ''));
      else if (value) words.push(small[value]);
      return words.join(' ');
    }
    const parts = [];
    for (let index = 0; integer; index++, integer /= 1000n) {
      const value = Number(integer % 1000n);
      if (value) parts.unshift(block(value) + (units[index] ? ' ' + units[index] : ''));
    }
    return parts.join(' ');
  }
  function englishShort(scaled) {
    const units = [['',1n],...Object.entries(ENGLISH_UNITS)];
    let index = 0;
    for (let candidate = 1; candidate < units.length; candidate++) if (scaled >= units[candidate][1] * SCALE) index = candidate;
    function rounded(place) { const denominator = units[place][1] * SCALE; return (scaled * 100n + denominator / 2n) / denominator; }
    if (index < units.length - 1 && rounded(index) >= 100000n) index++;
    const denominator = units[index][1] * SCALE, hundredths = rounded(index);
    const approximate = hundredths * denominator !== scaled * 100n;
    return (approximate ? '≈ ' : '') + ratio(hundredths,100n) + (units[index][0] ? ' ' + units[index][0] : '');
  }
  function convert(value) {
    const scaled = parse(value), integer = scaled / SCALE, isInteger = scaled % SCALE === 0n;
    return {
      digits:ratio(scaled,SCALE), grouped3:grouped(scaled,3), grouped4:grouped(scaled,4),
      groups3:grouping(scaled,3),groups4:grouping(scaled,4),
      chineseShort:chineseShort(scaled),chineseApprox:chineseApprox(scaled),
      chineseWords:isInteger ? chineseWords(integer) : null,
      englishShort:englishShort(scaled),
      englishWords:isInteger && integer < 1000000000000000n ? englishWords(integer) : null
    };
  }

  // These are quantities for language practice, not assertions about real data.
  const PRACTICE_VALUES = Object.freeze(['25000','486000','1234500','9600000','83000000','120000000','125000000','1400000000','2500000000','72000000000','250000000000','2000000000000','75000000000000','100020003','100000001','9999999999999999']);
  function exactEnglish(scaled) {
    let selected = ['thousand', ENGLISH_UNITS.thousand];
    for (const entry of Object.entries(ENGLISH_UNITS)) {
      const denominator = entry[1] * SCALE;
      if (scaled >= denominator && scaled * 10000n % denominator === 0n) selected = entry;
    }
    return ratio(scaled,selected[1] * SCALE) + ' ' + selected[0];
  }
  function createPractice(options = {}) {
    const random = typeof options.random === 'function' ? options.random : Math.random;
    let mode = options.mode || 'zh-en', selected = -1, bag = [];
    function validMode(value) { if (!['zh-en','en-zh'].includes(value)) fail('请选择中译英或英译中。');return value; }
    validMode(mode);
    function refill() {
      bag = PRACTICE_VALUES.map((_,index)=>index);
      for (let index=bag.length-1;index>0;index--) {
        const value=Number(random()),bounded=Number.isFinite(value)?Math.max(0,Math.min(1-Number.EPSILON,value)):0;
        const other=Math.floor(bounded*(index+1));[bag[index],bag[other]]=[bag[other],bag[index]];
      }
      if (bag[0]===selected&&bag.length>1) [bag[0],bag[1]]=[bag[1],bag[0]];
    }
    function current() {
      const digits=PRACTICE_VALUES[selected],scaled=parse(digits),english=exactEnglish(scaled),chinese=convert(digits).chineseShort;
      const number=mode==='zh-en'?chinese:english,expected=mode==='zh-en'?english:chinese;
      const hint=mode==='zh-en'?'请用数字加 thousand、million、billion 或 trillion。':'请用阿拉伯数字加万、亿；需要时可以混合单位。';
      return {id:'number-'+mode+'-'+selected,mode,digits,number,expected,hint,prompt:'把「'+number+'」改用'+(mode==='zh-en'?'英文数量单位':'万、亿')+'来写。'};
    }
    function next() { if (!bag.length) refill();selected=bag.shift();return current(); }
    function setMode(value) { value=validMode(value);if(value===mode)return current();mode=value;return next(); }
    function check(value) {
      const question=current(),input=typeof value==='string'?value.normalize('NFKC').trim():'';
      if (!input) return {correct:false,kind:'invalid',message:'先输入一个答案，再检查。',expected:question.expected};
      const english=/\b(?:thousand|million|billion|trillion)\b/i.test(input),chinese=/[十百千万亿]/.test(input);
      if (mode==='zh-en' ? !english||chinese : !/[万亿]/.test(input)||english) {
        return {correct:false,kind:'format',message:question.hint,expected:question.expected};
      }
      let answer;
      try { answer=parse(input); }
      catch (error) { return {correct:false,kind:'invalid',message:error instanceof NumberInputError?error.message:'请检查数字和单位的写法。',expected:question.expected}; }
      const correct=answer===parse(question.digits);
      return {correct,kind:correct?'correct':'incorrect',message:correct?'答对了：'+question.number+' = '+question.expected+'。':'数值还没对上。参考写法：'+question.expected+'。',expected:question.expected};
    }
    next();
    return {current,next,setMode,check};
  }

  function mount(options = {}) {
    const win = options.window, doc = options.document;
    const root = doc?.querySelector?.('[data-english-numbers]');
    if (!win || !root) return {destroy() {}};
    const input = doc.getElementById('english-number-input'), results = doc.getElementById('english-number-results'), error = doc.getElementById('english-number-error');
    if (!input || !results || !error) return {destroy() {}};
    let disposed = false, timer = null;
    const cleanups = [];
    function listen(target,type,handler) { target.addEventListener(type,handler); cleanups.push(() => target.removeEventListener(type,handler)); }
    function drawGroups(definition,groups,language) {
      const strip = doc.createElement('span'); strip.className = 'english-number-groups';
      strip.setAttribute('role','group');strip.setAttribute('aria-label',language === 'en' ? '英文三位分组' : '中文四位分组');
      groups.forEach((group,index) => {
        if (index) { const separator = doc.createElement('span');separator.className='english-number-separator';separator.textContent=',';separator.setAttribute('aria-hidden','true');strip.append(separator); }
        const chunk = doc.createElement('span'),digits = doc.createElement('b'),label = doc.createElement('small');
        chunk.className='english-number-group';digits.textContent=group.digits;digits.lang='en';label.textContent=group.label;label.lang=language;
        chunk.append(digits,label);strip.append(chunk);
      });
      definition.append(strip);
    }
    function refresh() {
      if (disposed) return;
      if (timer !== null) { win.clearTimeout(timer); timer = null; }
      error.textContent = ''; error.hidden = true; input.removeAttribute('aria-invalid');
      if (!input.value.trim()) { results.textContent = '输入数字，看看中英文怎样分节和读数。'; return; }
      try {
        const result = convert(input.value), list = doc.createElement('dl'); list.className = 'english-number-output';
        const rows = [
          ['三位分节',result.grouped3,'en'],['四位分节',result.grouped4,'zh-CN'],
          ['中文简写',result.chineseShort,'zh-CN'],['中文读法',result.chineseWords || '含小数，暂不展开中文读法。','zh-CN'],
          ['英文简写',result.englishShort,'en'],['英文全拼',result.englishWords || (result.digits.includes('.') ? '含小数，暂不展开英文全拼。' : '英文全拼支持小于10¹⁵的整数。'),result.englishWords ? 'en' : 'zh-CN']
        ];
        for (const [label,value,language] of rows) {
          const term = doc.createElement('dt'), definition = doc.createElement('dd');
          term.textContent = label; definition.lang = language;
          if (label === '三位分节') drawGroups(definition,result.groups3,'en');
          else if (label === '四位分节') drawGroups(definition,result.groups4,'zh-CN');
          else { definition.textContent = value; if (label === '中文简写' && result.chineseApprox) { const approximate=doc.createElement('small');approximate.className='english-number-approx';approximate.textContent=result.chineseApprox;definition.append(approximate); } }
          list.append(term,definition);
        }
        results.replaceChildren(list);
      } catch (failure) {
        results.replaceChildren(); input.setAttribute('aria-invalid','true'); error.textContent = failure instanceof NumberInputError ? failure.message : '暂时无法转换，请检查输入。'; error.hidden = false;
      }
    }
    listen(input,'input',() => { if (timer !== null) win.clearTimeout(timer); timer = win.setTimeout(refresh,160); });
    listen(input,'keydown',event => { if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) refresh(); });
    for (const button of root.querySelectorAll('[data-number-example]')) listen(button,'click',() => { input.value = button.getAttribute('data-number-example') || ''; refresh(); input.focus(); });

    let practice = null;
    const practiceRoot = doc.querySelector?.('[data-number-practice]');
    if (typeof practiceRoot?.querySelector === 'function') {
      const question=practiceRoot.querySelector('[data-number-practice-question]'),answer=practiceRoot.querySelector('[data-number-practice-answer]');
      const feedback=practiceRoot.querySelector('[data-number-practice-feedback]'),checkButton=practiceRoot.querySelector('[data-number-practice-check]'),nextButton=practiceRoot.querySelector('[data-number-practice-next]');
      const modes=[...practiceRoot.querySelectorAll('[data-number-practice-mode]')];
      if (question&&answer&&feedback&&checkButton&&nextButton&&modes.length) {
        practice=createPractice({random:options.random});
        let composing=false;
        function clearFeedback() { if(disposed)return;feedback.textContent='';feedback.hidden=true;feedback.removeAttribute('data-result');answer.removeAttribute('aria-invalid'); }
        function drawPractice(focus=false) {
          if(disposed)return;
          const state=practice.current();question.textContent=state.prompt;
          practiceRoot.setAttribute('data-mode',state.mode);answer.setAttribute('placeholder',state.hint);
          for(const button of modes)button.setAttribute('aria-pressed',String(button.getAttribute('data-number-practice-mode')===state.mode));
          answer.value='';clearFeedback();if(focus)answer.focus();
        }
        function grade() {
          if(disposed||composing)return;
          const result=practice.check(answer.value);feedback.textContent=result.message;feedback.hidden=false;feedback.setAttribute('data-result',result.kind);
          if(result.kind==='invalid'||result.kind==='format')answer.setAttribute('aria-invalid','true');else answer.removeAttribute('aria-invalid');
        }
        listen(answer,'input',clearFeedback);
        listen(answer,'compositionstart',()=>{composing=true;});
        listen(answer,'compositionend',()=>{composing=false;});
        listen(answer,'keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&!composing&&event.keyCode!==229){event.preventDefault?.();grade();}});
        listen(checkButton,'click',grade);
        listen(nextButton,'click',()=>{if(disposed)return;practice.next();drawPractice(true);});
        for(const button of modes)listen(button,'click',()=>{if(disposed)return;const mode=button.getAttribute('data-number-practice-mode');if(mode!==practice.current().mode){practice.setMode(mode);drawPractice(true);}});
        practiceRoot.hidden=false;drawPractice();
      }
    }

    function destroy() { if (disposed) return; disposed = true; if (timer !== null) win.clearTimeout(timer); cleanups.splice(0).reverse().forEach(cleanup => cleanup()); }
    win.SiteNavigation?.own?.(destroy);
    refresh();
    return {destroy,refresh,practice};
  }
  return {SCALE,parse,convert,createPractice,mount,NumberInputError};
});
