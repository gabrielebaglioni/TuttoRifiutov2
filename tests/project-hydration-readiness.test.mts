import { must, rect, deferred as deferredValue, installGlobal, restoreGlobal } from './browser-test-utils.mts';
import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { ensureCollectionsReadiness } from "../src/scripts/collections-readiness.ts";

const PROJECT_FACTORY = Symbol.for("tutto-rifiuto.project.factory");
const PROJECT_START_EVENT = "tutto-rifiuto:project-start";

function deferred() { return deferredValue<Response>(); }

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function freshImport(path: string, label: string): Promise<unknown> {
  return import(`${path}?autostart=${label}-${Date.now()}-${Math.random()}`);
}

async function importProject(label: string) {
  return freshImport("../src/scripts/project.ts", label);
}

async function importHydrator(label: string) {
  return freshImport("../src/scripts/collections-hydration.ts", label);
}

async function withBrowser(html: string, run: (fixture: ReturnType<typeof parseHTML> & { legacyFactoryCalls(): number }) => Promise<void>) {
  const prior = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch, requestAnimationFrame: globalThis.requestAnimationFrame };
  const { document, window } = parseHTML(html);
  Reflect.deleteProperty(window, '__tuttoRifiutoCollectionsReady');
  Reflect.deleteProperty(window, '__tuttoRifiutoProjectStart');
  let legacyFactoryCalls = 0;
  Reflect.set(window, PROJECT_FACTORY, () => { legacyFactoryCalls += 1; });
  Object.defineProperty(document, "readyState", { configurable: true, get: () => "complete" });
  globalThis.document = document;
  globalThis.window = window;
  try { return await run(Object.assign({}, window, { document, window, legacyFactoryCalls: () => legacyFactoryCalls })); }
  finally {
    window.__tuttoRifiutoCollectionsReady?.settle("failure");
    delete window.__tuttoRifiutoCollectionsReady;
    delete window.__tuttoRifiutoProjectStart;
    Reflect.deleteProperty(window, PROJECT_FACTORY);
    if (prior.document === undefined) Reflect.deleteProperty(globalThis, "document"); else globalThis.document = prior.document;
    if (prior.window === undefined) Reflect.deleteProperty(globalThis, "window"); else globalThis.window = prior.window;
    if (prior.fetch === undefined) Reflect.deleteProperty(globalThis, "fetch"); else globalThis.fetch = prior.fetch;
    if (prior.requestAnimationFrame === undefined) Reflect.deleteProperty(globalThis, "requestAnimationFrame"); else globalThis.requestAnimationFrame = prior.requestAnimationFrame;
  }
}

const shell = '<html><body><main data-public-detail-template="events"><div data-collection-media="cover"><picture><img src="/fallback-cover.webp"></picture></div><div class="project-images"><div data-collection-media-list><div class="project-img" data-collection-media-slot="detail:0"><picture><img src="/fallback-detail.webp"></picture></div></div></div></main></body></html>';
const remote = { slug: "nuovo-evento", media: [{ role: "detail", position: 0, alt: "Remota", sources: [{ src: "/media/events/nuovo-evento/00000000-0000-4000-8000-000000000001/640.webp", width: 640 }] }] };

type StartObservation = { cancelable: boolean; detail: import("../src/scripts/project.ts").ProjectStartDetail };
function observeProjectStarts(window: ReturnType<typeof parseHTML>["window"], starts: StartObservation[]) {
  window.addEventListener(PROJECT_START_EVENT, (event) => starts.push({
    cancelable: event.cancelable,
    detail: event.detail,
  }));
}

test("project-first guarded autostart waits for delayed hydration and captures remote media exactly once", { concurrency: false }, async () => {
  await withBrowser(shell, async ({ window, legacyFactoryCalls }) => {
    const detail = deferred();
    globalThis.fetch = async (path) => {
      if (path === "/api/events/nuovo-evento") return detail.promise;
      if (path === "/api/events" || path === "/api/archive") return response([]);
      return response({}, 404);
    };
    Object.assign(window, { location: { pathname: "/eventi/nuovo-evento" } });
    const starts: StartObservation[] = [];
    observeProjectStarts(window, starts);

    await importProject("project-first-success");
    assert.deepEqual(starts, []);
    await importHydrator("project-first-success");
    assert.deepEqual(starts, []);
    must(detail.resolve)(response(remote));
    await window.__tuttoRifiutoProjectStart;

    assert.equal(must(window.__tuttoRifiutoCollectionsReady).status, "complete");
    assert.deepEqual(starts, [{ cancelable: false, detail: { count: 1, images: ["/media/events/nuovo-evento/00000000-0000-4000-8000-000000000001/640.webp"], started: false, status: "unsupported" } }]);
    assert.equal(legacyFactoryCalls(), 0);
  });
});

test("hydrator-first guarded autostart classifies HTTP failure and captures local fallback exactly once", { concurrency: false }, async () => {
  await withBrowser(shell, async ({ window }) => {
    globalThis.fetch = async () => response({}, 500);
    Object.assign(window, { location: { pathname: "/eventi/nuovo-evento" } });
    const starts: StartObservation[] = [];
    observeProjectStarts(window, starts);

    await importHydrator("hydrator-first-failure");
    await importProject("hydrator-first-failure");
    await window.__tuttoRifiutoProjectStart;

    assert.equal(must(window.__tuttoRifiutoCollectionsReady).status, "failure");
    assert.deepEqual(starts, [{ cancelable: false, detail: { count: 1, images: ["/fallback-detail.webp"], started: false, status: "unsupported" } }]);
  });
});

test("guarded autostart classifies a network failure and still initializes from the local fallback", { concurrency: false }, async () => {
  await withBrowser(shell, async ({ window }) => {
    globalThis.fetch = async () => { throw new TypeError("network unavailable"); };
    Object.assign(window, { location: { pathname: "/eventi/nuovo-evento" } });
    const starts: StartObservation[] = [];
    observeProjectStarts(window, starts);

    await importProject("network-failure");
    await importHydrator("network-failure");
    await window.__tuttoRifiutoProjectStart;

    assert.equal(must(window.__tuttoRifiutoCollectionsReady).status, "failure");
    assert.deepEqual(starts, [{ cancelable: false, detail: { count: 1, images: ["/fallback-detail.webp"], started: false, status: "unsupported" } }]);
  });
});

test("guarded project autostart cannot deadlock on timeout and captures local fallback once", { concurrency: false }, async () => {
  await withBrowser(shell, async ({ window }) => {
    ensureCollectionsReadiness(window, { timeoutMs: 5 });
    const starts: StartObservation[] = [];
    observeProjectStarts(window, starts);

    await importProject("timeout");
    await window.__tuttoRifiutoProjectStart;

    assert.equal(must(window.__tuttoRifiutoCollectionsReady).status, "timeout");
    assert.deepEqual(starts, [{ cancelable: false, detail: { count: 1, images: ["/fallback-detail.webp"], started: false, status: "unsupported" } }]);
  });
});

test("real project startup observes readiness and bails safely when a canvas exists without WebGL", { concurrency: false }, async () => {
  await withBrowser(shell, async ({ document, window }) => {
    const originalCreateElement = document.createElement.bind(document);
    Object.assign(document, { createElement: (tagName: string) => {
      const element = originalCreateElement(tagName);
      if (element instanceof window.HTMLCanvasElement) element.getContext = () => null;
      return element;
    } });
    window.requestAnimationFrame = () => 0;
    ensureCollectionsReadiness(window).settle("complete");
    const starts: StartObservation[] = [];
    observeProjectStarts(window, starts);

    await importProject("webgl-unavailable");
    await window.__tuttoRifiutoProjectStart;

    assert.equal(starts.length, 1);
    assert.equal(must(starts[0]).detail.images[0], "/fallback-detail.webp");
    assert.equal(must(starts[0]).detail.started, false);
    assert.equal(must(starts[0]).detail.status, "unsupported");
  });
});

test("a sabotaging project-start listener runs only after the real constructor completed once", { concurrency: false }, async () => {
  await withBrowser(shell, async ({ document, window }) => {
    window.innerWidth = 500;
    window.innerHeight = 800;
    window.requestAnimationFrame = () => 1;
    globalThis.requestAnimationFrame = window.requestAnimationFrame;
    Object.assign(window, { lenis: { on() {} } });
    ensureCollectionsReadiness(window).settle("complete");
    const observations: Array<{ marker: string | undefined; detail: import("../src/scripts/project.ts").ProjectStartDetail }> = [];
    window.addEventListener(PROJECT_START_EVENT, (event) => {
      observations.push({ marker: document.documentElement.dataset.projectDistortionInitCount, detail: event.detail });
      Reflect.set(window, "requestAnimationFrame", undefined);
      Reflect.set(globalThis, "requestAnimationFrame", undefined);
      document.body.replaceChildren();
    });

    await importProject("listener-sabotage");
    await window.__tuttoRifiutoProjectStart;

    assert.deepEqual(observations, [{
      marker: "1",
      detail: { count: 1, images: ["/fallback-detail.webp"], started: true, status: "started" },
    }]);
  });
});

test("a real startup error is reported after its constructor attempt without rejecting readiness", { concurrency: false }, async () => {
  await withBrowser(shell, async ({ document, window }) => {
    window.innerWidth = 500;
    window.innerHeight = 800;
    window.requestAnimationFrame = () => 1;
    globalThis.requestAnimationFrame = window.requestAnimationFrame;
    Object.assign(window, { lenis: { on() { throw new Error("listener unavailable"); } } });
    ensureCollectionsReadiness(window).settle("complete");
    const starts: StartObservation[] = [];
    observeProjectStarts(window, starts);

    await importProject("startup-error");
    await window.__tuttoRifiutoProjectStart;

    assert.equal(document.documentElement.dataset.projectDistortionInitCount, "1");
    assert.deepEqual(starts, [{ cancelable: false, detail: {
      count: 1,
      images: ["/fallback-detail.webp"],
      started: false,
      status: "error",
    } }]);
  });
});
