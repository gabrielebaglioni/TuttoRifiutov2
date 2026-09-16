import { d1Double } from './worker-fixtures.mts';
import { must, rect, deferred as deferredValue, installGlobal, restoreGlobal } from './browser-test-utils.mts';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseHTML } from "linkedom";
import { applyContent, isAllowedLink } from "../src/scripts/content-hydration.ts";
import { eventsForPublicGroup, renderArchive, renderDetail, renderEvents } from "../src/scripts/collections-hydration.ts";
import { escapeAttribute, rewriteMetadata } from "../worker/html-metadata.ts";
import { routeRequest } from "../worker/router.ts";
import { ARCHIVE_DEFAULTS, EVENT_DEFAULTS } from "../worker/collections-defaults.ts";
import { validMediaSources } from "../src/data/media-source.ts";

test("public hydration accepts only relative, HTTPS, and mailto links", () => {
  assert.equal(isAllowedLink("/eventi"), true);
  assert.equal(isAllowedLink("https://example.com"), true);
  assert.equal(isAllowedLink("mailto:ciao@example.com"), true);
  assert.equal(isAllowedLink("//example.com"), false);
  assert.equal(isAllowedLink("javascript:alert(1)"), false);
  assert.equal(isAllowedLink("http://example.com"), false);
});

test("content hydration updates only compatible marked fallback nodes", () => {
  const { document } = parseHTML(`
    <main>
      <h1 data-content-key="home.hero.title">Fallback</h1>
      <a data-content-key="global.footer.email_href" href="mailto:fallback@example.test">Email</a>
      <p data-content-key="home.hero.subtitle">Sottotitolo</p>
    </main>
  `);
  applyContent(document, {
    "home.hero.title": "Titolo <sicuro>",
    "global.footer.email_href": "javascript:alert(1)",
    "home.hero.subtitle": ["tipo errato"],
  });
  assert.equal(must(document.querySelector<HTMLElement>("h1")).textContent, "Titolo <sicuro>");
  assert.equal(must(document.querySelector<HTMLAnchorElement>("a")).getAttribute("href"), "mailto:fallback@example.test");
  assert.equal(must(document.querySelector<HTMLElement>("p")).textContent, "Sottotitolo");
});

test("variable editorial arrays replace their exact fallback structure through DOM builders", () => {
  const { document } = parseHTML('<main><div data-content-key="home.about.paragraphs" data-content-render="about"><h3>Uno</h3></div><div data-content-key="home.how_it_works.items" data-content-render="stats"></div><section data-content-key="contact.info.rows" data-content-render="contact-rows"></section><div data-content-key="project.meta" data-content-render="project-meta"></div><div data-content-key="project.info" data-content-render="project-columns"></div></main>');
  applyContent(document, {
    "home.about.paragraphs": ["Uno", "Due", "Tre"],
    "home.how_it_works.items": [["01", "Testo", "Etichetta"]],
    "contact.info.rows": [["A", "B"], ["C", "D"]],
    "project.meta": ["Uno", "Due"],
    "project.info": [[["Etichetta", "Valore"]]],
  });
  assert.equal(document.querySelectorAll<HTMLElement>('[data-content-render="about"] h3').length, 3);
  assert.equal(document.querySelectorAll<HTMLElement>('[data-content-render="stats"] .stat-item').length, 1);
  assert.equal(document.querySelectorAll<HTMLElement>('[data-content-render="contact-rows"] .contact-info-row').length, 2);
  assert.equal(document.querySelectorAll<HTMLElement>('[data-content-render="project-meta"] p').length, 2);
  assert.equal(document.querySelectorAll<HTMLElement>('[data-content-render="project-columns"] .project-info-sub-col').length, 1);
});

test("collection renderers use DOM APIs and preserve rejected fallback media", () => {
  const { document } = parseHTML('<div id="events">fallback</div><div id="archive">fallback</div>');
  const events = document.querySelector<HTMLElement>("#events");
  const archive = document.querySelector<HTMLElement>("#archive");
  renderEvents(events, [{
    slug: "nuovo-evento", title: "Evento <sicuro>", code: "TR-E-99", status: "upcoming",
    cardMedia: { type: "image", sources: [{ src: "/media/events/nuovo/00000000-0000-4000-8000-000000000001/640.webp", width: 640 }], alt: "Fallback" },
    media: [{ role: "cover", position: 0, alt: "Copertina", sources: [{ src: "/media/events/nuovo/00000000-0000-4000-8000-000000000002/640.webp", width: 640 }] }],
  }]);
  renderArchive(archive, [{
    slug: "nuovo-pacchetto", title: "Archivio", code: "TR-99", href: "javascript:alert(1)",
    coverMedia: { type: "image", sources: [{ src: "https://example.test/cover.webp", width: 640 }], alt: "Copertina" },
  }]);
  assert.equal(must(must(events).querySelector<HTMLAnchorElement>("a")).getAttribute("href"), "/eventi/nuovo-evento");
  assert.equal(must(must(events).querySelector<HTMLElement>("p")).textContent, "Evento <sicuro>");
  assert.equal(must(must(events).querySelector<HTMLImageElement>("img")).getAttribute("src"), "/media/events/nuovo/00000000-0000-4000-8000-000000000002/640.webp");
  assert.equal(must(archive).textContent, "fallback", "unsafe data leaves the server fallback intact");
});

test("collection hydration retains local fallback media while updating a stored record's copy", () => {
  const { document } = parseHTML('<div id="events"><div class="work-item-row" data-collection-slug="esistente"><a href="/eventi/esistente"><div class="work-item"><img src="/_astro/fallback.webp" alt="Fallback"><div class="work-item-info"><p>Prima</p><p>TR-E-01</p></div></div></a></div></div>');
  const container = document.querySelector<HTMLElement>("#events");
  assert.equal(renderEvents(container, [{ slug: "esistente", title: "Dopo", code: "TR-E-01", status: "upcoming", cardMedia: { type: "image", src: "/fallback/esistente.webp", alt: "Fallback" } }]), true);
  assert.equal(must(must(container).querySelector<HTMLImageElement>("img")).getAttribute("src"), "/_astro/fallback.webp");
  assert.equal(must(must(container).querySelector<HTMLElement>(".work-item-info p")).textContent, "Dopo");
});

test("archive fallback identity uses the stable slug even when cards share an href", () => {
  const { document } = parseHTML('<div><div class="work-item-row" data-collection-slug="uno"><a href="/project"><img src="/one.webp"><div class="work-item-info"><p>Uno</p><p>1</p></div></a></div><div class="work-item-row" data-collection-slug="due"><a href="/project"><img src="/two.webp"><div class="work-item-info"><p>Due</p><p>2</p></div></a></div></div>');
  const container = document.querySelector<HTMLElement>("div");
  assert.equal(renderArchive(container, [
    { slug: "uno", title: "Uno nuovo", code: "1", href: "/project", coverMedia: { type: "image", src: "/fallback/uno.webp", alt: "Uno" } },
    { slug: "due", title: "Due nuovo", code: "2", href: "/project", coverMedia: { type: "image", src: "/fallback/due.webp", alt: "Due" } },
  ]), true);
  assert.equal(must(must(container).querySelector<HTMLImageElement>('[data-collection-slug="uno"] img')).getAttribute("src"), "/one.webp");
  assert.equal(must(must(container).querySelector<HTMLImageElement>('[data-collection-slug="due"] img')).getAttribute("src"), "/two.webp");
});

test("empty filters clear fallback cards and a new record without media receives a safe placeholder", () => {
  const { document } = parseHTML('<div id="events"><div class="work-item-row">Fallback</div></div>');
  const container = document.querySelector<HTMLElement>("#events");
  assert.equal(renderEvents(container, []), true);
  assert.equal(must(container).children.length, 0);
  assert.equal(renderEvents(container, [{ slug: "senza-media", title: "Nuovo", code: "TR-00", status: "upcoming", cardMedia: { type: "image", src: "/fallback/no.webp", alt: "Fallback" } }]), true);
  assert.equal(must(must(container).querySelector<HTMLElement>(".work-item-media-placeholder")).getAttribute("aria-label"), "Nuovo");
});

test("detail hydration replaces event text, variable columns, and valid cover media", () => {
  const { document } = parseHTML('<div><h1 data-collection-field="title">Fallback</h1><div data-collection-render="meta" data-collection-field="meta"></div><div data-collection-render="columns" data-collection-field="info"></div><div data-collection-media="cover"><img src="/fallback.webp"></div></div>');
  const root = document.querySelector<HTMLElement>("div");
  assert.equal(renderDetail(root, {
    title: "Aggiornato", meta: ["Uno", "Due"], info: [[["Etichetta", "Valore"]]],
    media: [{ role: "cover", position: 0, alt: "Cover", sources: [{ src: "/media/events/nuovo/00000000-0000-4000-8000-000000000002/640.webp", width: 640 }] }],
  }), true);
  assert.equal(must(must(root).querySelector<HTMLElement>("h1")).textContent, "Aggiornato");
  assert.equal(must(root).querySelectorAll<HTMLElement>('[data-collection-render="meta"] p').length, 2);
  assert.equal(must(root).querySelectorAll<HTMLElement>('[data-collection-render="columns"] .project-info-sub-col').length, 1);
  assert.match(must(must(must(root).querySelector<HTMLImageElement>('[data-collection-media="cover"] img')).getAttribute("src")), /^\/media\//);
});

test("project media-only hydration changes archival media without replacing published project copy", () => {
  const { document } = parseHTML('<div><h1 data-content-key="project.title" data-collection-field="title">Titolo contenuto</h1><div data-collection-media="cover"><img src="/_astro/fallback.webp"></div></div>');
  const root = document.querySelector<HTMLElement>("div");
  renderDetail(root, { title: "Titolo archivio", media: [{ role: "cover", position: 0, alt: "Cover", sources: [{ src: "/media/archive/parole/00000000-0000-4000-8000-000000000002/640.webp", width: 640 }] }] }, { mediaOnly: true });
  assert.equal(must(must(root).querySelector<HTMLElement>("h1")).textContent, "Titolo contenuto");
  assert.match(must(must(must(root).querySelector<HTMLImageElement>('[data-collection-media="cover"] img')).getAttribute("src")), /^\/media\/archive\/parole\//);
});

test("published events join upcoming exactly once while past stays separate and draft stays hidden", () => {
  const records = [
    { slug: "agenda", title: "Agenda", code: "A", status: "upcoming", cardMedia: { type: "image", src: "/fallback/a.webp", alt: "A" } },
    { slug: "pubblicato", title: "Pubblicato", code: "P", status: "published", cardMedia: { type: "image", src: "/fallback/p.webp", alt: "P" } },
    { slug: "passato", title: "Passato", code: "X", status: "past", cardMedia: { type: "image", src: "/fallback/x.webp", alt: "X" } },
    { slug: "bozza", title: "Bozza", code: "D", status: "draft", cardMedia: { type: "image", src: "/fallback/d.webp", alt: "D" } },
  ];
  assert.deepEqual(eventsForPublicGroup(records, "upcoming").map(({ slug }) => slug), ["agenda", "pubblicato"]);
  assert.deepEqual(eventsForPublicGroup(records, "past").map(({ slug }) => slug), ["passato"]);
  assert.equal(new Set([...eventsForPublicGroup(records, "upcoming"), ...eventsForPublicGroup(records, "past")].map(({ slug }) => slug)).size, 3);
});

test("metadata values escape untrusted attributes and replace only declared page fields", () => {
  assert.equal(escapeAttribute('a"<b&>'), "a&quot;&lt;b&amp;&gt;");
  const html = `<!doctype html><title>Fallback</title><meta name="description" content="Fallback"><link rel="canonical" href="https://site.test/work"><meta property="og:title" content="Fallback"><meta property="og:description" content="Fallback"><meta name="twitter:title" content="Fallback"><meta name="twitter:description" content="Fallback">`;
  const rewritten = rewriteMetadata(html, { title: 'Nuovo <titolo>', description: 'Descrizione & "sicura"', canonical: "https://site.test/work" });
  assert.match(rewritten, /<title>Nuovo &lt;titolo&gt;<\/title>/);
  assert.match(rewritten, /content="Descrizione &amp; &quot;sicura&quot;"/);
  assert.match(rewritten, /href="https:\/\/site\.test\/work"/);
});

test("metadata replacement treats replacement tokens as literal content", () => {
  const html = '<title>Fallback</title><meta name="description" content="Fallback"><meta property="og:title" content="Fallback">';
  const rewritten = rewriteMetadata(html, { title: "$& $1 $`", description: "$& $1 $`" });
  assert.match(rewritten, /<title>\$&amp; \$1 \$`<\/title>/);
  assert.match(rewritten, /content="\$&amp; \$1 \$`"/);
});

test("worker rewrites SEO only for HTML assets and keeps static failures intact", async () => {
  const html = '<title>Fallback</title><meta name="description" content="Fallback"><link rel="canonical" href="https://site.test/work"><meta property="og:title" content="Fallback"><meta property="og:description" content="Fallback"><meta name="twitter:title" content="Fallback"><meta name="twitter:description" content="Fallback">';
  const DB = { prepare() { return { bind() { return this; }, all: async () => [{ key: "seo.archive.title", value_json: '"Archivio aggiornato"' }] }; } };
  const env = { DB: d1Double(DB), ASSETS: { fetch: async (request: Request) => new Response(request.url.includes("/work") ? html : "plain", { status: request.url.includes("/work") ? 200 : 404, headers: { "content-type": request.url.includes("/work") ? "text/html" : "text/plain", "x-static": "kept" } }) } };
  const page = await routeRequest(new Request("https://site.test/work/"), env, {});
  assert.match(await page.text(), /<title>Archivio aggiornato<\/title>/);
  assert.equal(page.headers.get("x-static"), "kept");
  const missing = await routeRequest(new Request("https://site.test/missing"), env, {});
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), "plain");
});

test("worker queries the route SEO and palette needed by initial HTML together", async () => {
  const calls: unknown[][] = [];
  const DB = {
    prepare() {
      return {
        bind(...keys: unknown[]) { calls.push(keys); return this; },
        all: async () => [{ key: "seo.project.title", value_json: '"Progetto pubblicato"' }],
      };
    },
  };
  const html = '<title>Fallback</title><meta name="description" content="Fallback"><link rel="canonical" href="https://site.test/project"><meta property="og:title" content="Fallback"><meta property="og:description" content="Fallback"><meta name="twitter:title" content="Fallback"><meta name="twitter:description" content="Fallback">';
  const env = { DB: d1Double(DB), ASSETS: { fetch: async () => new Response(html, { headers: { "content-type": "text/html" } }) } };
  const response = await routeRequest(new Request("https://site.test/project"), env, {});
  assert.match(await response.text(), /<title>Progetto pubblicato<\/title>/);
  assert.deepEqual(calls, [["seo.project.title", "seo.project.description", "site.name", "seo.social.image_alt", "global.theme.palette"]]);
});

test("worker leaves existing static collection metadata unchanged when no stored override exists", async () => {
  const html = '<title>Fallback</title><meta name="description" content="Fallback"><link rel="canonical" href="https://site.test/detail"><meta property="og:title" content="Fallback"><meta property="og:description" content="Fallback"><meta name="twitter:title" content="Fallback"><meta name="twitter:description" content="Fallback">';
  const DB = { prepare() { return { bind() { return this; }, first: async () => null, all: async () => [] }; } };
  const env = { DB: d1Double(DB), ASSETS: { fetch: async () => new Response(html, { headers: { "content-type": "text/html" } }) } };
  const event = await routeRequest(new Request("https://site.test/eventi/musica"), env, {});
  const archive = await routeRequest(new Request("https://site.test/archivio/parole"), env, {});
  const unknown = await routeRequest(new Request("https://site.test/eventi/inesistente"), env, {});
  assert.match(await event.text(), /<title>Fallback<\/title>/);
  assert.match(await archive.text(), /<title>Fallback<\/title>/);
  assert.match(await unknown.text(), /<title>Fallback<\/title>/);
});

test("SEO asset fetch strips conditional range headers and drops stale representation headers after rewrite", async () => {
  let headers: Headers | undefined;
  const DB = { prepare() { return { bind() { return this; }, all: async () => [] }; } };
  const html = '<title>Fallback</title><meta name="description" content="Fallback"><link rel="canonical" href="https://site.test/work"><meta property="og:title" content="Fallback"><meta property="og:description" content="Fallback"><meta name="twitter:title" content="Fallback"><meta name="twitter:description" content="Fallback">';
  const env = { DB: d1Double(DB), ASSETS: { fetch: async (request: Request) => { headers = request.headers; return new Response(headers.has("if-none-match") ? "not modified" : html, { status: headers.has("if-none-match") ? 304 : 200, headers: { "content-type": "text/html", "content-length": "999", "content-encoding": "br", etag: "old", "last-modified": "yesterday", "content-range": "bytes 0-1/2", "accept-ranges": "bytes", "x-kept": "yes" } }); } } };
  const request = new Request("https://site.test/work", { headers: { "if-none-match": "tag", "if-modified-since": "yesterday", "if-range": "tag", range: "bytes=0-1" } });
  const response = await routeRequest(request, env, {});
  assert.match(await response.text(), /<title>Archivio — Tutto Rifiuto<\/title>/);
  for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-range", "accept-ranges"]) assert.equal(response.headers.get(name), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-kept"), "yes");
});

test("live clock targets its marked text nodes after hydration markers are added", () => {
  const source = readFileSync("src/scripts/nav.ts", "utf8");
  assert.match(source, /\[data-content-key="global\.nav\.clock_hours"\]/);
  assert.match(source, /\[data-content-key="global\.nav\.clock_minutes"\]/);
  assert.match(source, /\[data-content-key="global\.nav\.clock_timezone"\]/);
});

test("home about renderer is attached to the about container, not the hero copy", () => {
  const page = readFileSync("src/pages/index.astro", "utf8");
  assert.match(page, /<section class="lab-about">\s*<div class="container" data-content-key="home\.about\.paragraphs" data-content-render="about">/s);
  const hero = page.match(/<section class="lab-hero">([\s\S]*?)<\/section>/);
  assert.ok(hero, "the home hero section must be present");
  assert.doesNotMatch(must(hero[1]), /data-content-render="about"/);
});

test("home hydration defaults leave the hero title and subtitle in their own nodes", () => {
  const { document } = parseHTML('<section class="lab-hero"><h1><span data-content-key="home.hero.title">Titolo iniziale</span></h1><p><span data-content-key="home.hero.subtitle">Sottotitolo iniziale</span></p></section><section class="lab-about"><div data-content-key="home.about.paragraphs" data-content-render="about"><h3>Fallback</h3></div></section>');
  applyContent(document, {
    "home.hero.title": "Titolo pubblicato",
    "home.hero.subtitle": "Sottotitolo pubblicato",
    "home.about.paragraphs": ["Primo paragrafo", "Secondo paragrafo"],
  });
  assert.equal(must(document.querySelector<HTMLElement>(".lab-hero h1")).textContent, "Titolo pubblicato");
  assert.equal(must(document.querySelector<HTMLElement>(".lab-hero p")).textContent, "Sottotitolo pubblicato");
  assert.equal(document.querySelectorAll<HTMLElement>(".lab-about h3").length, 2);
});

test("array defaults preserve the real about, stats, contact, and project markup exactly", () => {
  const { document } = parseHTML('<main><div id="about" data-content-key="home.about.paragraphs" data-content-render="about"><h3 class="type-var-2" data-animate-variant="slide"><span data-content-key="home.about.paragraphs" data-content-path="0">Uno</span></h3><h3 class="type-var-2" data-animate-variant="slide"><span data-content-key="home.about.paragraphs" data-content-path="1">Due</span></h3></div><div id="stats" data-content-key="home.how_it_works.items" data-content-render="stats"><div class="stat-item" data-animate-variant="slide"><div class="stat-count"><h1>01</h1></div><div class="stat-content"><div class="stat-title"><h3>Testo</h3></div><div class="stat-info"><p class="type-mono">Etichetta</p></div></div></div></div><section id="contact" data-content-key="contact.info.rows" data-content-render="contact-rows"><div class="contact-info-row"><p>Ora</p><p class="contact-clock" data-animate-variant="flicker">Roma</p></div></section><div id="project" data-content-key="project.meta" data-content-render="project-meta"><p class="type-mono" data-animate-variant="flicker"><span>Meta</span></p></div></main>');
  const nodes = ["about", "stats", "contact", "project"].map((id) => document.querySelector(`#${id}`));
  const before = nodes.map((node) => must(node).outerHTML);
  applyContent(document, { "home.about.paragraphs": ["Uno", "Due"], "home.how_it_works.items": [["01", "Testo", "Etichetta"]], "contact.info.rows": [["Ora", "Roma"]], "project.meta": ["Meta"] });
  assert.deepEqual(nodes.map((node) => must(node).outerHTML), before);
});

test("array changes clone existing marked structures instead of discarding animation attributes", () => {
  const { document } = parseHTML('<div data-content-key="home.about.paragraphs" data-content-render="about"><h3 class="type-var-2" data-animate-variant="slide"><span data-content-path="0">Uno</span></h3></div>');
  applyContent(document, { "home.about.paragraphs": ["Uno nuovo", "Due"] });
  const rows = document.querySelectorAll<HTMLElement>("h3");
  assert.equal(rows.length, 2);
  assert.equal(must(rows[0]).getAttribute("data-animate-variant"), "slide");
  assert.equal(must(rows[1]).getAttribute("data-animate-variant"), "slide");
  assert.equal(must(must(rows[1]).querySelector<HTMLElement>("span")).textContent, "Due");
});

test("event detail identifies meta as a collection field for runtime hydration", () => {
  const component = readFileSync("src/components/EventDetail.astro", "utf8");
  assert.match(component, /data-collection-render="meta" data-collection-field="meta"/);
});

test("event status changes reuse a fallback card from the other event panel", () => {
  const { document } = parseHTML('<div id="upcoming"><div class="work-item-row" data-collection-slug="spostato"><a href="/eventi/spostato"><div class="work-item"><img src="/_astro/esistente.webp" alt="Esistente"><div class="work-item-info"><p>Prima</p><p>TR-E-01</p></div></div></a></div></div><div id="past"></div>');
  const upcoming = document.querySelector<HTMLElement>("#upcoming");
  const past = document.querySelector<HTMLElement>("#past");
  const fallbacks = new Map([["spostato", must(must(upcoming).querySelector<HTMLElement>(".work-item-row"))]]);
  assert.equal(renderEvents(upcoming, [], fallbacks), true);
  assert.equal(renderEvents(past, [{ slug: "spostato", title: "Dopo", code: "TR-E-01", status: "past", cardMedia: { type: "image", src: "/fallback.webp", alt: "Fallback" } }], fallbacks), true);
  assert.equal(must(must(past).querySelector<HTMLImageElement>("img")).getAttribute("src"), "/_astro/esistente.webp");
  assert.equal(must(must(past).querySelector<HTMLElement>(".work-item-info p")).textContent, "Dopo");
});

test("runtime responsive media uses distinct card, cover, and detail sizes", () => {
  const { document } = parseHTML('<div id="cards"></div><div id="detail"><div data-collection-media="cover"></div><div data-collection-media-list></div></div>');
  const source = (id: number) => `/media/events/prova/00000000-0000-4000-8000-00000000000${id}/640.webp`;
  const card = document.querySelector<HTMLElement>("#cards");
  const detail = document.querySelector<HTMLElement>("#detail");
  renderEvents(card, [{ slug: "prova", title: "Prova", code: "TR-E-01", status: "upcoming", cardMedia: { type: "image", alt: "Card", sources: [{ src: source(1), width: 640 }] } }]);
  renderDetail(detail, { media: [{ role: "cover", position: 0, alt: "Cover", sources: [{ src: source(2), width: 640 }] }, { role: "detail", position: 1, alt: "Dettaglio", sources: [{ src: source(3), width: 640 }] }] });
  assert.equal(must(must(card).querySelector<HTMLImageElement>("img")).getAttribute("sizes"), "(max-width: 1000px) 100vw, 40vw");
  assert.equal(must(must(detail).querySelector<HTMLImageElement>('[data-collection-media="cover"] img')).getAttribute("sizes"), "100vw");
  assert.equal(must(must(detail).querySelector<HTMLImageElement>("[data-collection-media-list] img")).getAttribute("sizes"), "(max-width: 1000px) 100vw, 75vw");
});

test("validated responsive sources reject duplicate widths and filename-width mismatches", () => {
  const base = "/media/events/prova/00000000-0000-4000-8000-000000000001";
  assert.deepEqual(validMediaSources([{ src: `${base}/640.webp`, width: 640 }, { src: `${base}/1280.webp`, width: 1280 }]).map((source) => source.width), [640, 1280]);
  assert.deepEqual(validMediaSources([{ src: `${base}/640.webp`, width: 1280 }, { src: `${base}/640.webp`, width: 640 }]), []);
});

test("remote detail media restores its local fallback when the image fails", () => {
  const { document, window } = parseHTML('<div><div data-collection-media="cover"><picture data-media-fallback="local"><img src="/_astro/local.webp"></picture></div></div>');
  const root = document.querySelector<HTMLElement>("div");
  renderDetail(root, { media: [{ role: "cover", position: 0, alt: "Cover", sources: [{ src: "/media/events/prova/00000000-0000-4000-8000-000000000001/640.webp", width: 640 }] }] });
  const remote = must(root).querySelector<HTMLImageElement>('[data-collection-media="cover"] img');
  must(remote).dispatchEvent(new window.Event("error"));
  assert.equal(must(must(root).querySelector<HTMLImageElement>('[data-collection-media="cover"] img')).getAttribute("src"), "/_astro/local.webp");
});

test("remote card media restores its local fallback and uses a placeholder for a new record", () => {
  const { document, window } = parseHTML('<div id="existing"><div class="work-item-row" data-collection-slug="prova"><a><div class="work-item"><picture><img src="/_astro/card.webp"></picture><div class="work-item-info"><p>Prima</p><p>TR</p></div></div></a></div></div><div id="new"></div>');
  const remote = { type: "image", alt: "Prova", sources: [{ src: "/media/events/prova/00000000-0000-4000-8000-000000000001/640.webp", width: 640 }] };
  const existing = document.querySelector<HTMLElement>("#existing");
  renderEvents(existing, [{ slug: "prova", title: "Dopo", code: "TR", status: "upcoming", cardMedia: remote }]);
  must(must(existing).querySelector<HTMLImageElement>("img")).dispatchEvent(new window.Event("error"));
  assert.equal(must(must(existing).querySelector<HTMLImageElement>("img")).getAttribute("src"), "/_astro/card.webp");
  const fresh = document.querySelector<HTMLElement>("#new");
  renderEvents(fresh, [{ slug: "nuovo", title: "Nuovo", code: "TR2", status: "upcoming", cardMedia: remote }]);
  must(must(fresh).querySelector<HTMLImageElement>("img")).dispatchEvent(new window.Event("error"));
  assert.equal(must(must(fresh).querySelector<HTMLElement>(".work-item-media-placeholder")).getAttribute("aria-label"), "Nuovo");
});

test("ResponsiveMedia keeps a local fallback node available for remote source errors", () => {
  const source = readFileSync("src/components/ResponsiveMedia.astro", "utf8");
  assert.match(source, /data-media-fallback="local"/);
  assert.match(source, /data-media-remote/);
});
