import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncOnce, mediaPaths } from '../scripts/local-content-sync.mjs';
import { publishedSnapshot } from '../worker/published-snapshot.js';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { THEME_KEY, DEFAULT_PALETTE } from '../src/data/theme.ts';

test('only canonical uploaded WebP paths are eligible for download', () => {
  assert.throws(() => mediaPaths({ events: [{ media: [{ sources: [{ src: '/media/../../.git/config' }] }] }], archive: [] }));
  assert.throws(() => mediaPaths({ events: [{ media: [{ sources: [{ src: 'https://evil.test/a.webp' }] }] }], archive: [] }));
});
test('local sync is idempotent and refuses to overwrite a user edit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tutto-sync-test-'));
  const snapshot = { schemaVersion: 1, content: { title: 'Uno' }, events: [], archive: [] };
  const fetcher = async () => Response.json(snapshot);
  assert.equal((await syncOnce(root, fetcher)).status, 'updated');
  assert.equal((await syncOnce(root, fetcher)).status, 'unchanged');
  const path = join(root, 'content/published/snapshot.json');
  await writeFile(path, 'local edit');
  snapshot.content.title = 'Due';
  await assert.rejects(syncOnce(root, fetcher), /Conflict/);
  assert.equal(await readFile(path, 'utf8'), 'local edit');
});
test('failed fetch preserves the previous local snapshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tutto-sync-test-'));
  await syncOnce(root, async () => Response.json({ schemaVersion: 1, content: {}, events: [], archive: [] }));
  const path = join(root, 'content/published/snapshot.json');
  const before = await readFile(path, 'utf8');
  await assert.rejects(syncOnce(root, async () => new Response('offline', {status: 503})));
  assert.equal(await readFile(path, 'utf8'), before);
});
test('preexisting unowned content is never overwritten', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tutto-sync-test-'));
  await mkdir(join(root, 'content/published'), { recursive: true });
  await writeFile(join(root, 'content/published/mine.txt'), 'mine');
  await assert.rejects(syncOnce(root, async () => Response.json({ schemaVersion: 1, content: {}, events: [], archive: [] })), /Conflict/);
});
test('snapshot fails closed on storage failure instead of exporting stale defaults', async () => {
  assert.equal((await publishedSnapshot({})).status, 503);
  assert.equal((await publishedSnapshot({DB:{prepare(){throw new Error('private database detail');}}})).status,503);
});

test('real database export reflects published labels and excludes draft text and sessions', async () => {
  const db = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) db.exec(readFileSync('drizzle/' + name, 'utf8'));
  db.exec(`INSERT INTO content_entries (key,value_json,updated_at) VALUES ('home.hero.title','"Titolo pubblicato"',1);
    INSERT INTO events (slug,status,title,code,created_at,updated_at) VALUES ('bozza','draft','TESTO PRIVATO','PRIVATE',1,1);
    INSERT INTO sessions (token_hash,csrf_token,expires_at,created_at) VALUES ('SEGRETO','SEGRETO',1,1);`);
  const DB = { prepare(sql) { const stmt = db.prepare(sql); let args = []; return {
    bind(...values) { args = values; return this; }, async all() { return { results: stmt.all(...args) }; }
  }; } };
  const response = await publishedSnapshot({ DB });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.equal(JSON.parse(text).content['home.hero.title'], 'Titolo pubblicato');
  assert.ok(!text.includes('TESTO PRIVATO') && !text.includes('SEGRETO'));
  const palette = {...DEFAULT_PALETTE,accent:'#123456'};
  db.prepare('INSERT INTO content_entries (key,value_json,updated_at) VALUES (?,?,1)').run(THEME_KEY,JSON.stringify(palette));
  const themed = await (await publishedSnapshot({DB})).json();
  assert.deepEqual(themed.content[THEME_KEY],palette);
  const root = await mkdtemp(join(tmpdir(), 'tutto-sync-theme-'));
  await syncOnce(root,async()=>Response.json(themed));
  assert.deepEqual(JSON.parse(await readFile(join(root,'content/published/snapshot.json'),'utf8')).content[THEME_KEY],palette);
  db.close();
});

test('uploaded images are copied with verified bytes, including small no-upscale variants', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tutto-sync-image-'));
  const src = '/media/events/foto/00000000-0000-4000-8000-000000000001/100.webp';
  const image = await sharp({ create: { width: 100, height: 50, channels: 3, background: 'blue' } }).webp().toBuffer();
  const snapshot = { schemaVersion: 1, content: {}, events: [{ media: [{ sources: [{ src, width: 100 }] }] }], archive: [] };
  await syncOnce(root, async (url, options) => {
    assert.equal(options.redirect, 'error');
    return url.endsWith('.webp') ? new Response(image) : Response.json(snapshot);
  });
  const manifest = JSON.parse(await readFile(join(root, 'content/published/manifest.json'), 'utf8'));
  assert.deepEqual(await readFile(join(root, 'content/published', manifest.media[src].file)), image);
});

test('sync rejects foreign or malformed formats before invoking a native decoder', async (t) => {
  const decode = t.mock.method(sharp.prototype, 'metadata', async () => { throw new Error('Native decoder reached'); });
  const src = '/media/events/foto/00000000-0000-4000-8000-000000000001/100.webp';
  const snapshot = { schemaVersion: 1, content: {}, events: [{ media: [{ sources: [{ src, width: 100 }] }] }], archive: [] };
  for (const image of [Buffer.from('GIF89a foreign payload'), Buffer.from('RIFF0000WEBPmalformed')]) {
    const root = await mkdtemp(join(tmpdir(), 'tutto-sync-reject-'));
    await assert.rejects(syncOnce(root, async url => url.endsWith('.webp') ? new Response(image) : Response.json(snapshot)));
    assert.equal(decode.mock.callCount(), 0, 'untrusted non-WebP must never reach native metadata parsing');
    await assert.rejects(readFile(join(root, 'content/published/snapshot.json')), { code: 'ENOENT' });
  }
});
