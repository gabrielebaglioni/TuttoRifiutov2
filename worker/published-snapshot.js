import { getContentOverrides } from './db.js';
import { SITE_CONTENT } from './content-defaults.js';
import { mergeContent } from './handlers/content.js';
import { publicItems } from './handlers/collections.js';

// Only the public projection, never raw DB rows, sessions or unpublished events.
// A storage error must fail export rather than overwrite backups with defaults.
export async function publishedSnapshot(env) {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  try {
    if (!env.DB) throw new Error('Missing storage');
    const scoped = { ...env, DB: env.DB.withSession?.('first-primary') ?? env.DB };
    const capture = async () => {
      const rows = await getContentOverrides(scoped.DB);
      return { schemaVersion: 1, content: mergeContent(SITE_CONTENT, rows.results ?? rows),
        events: await publicItems(scoped, 'events'), archive: await publicItems(scoped, 'archive') };
    };
    const first = JSON.stringify(await capture());
    const second = JSON.stringify(await capture());
    if (first !== second) return Response.json({ error: 'Content changed; retry' }, { status: 409, headers });
    return new Response(first, { headers: { ...headers, 'content-type': 'application/json' } });
  } catch {
    return Response.json({ error: 'Published content temporarily unavailable' }, { status: 503, headers });
  }
}
