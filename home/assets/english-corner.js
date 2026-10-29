/* Progressive local filtering. No requests, persistent storage, or hidden reading content without JS. */
(function () {
  'use strict';
  const root = document.querySelector('[data-english-corner]');
  if (!root) return;
  const cleanups = [], listen = (target,type,fn) => { target.addEventListener(type,fn);cleanups.push(()=>target.removeEventListener(type,fn)); };
  const rows = [...root.querySelectorAll('[data-ec-row]')], controls = root.querySelector('[data-ec-filters]');
  const columns = new Set(['words','classics','between','myths']);
  const params = new URLSearchParams(location.search);
  let column = columns.has(params.get('column')) ? params.get('column') : 'all', level = ['1','2','3'].includes(params.get('level')) ? params.get('level') : 'all';
  function query() { const values=new URLSearchParams();if(column!=='all')values.set('column',column);if(level!=='all')values.set('level',level);return values.size?'?'+values:''; }
  function render(update) {
    let count=0;
    rows.forEach(row=>{row.hidden=!(column==='all'||row.dataset.column===column)||!(level==='all'||row.dataset.level===level);if(!row.hidden)count++;});
    root.querySelectorAll('[data-ec-group]').forEach(group=>{group.hidden=![...group.querySelectorAll('[data-ec-row]')].some(row=>!row.hidden);});
    root.querySelectorAll('[data-ec-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.ecFilter===column)));
    root.querySelectorAll('[data-ec-level]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.ecLevel===level)));
    const countNode=root.querySelector('[data-ec-count]');if(countNode)countNode.textContent='显示 '+count+' / '+rows.length+' 张';
    const empty=root.querySelector('[data-ec-empty]');if(empty)empty.hidden=count>0;
    root.querySelectorAll('[data-ec-card]').forEach(link=>{link.search=query();});
    if(update)history.replaceState(history.state,'',location.pathname+query()+location.hash);
  }
  if (rows.length && controls) {
    controls.hidden=false;
    listen(root,'click',event=>{
      const target=event.target.closest('[data-ec-filter],[data-ec-level],[data-ec-column]');
      if(!target||!root.contains(target))return;
      if(target.hasAttribute('data-ec-column')){event.preventDefault();column=target.dataset.ecColumn;}
      if(target.hasAttribute('data-ec-filter'))column=target.dataset.ecFilter;
      if(target.hasAttribute('data-ec-level'))level=target.dataset.ecLevel;
      render(true);
    });
    listen(window,'popstate',()=>{const p=new URLSearchParams(location.search);column=columns.has(p.get('column'))?p.get('column'):'all';level=['1','2','3'].includes(p.get('level'))?p.get('level'):'all';render(false);});
    render(false);
  }
  root.querySelectorAll('[data-ec-return]').forEach(link=>{if(params.has('column')||params.has('level'))link.search=query();});
  window.SiteNavigation?.own?.(()=>cleanups.splice(0).reverse().forEach(fn=>fn()));
})();
