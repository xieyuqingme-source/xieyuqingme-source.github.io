(() => {
  'use strict';
  const searchUrl = text => 'https://www.google.com/search?q=' + encodeURIComponent(text);
  const copyText = async (text, doc, browserNavigator) => {
    let handled = false;
    const onCopy = event => {
      if (!event.clipboardData) return;
      event.clipboardData.setData('text/plain', text); event.preventDefault(); handled = true;
    };
    let copied = false;
    doc.addEventListener('copy', onCopy, { once: true });
    try { copied = Boolean(doc.execCommand?.('copy')) && handled; } catch (_) {}
    finally { doc.removeEventListener('copy', onCopy); }
    if (!copied) await browserNavigator.clipboard.writeText(text);
  };
  if (typeof module === 'object' && module.exports) { module.exports = { searchUrl, copyText }; return; }
  const article = document.getElementById('original');
  const menu = document.getElementById('anthology-selection');
  const popup = document.getElementById('anthology-note');
  const data = document.getElementById('anthology-glossary');
  if (!article || !menu || !popup || !data) return;
  let entries;
  try { entries = JSON.parse(data.textContent); } catch (_) { return; }
  const copy = document.getElementById('anthology-copy');
  const search = document.getElementById('anthology-search');
  const status = document.getElementById('anthology-copy-status');
  let selectedText = '', suppressed = '', dragging = false, moved = false, pointerStart;
  let selectionTimer, noteTimer, pointerMode = false, trigger = null, skipFocus = false, menuReturn = null;

  function selection() {
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || !selected.rangeCount ||
        !article.contains(selected.anchorNode) || !article.contains(selected.focusNode)) return '';
    return selected.toString().trim();
  }
  function closeMenu(restore = false) {
    clearTimeout(selectionTimer);
    suppressed = selection(); menu.hidden = true; status.textContent = '';
    if (restore && menuReturn?.isConnected) menuReturn.focus({ preventScroll: true });
    menuReturn = null;
  }
  function closeNote(restore = false) {
    clearTimeout(noteTimer); popup.hidden = true;
    if (restore && trigger?.isConnected && popup.contains(document.activeElement)) {
      skipFocus = true; trigger.focus({ preventScroll: true }); skipFocus = false;
    }
  }
  function showMenu() {
    const text = selection();
    if (!text) { if (!menu.contains(document.activeElement)) closeMenu(); return; }
    closeNote();
    if (dragging || text === suppressed) return;
    if (text !== selectedText || menu.hidden) status.textContent = '';
    selectedText = text; menu.hidden = false;
  }
  function showNote(marker, focus = false) {
    const entry = entries[Number(marker.dataset.noteIndex)];
    if (!entry) return;
    closeMenu(); trigger = marker;
    document.getElementById('anthology-note-title').textContent = entry.term;
    document.getElementById('anthology-note-explanation').textContent = entry.explanation;
    document.getElementById('anthology-note-source').textContent = [entry.source, entry.edition,
      entry.page ? '页码 ' + entry.page : '', '词义已核对'].filter(Boolean).join(' · ');
    document.getElementById('anthology-note-source-link').href = entry.source_url;
    popup.hidden = false;
    if (focus) popup.focus({ preventScroll: true });
  }
  article.querySelectorAll('[data-note-index]').forEach(marker => {
    marker.addEventListener('focus', () => {
      if (!skipFocus && !pointerMode && !selection()) showNote(marker);
    });
    marker.addEventListener('click', () => {
      clearTimeout(noteTimer);
      if (moved || selection()) return;
      noteTimer = setTimeout(() => { if (!selection()) showNote(marker); }, 240);
    });
    marker.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showNote(marker, true); }
    });
  });
  document.addEventListener('selectionchange', () => {
    if (selection()) closeNote();
    clearTimeout(selectionTimer); selectionTimer = setTimeout(showMenu, 160);
  });
  document.addEventListener('pointerdown', event => {
    pointerMode = true;
    if (menu.contains(event.target) || popup.contains(event.target)) return;
    closeMenu(); closeNote(); moved = false;
    dragging = article.contains(event.target);
    pointerStart = dragging ? [event.clientX, event.clientY] : null;
  });
  document.addEventListener('pointerup', event => {
    if (!dragging) return;
    dragging = false;
    moved = pointerStart && Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 4;
    if (moved) { suppressed = ''; showMenu(); }
    else if (!selection()) closeMenu();
  });
  document.addEventListener('pointercancel', () => { dragging = false; suppressed = ''; selectionTimer = setTimeout(showMenu, 180); });
  document.addEventListener('dblclick', event => {
    if (article.contains(event.target)) { closeNote(); suppressed = ''; showMenu(); }
  });
  document.addEventListener('keydown', event => {
    pointerMode = false;
    if (event.key === 'Escape') { closeMenu(true); closeNote(true); }
    if (event.key === 'Tab' && !menu.hidden && !menu.contains(document.activeElement) && selection()) {
      event.preventDefault(); menuReturn = document.activeElement;
      (event.shiftKey ? search : copy).focus({ preventScroll: true });
    }
  });
  document.addEventListener('focusin', event => {
    if (!popup.hidden && !popup.contains(event.target) && event.target !== trigger) closeNote();
  });
  document.addEventListener('keyup', event => {
    if (event.shiftKey && article.contains(document.activeElement)) { suppressed = ''; showMenu(); }
  });
  document.getElementById('anthology-note-close').addEventListener('click', () => closeNote(true));
  window.addEventListener('scroll', event => {
    if (event.target instanceof Node && (popup.contains(event.target) || menu.contains(event.target))) return;
    closeMenu(); closeNote();
  }, { passive: true, capture: true });
  window.addEventListener('pagehide', () => { closeMenu(); closeNote(); });
  copy.addEventListener('click', async () => {
    const text = selectedText;
    try { await copyText(text, document, navigator); if (selectedText === text && !menu.hidden) status.textContent = '已复制'; }
    catch (_) { status.textContent = '请使用设备的复制菜单'; }
  });
  search.addEventListener('click', () => {
    // No URL, request or prefetch is created before this explicit user action.
    window.open(searchUrl(selectedText), '_blank', 'noopener,noreferrer');
    closeMenu();
  });
})();
