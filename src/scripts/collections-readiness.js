const COLLECTIONS_READY_KEY = "__tuttoRifiutoCollectionsReady";
const PROJECT_START_KEY = "__tuttoRifiutoProjectStart";
const DEFAULT_READINESS_TIMEOUT_MS = 4_500;

function mark(document, status) {
  if (document?.documentElement?.dataset) document.documentElement.dataset.collectionsHydration = status;
}

export function ensureCollectionsReadiness(windowRef = globalThis.window, {
  timeoutMs = DEFAULT_READINESS_TIMEOUT_MS,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
} = {}) {
  if (!windowRef) throw new TypeError("Collections readiness requires a window");
  if (windowRef[COLLECTIONS_READY_KEY]) return windowRef[COLLECTIONS_READY_KEY];
  let resolve;
  let timer;
  const promise = new Promise((done) => { resolve = done; });
  const state = {
    promise,
    settled: false,
    status: "pending",
    settle(status = "complete") {
      if (state.settled) return false;
      state.settled = true;
      state.status = status;
      if (timer !== undefined) clearTimeoutImpl(timer);
      mark(windowRef.document, status);
      resolve(status);
      return true;
    },
  };
  windowRef[COLLECTIONS_READY_KEY] = state;
  mark(windowRef.document, "pending");
  timer = setTimeoutImpl(() => state.settle("timeout"), timeoutMs);
  return state;
}

function domReady(documentRef) {
  if (documentRef.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) => documentRef.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

export function startAfterCollectionsHydration({ windowRef, documentRef, create }) {
  if (!windowRef || !documentRef || typeof create !== "function") return Promise.resolve(false);
  if (windowRef[PROJECT_START_KEY]) return windowRef[PROJECT_START_KEY];
  const readiness = ensureCollectionsReadiness(windowRef);
  const start = Promise.all([domReady(documentRef), readiness.promise]).then(() => {
    create();
    return true;
  });
  windowRef[PROJECT_START_KEY] = start;
  return start;
}
