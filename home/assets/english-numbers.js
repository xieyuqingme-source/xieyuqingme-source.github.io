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
    if (/[零〇一二两三四五六七八九]/.test(input)) fail('第一版请用阿拉伯数字加单位，例如14亿；暂不识别纯汉字数词。');
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
    const chineseUnit = scaled >= CHINESE_UNITS.亿 * SCALE ? ['亿',CHINESE_UNITS.亿] : scaled >= CHINESE_UNITS.万 * SCALE ? ['万',CHINESE_UNITS.万] : ['',1n];
    return {
      digits:ratio(scaled,SCALE), grouped3:grouped(scaled,3), grouped4:grouped(scaled,4),
      chineseShort:ratio(scaled,chineseUnit[1] * SCALE) + chineseUnit[0],
      chineseWords:isInteger ? chineseWords(integer) : null,
      englishShort:englishShort(scaled),
      englishWords:isInteger && integer < 1000000000000000n ? englishWords(integer) : null
    };
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
    function refresh() {
      if (disposed) return;
      if (timer !== null) { win.clearTimeout(timer); timer = null; }
      error.textContent = ''; error.hidden = true; input.removeAttribute('aria-invalid');
      if (!input.value.trim()) { results.textContent = '输入数字，看看中英文怎样分节和读数。'; return; }
      try {
        const result = convert(input.value), list = doc.createElement('dl'); list.className = 'english-number-output';
        const rows = [
          ['三位分节',result.grouped3,'en'],['四位分节（演示用）',result.grouped4,'en'],
          ['中文简写',result.chineseShort,'zh-CN'],['中文读法',result.chineseWords || '含小数，暂不展开中文读法。','zh-CN'],
          ['英文简写',result.englishShort,'en'],['英文全拼',result.englishWords || (result.digits.includes('.') ? '含小数，暂不展开英文全拼。' : '英文全拼支持小于10¹⁵的整数。'),result.englishWords ? 'en' : 'zh-CN']
        ];
        for (const [label,value,language] of rows) {
          const term = doc.createElement('dt'), definition = doc.createElement('dd');
          term.textContent = label; definition.textContent = value; definition.lang = language;
          list.append(term,definition);
        }
        results.replaceChildren(list);
      } catch (failure) {
        results.replaceChildren(); input.setAttribute('aria-invalid','true'); error.textContent = failure instanceof NumberInputError ? failure.message : '暂时无法转换，请检查输入。'; error.hidden = false;
      }
    }
    listen(input,'input',() => { if (timer !== null) win.clearTimeout(timer); timer = win.setTimeout(refresh,160); });
    for (const button of root.querySelectorAll('[data-number-example]')) listen(button,'click',() => { input.value = button.getAttribute('data-number-example') || ''; refresh(); input.focus(); });
    function destroy() { if (disposed) return; disposed = true; if (timer !== null) win.clearTimeout(timer); cleanups.splice(0).reverse().forEach(cleanup => cleanup()); }
    win.SiteNavigation?.own?.(destroy);
    refresh();
    return {destroy,refresh};
  }
  return {SCALE,parse,convert,mount,NumberInputError};
});
