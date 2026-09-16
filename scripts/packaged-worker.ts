/** Load the emitted artifact without typechecking generated JavaScript. */
export async function loadPackagedWorker() {
  const loaded: unknown = await import(new URL('../dist/server/index.js', import.meta.url).href);
  if (!loaded || typeof loaded !== 'object' || !('default' in loaded)) throw new Error('Missing packaged Worker');
  const worker = loaded.default;
  if (!worker || typeof worker !== 'object' || !('fetch' in worker) || typeof worker.fetch !== 'function') throw new Error('Invalid packaged Worker');
  const handler = worker.fetch;
  return {
    async fetch(request: Request, env: unknown, context: unknown): Promise<Response> {
      const response: unknown = await Reflect.apply(handler, worker, [request, env, context]);
      if (!(response instanceof Response)) throw new Error('Worker did not return a Response');
      return response;
    },
  };
}
