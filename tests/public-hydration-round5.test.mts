import { d1Double } from './worker-fixtures.mts';
import type { MediaManifestRow } from '../worker/types.ts';
import { must, rect, deferred as deferredValue, installGlobal, restoreGlobal } from './browser-test-utils.mts';
import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { applyContent, hydrateContent } from "../src/scripts/content-hydration.ts";
import { renderDetail } from "../src/scripts/collections-hydration.ts";
import { SITE_CONTENT } from "../src/data/site-content.ts";
import { validMediaSources } from "../src/data/media-source.ts";
import { mediaJson } from "../worker/media.ts";
import { routeRequest } from "../worker/router.ts";

const UUID = "00000000-0000-4000-8000-000000000001";

function mediaSource(slug: string, uuid = UUID, width = 640) {
  return `/media/events/${slug}/${uuid}/${width}.webp`;
}

function mediaItem(slug: string, uuid: string, role: string, position: number, alt: string) {
  return { role, position, alt, sources: [{ src: mediaSource(slug, uuid), width: 640 }] };
}

function observerFor(window: ReturnType<typeof parseHTML>["window"], root: Node | null) {
  const observer = new window.MutationObserver(() => {});
  observer.observe(must(root), { attributes: true, childList: true, characterData: true, subtree: true });
  return observer;
}

test("formatting-only Astro whitespace is a true global no-op without collapsing editorial whitespace", () => {
  const { document, window } = parseHTML(`
    <main>
      <h1 data-content-key="headline">
        <span class="split-text" data-animate-variant="slide">Titolo  editoriale</span>
      </h1>
      <a data-content-key="href" href="/work">Archivio</a>
      <section id="about" data-content-key="about" data-content-render="about">
        <h3 data-animate-variant="slide"><span data-content-path="0">Primo</span></h3>
        <h3 data-animate-variant="slide"><span data-content-path="1">Secondo</span></h3>
      </section>
      <section id="stats" data-content-key="stats" data-content-render="stats">
        <div class="stat-item" data-animate-variant="slide"><div class="stat-count"><h1 data-content-path="0.0">01</h1></div><div class="stat-content"><div class="stat-title"><h3 data-content-path="0.1">Testo</h3></div><div class="stat-info"><p data-content-path="0.2">Etichetta</p></div></div></div>
      </section>
      <section id="contact" data-content-key="contact" data-content-render="contact-rows">
        <div class="contact-info-row"><p data-content-path="0.0">Ora</p><p class="contact-clock" data-content-path="0.1">Roma</p></div>
      </section>
      <section id="meta" data-content-key="meta" data-content-render="project-meta"><p data-animate-variant="flicker"><span data-content-path="0">Meta</span></p></section>
      <section id="columns" data-content-key="columns" data-content-render="project-columns"><div class="project-info-sub-col"><p data-content-path="0.0.0">Chiave</p><p data-content-path="0.0.1">Valore</p><br><br></div></section>
    </main>
  `);
  const main = document.querySelector<HTMLElement>("main");
  const scalar = document.querySelector<HTMLElement>("h1");
  const scalarLeaf = must(scalar).querySelector<HTMLElement>("span");
  const refs = [
    scalar,
    scalarLeaf,
    document.querySelector<HTMLElement>("#about h3"),
    document.querySelector<HTMLElement>("#stats .stat-item"),
    document.querySelector<HTMLElement>("#contact .contact-info-row"),
    document.querySelector<HTMLElement>("#meta p"),
    document.querySelector<HTMLElement>("#columns .project-info-sub-col"),
  ];
  const observer = observerFor(window, main);
  const applied = applyContent(document, {
    headline: "Titolo  editoriale",
    href: "/work",
    about: ["Primo", "Secondo"],
    stats: [["01", "Testo", "Etichetta"]],
    contact: [["Ora", "Roma"]],
    meta: ["Meta"],
    columns: [[["Chiave", "Valore"]]],
  });

  assert.equal(applied, false);
  assert.equal(observer.takeRecords().length, 0);
  assert.equal(document.querySelector<HTMLElement>("h1"), refs[0]);
  assert.equal(document.querySelector<HTMLElement>("h1 span"), refs[1]);
  assert.equal(document.querySelector<HTMLElement>("#about h3"), refs[2]);
  assert.equal(document.querySelector<HTMLElement>("#stats .stat-item"), refs[3]);
  assert.equal(document.querySelector<HTMLElement>("#contact .contact-info-row"), refs[4]);
  assert.equal(document.querySelector<HTMLElement>("#meta p"), refs[5]);
  assert.equal(document.querySelector<HTMLElement>("#columns .project-info-sub-col"), refs[6]);
});

test("changed array rows clone marked templates, reindex every leaf, and keep one contact clock", () => {
  const { document } = parseHTML(`
    <main>
      <section id="stats" data-content-key="stats" data-content-render="stats">
        <div class="stat-item" data-animate-variant="slide"><div class="stat-count"><h1 data-content-path="0.0">01</h1></div><div class="stat-content"><div class="stat-title"><h3 data-content-path="0.1">Uno</h3></div><div class="stat-info"><p data-content-path="0.2">A</p></div></div></div>
      </section>
      <section id="existing-contact" data-content-key="contact-existing" data-content-render="contact-rows"><div class="contact-info-row" data-animate-variant="slide"><p data-content-path="0.0">Ora</p><p class="contact-clock" data-content-path="0.1">Roma</p></div></section>
      <section id="empty-contact" data-content-key="contact-empty" data-content-render="contact-rows"></section>
    </main>
  `);
  applyContent(document, {
    stats: [["01", "Uno", "A"], ["02", "Due", "B"]],
    "contact-existing": [["Ora", "Roma"], ["Base", "Roma, IT"]],
    "contact-empty": [["Uno", "A"], ["Due", "B"]],
  });

  const statRows = document.querySelectorAll<HTMLElement>("#stats .stat-item");
  assert.equal(statRows.length, 2);
  assert.equal(must(statRows[1]).getAttribute("data-animate-variant"), "slide");
  assert.deepEqual([...must(statRows[1]).querySelectorAll<HTMLElement>("[data-content-path]")].map((node) => node.getAttribute("data-content-path")), ["1.0", "1.1", "1.2"]);
  for (const id of ["existing-contact", "empty-contact"]) {
    const contact = document.querySelector(`#${id}`);
    assert.equal(must(contact).querySelectorAll<HTMLElement>(".contact-clock").length, 1);
    assert.equal(must(must(contact).querySelector<HTMLElement>(".contact-clock")).textContent, id === "existing-contact" ? "Roma" : "A");
  }

  applyContent(document, { "contact-existing": [["Ora", "Roma"], ["Base", "Roma, IT"], ["Canale", "ciao@example.test"]], "contact-empty": [["Uno", "A"], ["Due", "B"], ["Tre", "C"]] });
  for (const id of ["existing-contact", "empty-contact"]) {
    const contact = document.querySelector(`#${id}`);
    assert.equal(must(contact).querySelectorAll<HTMLElement>(".contact-clock").length, 1);
    assert.deepEqual([...must(contact).querySelectorAll<HTMLElement>(".contact-info-row [data-content-path]")].map((node) => node.getAttribute("data-content-path")), ["0.0", "0.1", "1.0", "1.1", "2.0", "2.1"]);
  }
});

test("hydrateContent dispatches only changed keys and leaves default menu and clients untouched", async () => {
  const { document, window } = parseHTML(`
    <main>
      <div id="clients" data-content-key="home.clients.rows" data-content-render="clients">
        ${SITE_CONTENT["home.clients.rows"].map(([name, place]) => `<div class="client-row" data-animate-variant="slide"><p>${name}</p><p>${place}</p></div>`).join("")}
      </div>
      <div id="menu" data-content-key="global.menu.items" data-content-render="menu"><div class="joystick"></div>${SITE_CONTENT["global.menu.items"].map(([label, href]) => `<a class="menu-segment" href="${href}">${label}</a>`).join("")}</div>
    </main>
  `);
  const root = document.querySelector<HTMLElement>("main");
  const firstClient = document.querySelector<HTMLElement>(".client-row");
  const joystick = document.querySelector<HTMLElement>(".joystick");
  const observer = observerFor(window, root);
  const events: Record<string, unknown>[] = [];
  must(root).addEventListener("tutto-rifiuto:content", (event) => { assert.ok(event instanceof window.CustomEvent); events.push(event.detail); });
  const previousFetch = globalThis.fetch;
  let responseNumber = 0;
  globalThis.fetch = async () => {
    const payload = (() => {
      responseNumber += 1;
      return responseNumber === 1 ? {
        "home.clients.rows": SITE_CONTENT["home.clients.rows"],
        "global.menu.items": SITE_CONTENT["global.menu.items"],
      } : {
        "home.clients.rows": [["Nuovo cliente", "Roma"]],
        "global.menu.items": [["Nuovo menu", "/contact"]],
      };
    })();
    return Response.json(payload);
  };
  try {
    assert.equal(await hydrateContent(must(root)), false);
    assert.deepEqual(events, []);
    assert.equal(observer.takeRecords().length, 0);
    assert.equal(document.querySelector<HTMLElement>(".client-row"), firstClient);
    assert.equal(document.querySelector<HTMLElement>(".joystick"), joystick);

    assert.equal(await hydrateContent(must(root)), true);
    assert.deepEqual(Object.keys(must(events[0])).sort(), ["global.menu.items", "home.clients.rows"]);
    assert.equal(must(document.querySelector<HTMLElement>("#clients .client-row p")).textContent, "Nuovo cliente");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("detail media keeps immutable local fallbacks across repeated remote overlays", () => {
  const { document, window } = parseHTML(`
    <div data-public-detail-kind="events" data-public-detail-slug="prova">
      <div data-collection-media="cover"><picture><img src="/_astro/cover-local.webp"></picture></div>
      <div data-collection-media-list>
        <div class="project-img" data-collection-media-slot="detail:0"><picture><img src="/_astro/detail-zero.webp"></picture></div>
        <div class="project-img" data-collection-media-slot="detail:1"><video src="/_astro/detail-one.mp4"></video></div>
      </div>
    </div>
  `);
  const root = document.querySelector<HTMLElement>("div");
  const first = {
    slug: "prova",
    media: [
      mediaItem("prova", "00000000-0000-4000-8000-000000000011", "cover", 0, "Cover A"),
      mediaItem("prova", "00000000-0000-4000-8000-000000000012", "detail", 0, "Dettaglio A"),
      mediaItem("prova", "00000000-0000-4000-8000-000000000013", "detail", 2, "Nuovo"),
    ],
  };
  const second = {
    slug: "prova",
    media: [
      mediaItem("prova", "00000000-0000-4000-8000-000000000021", "cover", 0, "Cover B"),
      mediaItem("prova", "00000000-0000-4000-8000-000000000022", "detail", 0, "Dettaglio B"),
      mediaItem("prova", "00000000-0000-4000-8000-000000000023", "detail", 2, "Nuovo B"),
    ],
  };
  const untouched = must(root).querySelector<HTMLElement>('[data-collection-media-slot="detail:1"] video');
  renderDetail(root, first);
  renderDetail(root, second);
  for (const img of must(root).querySelectorAll<HTMLImageElement>("img")) img.dispatchEvent(new window.Event("error"));

  assert.equal(must(must(root).querySelector<HTMLImageElement>('[data-collection-media="cover"] img')).getAttribute("src"), "/_astro/cover-local.webp");
  assert.equal(must(must(root).querySelector<HTMLImageElement>('[data-collection-media-slot="detail:0"] img')).getAttribute("src"), "/_astro/detail-zero.webp");
  assert.equal(must(root).querySelector<HTMLElement>('[data-collection-media-slot="detail:1"] video'), untouched);
  assert.equal(must(must(root).querySelector<HTMLElement>('[data-collection-media-slot="detail:2"] [data-media-fallback-placeholder]')).getAttribute("aria-label"), "Nuovo B");

  renderDetail(root, second);
  for (const img of must(root).querySelectorAll<HTMLImageElement>("img")) img.dispatchEvent(new window.Event("error"));
  assert.equal(must(must(root).querySelector<HTMLImageElement>('[data-collection-media="cover"] img')).getAttribute("src"), "/_astro/cover-local.webp");
  assert.equal(must(must(root).querySelector<HTMLImageElement>('[data-collection-media-slot="detail:0"] img')).getAttribute("src"), "/_astro/detail-zero.webp");
});

test("worker media JSON applies the shared source set validation for duplicates, casing, and byte limits", () => {
  const key = `events/prova/${UUID}/1280.webp`;
  const key640 = `events/prova/${UUID}/640.webp`;
  const source = (sourceKey: string, width: number) => ({ key: sourceKey, width });
  const row = (overrides: Partial<MediaManifestRow> = {}): MediaManifestRow => ({ id: 1, key, role: "cover", alt: "", position: 0, widths_json: "[1280,640]", sources_json: JSON.stringify([source(key, 1280), source(key640, 640)]), ...overrides });
  const context = { ownerType: "events" as const, ownerSlug: "prova", role: "cover" };

  const valid = mediaJson(row(), context);
  assert.deepEqual(must(valid).widths, [640, 1280]);
  assert.deepEqual(must(valid).sources, validMediaSources([{ src: `/media/${key}`, width: 1280 }, { src: `/media/${key640}`, width: 640 }]));

  assert.equal(mediaJson(row(), { ...context, ownerSlug: "altro" }), null, "a key cannot claim another collection slug");
  assert.equal(mediaJson(row(), { ...context, ownerType: "archive" }), null, "a key cannot cross collection types");
  assert.equal(mediaJson(row(), { ...context, role: "detail" }), null, "a media row cannot cross its expected role");
  assert.equal(Reflect.apply(mediaJson, undefined, [row(), null]), null, "owner context is mandatory");
  assert.equal(mediaJson(row({ sources_json: JSON.stringify([source(key, 1280), source(key640, 1280)]) }), context), null, "source.width must match its filename");
  assert.equal(mediaJson(row({ widths_json: "[640]" }), context), null, "extra stored source must fail closed");
  assert.equal(mediaJson(row({ sources_json: JSON.stringify([source(key640, 640)]) }), context), null, "partial source set must fail closed");
  assert.equal(mediaJson(row({ widths_json: "[640,640]", sources_json: "[]" }), context), null, "duplicate declared widths must fail closed");
  assert.equal(mediaJson(row({ sources_json: JSON.stringify([source(key, 1280), source(`events/altro/${UUID}/640.webp`, 640)]) }), context), null, "cross-owner sources must fail closed");
  assert.equal(mediaJson(row({ sources_json: JSON.stringify([source(key, 1280), source(`events/prova/00000000-0000-4000-8000-000000000002/640.webp`, 640)]) }), context), null, "cross-UUID sources must fail closed");
  assert.equal(mediaJson(row({ key: key.replace("prova", "Prova") }), context), null, "noncanonical primary keys must fail closed");

  const boundarySlug = "a".repeat(180);
  const boundaryKey = `events/${boundarySlug}/${UUID}/640.webp`;
  const boundary = mediaJson({ id: 3, key: boundaryKey, role: "cover", alt: "", position: 0, widths_json: "[640]", sources_json: "[]" }, { ownerType: "events", ownerSlug: boundarySlug, role: "cover" });
  assert.deepEqual(must(boundary).sources, validMediaSources([{ src: `/media/${boundaryKey}`, width: 640 }]));
  const oversizedKey = `events/${"a".repeat(181)}/${UUID}/640.webp`;
  const oversized = mediaJson({ id: 4, key: oversizedKey, role: "cover", alt: "", position: 0, widths_json: "[640]", sources_json: "[]" }, { ownerType: "events", ownerSlug: "a".repeat(181), role: "cover" });
  assert.equal(oversized, null);
});

test("real content hydration applies empty and default menu states idempotently", async () => {
  const { document, window } = parseHTML(`<div class="circular-menu" data-content-key="global.menu.items" data-content-render="menu"><div class="joystick"></div>${SITE_CONTENT["global.menu.items"].map(([label, href]) => `<a class="menu-segment" href="${href}">${label}</a>`).join("")}</div>`);
  const joystick = document.querySelector<HTMLElement>(".joystick");
  let mutationCount = 0;
  const observer = new window.MutationObserver((records) => { mutationCount += records.length; });
  observer.observe(document, { attributes: true, childList: true, characterData: true, subtree: true });
  const events: Record<string, unknown>[] = [];
  document.addEventListener("tutto-rifiuto:content", (event) => { assert.ok(event instanceof window.CustomEvent); events.push(event.detail); });
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  globalThis.document = document;
  globalThis.window = window;
  const responses = [[], [], SITE_CONTENT["global.menu.items"], SITE_CONTENT["global.menu.items"]];
  globalThis.fetch = async () => Response.json({ "global.menu.items": responses.shift() });
  try {
    await import(`../src/scripts/menu.ts?idempotent-menu=${Date.now()}`);
    assert.equal(await hydrateContent(document), true);
    assert.equal(document.querySelectorAll<HTMLElement>(".menu-segment").length, 0);
    assert.equal(document.querySelector<HTMLElement>(".joystick"), joystick);
    assert.equal(events.length, 1);
    assert.ok(mutationCount > 0);

    const afterClearMutations = mutationCount;
    assert.equal(await hydrateContent(document), false);
    assert.equal(events.length, 1);
    assert.equal(mutationCount, afterClearMutations);

    assert.equal(await hydrateContent(document), true);
    const segments = [...document.querySelectorAll<HTMLElement>(".menu-segment")];
    assert.deepEqual(segments.map((segment) => [must(segment.querySelector<HTMLElement>(".label")).textContent, segment.getAttribute("href")]), SITE_CONTENT["global.menu.items"]);
    assert.equal(events.length, 2);
    assert.ok(mutationCount > afterClearMutations);

    const afterDefaultsMutations = mutationCount;
    assert.equal(await hydrateContent(document), false);
    assert.equal(events.length, 2);
    assert.equal(mutationCount, afterDefaultsMutations);
    assert.deepEqual([...document.querySelectorAll<HTMLElement>(".menu-segment")], segments);
  } finally {
    observer.disconnect();
    globalThis.fetch = previousFetch;
    if (previousDocument === undefined) Reflect.deleteProperty(globalThis, "document"); else globalThis.document = previousDocument;
    if (previousWindow === undefined) Reflect.deleteProperty(globalThis, "window"); else globalThis.window = previousWindow;
  }
});

test("SEO asset rewriting explicitly strips If-Match and If-Unmodified-Since validators", async () => {
  let received: Headers | undefined;
  const html = '<title>Fallback</title><meta name="description" content="Fallback"><link rel="canonical" href="https://site.test/work"><meta property="og:title" content="Fallback"><meta property="og:description" content="Fallback"><meta name="twitter:title" content="Fallback"><meta name="twitter:description" content="Fallback">';
  const env = {
    DB: d1Double({ prepare() { return { bind() { return this; }, all: async () => [] }; } }),
    ASSETS: { fetch: async (request: Request) => { received = request.headers; return new Response(html, { headers: { "content-type": "text/html" } }); } },
  };
  await routeRequest(new Request("https://site.test/work", { headers: { "if-match": "tag", "if-unmodified-since": "yesterday" } }), env, {});
  assert.equal(must(received).has("if-match"), false);
  assert.equal(must(received).has("if-unmodified-since"), false);
});
