"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createGallery } = require(path.join(__dirname, "../home/assets/photos.js"));

class Element {
  constructor(document) { this.document = document; this.listeners = {}; this.children = []; this.style = {}; this.dataset = {}; this.hidden = false; this.open = false; this.textContent = ""; }
  addEventListener(name, action) { (this.listeners[name] ||= []).push(action); }
  dispatch(name, values = {}) {
    const event = { target: this, button: 0, preventDefault() { this.prevented = true; }, ...values };
    for (const action of this.listeners[name] || []) action(event);
    return event;
  }
  setAttribute(name, value) { (this.attributes ||= {})[name] = String(value); }
  getAttribute(name) { return this.attributes?.[name] ?? null; }
  focus() { this.document.activeElement = this; }
  replaceChildren() { this.children = []; }
  appendChild(element) { this.children.push(element); }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch("close"); }
  getBoundingClientRect() { return { left: 10, right: 100, top: 10, bottom: 100 }; }
}

function fixture({ supported = true, historyFails = false, language = null } = {}) {
  const document = { activeElement: null };
  const make = () => new Element(document);
  document.documentElement = make(); document.body = make();
  document.documentElement.style.overflow = "auto"; document.body.style.overflow = "scroll";
  document.createElement = make;
  const data = make(), dialog = make();
  const photos = [0, 1, 2].map((index) => ({
    id: `test-${index}`, src: `/photos/images/${index}.webp`, title: index ? `照片 ${index}` : "",
    caption: index === 0 ? '<img src=x onerror="alert(1)">' : index === 1 ? "长故事的第一段。".repeat(500) + "\n\n" + "第二段也必须完整保留。".repeat(200) : "",
    date: "2026-10-16", date_text: "2026年10月16日", time: "12:34", location: "北京", width: 1600, height: 1000
  }));
  data.textContent = JSON.stringify(photos);
  const nodes = Object.fromEntries([".photo-large", "#photo-viewer-title", "#photo-viewer-caption", "#photo-viewer-story-label", "#photo-viewer-facts", ".photo-position", ".photo-close", ".photo-previous", ".photo-next", ".photo-stage", "#photo-load-error"].map((name) => [name, make()]));
  dialog.querySelector = (selector) => nodes[selector];
  if (!supported) dialog.showModal = undefined;
  const links = photos.map((_, index) => { const link = make(); link.dataset.photoIndex = String(index); return link; });
  document.querySelector = (selector) => selector === "#photo-data" ? data : selector === "#photo-viewer" ? dialog : null;
  document.querySelectorAll = selector => selector === "[data-photo-open]" ? links : [];
  const window = make();
  const stack = [{ route: "album" }];
  window.navigation = { get currentEntry() { return {index:stack.length - 1}; } };
  window.history = {
    state: stack[0], backCalls: 0, goCalls: [],
    go(step) { this.goCalls.push(step); stack.splice(Math.max(1,stack.length + step)); this.state=stack.at(-1); window.dispatch("popstate", {state:this.state}); },
    pushState(state) { if (historyFails) throw new Error("History unavailable"); stack.push(state); this.state = state; },
    back() { this.backCalls++; if (stack.length > 1) stack.pop(); this.state = stack[stack.length - 1]; window.dispatch("popstate", { state: this.state }); }
  };
  let currentLanguage = language;
  const languageListeners = [];
  if (language) window.SiteI18n = {
    lang: () => currentLanguage,
    setLanguage(value, options = {}) {
      if (value !== currentLanguage && !options.replace) window.history.pushState(window.history.state);
      currentLanguage=value;
      languageListeners.forEach(fn=>fn(value,{source:options.source || "switch"}));
    },
    t(key, values = {}, fallback = key) {
      const photoIndex = Number(key.match(/test-(\d+)/)?.[1]);
      let value = fallback;
      if (key === "photos.position") value = currentLanguage === "en" ? "Photo {number} of {count}" : "第 {number} 张，共 {count} 张";
      if (key === "photos.open") value = currentLanguage === "en" ? "View photo {number}" : "查看第 {number} 张照片";
      if (key === "photos.open_named") value = currentLanguage === "en" ? "View photo {number}: {title}" : "查看第 {number} 张照片：{title}";
      if (Number.isInteger(photoIndex)) {
        const field = key.split(".").at(-1);
        value = currentLanguage === "en" ? ({title: photoIndex ? `Photo ${photoIndex}` : "", caption: photoIndex < 2 ? `Complete English story ${photoIndex}\n\nSecond paragraph.` : "", date_text: "16 October 2026", location: "Beijing", alt: `English scene ${photoIndex}`}[field] ?? fallback) : (photos[photoIndex][field] || fallback);
      }
      return String(value).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
    },
    onChange(callback) { languageListeners.push(callback); }
  };
  const switchLanguage = value => { currentLanguage = value; languageListeners.forEach(fn => fn(value, {source:"test"})); };
  const controller = createGallery(document, window);
  return { document, window, nodes, data, links, dialog, photos, controller, stack, switchLanguage };
}

test("unmodified photo click opens modal, presents literal metadata and preserves previous history", () => {
  const f = fixture();
  const event = f.links[0].dispatch("click");
  assert.equal(event.prevented, true);
  assert.equal(f.dialog.open, true);
  assert.deepEqual(f.controller.getState(), { opened: true, index: 0 });
  assert.equal(f.nodes[".photo-large"].src, f.photos[0].src);
  assert.equal(f.nodes["#photo-viewer-title"].hidden, true);
  assert.equal(f.nodes["#photo-viewer-caption"].textContent, '<img src=x onerror="alert(1)">');
  assert.equal(f.nodes["#photo-viewer-caption"].children.length, 0);
  assert.deepEqual(f.nodes["#photo-viewer-facts"].children.map((item) => item.textContent), ["2026年10月16日", "12:34", "北京"]);
  assert.equal(f.document.activeElement, f.nodes[".photo-close"]);
  assert.equal(f.document.body.style.overflow, "hidden");
  assert.equal(f.window.history.state.route, "album");
  assert.equal(f.stack.length, 2);
});

test("keyboard and buttons wrap through the album; Esc closes, restores focus and consumes only modal history", () => {
  const f = fixture();
  f.links[0].dispatch("click");
  assert.equal(f.dialog.dispatch("keydown", { key: "ArrowLeft" }).prevented, true);
  assert.equal(f.controller.getState().index, 2);
  f.nodes[".photo-next"].dispatch("click");
  assert.equal(f.controller.getState().index, 0);
  f.nodes[".photo-previous"].dispatch("click");
  assert.equal(f.nodes[".photo-position"].textContent, "3 / 3");
  f.dialog.dispatch("keydown", { key: "Escape" });
  assert.equal(f.controller.getState().opened, false);
  assert.equal(f.dialog.open, false);
  assert.equal(f.window.history.backCalls, 1);
  assert.equal(f.stack.length, 1);
  assert.equal(f.document.activeElement, f.links[0]);
  assert.equal(f.document.documentElement.style.overflow, "auto");
  assert.equal(f.document.body.style.overflow, "scroll");
});

test("a primary touch release navigates without click and a later compatibility click cannot navigate twice", () => {
  const f = fixture(); f.links[0].dispatch("click");
  const button = f.nodes[".photo-next"];
  const touch = { pointerType: "touch", isPrimary: true, pointerId: 7, clientX: 50, clientY: 50 };
  button.dispatch("pointerdown", touch); button.dispatch("pointerup", touch);
  assert.equal(f.controller.getState().index, 1);
  button.dispatch("click", { pointerType: "touch", detail: 1 });
  assert.equal(f.controller.getState().index, 1);
  button.dispatch("pointerdown", { ...touch, pointerId: 8 });
  button.dispatch("pointerup", { ...touch, pointerId: 8 });
  button.dispatch("click", { detail: 1 });
  assert.equal(f.controller.getState().index, 2, "Legacy compatibility click also stays single-step");
  button.dispatch("pointerdown", { pointerType: "mouse" });
  button.dispatch("click", { detail: 1 });
  assert.equal(f.controller.getState().index, 0, "Mouse clicks remain usable immediately after touch");
  button.dispatch("click", { detail: 0 });
  assert.equal(f.controller.getState().index, 1, "Keyboard activation remains usable");
});

test("navigation touch movement, cancellation, another pointer and secondary touch do not activate a button", () => {
  const f = fixture(); f.links[0].dispatch("click");
  const button = f.nodes[".photo-next"];
  const touch = { pointerType: "touch", isPrimary: true, pointerId: 7, clientX: 50, clientY: 50 };
  button.dispatch("pointerdown", touch); button.dispatch("pointerup", { ...touch, clientX: 70 });
  assert.equal(f.controller.getState().index, 0);
  button.dispatch("pointerdown", touch); button.dispatch("pointercancel"); button.dispatch("pointerup", touch);
  assert.equal(f.controller.getState().index, 0);
  button.dispatch("pointerdown", touch); button.dispatch("pointerup", { ...touch, pointerId: 8 });
  assert.equal(f.controller.getState().index, 0);
  button.dispatch("pointerdown", { ...touch, isPrimary: false }); button.dispatch("pointerup", { ...touch, isPrimary: false });
  assert.equal(f.controller.getState().index, 0);
});

test("browser Back closes the viewer without an extra Back and a later close works normally", () => {
  const f = fixture();
  f.links[1].dispatch("click");
  f.window.history.back();
  assert.equal(f.dialog.open, false);
  assert.equal(f.document.activeElement, f.links[1]);
  assert.equal(f.window.history.backCalls, 1);
  f.links[2].dispatch("click");
  f.nodes[".photo-close"].dispatch("click");
  assert.equal(f.window.history.backCalls, 2);
  assert.equal(f.dialog.open, false);
});

test("native cancel and backdrop close use the same cleanup", () => {
  const f = fixture(); f.links[0].dispatch("click");
  assert.equal(f.dialog.dispatch("cancel").prevented, true);
  assert.equal(f.dialog.open, false);
  f.links[0].dispatch("click");
  f.dialog.dispatch("click", { clientX: 5, clientY: 5 });
  assert.equal(f.dialog.open, false);
  assert.equal(f.window.history.backCalls, 2);
});

test("touch swipe switches photos; vertical gesture, pinch and pointer cancellation do not", () => {
  const f = fixture(); f.links[0].dispatch("click");
  const stage = f.nodes[".photo-stage"], image = f.nodes[".photo-large"];
  const down = (values = {}) => stage.dispatch("pointerdown", { pointerType: "touch", pointerId: 1, isPrimary: true, clientX: 200, clientY: 100, target: image, ...values });
  const up = (values = {}) => stage.dispatch("pointerup", { pointerId: 1, clientX: 100, clientY: 110, ...values });
  assert.equal(down().prevented, undefined); assert.equal(up().prevented, undefined);
  assert.equal(f.controller.getState().index, 1);
  down(); up({ clientY: 250 });
  assert.equal(f.controller.getState().index, 1);
  down(); down({ pointerId: 2, isPrimary: false }); up();
  assert.equal(f.controller.getState().index, 1);
  down(); stage.dispatch("pointercancel"); up();
  assert.equal(f.controller.getState().index, 1);
});

test("unsupported dialogs and modified clicks preserve direct compressed image links", () => {
  const old = fixture({ supported: false });
  assert.equal(old.controller, null);
  assert.equal(old.links[0].dispatch("click").prevented, undefined);
  const f = fixture();
  for (const values of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
    assert.equal(f.links[0].dispatch("click", values).prevented, undefined);
    assert.equal(f.dialog.open, false);
  }
});

test("history/storage restrictions still permit image browsing and closing", () => {
  const f = fixture({ historyFails: true });
  f.links[0].dispatch("click"); f.nodes[".photo-next"].dispatch("click");
  assert.equal(f.controller.getState().index, 1);
  f.nodes[".photo-close"].dispatch("click");
  assert.equal(f.dialog.open, false);
  assert.equal(f.window.history.backCalls, 0);
  assert.equal(f.document.activeElement, f.links[0]);
});

test("every move replaces the complete story, retaining long multi-paragraph text without stale content", () => {
  const f = fixture(); f.links[0].dispatch("click");
  assert.equal(f.nodes["#photo-viewer-story-label"].hidden, false);
  f.dialog.scrollTop = 780;
  f.nodes[".photo-next"].dispatch("click");
  assert.equal(f.dialog.scrollTop, 0);
  assert.equal(f.nodes["#photo-viewer-caption"].textContent, f.photos[1].caption);
  assert.ok(f.nodes["#photo-viewer-caption"].textContent.length > 5000);
  assert.equal(f.nodes["#photo-viewer-caption"].textContent.split("\n\n").length, 2);
  f.dialog.scrollTop = 920;
  f.nodes[".photo-next"].dispatch("click");
  assert.equal(f.dialog.scrollTop, 0);
  assert.equal(f.nodes["#photo-viewer-caption"].textContent, "");
  assert.equal(f.nodes["#photo-viewer-caption"].hidden, true);
  assert.equal(f.nodes["#photo-viewer-story-label"].hidden, true);
  f.nodes[".photo-previous"].dispatch("click");
  assert.equal(f.nodes["#photo-viewer-caption"].textContent, f.photos[1].caption);
  assert.equal(f.nodes["#photo-viewer-caption"].hidden, false);
  assert.equal(f.nodes["#photo-viewer-story-label"].hidden, false);
});


test("changing locale preserves image source/node, index, dialog scroll, focus, history and source metadata", () => {
  const f = fixture({language: "en"});
  const beforeData = f.data.textContent;
  const image = f.nodes[".photo-large"];
  let assignments = 0, source;
  Object.defineProperty(image, "src", {get: () => source, set: value => { source = value; assignments++; }});
  f.links[1].dispatch("click");
  assert.equal(f.nodes["#photo-viewer-caption"].textContent, "Complete English story 1\n\nSecond paragraph.");
  assert.equal(f.nodes[".photo-position"].textContent, "Photo 2 of 3");
  assert.equal(f.links[1].getAttribute("aria-label"), "View photo 2: Photo 1");
  f.nodes[".photo-next"].focus(); f.dialog.scrollTop = 87;
  const historyState = f.window.history.state;
  f.switchLanguage("zh-CN");
  assert.equal(f.nodes["#photo-viewer-caption"].textContent, f.photos[1].caption);
  assert.equal(f.dialog.scrollTop, 87);
  assert.equal(f.document.activeElement, f.nodes[".photo-next"]);
  assert.equal(f.nodes[".photo-large"], image);
  assert.equal(assignments, 1, "A language change never reloads the image or resets native zoom");
  assert.equal(f.window.history.state, historyState);
  assert.deepEqual(f.controller.getState(), {opened: true, index: 1});
  f.switchLanguage("en");
  assert.equal(f.nodes["#photo-viewer-facts"].children[0].textContent, "16 October 2026");
  assert.equal(image.alt, "English scene 1");
  assert.equal(f.data.textContent, beforeData);
  assert.equal(assignments, 1);
  f.controller.close();
  assert.equal(f.document.activeElement, f.links[1]);
});

test("reinitialization cannot add locale or interaction listeners twice; error display does not reset state", () => {
  const f = fixture({language: "en"});
  assert.equal(createGallery(f.document, f.window), f.controller);
  f.links[0].dispatch("click");
  f.nodes[".photo-next"].dispatch("click");
  assert.equal(f.controller.getState().index, 1);
  f.nodes[".photo-large"].dispatch("error");
  assert.equal(f.nodes["#photo-load-error"].hidden, false);
  f.switchLanguage("zh-CN");
  assert.equal(f.nodes["#photo-load-error"].hidden, false);
  f.nodes[".photo-large"].dispatch("load");
  assert.equal(f.nodes["#photo-load-error"].hidden, true);
});


test("closing after several language history pushes consumes the entire modal segment once", () => {
  const f=fixture({language:"en"});
  f.links[1].dispatch("click");
  f.window.SiteI18n.setLanguage("zh-CN");
  f.window.SiteI18n.setLanguage("en");
  f.window.SiteI18n.setLanguage("zh-CN");
  assert.equal(f.stack.length,5);
  f.controller.close();
  assert.deepEqual(f.window.history.goCalls,[-4]);
  assert.equal(f.stack.length,1);
  assert.equal(f.window.history.state.photoLightbox,undefined);
  assert.equal(f.window.SiteI18n.lang(),"zh-CN");
  assert.equal(f.document.activeElement,f.links[1]);
});
