import assert from 'node:assert/strict';

// Built JavaScript is a runtime boundary. Validate its shape and every returned
// response rather than publishing an unchecked declaration for generated code.
export async function loadCompiledWorker(url = new URL('../dist/server/index.js', import.meta.url)) {
  const loaded: unknown = await import(url.href);
  assert.ok(loaded && typeof loaded === 'object' && 'default' in loaded);
  const worker = loaded.default;
  assert.ok(worker && typeof worker === 'object' && 'fetch' in worker);
  const fetchWorker = worker.fetch;
  assert.equal(typeof fetchWorker, 'function');
  assert.ok(typeof fetchWorker === 'function');
  return {
    async fetch(request: Request, env: object, context: object): Promise<Response> {
      const response: unknown = await Reflect.apply(fetchWorker, worker, [request, env, context]);
      assert.ok(response instanceof Response, 'compiled Worker must return a Response');
      return response;
    },
  };
}
