// Disposable local UI fixture. No production credentials, database or writes.
import { createServer } from 'node:http';
import { SITE_CONTENT } from '../src/data/site-content.js';
let content = structuredClone(SITE_CONTENT);
let collections = { events: [], archive: [] };
createServer(async (req, res) => {
  try {
    const path = req.url.split('?')[0];
    if (!path.startsWith('/api/')) {
      const upstream = await fetch(`http://127.0.0.1:4324${req.url}`);
      res.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([name]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(name))));
      res.end(Buffer.from(await upstream.arrayBuffer())); return;
    }
    res.setHeader('content-type', 'application/json');
    let payload = {};
    if (path === '/api/admin/session' || path === '/api/admin/login') payload = { authenticated: true, csrfToken: 'local-fixture-only' };
    else if (path === '/api/content') payload = content;
    else if (path.startsWith('/api/admin/content/')) {
      let body = ''; for await (const chunk of req) body += chunk;
      const key = decodeURIComponent(path.slice('/api/admin/content/'.length));
      content[key] = req.method === 'DELETE' ? SITE_CONTENT[key] : JSON.parse(body).value;
      payload = { ok: true };
    } else if (/^\/api\/admin\/(events|archive)$/.test(path)) {
      const kind = path.split('/').at(-1);
      if (req.method === 'POST') { let body = ''; for await (const chunk of req) body += chunk; const item = { ...JSON.parse(body), media: [] }; collections[kind].push(item); payload = item; }
      else payload = collections[kind];
    } else { res.statusCode = 404; payload = { error: 'Endpoint non disponibile nella fixture locale' }; }
    res.end(JSON.stringify(payload));
  } catch { res.statusCode = 500; res.end('Local fixture error'); }
}).listen(4325, '127.0.0.1', () => console.log('Disposable admin fixture: http://127.0.0.1:4325/admin'));
