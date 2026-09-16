import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { routeRequest, templatePathFor } from "../worker/router.ts";
import { detailIdentityFromPath, hydrateDetailTemplate, renderArchive } from "../src/scripts/collections-hydration.js";
import { applyContent } from "../src/scripts/content-hydration.js";
import { SITE_CONTENT } from "../src/data/site-content.ts";
import { SITE_CONTENT as WORKER_CONTENT } from "../worker/content-defaults.ts";
import { adminSectionForContentKey } from "../src/scripts/admin.js";

test("dynamic collection paths resolve only valid slugs to internal templates", () => {
  assert.equal(templatePathFor("/eventi/nuovo-evento"), "/eventi/template/");
  assert.equal(templatePathFor("/archivio/nuovo-pacchetto/"), "/archivio/template/");
  assert.equal(templatePathFor("/contact"), null);
  assert.equal(templatePathFor("/eventi/Bad%20Slug"), null);
  assert.equal(templatePathFor("/archivio/template"), null);
});

const templateHtml = '<!doctype html><title>Fallback</title><meta name="description" content="Fallback"><link rel="canonical" href="https://site.test/eventi/template/"><meta property="og:title" content="Fallback"><meta property="og:description" content="Fallback"><meta property="og:url" content="https://site.test/eventi/template/"><meta property="og:site_name" content="Fallback"><meta property="og:image:alt" content="Fallback"><meta name="author" content="Fallback"><meta name="twitter:title" content="Fallback"><meta name="twitter:description" content="Fallback"><main>dynamic template</main>';

function dynamicDb(row, { fail = false, failContent = false } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          calls.push({ sql, values });
          return {
            async first() {
              if (fail) throw new Error("private database detail");
              return row;
            },
            async all() {
              if (fail || failContent) throw new Error("private database detail");
              return { results: [] };
            },
          };
        },
        async all() {
          if (fail) throw new Error("private database detail");
          return { results: [] };
        },
      };
    },
  };
}

function assets({ failOriginal = false, failTemplate = false } = {}) {
  const calls = [];
  return {
    calls,
    async fetch(request) {
      const url = new URL(request.url);
      calls.push({ pathname: url.pathname, method: request.method, headers: new Headers(request.headers) });
      if (url.pathname.endsWith("/template/")) {
        if (failTemplate) throw new Error("private template detail");
        return new Response(templateHtml, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "content-length": "999", etag: "stale", "x-template": "yes" } });
      }
      if (failOriginal) throw new Error("private asset detail");
      if (["/eventi/musica", "/archivio/parole"].includes(url.pathname)) return new Response(templateHtml.replace("dynamic template", "known static"), { status: 200, headers: { "content-type": "text/html", "x-static": "yes" } });
      return new Response("static missing", { status: 404, headers: { "content-type": "text/plain", "x-static": "miss" } });
    },
  };
}

const publishedEvent = {
  id: 91,
  slug: "nuovo-evento",
  status: "upcoming",
  deleting: 0,
  seo_json: JSON.stringify({ title: "Evento nuovo", description: "Dettaglio evento nuovo" }),
};

test("stored overrides gate existing event and archive static details for GET and HEAD", async () => {
  const cases = [
    { path: "/eventi/musica", row: null, status: 200 },
    { path: "/eventi/musica", row: { ...publishedEvent, slug: "musica", status: "published" }, status: 200 },
    { path: "/eventi/musica", row: { ...publishedEvent, slug: "musica", status: "draft" }, status: 404 },
    { path: "/eventi/musica", row: { ...publishedEvent, slug: "musica", deleting: 1 }, status: 404 },
    { path: "/archivio/parole", row: null, status: 200 },
    { path: "/archivio/parole", row: { id: 8, slug: "parole", deleting: 0, seo_json: JSON.stringify({ title: "Parole override", description: "Archivio" }) }, status: 200 },
    { path: "/archivio/parole", row: { id: 8, slug: "parole", deleting: 1, seo_json: JSON.stringify({ title: "Nascosto", description: "Archivio" }) }, status: 404 },
  ];
  for (const { path, row, status } of cases) {
    for (const method of ["GET", "HEAD"]) {
      const DB = dynamicDb(row);
      const ASSETS = assets();
      const response = await routeRequest(new Request(`https://site.test${path}`, { method }), { DB, ASSETS }, {});
      assert.equal(response.status, status, `${method} ${path}`);
      assert.equal(DB.calls.filter(({ sql }) => /FROM (events|archive_items)/.test(sql)).length, 1);
      if (status === 404) {
        assert.equal(response.headers.get("cache-control"), "no-store");
        if (method === "HEAD") assert.equal(await response.text(), "");
      } else {
        assert.equal(response.headers.get("x-static"), "yes");
        if (method === "GET" && row) assert.match(await response.text(), new RegExp(JSON.parse(row.seo_json).title));
        else if (method === "GET") {
          const body = await response.text();
          assert.match(body, /<title>Fallback<\/title>/);
          assert.match(body, /known static/);
        }
      }
    }
  }
});

test("details without a stored collection override still fetch full fresh representations for palette injection", async () => {
  const calls = [];
  const ASSETS = {
    async fetch(request) {
      calls.push(new Headers(request.headers));
      if (request.headers.has("range")) {
        return new Response("par", { status: 206, headers: { "content-range": "bytes 0-2/9", etag: "asset-v1" } });
      }
      if(request.headers.has('if-none-match')) return new Response(null, {status:304,headers:{etag:'asset-v1'}});
      return new Response('<html><head><title>Static title</title></head></html>',{headers:{'content-type':'text/html',etag:'asset-v1'}});
    },
  };
  const conditional = await routeRequest(new Request("https://site.test/eventi/musica", {
    headers: { "if-none-match": "asset-v1", "if-modified-since": "yesterday" },
  }), { DB: dynamicDb(null), ASSETS }, {});
  assert.equal(conditional.status, 200);
  assert.equal(conditional.headers.get("etag"), null);
  assert.equal(calls[0].get("if-none-match"), null);
  assert.equal(calls[0].get("if-modified-since"), null);
  assert.match(await conditional.text(), /<title>Static title<\/title>/);

  const range = await routeRequest(new Request("https://site.test/archivio/parole", {
    headers: { range: "bytes=0-2", "if-range": "asset-v1" },
  }), { DB: dynamicDb(null), ASSETS }, {});
  assert.equal(range.status, 200);
  assert.match(await range.text(), /<title>Static title<\/title>/);
  assert.equal(range.headers.get("content-range"), null);
  assert.equal(calls[1].get("range"), null);
  assert.equal(calls[1].get("if-range"), null);
});

test("a public stored override sanitizes validators and returns fresh no-store GET and HEAD representations", async () => {
  const calls = [];
  const ASSETS = {
    async fetch(request) {
      calls.push({ method: request.method, headers: new Headers(request.headers) });
      return new Response(templateHtml.replace("dynamic template", "known static"), {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8", "content-length": "999", "content-encoding": "gzip",
          etag: "stale", "last-modified": "yesterday", "content-range": "bytes 0-2/9", "accept-ranges": "bytes",
        },
      });
    },
  };
  const env = { DB: dynamicDb({ ...publishedEvent, slug: "musica", status: "published" }), ASSETS };
  for (const method of ["GET", "HEAD"]) {
    const response = await routeRequest(new Request("https://site.test/eventi/musica", {
      method,
      headers: { "if-match": "old", "if-none-match": "old", "if-modified-since": "yesterday", "if-unmodified-since": "today", "if-range": "old", range: "bytes=0-2" },
    }), env, {});
    assert.equal(response.status, 200, method);
    assert.equal(response.headers.get("cache-control"), "no-store", method);
    for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-range", "accept-ranges"]) {
      assert.equal(response.headers.get(name), null, `${method} ${name}`);
    }
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    if (method === "HEAD") assert.equal(await response.text(), "");
  }
  for (const { headers } of calls) {
    for (const name of ["if-match", "if-none-match", "if-modified-since", "if-unmodified-since", "if-range", "range"]) {
      assert.equal(headers.has(name), false, name);
    }
  }
});

test("collection detail database failure is fail-closed while project remains an ungated static authority", async () => {
  const failed = await routeRequest(new Request("https://site.test/eventi/musica"), { DB: dynamicDb(null, { fail: true }), ASSETS: assets() }, {});
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("cache-control"), "no-store");
  const projectAssets = { async fetch() { return new Response("project static", { headers: { "content-type": "text/html" } }); } };
  const project = await routeRequest(new Request("https://site.test/project"), { DB: dynamicDb(null, { fail: true }), ASSETS: projectAssets }, {});
  assert.equal(project.status, 200);
  assert.equal(await project.text(), "project static");
});

test("a published D1 event receives the internal template and its SEO in one detail lookup", async () => {
  const DB = dynamicDb(publishedEvent);
  const ASSETS = assets();
  const request = new Request("https://site.test/eventi/nuovo-evento", {
    headers: { "if-none-match": "old", "if-modified-since": "yesterday", range: "bytes=0-2" },
  });
  const response = await routeRequest(request, { DB, ASSETS }, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-template"), "yes");
  assert.equal(response.headers.get("etag"), null);
  assert.equal(response.headers.get("content-length"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  const body = await response.text();
  assert.match(body, /<title>Evento nuovo<\/title>/);
  assert.match(body, /<main>dynamic template<\/main>/);
  assert.equal(DB.calls.filter(({ sql }) => /FROM events/.test(sql)).length, 1);
  assert.deepEqual(ASSETS.calls.map(({ pathname }) => pathname), ["/eventi/nuovo-evento", "/eventi/template/"]);
  for (const call of ASSETS.calls) {
    assert.equal(call.headers.has("if-none-match"), false);
    assert.equal(call.headers.has("if-modified-since"), false);
    assert.equal(call.headers.has("range"), false);
  }
});

test("event detail publication uses the same status contract as public event grouping", async () => {
  for (const status of ["upcoming", "published", "past"]) {
    const response = await routeRequest(new Request("https://site.test/eventi/nuovo-evento"), {
      DB: dynamicDb({ ...publishedEvent, status }), ASSETS: assets(),
    }, {});
    assert.equal(response.status, 200, status);
  }
  const hidden = await routeRequest(new Request("https://site.test/eventi/nuovo-evento"), {
    DB: dynamicDb({ ...publishedEvent, status: "draft" }), ASSETS: assets(),
  }, {});
  assert.equal(hidden.status, 404);
});

test("archive dynamic details use the archive template while project stays a static authority", async () => {
  const DB = dynamicDb({ id: 92, slug: "nuovo-pacchetto", deleting: 0, seo_json: JSON.stringify({ title: "Pacchetto nuovo", description: "Dettaglio archivio" }) });
  const ASSETS = assets();
  const response = await routeRequest(new Request("https://site.test/archivio/nuovo-pacchetto"), { DB, ASSETS }, {});
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<title>Pacchetto nuovo<\/title>/);
  assert.deepEqual(ASSETS.calls.map(({ pathname }) => pathname), ["/archivio/nuovo-pacchetto", "/archivio/template/"]);

  const projectAssets = { calls: [], async fetch(request) { this.calls.push(new URL(request.url).pathname); return new Response("project static", { headers: { "content-type": "text/html" } }); } };
  const project = await routeRequest(new Request("https://site.test/project"), { ASSETS: projectAssets }, {});
  assert.equal(await project.text(), "project static");
  assert.deepEqual(projectAssets.calls, ["/project"]);
});

test("unknown, draft, deleting, malformed, encoded, and direct template paths never receive a template", async () => {
  for (const row of [null, { ...publishedEvent, status: "draft" }, { ...publishedEvent, deleting: 1 }]) {
    const DB = dynamicDb(row);
    const ASSETS = assets();
    const response = await routeRequest(new Request("https://site.test/eventi/nuovo-evento"), { DB, ASSETS }, {});
    assert.equal(response.status, 404);
    assert.equal(await response.text(), row ? "Not found" : "static missing");
    assert.deepEqual(ASSETS.calls.map(({ pathname }) => pathname), row ? [] : ["/eventi/nuovo-evento"]);
  }
  for (const path of ["/eventi/Bad%20Slug", "/eventi/a%2Fb", "/archivio/template", "/eventi/template/"]) {
    const DB = dynamicDb(publishedEvent);
    const ASSETS = assets();
    const response = await routeRequest(new Request(`https://site.test${path}`), { DB, ASSETS }, {});
    assert.equal(response.status, 404, path);
    assert.equal(DB.calls.length, 0, path);
    if (path.includes("template")) assert.equal(ASSETS.calls.length, 0, path);
  }
});

test("dynamic misses are no-store bodyless HEAD responses and do not hide a later record", async () => {
  let row = null;
  const DB = dynamicDb(null);
  DB.prepare = (sql) => ({
    bind: (...values) => ({
      async first() { DB.calls.push({ sql, values }); return row; },
      async all() { DB.calls.push({ sql, values }); return { results: [] }; },
    }),
    async all() { return { results: [] }; },
  });
  const ASSETS = assets();
  const first = await routeRequest(new Request("https://site.test/eventi/nuovo-evento"), { DB, ASSETS }, {});
  assert.equal(first.status, 404);
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.equal(first.headers.get("etag"), null);

  const head = await routeRequest(new Request("https://site.test/eventi/nuovo-evento", { method: "HEAD" }), { DB, ASSETS }, {});
  assert.equal(head.status, 404);
  assert.equal(head.headers.get("cache-control"), "no-store");
  assert.equal(head.headers.get("content-length"), null);
  assert.equal(await head.text(), "");

  row = publishedEvent;
  const created = await routeRequest(new Request("https://site.test/eventi/nuovo-evento"), { DB, ASSETS }, {});
  assert.equal(created.status, 200);
  assert.match(await created.text(), /<title>Evento nuovo<\/title>/);
});

test("all canonical and encoded internal template representations are blocked without blocking legitimate slugs", async () => {
  const blocked = [
    "//eventi/template", "///archivio/template/index.html",
    "/eventi/template", "/eventi/template/", "/eventi//template//", "/eventi/template/index.html",
    "/archivio/template", "/archivio/template///", "/archivio/template/index.html",
    "/eventi/%74emplate", "/archivio/template%2Findex.html", "/eventi%2Ftemplate",
    "/eventi/%2574emplate", "/archivio/template%252Findex.html",
    "/%2Feventi%2Ftemplate", "/%252Feventi%252Ftemplate",
    "/%5Carchivio%5Ctemplate%5Cindex.html", "/%255Ceventi%255Ctemplate",
    "/eventi/%252e%252e/eventi/template", "/safe/%252e%252e/archivio/template",
  ];
  for (const path of blocked) {
    for (const method of ["GET", "HEAD"]) {
      const ASSETS = assets();
      const response = await routeRequest(new Request(`https://site.test${path}?raw=1`, { method }), { DB: dynamicDb(publishedEvent), ASSETS }, {});
      assert.equal(response.status, 404, `${method} ${path}`);
      assert.equal(response.headers.get("cache-control"), "no-store", `${method} ${path}`);
      assert.equal(await response.text(), "", `${method} ${path}`);
      assert.equal(ASSETS.calls.length, 0, `${method} ${path}`);
    }
  }

  const ASSETS = assets();
  const legitimate = await routeRequest(new Request("https://site.test/eventi/template-art"), {
    DB: dynamicDb({ ...publishedEvent, slug: "template-art", seo_json: JSON.stringify({ title: "Template art", description: "Evento" }) }), ASSETS,
  }, {});
  assert.equal(legitimate.status, 200);
  assert.deepEqual(ASSETS.calls.map(({ pathname }) => pathname), ["/eventi/template-art", "/eventi/template/"]);
});

test("dynamic HEAD keeps template headers without a body and unsupported methods return 405", async () => {
  const DB = dynamicDb(publishedEvent);
  const ASSETS = assets();
  const head = await routeRequest(new Request("https://site.test/eventi/nuovo-evento", { method: "HEAD" }), { DB, ASSETS }, {});
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("x-template"), "yes");
  assert.equal(head.headers.get("etag"), null);
  assert.equal(head.headers.get("content-length"), null);
  assert.equal(head.headers.get("cache-control"), "no-store");
  assert.equal(await head.text(), "");
  assert.deepEqual(ASSETS.calls.map(({ method }) => method), ["HEAD", "HEAD"]);

  const post = await routeRequest(new Request("https://site.test/eventi/nuovo-evento", { method: "POST" }), { DB, ASSETS }, {});
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
});

test("database and asset failures do not expose details or serve an unchecked template", async () => {
  const dbFailure = await routeRequest(new Request("https://site.test/eventi/nuovo-evento"), { DB: dynamicDb(null, { fail: true }), ASSETS: assets() }, {});
  assert.equal(dbFailure.status, 503);
  assert.equal(await dbFailure.text(), "Service unavailable");

  const assetFailure = await routeRequest(new Request("https://site.test/eventi/nuovo-evento"), { DB: dynamicDb(publishedEvent), ASSETS: assets({ failOriginal: true }) }, {});
  assert.equal(assetFailure.status, 503);
  assert.equal(await assetFailure.text(), "Service unavailable");

  const templateFailure = await routeRequest(new Request("https://site.test/eventi/nuovo-evento"), { DB: dynamicDb(publishedEvent), ASSETS: assets({ failTemplate: true }) }, {});
  assert.equal(templateFailure.status, 503);
  assert.equal(await templateFailure.text(), "Service unavailable");
});

test("dynamic detail SEO still uses its checked row when optional global overrides are unavailable", async () => {
  const response = await routeRequest(new Request("https://site.test/eventi/nuovo-evento"), {
    DB: dynamicDb(publishedEvent, { failContent: true }),
    ASSETS: assets(),
  }, {});
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<title>Evento nuovo<\/title>/);
});

test("template hydration derives a safe matching identity from the browser pathname", () => {
  assert.deepEqual(detailIdentityFromPath("/eventi/nuovo-evento"), { kind: "events", slug: "nuovo-evento" });
  assert.deepEqual(detailIdentityFromPath("/archivio/nuovo-pacchetto/"), { kind: "archive", slug: "nuovo-pacchetto" });
  for (const path of ["/eventi/template", "/eventi/a%2Fb", "/archivio/Bad", "/project"]) assert.equal(detailIdentityFromPath(path), null);
});

test("the shared hydrator fetches the safe event slug and updates generic fallback with DOM APIs", async () => {
  const { document } = parseHTML('<main data-public-detail-template="events"><h1 data-collection-field="title">Evento Tutto Rifiuto</h1><p data-collection-field="description">Contenuto in caricamento.</p><div data-collection-media="cover"><div role="img" aria-label="Copertina segnaposto"></div></div></main>');
  const root = document.querySelector("main");
  const calls = [];
  const hydrated = await hydrateDetailTemplate(root, "/eventi/nuovo-evento", async (path) => {
    calls.push(path);
    return {
      slug: "nuovo-evento",
      title: "Titolo <sicuro>",
      description: "Descrizione aggiornata",
      media: [{ role: "cover", position: 0, alt: "Cover", sources: [{ src: "/media/events/nuovo-evento/00000000-0000-4000-8000-000000000001/640.webp", width: 640 }] }],
    };
  });
  assert.equal(hydrated, true);
  assert.deepEqual(calls, ["/api/events/nuovo-evento"]);
  assert.equal(root.dataset.publicDetailKind, "events");
  assert.equal(root.dataset.publicDetailSlug, "nuovo-evento");
  assert.equal(root.querySelector("h1").textContent, "Titolo <sicuro>");
  assert.equal(root.querySelector("h1 img"), null);
  assert.match(root.querySelector('[data-collection-media="cover"] img').getAttribute("src"), /^\/media\/events\//);
});

test("template hydration rejects mismatched or unsafe paths without fetching or replacing fallback", async () => {
  for (const pathname of ["/archivio/nuovo", "/eventi/template", "/eventi/a%2Fb"]) {
    const { document } = parseHTML('<main data-public-detail-template="events"><h1 data-collection-field="title">Fallback accessibile</h1></main>');
    let calls = 0;
    const hydrated = await hydrateDetailTemplate(document.querySelector("main"), pathname, async () => { calls += 1; return {}; });
    assert.equal(hydrated, false, pathname);
    assert.equal(calls, 0, pathname);
    assert.equal(document.querySelector("h1").textContent, "Fallback accessibile", pathname);
  }
});

test("new archive records link to their detail URL while existing project links remain unchanged", () => {
  const { document } = parseHTML('<div id="archive"><div class="work-item-row" data-collection-slug="parole"><a href="/project"><div class="work-item"><img src="/fallback.webp"><div class="work-item-info"><p>Parole</p><p>TR-01</p></div></div></a></div></div>');
  const container = document.querySelector("#archive");
  assert.equal(renderArchive(container, [
    { slug: "parole", title: "Parole", code: "TR-01", href: "/project", coverMedia: { type: "image", src: "/fallback.webp", alt: "Parole" } },
    { slug: "nuovo-pacchetto", title: "Nuovo", code: "TR-99", href: "/project", coverMedia: { type: "image", src: "/missing.webp", alt: "Nuovo" } },
  ]), true);
  assert.equal(container.querySelector('[data-collection-slug="parole"] a').getAttribute("href"), "/project");
  assert.equal(container.querySelector('[data-collection-slug="nuovo-pacchetto"] a').getAttribute("href"), "/archivio/nuovo-pacchetto");
});

test("archive template labels are complete editable defaults in public, worker, and admin schemas", () => {
  const expected = {
    "archive.detail.context_label": "Archivio Tutto Rifiuto",
    "archive.detail.status_label": "Stato",
    "archive.detail.status_value": "In decomposizione",
  };
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(SITE_CONTENT[key], value, key);
    assert.equal(WORKER_CONTENT[key], value, key);
    assert.equal(adminSectionForContentKey(key), "archive", key);
  }
  const { document } = parseHTML('<main><p data-content-key="archive.detail.context_label">Archivio Tutto Rifiuto</p><p data-content-key="archive.detail.status_label">Stato</p><p data-content-key="archive.detail.status_value">In decomposizione</p></main>');
  assert.equal(applyContent(document, {
    "archive.detail.context_label": "Archivio collettivo",
    "archive.detail.status_label": "Condizione",
    "archive.detail.status_value": "In circolo",
  }), true);
  assert.deepEqual([...document.querySelectorAll("p")].map((node) => node.textContent), ["Archivio collettivo", "Condizione", "In circolo"]);
});
