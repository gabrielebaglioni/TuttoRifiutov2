// Readiness progress, not downloaded bytes: fonts/content first, then the
// visible initial images after hydration. Lazy galleries never hold the page.
export function waitForInitialResources({ documentRef, readiness = [], onProgress, timeoutMs = 12000 }) {
  return new Promise((resolve) => {
    let finished = false;
    let settled = 0;
    const cleanups = [];
    const report = (value) => { if (!finished) onProgress(value); };
    const finish = (status) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanups.forEach((cleanup) => cleanup());
      resolve({ status });
    };
    // A dead connection must not lock navigation or fake a jump to 100%.
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    report(0);
    const tasks = readiness.map((task) => Promise.resolve(task).catch(() => {}).then(() => {
      settled++;
      report(Math.floor(50 * settled / readiness.length));
    }));
    Promise.all(tasks).then(async () => {
      if (finished) return;
      const viewportHeight = documentRef.defaultView?.innerHeight ?? Infinity;
      const images = [...documentRef.querySelectorAll('img')].filter((image) => {
        if (image.loading === 'lazy' || image.closest('[hidden], .menu-overlay')) return false;
        const rect = image.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < viewportHeight;
      });
      let imagesDone = 0;
      await Promise.all(images.map((image) => new Promise((done) => {
        let handled = false;
        const cleanup = () => { image.removeEventListener('load', loaded); image.removeEventListener('error', loaded); };
        const loaded = async () => {
          if (handled) return;
          handled = true;
          cleanup();
          try { if (image.naturalWidth > 0) await image.decode?.(); } catch { /* Native fallback may still render. */ }
          imagesDone++;
          report(50 + Math.floor(50 * imagesDone / images.length));
          done();
        };
        cleanups.push(() => { cleanup(); done(); });
        image.addEventListener('load', loaded, { once: true });
        image.addEventListener('error', loaded, { once: true });
        if (image.complete) loaded();
      })));
      if (!finished) { report(100); finish('complete'); }
    }).catch(() => finish('fallback'));
  });
}
