import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { createAdminController } from "../src/scripts/admin.js";
import { DEFAULT_PALETTE, THEME_KEY } from '../src/data/theme.ts';

test('theme draft survives tab switch, validates before atomic CSRF save, cancels and restores', async () => {
  const { document, window } = parseHTML(SHELL);
  let palette = {...DEFAULT_PALETTE};
  const writes = [];
  let finishSave;
  const fetch = async (path, init={}) => {
    if (path === '/api/admin/session') return response({csrfToken:'theme-csrf'});
    if (path === '/api/content') return response({[THEME_KEY]:palette});
    if (path === '/api/admin/events' || path === '/api/admin/archive') return response([]);
    writes.push({path, init});
    if (init.method === 'PUT') { palette = JSON.parse(init.body).value; await new Promise(resolve=>{finishSave=resolve;}); }
    if (init.method === 'DELETE') palette = {...DEFAULT_PALETTE};
    return response({ok:true});
  };
  const controller = createAdminController({document,window,fetch}); controller.boot(); await settled();
  const tab = (section) => document.querySelector(`[data-admin-section="${section}"]`).dispatchEvent(new window.Event('click'));
  const field = () => document.querySelector('[data-theme-hex="foreground"]');
  const edit = (value) => {field().value=value; field().dispatchEvent(new window.Event('input'));};
  const action = (text) => [...document.querySelectorAll('.admin-actions button')].find(b=>b.textContent===text).dispatchEvent(new window.Event('click'));
  tab('colors'); assert.ok(field()); edit('#123456'); tab('home'); tab('colors'); assert.equal(field().value, '#123456');
  edit('url(evil)'); action('Save'); await settled(); assert.equal(writes.length,0);
  edit('#222222'); action('Save'); await settled(); assert.equal(writes.length,1);
  assert.equal(writes[0].path, '/api/admin/content/global.theme.palette');
  assert.equal(writes[0].init.headers.get('x-csrf-token'),'theme-csrf');
  assert.deepEqual(JSON.parse(writes[0].init.body).value, {...DEFAULT_PALETTE,foreground:'#222222'});
  assert.equal(field().disabled,true); assert.equal(document.querySelector('[data-admin-section="home"]').disabled,true);
  finishSave(); await settled(); edit('#333333'); action('Cancel'); assert.equal(field().value,'#222222');
  action('Restore placeholder'); await settled(); assert.equal(field().value,'#000000');
  assert.equal(writes[1].init.method,'DELETE');
  edit('#ffff00'); assert.match(document.querySelector('.admin-theme [role="status"]').textContent,/contrasto insufficiente/);
  [...document.querySelectorAll('.admin-theme button')].find(b=>b.textContent==='Palette iniziale in anteprima').dispatchEvent(new window.Event('click'));
  assert.equal(field().value,'#000000'); assert.equal(writes.length,2);
  assert.match(document.querySelector('#admin-dirty').textContent,/1 modifiche/);
});

const SHELL = `<!doctype html><html><body>
  <section id="admin-login"><form id="admin-login-form"><input name="username"><input name="password"><button type="submit">Entra</button></form><p id="admin-login-status"></p></section>
  <section id="admin-editor" hidden inert><h1 id="admin-title" tabindex="-1">Contenuti</h1><button id="admin-logout">Esci</button>
    <nav><button data-admin-section="home">Home</button><button data-admin-section="archive">Archivio</button><button data-admin-section="events">Eventi</button><button data-admin-section="project">Progetto</button><button data-admin-section="contact">Contatti</button><button data-admin-section="global">Globali</button><button data-admin-section="colors">Colori</button></nav>
    <p id="admin-status"></p><p id="admin-dirty"></p><div id="admin-panels"></div>
  </section>
</body></html>`;

function event(slug = "fixture") {
  return {
    id: 41, slug, status: "upcoming", title: "Evento iniziale", code: "TR-41", summary: "Sommario", meta: ["Meta"], description: "Descrizione",
    info: [[ ["Etichetta", "Valore"] ]], outro: "Finale", outroInfo: [[ ["Etichetta", "Valore"] ]], seo: { title: "SEO", description: "" }, position: 0,
    cardMedia: { type: "image", src: "/fallback/card.webp", alt: "Card" }, heroMedia: { type: "image", src: "/fallback/hero.webp", alt: "Hero" },
    detailMedia: [{ type: "image", src: "/fallback/detail.webp", alt: "Detail" }], media: [],
  };
}

function harness() {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const calls = [];
  const fetch = async (path) => {
    calls.push(String(path));
    const body = path === "/api/admin/session" ? { csrfToken: "csrf" }
      : path === "/api/content" ? { "home.title": "Home" }
        : path === "/api/admin/events" ? [event()]
          : path === "/api/admin/archive" ? [] : { error: "Unexpected request" };
    return new Response(JSON.stringify(body), { status: body.error ? 500 : 200, headers: { "content-type": "application/json" } });
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  return { document, window, calls, controller };
}

test("collection accordions follow page order and retain drafts when closed and reopened", async () => {
  const { document, window, controller } = harness();
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const card = [...document.querySelectorAll(".admin-card")].find((entry) => entry.querySelector("h3")?.textContent === "Evento iniziale");
  assert.equal(card.tagName, "DETAILS");
  assert.ok(card.querySelector("summary"));
  assert.deepEqual([...card.querySelectorAll("[data-editor-stage]")].map((node) => node.dataset.editorStage), ["cover", "intro", "description", "gallery", "outro", "settings"]);
  const title = [...card.querySelectorAll("input")].find((input) => input.value === "Evento iniziale");
  title.value = "Titolo in lavorazione";
  title.dispatchEvent(new window.Event("input"));
  card.setAttribute("open", "");
  card.dispatchEvent(new window.Event("toggle"));
  document.querySelector('[data-admin-section="home"]').dispatchEvent(new window.Event("click"));
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const updated = [...document.querySelectorAll(".admin-card")].find((entry) => entry.querySelector("h3")?.textContent === "Titolo in lavorazione");
  assert.ok(updated.hasAttribute("open"));
  assert.ok([...updated.querySelectorAll("input")].some((input) => input.value === "Titolo in lavorazione"));
});

test("admin editor loads collections only from authenticated admin read endpoints", async () => {
  const { calls, controller } = harness();
  controller.boot();
  await settled();
  assert.equal(calls.includes("/api/admin/events"), true);
  assert.equal(calls.includes("/api/admin/archive"), true);
  assert.equal(calls.includes("/api/events"), false);
  assert.equal(calls.includes("/api/archive"), false);
});

test("a draft created in the real admin DOM survives reload and becomes public only after publication", async () => {
  const { document, window } = parseHTML(SHELL);
  let stored = null;
  const isPublic = () => stored && ["upcoming", "published", "past"].includes(stored.status);
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events" && init.method === "POST") {
      stored = { ...JSON.parse(init.body), id: 88, media: [] };
      return response(stored, 201);
    }
    if (path === "/api/admin/events/bozza-live" && init.method === "PUT") {
      stored = { ...stored, ...JSON.parse(init.body), id: 88, media: [] };
      return response(stored);
    }
    if (path === "/api/admin/events") return response(stored ? [event(), stored] : [event()]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/events") return response(isPublic() ? [stored] : []);
    if (path === "/api/events/bozza-live") return isPublic() ? response(stored) : response({ error: "Not found" }, 404);
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  [...document.querySelectorAll("button")].find((control) => control.textContent.startsWith("Create")).dispatchEvent(new window.Event("click"));

  let card = [...document.querySelectorAll(".admin-card")].find((entry) => entry.querySelector("h3")?.textContent === "Nuovo elemento");
  const slug = card.querySelector('input[name="slug"]');
  const title = [...card.querySelectorAll("input")].find((input) => input.value === "Nuovo elemento");
  const status = [...card.querySelectorAll("input")].find((input) => input.value === "upcoming");
  slug.value = "bozza-live"; slug.dispatchEvent(new window.Event("input"));
  title.value = "Bozza visibile in admin"; title.dispatchEvent(new window.Event("input"));
  status.value = "draft"; status.dispatchEvent(new window.Event("input"));
  [...card.querySelectorAll("button")].find((control) => control.textContent === "Save").dispatchEvent(new window.Event("click"));
  await settled();

  assert.equal(controller.state.collections.events.some((item) => item.slug === "bozza-live" && item.status === "draft"), true);
  assert.equal((await (await fetch("/api/events")).json()).length, 0);
  assert.equal((await fetch("/api/events/bozza-live")).status, 404);

  card = [...document.querySelectorAll(".admin-card")].find((entry) => entry.querySelector("h3")?.textContent === "Bozza visibile in admin");
  const reloadedStatus = [...card.querySelectorAll("input")].find((input) => input.value === "draft");
  reloadedStatus.value = "published";
  reloadedStatus.dispatchEvent(new window.Event("input"));
  [...card.querySelectorAll("button")].find((control) => control.textContent === "Save").dispatchEvent(new window.Event("click"));
  await settled();

  const publicList = await (await fetch("/api/events")).json();
  assert.equal(publicList.some((item) => item.slug === "bozza-live"), true);
  assert.equal((await fetch("/api/events/bozza-live")).status, 200);
});

async function settled() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function deferred() {
  let resolve;
  let reject;
  return { promise: new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; }), resolve, reject };
}

test("real admin controller retains a focused collection input through multi-character edits and tab drafts", async () => {
  const { document, window, controller } = harness();
  controller.boot();
  await settled();

  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const title = [...document.querySelectorAll("#admin-panels input")].find((input) => input.value === "Evento iniziale");
  assert.ok(title);
  title.focus();
  title.value = "E";
  title.dispatchEvent(new window.Event("input"));
  title.value = "Ed";
  title.dispatchEvent(new window.Event("input"));
  assert.equal(document.activeElement, title);
  assert.equal(title.value, "Ed");

  document.querySelector('[data-admin-section="home"]').dispatchEvent(new window.Event("click"));
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const remountedTitle = [...document.querySelectorAll("#admin-panels input")].find((input) => input.value === "Ed");
  assert.ok(remountedTitle);
  assert.equal(controller.state.drafts.get("collection:events:fixture").title, "Ed");
});

test("real admin controller keeps a newer content draft when a pending content save completes", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const save = deferred();
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([event()]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/content/home.title" && init.method === "PUT") return save.promise;
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();

  const card = [...document.querySelectorAll(".admin-card")].find((entry) => entry.querySelector(".admin-key")?.textContent === "home.title");
  const input = card.querySelector("input");
  input.value = "Versione inviata";
  input.dispatchEvent(new window.Event("input"));
  [...card.querySelectorAll("button")].find((button) => button.textContent === "Save").dispatchEvent(new window.Event("click"));
  await settled();

  const resource = "content:home.title";
  controller.state.drafts.set(resource, [], "Versione arrivata tardi");
  controller.state.dirty.mark(resource);
  save.resolve(response({ value: "Versione inviata" }));
  await settled();

  assert.equal(controller.state.drafts.get(resource), "Versione arrivata tardi");
  assert.equal(controller.state.dirty.has(resource), true);
  assert.equal(controller.state.content["home.title"], "Home");
});

test("real admin controller keeps a newer content draft when a pending restore completes", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const restore = deferred();
  let content = { "home.title": "Home" };
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response(content);
    if (path === "/api/admin/events") return response([event()]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/content/home.title" && init.method === "DELETE") return restore.promise;
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();

  const card = [...document.querySelectorAll(".admin-card")].find((entry) => entry.querySelector(".admin-key")?.textContent === "home.title");
  [...card.querySelectorAll("button")].find((button) => button.textContent === "Restore placeholder").dispatchEvent(new window.Event("click"));
  await settled();

  const resource = "content:home.title";
  controller.state.drafts.set(resource, [], "Versione arrivata tardi");
  controller.state.dirty.mark(resource);
  content = { "home.title": "Placeholder dal server" };
  restore.resolve(response({ deleted: true }));
  await settled();

  assert.equal(controller.state.drafts.get(resource), "Versione arrivata tardi");
  assert.equal(controller.state.dirty.has(resource), true);
  assert.equal(controller.state.content["home.title"], "Home");
});

test("real admin controller keeps recreated controls and tabs busy through a pending save", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const save = deferred();
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([event()]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/events/fixture" && init.method === "PUT") return save.promise;
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  [...document.querySelectorAll("button")].find((button) => button.textContent === "Save").dispatchEvent(new window.Event("click"));
  await settled();

  assert.equal(document.querySelector("#admin-editor").getAttribute("aria-busy"), "true");
  assert.equal(document.querySelector('[data-admin-section="home"]').disabled, true);
  controller.render();
  assert.equal(document.querySelector("#admin-editor").getAttribute("aria-busy"), "true");
  assert.equal(document.querySelector('[data-admin-section="home"]').disabled, true);
  assert.equal(document.querySelector(".admin-card").getAttribute("aria-busy"), "true");

  save.resolve(response(event()));
  await settled();
  assert.equal(document.querySelector("#admin-editor").getAttribute("aria-busy"), "false");
  assert.equal(document.querySelector('[data-admin-section="home"]').disabled, false);
});

test("real admin controller rebases server media and fallback paths without losing an unsaved collection field", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  let serverEvent = event();
  const fetch = async (path) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([serverEvent]);
    if (path === "/api/admin/archive") return response([]);
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const title = [...document.querySelectorAll("#admin-panels input")].find((input) => input.value === "Evento iniziale");
  title.value = "Titolo non salvato";
  title.dispatchEvent(new window.Event("input"));

  serverEvent = {
    ...event(), title: "Titolo server", position: 4,
    cardMedia: { type: "image", src: "/fallback/new-card.webp", alt: "Nuova card" },
    heroMedia: { type: "image", src: "/fallback/new-hero.webp", alt: "Nuovo hero" },
    detailMedia: [{ type: "image", src: "/fallback/new-detail.webp", alt: "Nuovo dettaglio" }],
    media: [{ id: 91, role: "cover", position: 0, src: "/media/events/fixture/new.webp", alt: "Cover server" }],
  };
  await controller.reloadCollections();
  controller.render();

  assert.ok([...document.querySelectorAll("#admin-panels input")].some((input) => input.value === "Titolo non salvato"));
  assert.equal(controller.state.drafts.get("collection:events:fixture").position, 4);
  assert.equal(controller.state.drafts.get("collection:events:fixture").media[0].id, 91);
  assert.ok([...document.querySelectorAll("#admin-panels img")].some((image) => image.getAttribute("src") === "/media/events/fixture/new.webp"));
});

test("real admin controller keeps only a nested collection leaf dirty when a server refresh changes its sibling", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  let serverEvent = event();
  const fetch = async (path) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([serverEvent]);
    if (path === "/api/admin/archive") return response([]);
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));

  const seoTitle = [...document.querySelectorAll("#admin-panels input")].find((input) => input.value === "SEO");
  seoTitle.value = "SEO locale";
  seoTitle.dispatchEvent(new window.Event("input"));
  serverEvent = { ...serverEvent, seo: { title: "SEO dal server", description: "Descrizione dal server" } };
  await controller.reloadCollections();
  controller.render();

  const resource = "collection:events:fixture";
  assert.deepEqual(controller.state.drafts.dirtyPaths(resource), [["seo", "title"]]);
  assert.deepEqual(controller.state.drafts.get(resource).seo, { title: "SEO locale", description: "Descrizione dal server" });
  assert.ok([...document.querySelectorAll("#admin-panels input")].some((input) => input.value === "SEO locale"));
  assert.ok([...document.querySelectorAll("#admin-panels input")].some((input) => input.value === "Descrizione dal server"));
});

test("real admin controller refreshes a child media position after reload without losing its unsaved alt", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  let serverEvent = {
    ...event(),
    media: [{ id: 17, role: "detail", position: 0, src: "/media/events/fixture/detail.webp", alt: "Alt server iniziale" }],
  };
  const fetch = async (path) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([serverEvent]);
    if (path === "/api/admin/archive") return response([]);
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const stored = [...document.querySelectorAll(".admin-media")].find((section) => section.querySelector("img")?.getAttribute("src") === "/media/events/fixture/detail.webp");
  const alt = stored.querySelector('input[type="text"]');
  alt.value = "Alt editoriale non salvato";
  alt.dispatchEvent(new window.Event("input"));

  serverEvent = {
    ...serverEvent,
    media: [{ ...serverEvent.media[0], position: 1, alt: "Alt canonicalizzato dal server" }],
  };
  await controller.reloadCollections();
  controller.render();

  const resource = "media:events:fixture:stored:17";
  assert.equal(controller.state.drafts.get(resource).alt, "Alt editoriale non salvato");
  assert.equal(controller.state.drafts.get(resource).position, 1);
  const reloaded = [...document.querySelectorAll(".admin-media")].find((section) => section.querySelector("img")?.getAttribute("src") === "/media/events/fixture/detail.webp");
  assert.equal(reloaded.querySelector('input[type="number"]').value, "1");
});

test("real admin controller clears slug-keyed parent and media drafts after deleting a parent", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  window.confirm = () => true;
  let deleted = false;
  const stored = { ...event(), media: [{ id: 7, role: "cover", position: 0, src: "/media/events/fixture/cover.webp", alt: "Cover salvata" }] };
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response(deleted ? [] : [stored]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/events/fixture" && init.method === "DELETE") { deleted = true; return response({ deleted: true }); }
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const alt = document.querySelector(".admin-media input[type=\"text\"]");
  alt.value = "Alt non salvato";
  alt.dispatchEvent(new window.Event("input"));
  const parent = [...document.querySelectorAll("#admin-panels input")].find((input) => input.value === "Evento iniziale");
  parent.value = "Titolo non salvato";
  parent.dispatchEvent(new window.Event("input"));
  const parentKey = "collection:events:fixture";
  const mediaKey = "media:events:fixture:stored:7";
  assert.ok(controller.state.drafts.get(parentKey));
  assert.ok(controller.state.drafts.get(mediaKey));
  assert.equal(controller.state.dirty.has(parentKey), true);
  assert.equal(controller.state.dirty.has(mediaKey), true);

  [...document.querySelectorAll("button")].find((button) => button.textContent === "Delete").dispatchEvent(new window.Event("click"));
  await settled();
  assert.equal(controller.state.drafts.get(parentKey), undefined);
  assert.equal(controller.state.drafts.get(mediaKey), undefined);
  assert.equal(controller.state.dirty.has(parentKey), false);
  assert.equal(controller.state.dirty.has(mediaKey), false);
  assert.equal(controller.state.busy.has(mediaKey), false);
});

test("real admin controller clears new parent state and remaps child media drafts after first save", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const saved = { ...event("nuovo-evento-2"), id: 42, title: "Nuovo elemento" };
  let created = false;
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events" && init.method === "POST") { created = true; return response(saved, 201); }
    if (path === "/api/admin/events") return response(created ? [event(), saved] : [event()]);
    if (path === "/api/admin/archive") return response([]);
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  [...document.querySelectorAll("button")].find((button) => button.textContent.startsWith("Create")).dispatchEvent(new window.Event("click"));
  const freshAlt = [...document.querySelectorAll(".admin-media input[type=\"text\"]")].at(-1);
  freshAlt.value = "Alt nuovo non salvato";
  freshAlt.dispatchEvent(new window.Event("input"));
  const newCard = [...document.querySelectorAll(".admin-card")].find((card) => card.querySelector("h3")?.textContent === "Nuovo elemento");
  [...newCard.querySelectorAll("button")].find((button) => button.textContent === "Save").dispatchEvent(new window.Event("click"));
  await settled();

  const oldParent = "collection:events:new-1";
  const oldMedia = "media:events:new-1:new:cover:0";
  const savedMedia = "media:events:nuovo-evento-2:new:cover:0";
  assert.equal(controller.state.drafts.get(oldParent), undefined);
  assert.equal(controller.state.drafts.get(oldMedia), undefined);
  assert.equal(controller.state.dirty.has(oldParent), false);
  assert.equal(controller.state.drafts.get(savedMedia).alt, "Alt nuovo non salvato");
  assert.equal(controller.state.dirty.has(savedMedia), true);
});

test("real admin controller remaps late new-parent and child edits to the saved slug without clearing them", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const save = deferred();
  const saved = { ...event("nuovo-evento-2"), id: 42, title: "Titolo inviato" };
  let created = false;
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events" && init.method === "POST") return save.promise;
    if (path === "/api/admin/events") return response(created ? [event(), saved] : [event()]);
    if (path === "/api/admin/archive") return response([]);
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  [...document.querySelectorAll("button")].find((button) => button.textContent.startsWith("Create")).dispatchEvent(new window.Event("click"));
  const newCard = [...document.querySelectorAll(".admin-card")].find((card) => card.querySelector("h3")?.textContent === "Nuovo elemento");
  [...newCard.querySelectorAll("button")].find((button) => button.textContent === "Save").dispatchEvent(new window.Event("click"));
  await settled();

  const oldParent = "collection:events:new-1";
  const oldMedia = "media:events:new-1:new:cover:0";
  controller.state.drafts.set(oldParent, ["title"], "Titolo arrivato tardi");
  controller.state.dirty.mark(oldParent);
  controller.state.drafts.set(oldMedia, ["alt"], "Alt arrivato tardi");
  controller.state.dirty.mark(oldMedia);
  created = true;
  save.resolve(response(saved, 201));
  await settled();

  const parent = "collection:events:nuovo-evento-2";
  const media = "media:events:nuovo-evento-2:new:cover:0";
  assert.equal(controller.state.drafts.get(oldParent), undefined);
  assert.equal(controller.state.drafts.get(oldMedia), undefined);
  assert.equal(controller.state.drafts.get(parent).title, "Titolo arrivato tardi");
  assert.deepEqual(controller.state.drafts.dirtyPaths(parent), [["title"]]);
  assert.equal(controller.state.drafts.get(media).alt, "Alt arrivato tardi");
  assert.deepEqual(controller.state.drafts.dirtyPaths(media), [["alt"]]);
  assert.equal(controller.state.dirty.has(parent), true);
  assert.equal(controller.state.dirty.has(media), true);
});

test("real admin controller reloads a stored upload and reveals its fallback after delete", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  let media = [];
  const storedCover = { id: 88, role: "cover", position: 0, src: "/media/events/fixture/uploaded.webp", alt: "Cover caricata" };
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([{ ...event(), media }]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/media" && init.method === "POST") { media = [storedCover]; return response(storedCover, 201); }
    if (path === "/api/admin/media/events/88" && init.method === "DELETE") { media = []; return response({ id: 88, deleted: true }); }
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({
    document,
    window,
    fetch,
    optimizeImage: async () => [{ width: 640, blob: new Blob(["webp"], { type: "image/webp" }) }],
  });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const file = [...document.querySelectorAll(".admin-media")]
    .find((section) => section.querySelector("select")?.value === "cover")
    .querySelector('input[type="file"]');
  Object.defineProperty(file, "files", { configurable: true, value: [{ type: "image/png" }] });
  file.dispatchEvent(new window.Event("change"));
  await settled();
  assert.ok([...document.querySelectorAll("#admin-panels img")].some((image) => image.getAttribute("src") === "/media/events/fixture/uploaded.webp"));
  assert.equal([...document.querySelectorAll("#admin-panels img")].some((image) => image.getAttribute("src") === "/fallback/card.webp"), false);

  [...document.querySelectorAll("button")].find((button) => button.textContent === "Remove image").dispatchEvent(new window.Event("click"));
  await settled();
  assert.ok([...document.querySelectorAll("#admin-panels img")].some((image) => image.getAttribute("src") === "/fallback/card.webp"));
});

test("real admin controller remaps a newer upload draft when a pending upload completes", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const upload = deferred();
  const stored = { id: 88, role: "cover", position: 0, src: "/media/events/fixture/uploaded.webp", alt: "Alt dal server" };
  let media = [];
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([{ ...event(), media }]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/media" && init.method === "POST") return upload.promise;
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({
    document,
    window,
    fetch,
    optimizeImage: async () => [{ width: 640, blob: new Blob(["webp"], { type: "image/webp" }) }],
  });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const file = document.querySelector('.admin-media input[type="file"]');
  Object.defineProperty(file, "files", { configurable: true, value: [{ type: "image/png" }] });
  file.dispatchEvent(new window.Event("change"));
  await settled();

  const oldResource = "media:events:fixture:fallback:cover:0";
  const storedResource = "media:events:fixture:stored:88";
  controller.state.drafts.set(oldResource, ["alt"], "Alt arrivato tardi");
  controller.state.dirty.mark(oldResource);
  media = [stored];
  upload.resolve(response(stored, 201));
  await settled();

  assert.equal(controller.state.drafts.get(oldResource), undefined);
  assert.equal(controller.state.drafts.get(storedResource).alt, "Alt arrivato tardi");
  assert.equal(controller.state.dirty.has(storedResource), true);
});

test("real admin controller renders exactly one merged cover editor and uses a video preview when appropriate", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  let serverEvent = {
    ...event(),
    cardMedia: { type: "video", src: "/fallback/card.mp4", poster: "/fallback/card-poster.webp", alt: "Card video" },
    media: [],
  };
  const fetch = async (path) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([serverEvent]);
    if (path === "/api/admin/archive") return response([]);
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));

  const coverEditors = () => [...document.querySelectorAll(".admin-media")]
    .filter((section) => section.querySelector("select")?.value === "cover");
  assert.equal(coverEditors().length, 1);
  const video = coverEditors()[0].querySelector("video");
  assert.ok(video);
  assert.equal(video.src, "/fallback/card.mp4");
  assert.equal(video.getAttribute("poster"), "/fallback/card-poster.webp");
  assert.equal(video.hasAttribute("controls"), true);

  serverEvent = { ...serverEvent, cardMedia: undefined, coverMedia: undefined, media: [] };
  await controller.reloadCollections();
  controller.render();
  const blankCovers = coverEditors();
  assert.equal(blankCovers.length, 1);
  assert.equal(blankCovers[0].innerHTML.includes("src="), false);
  assert.equal(blankCovers[0].innerHTML.includes("<video"), false);
});

test("real admin controller keeps a default draft under its slug when first media upload materializes an id", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const defaultEvent = event();
  delete defaultEvent.id;
  let materialized = false;
  let media = [];
  const storedCover = { id: 88, role: "cover", position: 0, src: "/media/events/fixture/uploaded.webp", alt: "Cover caricata" };
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([{ ...defaultEvent, ...(materialized ? { id: 91 } : {}), media }]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/media" && init.method === "POST") {
      materialized = true;
      media = [storedCover];
      return response(storedCover, 201);
    }
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({
    document,
    window,
    fetch,
    optimizeImage: async () => [{ width: 640, blob: new Blob(["webp"], { type: "image/webp" }) }],
  });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const title = [...document.querySelectorAll("#admin-panels input")].find((input) => input.value === "Evento iniziale");
  title.value = "Titolo default non salvato";
  title.dispatchEvent(new window.Event("input"));
  const file = document.querySelector('.admin-media input[type="file"]');
  Object.defineProperty(file, "files", { configurable: true, value: [{ type: "image/png" }] });
  file.dispatchEvent(new window.Event("change"));
  await settled();

  const resource = "collection:events:fixture";
  assert.equal(controller.state.collections.events[0].id, 91);
  assert.equal(controller.state.drafts.get(resource).title, "Titolo default non salvato");
  assert.equal(controller.state.drafts.get("collection:events:91"), undefined);
  assert.deepEqual(controller.state.drafts.dirtyPaths(resource), [["title"]]);
  assert.equal(controller.state.dirty.count, 1);
  assert.ok([...document.querySelectorAll("#admin-panels input")].some((input) => input.value === "Titolo default non salvato"));
});

test("real admin controller reloads media metadata while retaining an unrelated editorial draft", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  let media = [{ id: 88, role: "cover", position: 0, src: "/media/events/fixture/cover.webp", alt: "Cover iniziale" }];
  let metadataRequest;
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([{ ...event(), media }]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/media/events/88" && init.method === "PUT") {
      metadataRequest = JSON.parse(init.body);
      media = [{ ...media[0], alt: "Alt canonicalizzato" }];
      return response(media[0]);
    }
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const title = [...document.querySelectorAll("#admin-panels input")].find((input) => input.value === "Evento iniziale");
  title.value = "Titolo editoriale da trattenere";
  title.dispatchEvent(new window.Event("input"));
  const alt = document.querySelector('.admin-media input[type="text"]');
  alt.value = "Alt inviato";
  alt.dispatchEvent(new window.Event("input"));
  [...document.querySelectorAll("button")].find((button) => button.textContent === "Save media").dispatchEvent(new window.Event("click"));
  await settled();

  assert.deepEqual(metadataRequest, { role: "cover", alt: "Alt inviato", position: 0 });
  assert.ok([...document.querySelectorAll("#admin-panels input")].some((input) => input.value === "Titolo editoriale da trattenere"));
  assert.ok([...document.querySelectorAll("#admin-panels img")].some((image) => image.getAttribute("alt") === "Alt canonicalizzato"));
});

test("real admin controller keeps a newer media metadata draft when a pending metadata save completes", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const patch = deferred();
  let media = [{ id: 88, role: "cover", position: 0, src: "/media/events/fixture/cover.webp", alt: "Alt iniziale" }];
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([{ ...event(), media }]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/media/events/88" && init.method === "PUT") return patch.promise;
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const stored = [...document.querySelectorAll(".admin-media")].find((section) => section.querySelector("img")?.getAttribute("src") === "/media/events/fixture/cover.webp");
  const alt = stored.querySelector('input[type="text"]');
  alt.value = "Alt inviata";
  alt.dispatchEvent(new window.Event("input"));
  [...stored.querySelectorAll("button")].find((button) => button.textContent === "Save media").dispatchEvent(new window.Event("click"));
  await settled();

  const resource = "media:events:fixture:stored:88";
  controller.state.drafts.set(resource, ["alt"], "Alt arrivato tardi");
  controller.state.dirty.mark(resource);
  media = [{ ...media[0], alt: "Alt canonicalizzato dal server" }];
  patch.resolve(response(media[0]));
  await settled();

  assert.equal(controller.state.drafts.get(resource).alt, "Alt arrivato tardi");
  assert.equal(controller.state.dirty.has(resource), true);
});

test("real admin controller keeps a newer media draft when a pending delete completes", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const deletion = deferred();
  let media = [{ id: 88, role: "cover", position: 0, src: "/media/events/fixture/cover.webp", alt: "Alt iniziale" }];
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([{ ...event(), media }]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/media/events/88" && init.method === "DELETE") return deletion.promise;
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const stored = [...document.querySelectorAll(".admin-media")].find((section) => section.querySelector("img")?.getAttribute("src") === "/media/events/fixture/cover.webp");
  [...stored.querySelectorAll("button")].find((button) => button.textContent === "Remove image").dispatchEvent(new window.Event("click"));
  await settled();

  const resource = "media:events:fixture:stored:88";
  controller.state.drafts.set(resource, ["alt"], "Alt arrivato tardi");
  controller.state.dirty.mark(resource);
  media = [];
  deletion.resolve(response({ id: 88, deleted: true }));
  await settled();

  assert.equal(controller.state.drafts.get(resource).alt, "Alt arrivato tardi");
  assert.equal(controller.state.dirty.has(resource), true);
  assert.deepEqual(controller.state.collections.events[0].media, []);
});

test("real admin controller sends only a complete media order and rebases positions without clearing title or summary drafts", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  let media = [
    { id: 1, role: "cover", position: 0, src: "/media/events/fixture/cover.webp", alt: "Cover" },
    { id: 2, role: "detail", position: 0, src: "/media/events/fixture/detail-0.webp", alt: "Dettaglio zero" },
    { id: 3, role: "detail", position: 1, src: "/media/events/fixture/detail-1.webp", alt: "Dettaglio uno" },
  ];
  let orderRequest;
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([{ ...event(), media }]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/media/_order" && init.method === "PUT") {
      orderRequest = JSON.parse(init.body);
      const positions = new Map(orderRequest.items.map((item) => [item.id, item.position]));
      media = media.map((item) => ({ ...item, position: positions.get(item.id) }));
      return response(orderRequest.items);
    }
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const title = [...document.querySelectorAll("#admin-panels input")].find((input) => input.value === "Evento iniziale");
  const summary = [...document.querySelectorAll("#admin-panels input")].find((input) => input.value === "Sommario");
  title.value = "Titolo locale";
  title.dispatchEvent(new window.Event("input"));
  summary.value = "Sommario locale";
  summary.dispatchEvent(new window.Event("input"));
  const card = [...document.querySelectorAll(".admin-card")].find((entry) => entry.querySelector("h3")?.textContent === "Evento iniziale");
  [...card.querySelectorAll(".admin-media button")].find((button) => button.textContent === "Reorder ↓").dispatchEvent(new window.Event("click"));
  await settled();

  assert.deepEqual(orderRequest, {
    ownerType: "events", ownerSlug: "fixture",
    items: [{ id: 1, position: 0 }, { id: 2, position: 1 }, { id: 3, position: 0 }],
  });
  const parent = controller.state.drafts.get("collection:events:fixture");
  assert.equal(parent.title, "Titolo locale");
  assert.equal(parent.summary, "Sommario locale");
  assert.deepEqual(controller.state.drafts.dirtyPaths("collection:events:fixture"), [["title"], ["summary"]]);
  assert.equal(controller.state.drafts.get("media:events:fixture:stored:2").position, 1);
  assert.equal(controller.state.drafts.get("media:events:fixture:stored:3").position, 0);
  assert.equal(controller.state.dirty.count, 1);
  assert.equal(controller.state.dirty.has("media-order:collection:events:fixture"), false);
});

test("real admin controller keeps a newer media-order draft when a pending media reorder completes", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const order = deferred();
  const media = [
    { id: 1, role: "cover", position: 0, src: "/media/events/fixture/cover.webp", alt: "Cover" },
    { id: 2, role: "detail", position: 0, src: "/media/events/fixture/detail-0.webp", alt: "Dettaglio zero" },
    { id: 3, role: "detail", position: 1, src: "/media/events/fixture/detail-1.webp", alt: "Dettaglio uno" },
  ];
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([{ ...event(), media }]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/media/_order" && init.method === "PUT") return order.promise;
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const detail = [...document.querySelectorAll(".admin-media")].find((section) => section.querySelector("img")?.getAttribute("src") === "/media/events/fixture/detail-0.webp");
  [...detail.querySelectorAll("button")].find((button) => button.textContent === "Reorder ↓").dispatchEvent(new window.Event("click"));
  await settled();

  const orderResource = "media-order:collection:events:fixture";
  const parentResource = "collection:events:fixture";
  const newerItems = [{ id: 1, position: 0 }, { id: 2, position: 0 }, { id: 3, position: 1 }];
  controller.state.drafts.set(orderResource, ["items"], newerItems);
  controller.state.dirty.mark(orderResource);
  controller.state.drafts.set(parentResource, ["title"], "Titolo arrivato tardi");
  controller.state.dirty.mark(parentResource);
  order.resolve(response([{ id: 1, role: "cover", position: 0 }, { id: 2, role: "detail", position: 1 }, { id: 3, role: "detail", position: 0 }]));
  await settled();

  assert.deepEqual(controller.state.drafts.get(orderResource).items, newerItems);
  assert.equal(controller.state.dirty.has(orderResource), true);
  assert.equal(controller.state.drafts.get(parentResource).title, "Titolo arrivato tardi");
  assert.deepEqual(controller.state.collections.events[0].media.map(({ id, position }) => ({ id, position })), [
    { id: 1, position: 0 }, { id: 2, position: 0 }, { id: 3, position: 1 },
  ]);
});

test("real admin controller preserves a newer draft revision when a pending save resolves", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const save = deferred();
  let serverEvent = event();
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([serverEvent]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/events/fixture" && init.method === "PUT") return save.promise;
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const title = [...document.querySelectorAll("#admin-panels input")].find((input) => input.value === "Evento iniziale");
  title.value = "Versione inviata";
  title.dispatchEvent(new window.Event("input"));
  const card = [...document.querySelectorAll(".admin-card")].find((entry) => entry.querySelector("h3")?.textContent === "Evento iniziale");
  const actions = [...card.children].find((child) => child.className === "admin-actions");
  [...actions.querySelectorAll("button")].find((button) => button.textContent === "Save").dispatchEvent(new window.Event("click"));
  await settled();

  const resource = "collection:events:fixture";
  controller.state.drafts.set(resource, ["title"], "Versione piu recente");
  controller.state.dirty.mark(resource);
  serverEvent = { ...serverEvent, title: "Versione server" };
  save.resolve(response(serverEvent));
  await settled();

  assert.equal(controller.state.drafts.get(resource).title, "Versione piu recente");
  assert.equal(controller.state.dirty.has(resource), true);
  assert.ok([...document.querySelectorAll("#admin-panels input")].some((input) => input.value === "Versione piu recente"));
});

test("real admin controller rebases cached positions after a collection reorder without clearing an editorial draft", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const first = event();
  const second = { ...event("secondo"), id: 42, title: "Secondo evento", code: "TR-42", position: 1 };
  const reordered = [{ ...second, position: 0 }, { ...first, position: 1 }];
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([first, second]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/events/_order" && init.method === "PUT") return response(reordered);
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const title = [...document.querySelectorAll("#admin-panels input")].find((input) => input.value === "Evento iniziale");
  title.value = "Titolo da trattenere";
  title.dispatchEvent(new window.Event("input"));
  controller.state.dirty.mark("collection-order:events");
  const firstCard = [...document.querySelectorAll(".admin-card")].find((card) => card.querySelector("h3")?.textContent === "Evento iniziale");
  const actions = [...firstCard.children].find((child) => child.className === "admin-actions");
  [...actions.querySelectorAll("button")].find((button) => button.textContent === "Reorder ↓").dispatchEvent(new window.Event("click"));
  await settled();

  assert.equal(controller.state.collections.events[0].slug, "secondo");
  assert.equal(controller.state.drafts.get("collection:events:fixture").title, "Titolo da trattenere");
  assert.equal(controller.state.drafts.get("collection:events:fixture").position, 1);
  assert.equal(controller.state.busy.has("collection-order:events"), false);
  assert.equal(controller.state.dirty.has("collection-order:events"), false);
  assert.equal(controller.state.dirty.has("collection:events:fixture"), true);
});

test("real admin controller leaves collection state and order draft untouched when a pending reorder becomes stale", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const pendingOrder = deferred();
  const first = event();
  const second = { ...event("secondo"), id: 42, title: "Secondo evento", code: "TR-42", position: 1 };
  const reordered = [{ ...second, position: 0 }, { ...first, position: 1 }];
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([first, second]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/events/_order" && init.method === "PUT") return pendingOrder.promise;
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const firstCard = [...document.querySelectorAll(".admin-card")].find((card) => card.querySelector("h3")?.textContent === "Evento iniziale");
  const actions = [...firstCard.children].find((child) => child.className === "admin-actions");
  [...actions.querySelectorAll("button")].find((button) => button.textContent === "Reorder ↓").dispatchEvent(new window.Event("click"));
  await settled();

  const itemResource = "collection:events:fixture";
  const orderResource = "collection-order:events";
  controller.state.drafts.set(itemResource, ["title"], "Titolo arrivato tardi");
  controller.state.dirty.mark(itemResource);
  pendingOrder.resolve(response(reordered));
  await settled();

  assert.deepEqual(controller.state.collections.events.map(({ slug, position }) => ({ slug, position })), [
    { slug: "fixture", position: 0 }, { slug: "secondo", position: 1 },
  ]);
  assert.equal(controller.state.drafts.get(itemResource).title, "Titolo arrivato tardi");
  assert.equal(controller.state.dirty.has(itemResource), true);
  assert.ok(controller.state.drafts.get(orderResource));
});

test("real admin controller resets its DOM on a 401 and clears every editor resource", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([event()]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/events/fixture" && init.method === "PUT") return response({ error: "Sessione scaduta" }, 401);
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));
  const title = [...document.querySelectorAll("#admin-panels input")].find((input) => input.value === "Evento iniziale");
  title.value = "Modifica da eliminare";
  title.dispatchEvent(new window.Event("input"));
  const card = [...document.querySelectorAll(".admin-card")].find((entry) => entry.querySelector("h3")?.textContent === "Evento iniziale");
  const actions = [...card.children].find((child) => child.className === "admin-actions");
  [...actions.querySelectorAll("button")].find((button) => button.textContent === "Save").dispatchEvent(new window.Event("click"));
  await settled();

  assert.equal(document.querySelector("#admin-editor").hidden, true);
  assert.equal(document.querySelector("#admin-login").hidden, false);
  assert.equal(document.querySelector("#admin-login-status").textContent, "Sessione scaduta. Accedi di nuovo.");
  assert.equal(controller.state.csrfToken, "");
  assert.equal(controller.state.collections.events.length, 0);
  assert.equal(controller.state.drafts.get("collection:events:fixture"), undefined);
  assert.equal(controller.state.dirty.count, 0);
  assert.equal(controller.state.busy.busy, false);
  assert.equal(document.activeElement, document.querySelector("#admin-login-form input"));
});

test("real admin controller classifies a stale transport failure without overwriting newer-session focus or status", async () => {
  const { document, window } = parseHTML(SHELL);
  let activeElement = document.body;
  Object.defineProperty(document, "activeElement", { configurable: true, get: () => activeElement });
  window.HTMLElement.prototype.focus = function focus() { activeElement = this; };
  const slow = deferred();
  const fetch = async (path) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([event()]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/slow") return slow.promise;
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();
  const request = controller.api("/slow");
  controller.reset("Nuova sessione.");
  slow.reject(new TypeError("Network disconnected"));

  await assert.rejects(request, (error) => error?.stale === true);
  assert.equal(document.querySelector("#admin-login-status").textContent, "Nuova sessione.");
  assert.equal(document.activeElement, document.querySelector("#admin-login-form input"));
  assert.equal(document.querySelector("#admin-editor").hidden, true);
});

test("content card can be edited again immediately after a terminal save", async () => {
  const { document, window } = parseHTML(SHELL);
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": "Home" });
    if (path === "/api/admin/events") return response([event()]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/content/home.title" && init.method === "PUT") return response({ value: "Salvato" });
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();

  const card = [...document.querySelectorAll(".admin-card")].find((entry) => entry.querySelector(".admin-key")?.textContent === "home.title");
  const input = card.querySelector("input");
  input.value = "Salvato";
  input.dispatchEvent(new window.Event("input"));
  [...card.querySelectorAll("button")].find((control) => control.textContent === "Save").dispatchEvent(new window.Event("click"));
  await settled();

  input.value = "Seconda modifica";
  assert.doesNotThrow(() => input.dispatchEvent(new window.Event("input")));
  assert.equal(controller.state.drafts.get("content:home.title"), "Seconda modifica");
});

test("content card can be edited again immediately after cancel and restore", async () => {
  const { document, window } = parseHTML(SHELL);
  let restored = false;
  const fetch = async (path, init = {}) => {
    if (path === "/api/admin/session") return response({ csrfToken: "csrf" });
    if (path === "/api/content") return response({ "home.title": restored ? "Placeholder" : "Home" });
    if (path === "/api/admin/events") return response([event()]);
    if (path === "/api/admin/archive") return response([]);
    if (path === "/api/admin/content/home.title" && init.method === "DELETE") { restored = true; return response({ deleted: true }); }
    return response({ error: "Unexpected request" }, 500);
  };
  const controller = createAdminController({ document, window, fetch, optimizeImage: async () => [] });
  controller.boot();
  await settled();

  const card = [...document.querySelectorAll(".admin-card")].find((entry) => entry.querySelector(".admin-key")?.textContent === "home.title");
  let input = card.querySelector("input");
  input.value = "Da annullare";
  input.dispatchEvent(new window.Event("input"));
  [...card.querySelectorAll("button")].find((control) => control.textContent === "Cancel").dispatchEvent(new window.Event("click"));
  input = card.querySelector("input");
  input.value = "Dopo annulla";
  assert.doesNotThrow(() => input.dispatchEvent(new window.Event("input")));

  [...card.querySelectorAll("button")].find((control) => control.textContent === "Restore placeholder").dispatchEvent(new window.Event("click"));
  await settled();
  input = card.querySelector("input");
  input.value = "Dopo ripristino";
  assert.doesNotThrow(() => input.dispatchEvent(new window.Event("input")));
  assert.equal(controller.state.drafts.get("content:home.title"), "Dopo ripristino");
});

test("collection card can be edited again immediately after cancel", async () => {
  const { document, window, controller } = harness();
  controller.boot();
  await settled();
  document.querySelector('[data-admin-section="events"]').dispatchEvent(new window.Event("click"));

  const card = [...document.querySelectorAll(".admin-card")].find((entry) => entry.querySelector("h3")?.textContent === "Evento iniziale");
  let title = [...card.querySelectorAll("input")].find((input) => input.value === "Evento iniziale");
  title.value = "Da annullare";
  title.dispatchEvent(new window.Event("input"));
  [...card.querySelectorAll("button")].find((control) => control.textContent === "Cancel").dispatchEvent(new window.Event("click"));
  title = [...card.querySelectorAll("input")].find((input) => input.value === "Evento iniziale");
  title.value = "Dopo annulla";
  assert.doesNotThrow(() => title.dispatchEvent(new window.Event("input")));
  assert.equal(controller.state.drafts.get("collection:events:fixture").title, "Dopo annulla");
});

test("admin module's browser autostart guard leaves a page without the login form untouched", { concurrency: false }, async () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  const { document, window } = parseHTML("<!doctype html><html><body><main>Public page</main></body></html>");
  let calls = 0;
  try {
    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    Object.defineProperty(globalThis, "window", { configurable: true, value: window });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => { calls += 1; return response({}); } });
    await import(`../src/scripts/admin.js?autostart-guard=${Date.now()}`);
    await settled();
    assert.equal(calls, 0);
  } finally {
    if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor); else delete globalThis.document;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor); else delete globalThis.window;
    if (fetchDescriptor) Object.defineProperty(globalThis, "fetch", fetchDescriptor); else delete globalThis.fetch;
  }
});

test("admin module autostarts once in a browser document with the login form", { concurrency: false }, async () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  const { document, window } = parseHTML(SHELL);
  let sessionCalls = 0;
  try {
    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    Object.defineProperty(globalThis, "window", { configurable: true, value: window });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async (path) => {
        if (path === "/api/admin/session") { sessionCalls += 1; return response({ csrfToken: "csrf" }); }
        if (path === "/api/content") return response({ "home.title": "Home" });
        if (path === "/api/admin/events") return response([event()]);
        if (path === "/api/admin/archive") return response([]);
        return response({ error: "Unexpected request" }, 500);
      },
    });
    await import(`../src/scripts/admin.js?autostart-positive=${Date.now()}`);
    await settled();

    assert.equal(sessionCalls, 1);
    assert.equal(document.querySelector("#admin-login").hidden, true);
    assert.equal(document.querySelector("#admin-editor").hidden, false);
  } finally {
    if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor); else delete globalThis.document;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor); else delete globalThis.window;
    if (fetchDescriptor) Object.defineProperty(globalThis, "fetch", fetchDescriptor); else delete globalThis.fetch;
  }
});
