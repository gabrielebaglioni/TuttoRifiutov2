import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parse } from "acorn";
import { parseHTML } from "linkedom";
import { readBrowserScript } from './read-browser-script.mjs';

function functionSource(file, name) {
  const source = readBrowserScript(new URL(file, import.meta.url));
  const node = parse(source, { ecmaVersion: "latest", sourceType: "module" }).body
    .find((node) => node.type === "FunctionDeclaration" && node.id.name === name);
  return source.slice(node.start, node.end);
}

// Exercise the site's completion callback together with its actual stylesheet.
// Only the animation clock/splitter is substituted; CSS fallback remains real.
test("diffuse words stay readable after completion on home, archive and events", () => {
  const css = readFileSync(new URL("../src/styles/globals.css", import.meta.url), "utf8");
  for (const title of ["Nessuna spiegazione", "Pacchetti", "Eventi"]) {
    const { document } = parseHTML(`<html><head><style>${css}</style></head><body><h1 data-animate-variant="diffuse" data-animate-on-scroll="false"><span class="word">${title}</span></h1></body></html>`);
    const element = document.querySelector("h1");
    const word = element.firstElementChild;
    const apply = (targets, values) => {
      for (const target of Array.isArray(targets) ? targets : [targets]) {
        for (const key of ["filter", "opacity"]) if (key in values) target.style.setProperty(key, String(values[key]));
        for (const key of (values.clearProps || "").split(",")) if (key) target.style.removeProperty(key);
      }
    };
    let finish;
    const context = vm.createContext({
      element,
      getComputedStyle: () => ({ fontSize: "36.8px" }),
      SplitText: { create: (_, options) => options.onSplit({ words: [word] }) },
      gsap: {
        set: apply,
        to: (targets, values) => {
          finish = () => { apply(targets, values); values.onComplete?.(); };
          return { play() {} };
        },
      },
    });
    vm.runInContext(functionSource("../src/scripts/animated-copy.ts", "initDiffuseAnimation") + "\ninitDiffuseAnimation(element);", context);
    assert.equal(word.style.opacity, "0", "reveal starts hidden");
    finish();
    const computed = (property) => {
      let value;
      for (const rule of document.querySelector("style").sheet.cssRules) {
        if (rule.selectorText && !rule.selectorText.includes("::") && rule.style.getPropertyValue(property) && word.matches(rule.selectorText)) value = rule.style.getPropertyValue(property);
      }
      return word.style.getPropertyValue(property) || value;
    };
    assert.equal(computed("filter"), "blur(0px)", `${title} must not fall back to the hidden blur after completion`);
    assert.equal(computed("opacity"), "1");
    // Style cleanup/re-splitting must also leave a readable resting state.
    word.removeAttribute("style");
    assert.equal(computed("filter"), "blur(0px)");
    assert.equal(computed("opacity"), "1");
  }
});

test("menu navigation plays selection synchronously before capture stops propagation", () => {
  for (const href of ["/events", "/", "mailto:ciao@example.test"]) {
    const { document } = parseHTML(`<div class="menu-overlay"><a href="${href}"><span>Destinazione</span></a></div>`);
    const calls = [];
    let handler;
    const context = vm.createContext({
      document: { addEventListener: (_, callback) => { handler = callback; }, querySelector: () => null },
      Element: document.defaultView.Element,
      window: { addEventListener() {}, toggleMenu() {}, location: { href: "" } },
      sessionStorage: { setItem() {} },
      isExternalLink: (value) => value.startsWith("mailto:"),
      isSamePage: (value) => value === "/",
      playMenuSound: (kind) => calls.push(kind),
      animateOut: () => new Promise(() => {}),
    });
    vm.runInContext(functionSource("../src/scripts/transition.ts", "setupLinkHandlers") + "\nsetupLinkHandlers();", context);
    handler({ target: document.querySelector("span"), preventDefault() { calls.push("prevent"); }, stopPropagation() {}, stopImmediatePropagation() {} });
    assert.equal(calls[0], "select", "touch/keyboard click must sound before page-transition interception");
    assert.equal(calls.filter((call) => call === "select").length, 1);
  }
});

test("menu audio is loaded before interaction and replayed without allocating a new player", async () => {
  const previousAudio = globalThis.Audio;
  const players = [];
  globalThis.Audio = class {
    constructor(src) { this.src = src; this.currentTime = 9; this.plays = 0; players.push(this); }
    load() { this.loaded = true; }
    play() { this.plays++; return Promise.resolve(); }
  };
  try {
    const { playMenuSound } = await import("../src/scripts/menu-audio.ts");
    assert.equal(players.length, 3);
    assert.ok(players.every((player) => player.loaded && player.preload === "auto" && player.plays === 0));
    playMenuSound("open");
    playMenuSound("open");
    assert.equal(players.length, 3);
    const opened = players.find((player) => player.src === "/sfx/menu-open.mp3");
    assert.equal(opened.plays, 2, "play begins in the gesture, not a timer");
    assert.equal(opened.currentTime, 0);
    opened.play = () => Promise.reject(new Error("browser audio blocked"));
    assert.doesNotThrow(() => playMenuSound("open"));
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    if (previousAudio === undefined) delete globalThis.Audio; else globalThis.Audio = previousAudio;
  }
});
