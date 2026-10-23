(function (scope) {
  "use strict";
  const instances = new WeakMap();
  function createGallery(document, window) {
    if (instances.has(document)) return instances.get(document);
    instances.set(document, null);
    const i18n = window.SiteI18n;
    const tr = (key, values, fallback) => i18n ? i18n.t(key, values, fallback) : fallback;
    const field = (photo, name) => tr(`photos.photo.${photo.id}.${name}`, {}, photo[name] || "");
    let refreshViewer = null;
    function translatePage() {
      for (const node of document.querySelectorAll("[data-photo-count]")) {
        const count = Number(node.dataset.photoCount);
        node.textContent = tr(count === 1 ? "photos.count_one" : "photos.count_many", { count }, `${count} 张照片`);
      }
      const share = document.querySelector('meta[property="og:image:alt"]');
      if (share) share.content = tr("photos.share_alt", {}, share.content);
      if (refreshViewer) refreshViewer(...arguments);
    }
    if (i18n) i18n.onChange(translatePage);
    translatePage();
    const data = document.querySelector("#photo-data");
    const dialog = document.querySelector("#photo-viewer");
    if (!data || !dialog || typeof dialog.showModal !== "function") return null;
    let photos;
    try { photos = JSON.parse(data.textContent); } catch (_) { return null; }
    if (!Array.isArray(photos) || !photos.length) return null;
    const links = Array.from(document.querySelectorAll("[data-photo-open]"));
    const image = dialog.querySelector(".photo-large");
    const title = dialog.querySelector("#photo-viewer-title");
    const caption = dialog.querySelector("#photo-viewer-caption");
    const storyLabel = dialog.querySelector("#photo-viewer-story-label");
    const facts = dialog.querySelector("#photo-viewer-facts");
    const position = dialog.querySelector(".photo-position");
    const closeButton = dialog.querySelector(".photo-close");
    const previous = dialog.querySelector(".photo-previous");
    const next = dialog.querySelector(".photo-next");
    const stage = dialog.querySelector(".photo-stage");
    const viewerCopy = dialog.querySelector(".photo-viewer-copy");
    let localeScroll = null;
    const loadError = dialog.querySelector("#photo-load-error");
    const languageButton = dialog.querySelector("[data-site-language-switch]");
    let index = 0, opened = false, trigger = null, historyOwned = false, pointer = null;
    let oldRootOverflow = "", oldBodyOverflow = "";
    let historyBaseIndex = null, viewerLanguage = null, pendingLanguage = null, pendingClose = false;
    const marker = `photos-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    function render(changeImage = true) {
      const photo = photos[index];
      // A language change updates copy only. Keeping the same image node/source,
      // scroll, active pointer and focus preserves native pinch zoom and browsing.
      if (changeImage) {
        localeScroll = null;
        if (viewerCopy) viewerCopy.style.minHeight = "";
        if (loadError) loadError.hidden = true;
        image.src = photo.src;
        image.width = photo.width;
        image.height = photo.height;
      }
      image.alt = field(photo, "alt") || field(photo, "title") || field(photo, "caption");
      title.textContent = field(photo, "title");
      title.hidden = !title.textContent;
      caption.textContent = field(photo, "caption");
      caption.hidden = !caption.textContent;
      storyLabel.hidden = !caption.textContent;
      facts.replaceChildren();
      const date = field(photo, "date_text") || photo.date;
      const metadata = [date, photo.time && !(date || "").includes(photo.time) ? photo.time : "", field(photo, "location")];
      metadata.filter(Boolean).forEach((value) => {
        const item = document.createElement("li");
        item.textContent = value;
        facts.appendChild(item);
      });
      facts.hidden = !facts.children.length;
      position.textContent = tr("photos.position", { number: index + 1, count: photos.length }, `${index + 1} / ${photos.length}`);
      previous.hidden = next.hidden = photos.length < 2;
      if (changeImage) dialog.scrollTop = 0;
      else if (localeScroll) {
        dialog.scrollTop = localeScroll.top; dialog.scrollLeft = localeScroll.left;
        localeScroll = null;
      }
    }
    function translateLinks(language, detail) {
      links.forEach((link, number) => {
        const photo = photos[number];
        if (!photo || !link.setAttribute) return;
        const name = field(photo, "title");
        link.setAttribute("aria-label", tr(name ? "photos.open_named" : "photos.open",
          { number: number + 1, title: name }, `查看第 ${number + 1} 张照片${name ? "：" + name : ""}`));
      });
      if (opened) {
        if (!detail || detail.source !== "history" || window.history.state?.photoLightbox === marker) viewerLanguage = language || i18n?.lang?.() || viewerLanguage;
        render(false);
      }
    }
    window.addEventListener("site:beforelanguagechange", () => {
      if (!opened) return;
      localeScroll = { top: dialog.scrollTop, left: dialog.scrollLeft };
      // Keep enough copy space that a shorter translation cannot clamp the
      // reader's current scroll position. Reset this floor on the next photo.
      if (viewerCopy) viewerCopy.style.minHeight = Math.max(parseFloat(viewerCopy.style.minHeight) || 0, viewerCopy.getBoundingClientRect().height) + "px";
    });
    refreshViewer = translateLinks;
    translateLinks();
    image.addEventListener("error", () => { if (loadError) loadError.hidden = false; });
    image.addEventListener("load", () => { if (loadError) loadError.hidden = true; });
    function finishClose() {
      if (!opened) return;
      opened = false;
      pointer = null;
      document.documentElement.style.overflow = oldRootOverflow;
      document.body.style.overflow = oldBodyOverflow;
      if (dialog.open) dialog.close();
      if (trigger && typeof trigger.focus === "function") trigger.focus({ preventScroll: true });
    }
    function restoreFocusAfterTraversal() {
      const focus = () => { if (!opened && trigger && typeof trigger.focus === "function") trigger.focus({ preventScroll: true }); };
      // Fragment history restoration can move focus after the close handler.
      if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(focus);
      else focus();
    }
    function restoreLanguage(language) {
      if (language && i18n?.setLanguage) i18n.setLanguage(language, { replace: true, source: "photo-close" });
    }
    function requestClose() {
      const goBack = historyOwned && window.history.state && window.history.state.photoLightbox === marker;
      const currentEntry = window.navigation?.currentEntry?.index;
      const steps = Number.isInteger(currentEntry) && Number.isInteger(historyBaseIndex) ? currentEntry - historyBaseIndex : 1;
      pendingClose = Boolean(goBack);
      pendingLanguage = goBack ? viewerLanguage : null;
      finishClose();
      historyOwned = false;
      if (goBack) {
        if (steps > 1 && typeof window.history.go === "function") window.history.go(-steps);
        else window.history.back();
      }
    }
    function open(selected, element) {
      if (!Number.isInteger(selected) || selected < 0 || selected >= photos.length || opened) return false;
      index = selected;
      viewerLanguage = i18n?.lang?.() || null;
      trigger = element;
      render();
      try { dialog.showModal(); } catch (_) { return false; }
      opened = true;
      oldRootOverflow = document.documentElement.style.overflow;
      oldBodyOverflow = document.body.style.overflow;
      document.documentElement.style.overflow = document.body.style.overflow = "hidden";
      try {
        const state = window.history.state;
        historyBaseIndex = window.navigation?.currentEntry?.index ?? null;
        window.history.pushState({ ...(state && typeof state === "object" ? state : {}), photoLightbox: marker }, "");
        historyOwned = true;
      } catch (_) { historyOwned = false; }
      closeButton.focus();
      return true;
    }
    function move(step) {
      if (!opened) return;
      index = (index + step + photos.length) % photos.length;
      render();
    }
    links.forEach((link) => link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (open(Number(link.dataset.photoIndex), link)) event.preventDefault();
    }));
    closeButton.addEventListener("click", requestClose);
    if (languageButton && i18n) languageButton.addEventListener("click", (event) => {
      event.preventDefault();
      const language = i18n.lang() === "en" ? "zh-CN" : "en";
      i18n.setLanguage(language, { replace: true, source: "photo-viewer" });
    });
    function navigationButton(button, step) {
      let touch = null, handledAt = 0;
      button.addEventListener("pointerdown", (event) => {
        handledAt = 0;
        touch = event.pointerType === "touch" && event.isPrimary
          ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
      });
      button.addEventListener("pointercancel", () => { touch = null; });
      button.addEventListener("pointerup", (event) => {
        if (!touch || event.pointerType !== "touch" || !event.isPrimary || event.pointerId !== touch.id) return;
        const start = touch; touch = null;
        const bounds = button.getBoundingClientRect();
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12 ||
            event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) return;
        // A completed touch tap can arrive without a compatibility click after
        // a swipe in Chrome. Act once on release and ignore its optional click.
        handledAt = Date.now();
        move(step);
      });
      button.addEventListener("click", (event) => {
        const touchClick = event.pointerType === "touch" || event.sourceCapabilities?.firesTouchEvents ||
          (event.pointerType === undefined && event.detail > 0);
        if (touchClick && Date.now() - handledAt < 700) return;
        move(step);
      });
    }
    navigationButton(previous, -1);
    navigationButton(next, 1);
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); requestClose(); });
    dialog.addEventListener("close", () => { if (opened) requestClose(); });
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose();
    });
    dialog.addEventListener("keydown", (event) => {
      if (!opened || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1);
      } else if (event.key === "Escape") { event.preventDefault(); requestClose(); }
    });
    stage.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch" && event.isPrimary && event.target === image) pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      else pointer = null;
    });
    stage.addEventListener("pointerup", (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      pointer = null;
      if (Math.abs(dx) >= 65 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
    });
    stage.addEventListener("pointercancel", () => { pointer = null; });
    window.addEventListener("popstate", (event) => {
      if (pendingClose) {
        const language = pendingLanguage; pendingLanguage = null; pendingClose = false;
        restoreLanguage(language); restoreFocusAfterTraversal();
      } else if (opened && (!event.state || event.state.photoLightbox !== marker)) {
        const language = viewerLanguage;
        historyOwned = false; finishClose(); restoreLanguage(language); restoreFocusAfterTraversal();
      }
    });
    const controller = { open, close: requestClose, move, getState: () => ({ opened, index }) };
    instances.set(document, controller);
    return controller;
  }
  if (typeof module === "object" && module.exports) module.exports = { createGallery };
  else if (scope.document) createGallery(scope.document, scope);
})(typeof window !== "undefined" ? window : globalThis);
