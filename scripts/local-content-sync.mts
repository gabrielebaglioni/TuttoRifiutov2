import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile, readdir, lstat, rename, rm, mkdtemp, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { parseCanonicalMediaKey } from '../src/data/media-source.ts';
import { inspectWebp, MAX_VARIANT_PIXELS } from '../worker/media.ts';
import { isRecord } from '../worker/types.ts';

export const SITE = 'https://tutto-rifiuto.gabrielebaglioni55.chatgpt.site';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const hasErrorCode = (error: unknown, code: string): boolean => isRecord(error) && error.code === code;
function list(value: unknown): unknown[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('Invalid snapshot list');
  return value;
}
export function mediaPaths(snapshot: unknown): string[] {
  if (!isRecord(snapshot)) throw new Error('Invalid snapshot');
  const paths = new Set<string>();
  for (const item of [...list(snapshot.events), ...list(snapshot.archive)]) {
    if (!isRecord(item)) throw new Error('Invalid snapshot item');
    for (const media of list(item.media)) {
      if (!isRecord(media)) throw new Error('Invalid snapshot media');
      for (const source of list(media.sources)) {
      if (!isRecord(source)) throw new Error('Unsafe media path');
      const parsed = typeof source.src === 'string' && source.src.startsWith('/media/') && parseCanonicalMediaKey(source.src.slice(7));
      if (!parsed || parsed.width > 2048 || typeof source.src !== 'string') throw new Error('Unsafe media path');
      paths.add(source.src);
    }
    }
  }
  if (paths.size > 500) throw new Error('Too many media variants');
  return [...paths].sort();
}
async function boundedFetch(fetcher: typeof fetch, path: string, limit: number): Promise<Buffer<ArrayBuffer>> {
  const response = await fetcher(SITE + path, { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { accept: path.startsWith('/api/') ? 'application/json' : 'image/webp' } });
  if (!response.ok) throw new Error(`Remote HTTP ${response.status}`);
  if (!response.body) throw new Error('Remote response has no body');
  const reader = response.body.getReader();
  let total = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.length;
      if (total > limit) { await reader.cancel(); throw new Error('Remote file exceeds size limit'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
async function safeDirectory(path: string): Promise<void> {
  try { const stat = await lstat(path); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe local directory'); }
  catch (error) { if (!hasErrorCode(error, 'ENOENT')) throw error; await mkdir(path); }
}
async function treeDigest(path: string): Promise<string | null> {
  const stat = await lstat(path).catch((error: unknown) => { if (hasErrorCode(error, 'ENOENT')) return null; throw error; });
  if (!stat) return null;
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe local directory');
  const entries: [string, string][] = [];
  async function walk(dir: string, prefix = ''): Promise<void> {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const file = join(dir, entry.name); const name = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error('Symlinks are not allowed in synchronized content');
      if (entry.isDirectory()) await walk(file, name + '/');
      else if (entry.isFile()) entries.push([name, hash(await readFile(file))]);
      else throw new Error('Unsupported local file');
    }
  }
  await walk(path); return hash(JSON.stringify(entries));
}
async function atomicJson(path: string, value: unknown): Promise<void> {
  if ((await lstat(path).catch(() => null))?.isSymbolicLink()) throw new Error('Unsafe local state file');
  const temporary = path + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
}
export async function syncOnce(root: string, fetcher: typeof fetch = fetch) {
  root = await realpath(root);
  const stateDir = join(root, '.cms-sync'); await safeDirectory(stateDir);
  const lock = join(stateDir, 'lock');
  try { await mkdir(lock); } catch (error) { if (hasErrorCode(error, 'EEXIST')) throw new Error('Sync already running or stale lock: inspect .cms-sync/lock'); throw error; }
  let staging: string | null = null;
  try {
    await safeDirectory(join(root, 'content'));
    const target = join(root, 'content/published');
    const baselinePath = join(stateDir, 'baseline.json');
    if ((await lstat(baselinePath).catch(() => null))?.isSymbolicLink()) throw new Error('Unsafe local state file');
    const storedBaseline: unknown = await readFile(baselinePath, 'utf8').then((text) => JSON.parse(text)).catch((error: unknown) => { if (hasErrorCode(error, 'ENOENT')) return null; throw error; });
    const baseline = isRecord(storedBaseline) ? storedBaseline : null;
    const before = await treeDigest(target);
    if (before !== (baseline?.digest ?? null)) throw new Error('Conflict: local content changed; no files overwritten');
    const bytes = await boundedFetch(fetcher, '/api/published-snapshot', 10 * 1024 * 1024);
    const snapshot: unknown = JSON.parse(bytes.toString());
    if (!isRecord(snapshot) || snapshot.schemaVersion !== 1 || !snapshot.content || Array.isArray(snapshot.content) || !Array.isArray(snapshot.events) || !Array.isArray(snapshot.archive)) throw new Error('Invalid snapshot');
    const revision = hash(bytes);
    if (baseline?.revision === revision) {
      const status = { status: 'unchanged', revision, checkedAt: new Date().toISOString() };
      await atomicJson(join(stateDir, 'status.json'), status); return status;
    }
    staging = await mkdtemp(join(stateDir, 'incoming-'));
    await mkdir(join(staging, 'media'));
    const media: Record<string, { file: string; sha256: string; bytes: number }> = {}; let total = bytes.length;
    for (const path of mediaPaths(snapshot)) {
      const image = await boundedFetch(fetcher, path, 4 * 1024 * 1024);
      total += image.length; if (total > 100 * 1024 * 1024) throw new Error('Snapshot exceeds 100 MiB');
      // Do not expose native decoders for other formats to downloaded bytes.
      const dimensions = await inspectWebp(new Blob([image]));
      if (!dimensions || dimensions.width * dimensions.height > MAX_VARIANT_PIXELS) throw new Error('Expected optimized static WebP');
      const metadata = await sharp(image, { limitInputPixels: 25_000_000 }).metadata();
      if (metadata.format !== 'webp' || (metadata.pages ?? 1) > 1) throw new Error('Expected optimized static WebP');
      const local = `media/${hash(path)}.webp`;
      await writeFile(join(staging, local), image);
      media[path] = { file: local, sha256: hash(image), bytes: image.length };
    }
    // If publication changed during image downloads, preserve the old replica.
    if (hash(await boundedFetch(fetcher, '/api/published-snapshot', 10 * 1024 * 1024)) !== revision) throw new Error('Remote content changed during download; retry next cycle');
    await writeFile(join(staging, 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');
    await writeFile(join(staging, 'manifest.json'), JSON.stringify({ schemaVersion: 1, site: SITE, revision, media }, null, 2) + '\n');
    if (await treeDigest(target) !== before) throw new Error('Conflict: local content changed during download');
    const digest = await treeDigest(staging);
    const previous = join(stateDir, 'previous');
    if (await lstat(previous).catch(() => null)) {
      if (!baseline?.previousDigest || await treeDigest(previous) !== baseline.previousDigest) throw new Error('Conflict: previous backup modified; preserving it');
      await rm(previous, { recursive: true });
    }
    if (before !== null) await rename(target, previous);
    try { await rename(staging, target); staging = null; }
    catch (error) { if (before !== null) await rename(previous, target); throw error; }
    await atomicJson(baselinePath, { digest, revision, previousDigest: before });
    const status = { status: 'updated', revision, checkedAt: new Date().toISOString(), variants: Object.keys(media).length };
    await atomicJson(join(stateDir, 'status.json'), status); return status;
  } catch (error) {
    await atomicJson(join(stateDir, 'status.json'), { status: 'error', message: error instanceof Error ? error.message : String(error), checkedAt: new Date().toISOString() });
    throw error;
  } finally {
    if (staging) await rm(staging, { recursive: true });
    await rm(lock, { recursive: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2] ?? process.cwd();
  syncOnce(root).then(status => console.log(JSON.stringify(status))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
