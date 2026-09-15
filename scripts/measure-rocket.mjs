import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parse } from 'acorn';
import { parseHTML } from 'linkedom';
import worker from '../dist/server/index.js';

export async function measureRoute(route) {
  const response = await worker.fetch(new Request(`https://site.test${route}`), { ASSETS: { fetch: async () => new Response('', { status: 404 }) } }, {});
  if (!response.ok) throw new Error(`Route ${route}: ${response.status}`);
  const { document } = parseHTML(await response.text());
  const root = resolve('dist/client'), seen = new Map();
  function visit(url) {
    const path = resolve(root, `.${url}`);
    if (!path.startsWith(`${root}/`) || seen.has(path)) return;
    const source = readFileSync(path, 'utf8'); seen.set(path, source);
    const tree = parse(source, { sourceType: 'module', ecmaVersion: 'latest' });
    for (const node of tree.body) {
      if (!['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) || !node.source) continue;
      const dependency = node.source.value;
      if (dependency.startsWith('.')) visit('/' + join(dirname(path).slice(root.length), dependency));
      else if (dependency.startsWith('/')) visit(dependency);
    }
  }
  for (const node of document.querySelectorAll('script[type="module"][src],astro-island[component-url],astro-island[renderer-url]')) {
    for (const attr of ['src', 'component-url', 'renderer-url']) { const url = node.getAttribute(attr); if (url?.endsWith('.js')) visit(url); }
  }
  return { route, files: [...seen.keys()].map(path => path.slice(root.length)), rawBytes: [...seen.values()].reduce((sum, source) => sum + Buffer.byteLength(source), 0), gzipBytes: [...seen.values()].reduce((sum, source) => sum + gzipSync(source).length, 0) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const route of ['/', '/work', '/events', '/contact', '/admin']) console.log(JSON.stringify(await measureRoute(route)));
}
