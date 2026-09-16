// Readiness progress, not downloaded bytes: fonts/content first, then the
// visible initial images after hydration. Lazy galleries never hold the page.
export type LoadingStatus = 'complete' | 'timeout' | 'fallback';
export interface InitialResourcesOptions {
  documentRef: Document;
  readiness?: readonly unknown[];
  onProgress(value: number): void;
  timeoutMs?: number;
}
export function waitForInitialResources({ documentRef, readiness = [], onProgress, timeoutMs = 12000 }: InitialResourcesOptions): Promise<{ status: LoadingStatus }> {
  return new Promise((resolve) => {
    let finished = false;
    let settled = 0;
    let lastProgress = 0;
    const cleanups: Array<() => void> = [];
    const report = (value: number) => { if (!finished) { lastProgress = Math.max(lastProgress, value); onProgress(lastProgress); } };
    const finish = (status: LoadingStatus) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanups.forEach((cleanup) => cleanup());
      resolve({ status });
    };
    // A dead connection must not lock navigation or fake a jump to 100%.
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    report(0);
    const tasks = readiness.map((task) => Promise.resolve(task).catch(() => {}).then((status) => {
      // The collections coordinator can release its fallback before the
      // underlying fetch finishes. That is not full resource readiness.
      if (status === 'timeout') { finish('timeout'); return; }
      settled++;
      report(Math.floor(50 * settled / readiness.length));
    }));
    Promise.all(tasks).then(async () => {
      if (finished) return;
      const viewportHeight = documentRef.defaultView?.innerHeight ?? Infinity;
      const seen = new Set<HTMLImageElement>();
      const initialImages = () => [...documentRef.querySelectorAll('img')].filter((image) => {
        if (seen.has(image)) return false;
        if (image.loading === 'lazy' || image.closest('[hidden], .menu-overlay')) return false;
        const rect = image.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < viewportHeight;
      });
      // Error handlers may replace a remote picture with a local fallback.
      // Recheck the visible DOM after each batch; never count 100 beforehand.
      let images = initialImages();
      while (images.length && !finished) {
      let imagesDone = 0;
      await Promise.all(images.map((image) => new Promise<void>((done) => {
        seen.add(image);
        let handled = false;
        const cleanup = () => { image.removeEventListener('load', loaded); image.removeEventListener('error', loaded); };
        const loaded = async () => {
          if (handled) return;
          handled = true;
          cleanup();
          try { if (image.naturalWidth > 0) await image.decode?.(); } catch { /* Native fallback may still render. */ }
          imagesDone++;
          report(50 + Math.floor(49 * imagesDone / images.length));
          done();
        };
        cleanups.push(() => { cleanup(); done(); });
        image.addEventListener('load', loaded, { once: true });
        image.addEventListener('error', loaded, { once: true });
        if (image.complete) loaded();
      })));
      images = initialImages();
      }
      if (!finished) { report(100); finish('complete'); }
    }).catch(() => finish('fallback'));
  });
}
