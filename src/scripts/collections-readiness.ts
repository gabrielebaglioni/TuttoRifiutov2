const COLLECTIONS_READY_KEY = "__tuttoRifiutoCollectionsReady";
const PROJECT_START_KEY = "__tuttoRifiutoProjectStart";
const DEFAULT_READINESS_TIMEOUT_MS = 4_500;
export type CollectionStatus = 'complete' | 'failure' | 'timeout';
export interface CollectionsReadiness {
  promise: Promise<CollectionStatus>;
  settled: boolean;
  status: 'pending' | CollectionStatus;
  settle(status?: CollectionStatus): boolean;
}
interface ReadinessWindow {
  document: Document;
  [COLLECTIONS_READY_KEY]?: CollectionsReadiness;
  [PROJECT_START_KEY]?: Promise<boolean>;
}
interface ReadinessOptions {
  timeoutMs?: number;
  setTimeoutImpl?: typeof globalThis.setTimeout;
  clearTimeoutImpl?: typeof globalThis.clearTimeout;
}

function mark(document: Document, status: CollectionsReadiness['status']) {
  if (document?.documentElement?.dataset) document.documentElement.dataset.collectionsHydration = status;
}

export function ensureCollectionsReadiness(windowRef: ReadinessWindow = globalThis.window, {
  timeoutMs = DEFAULT_READINESS_TIMEOUT_MS,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
}: ReadinessOptions = {}): CollectionsReadiness {
  if (!windowRef) throw new TypeError("Collections readiness requires a window");
  if (windowRef[COLLECTIONS_READY_KEY]) return windowRef[COLLECTIONS_READY_KEY];
  let resolve!: (status: CollectionStatus) => void; // Promise executor runs synchronously.
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  const promise = new Promise<CollectionStatus>((done) => { resolve = done; });
  const state: CollectionsReadiness = {
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

function domReady(documentRef: Document) {
  if (documentRef.readyState !== "loading") return Promise.resolve();
  return new Promise<void>((resolve) => documentRef.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
}

export function startAfterCollectionsHydration({ windowRef, documentRef, create }: { windowRef: ReadinessWindow; documentRef: Document; create(): unknown }): Promise<boolean> {
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
