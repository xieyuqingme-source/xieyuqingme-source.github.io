/* Original-number teaching tools. No network, storage, or personal data. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) { root.ReadMarxLab = api; api.mount(root.document, root); }
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12;
  function valueFormStep(index) {
    return Number.isInteger(index) && index >= 0 && index < 4 ? index : null;
  }
  function percent(value) {
    const rounded = Math.round(value * 10) / 10;
    const approximate = Math.abs(value - rounded) > Number.EPSILON * 16 * Math.max(1, Math.abs(value));
    return (approximate ? '约' : '') + new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 1}).format(rounded) + '%';
  }
  function workingDay(total, necessary) {
    if (!valid(total) || !valid(necessary) || total > 24 || necessary <= 0 || necessary > total) {
      return {valid: false, message: '必要劳动须大于0，且不超过工作日；工作日不超过24小时。'};
    }
    const surplus = total - necessary;
    const rate=surplus / necessary * 100;
    if(!Number.isFinite(rate))return {valid:false,message:'必要劳动过小，比率超出本工具的有限计算范围。'};
    return {valid: true, total, necessary, surplus, rate};
  }
  function reproduction(values) {
    if (!Array.isArray(values) || values.length !== 6 || !values.every(valid)) {
      return {valid: false, message: '请为六项输入0至一万亿之间的有限非负数。'};
    }
    const [ic, iv, im, iic, iiv, iim] = values;
    const first = ic + iv + im, second = iic + iiv + iim;
    const outward = iv + im, inward = iic, difference = outward - inward;
    const balanced = Math.abs(difference) <= Number.EPSILON * 16 * Math.max(1, outward, inward);
    const firstRate=iv===0?null:im/iv*100,secondRate=iiv===0?null:iim/iiv*100;
    if([firstRate,secondRate].some(rate=>rate!==null&&!Number.isFinite(rate)))return {valid:false,message:'可变资本过小，比率超出本工具的有限计算范围。'};
    return {valid: true, first, second, total: first + second, outward, inward, difference, balanced,firstRate,secondRate};
  }
  function mount(doc, win) {
    const root = doc.querySelector('[data-me-lab]');
    if (!root) return () => {};
    const cleanups = [];
    const listen = (node, type, handler) => { node.addEventListener(type, handler); cleanups.push(() => node.removeEventListener(type, handler)); };
    const format = value => new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 3}).format(value);
    const stages = [...root.querySelectorAll('[data-lab-step]')];
    if (stages.length === 4) {
      const controls = root.querySelector('[data-lab-step-controls]');
      let index = 0;
      const show = (next, focus = false) => {
        if (valueFormStep(next) === null) return;
        index = next;
        stages.forEach((stage, i) => { stage.hidden = i !== index; });
        controls.querySelector('[data-lab-previous]').disabled = index === 0;
        controls.querySelector('[data-lab-next]').disabled = index === 3;
        root.querySelector('[data-lab-position]').textContent = '第' + (index + 1) + '步，共4步';
        if (focus) stages[index].querySelector('h2').focus();
      };
      controls.hidden = false;
      listen(controls.querySelector('[data-lab-previous]'), 'click', () => show(index - 1, true));
      listen(controls.querySelector('[data-lab-next]'), 'click', () => show(index + 1, true));
      show(0);
    }
    const day = root.querySelector('[data-lab-day]');
    if (day) {
      const total = day.querySelector('[name="total"]'), necessary = day.querySelector('[name="necessary"]');
      const output = day.querySelector('[data-lab-result]');
      const show = () => {
        day.querySelector('[data-lab-total]').textContent = total.value;
        day.querySelector('[data-lab-necessary]').textContent = necessary.value;
        const result = workingDay(total.valueAsNumber, necessary.valueAsNumber);
        output.textContent = result.valid ? '本站计算：剩余劳动' + format(result.surplus) + '小时；剩余价值率' + percent(result.rate) + '。' : result.message;
        const bar = day.querySelector('[data-lab-bar]');
        bar.hidden = !result.valid;
        if (result.valid) {
          bar.children[0].style.width = result.necessary / result.total * 100 + '%';
          bar.children[1].style.width = result.surplus / result.total * 100 + '%';
        }
      };
      day.hidden = false;
      listen(total, 'input', show); listen(necessary, 'input', show);
      day.querySelectorAll('[data-lab-preset]').forEach(button => listen(button, 'click', () => { total.value = button.dataset.labPreset; necessary.value = '6'; show(); }));
      show();
    }
    const diagram = root.querySelector('[data-lab-reproduction]');
    if (diagram) {
      const inputs = [...diagram.querySelectorAll('input')];
      const output = diagram.querySelector('[data-lab-result]');
      const show = () => {
        const result = reproduction(inputs.map(input => input.valueAsNumber));
        if (!result.valid) { output.textContent = result.message; return; }
        output.textContent = '本站计算：Ⅰ总额' + format(result.first) + '，Ⅱ总额' + format(result.second) + '，合计' + format(result.total)
          + '。Ⅰ(v＋m)＝' + format(result.outward) + '，Ⅱc＝' + format(result.inward) + '；'
          + (result.balanced ? '数值交换条件相等。' : '两边不相等，差额为' + format(result.difference) + '。')
          + 'Ⅰ的m/v：' + (result.firstRate === null ? '未定义（v为0）' : percent(result.firstRate))
          + '；Ⅱ的m/v：' + (result.secondRate === null ? '未定义（v为0）' : percent(result.secondRate)) + '。';
      };
      diagram.hidden = false;
      inputs.forEach(input => listen(input, 'input', show));
      listen(diagram.querySelector('[data-lab-reset]'), 'click', () => { inputs.forEach(input => { input.value = input.defaultValue; }); show(); });
      show();
    }
    let disposed = false;
    const dispose = () => { if (!disposed) { disposed = true; cleanups.splice(0).reverse().forEach(fn => fn()); } };
    win.SiteNavigation?.own?.(dispose);
    return dispose;
  }
  return {valueFormStep, workingDay, reproduction, percent, mount};
});
