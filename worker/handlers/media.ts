import { requireAdmin } from "../auth.ts";
import { materializeCollectionItem } from "./collections.ts";
import { jsonResponse } from "../response.ts";
import { MAX_VARIANT_BYTES, VARIANTS, inspectWebp, isSafeMediaKey, keysForVariantSet, mediaJson, serveMedia, validateVariant } from "../media.ts";
import { isSlug, MAX_SLUG_BYTES } from "../slug.ts";
import { isRecord, type CollectionKind, type DatabaseReader, type MediaMetadata, type MediaOrderPayload, type MediaRow, type MediaRole, type MediaStore, type MediaVariant, type OrderEntry, type ParentRow, type UploadPayload, type WorkerContext, type WorkerDatabase, type WorkerEnv } from '../types.ts';

const HEADERS = { "cache-control": "no-store" };
const MAX_REQUEST_BYTES = 8_000_000;
const OWNER_TYPES = new Set(["events", "archive"]);
const MAX_ALT_LENGTH = 2_000;
const MAX_METADATA_BYTES = 16_384;
const MAX_MEDIA_ORDER_BYTES = 65_536;
const MAX_MEDIA_ORDER_ITEMS = 1_000;
const MAX_MEDIA_POSITION = 1_000_000;
const MAX_OWNER_SLUG_BYTES = MAX_SLUG_BYTES;
const MAX_FIELD_WIDTH = { small: 640, medium: 1280, large: 2048 };
const ASPECT_RATIO_TOLERANCE = 0.02;
// No upload heartbeat exists: keep this comfortably above normal Worker/R2 upload duration.
// Lowering it requires a heartbeat so a live reservation cannot be reclaimed early.
export const PENDING_LEASE_MS = 5 * 60 * 1000;

function error(message: string, status: number) { return jsonResponse({ error: message }, { status, headers: HEADERS }); }
function config(ownerType: CollectionKind) {
  return ownerType === "events"
    ? { table: "event_media", parent: "event_id" as const, parentTable: "events" }
    : { table: "archive_media", parent: "archive_item_id" as const, parentTable: "archive_items" };
}

async function boundedFormData(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const declared = Number(request.headers.get("content-length"));
  if (!contentType.toLowerCase().startsWith("multipart/form-data;") || (request.headers.has("content-length") && (!Number.isSafeInteger(declared) || declared < 0 || declared > MAX_REQUEST_BYTES))) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new Request(request.url, { method: request.method, headers: request.headers, body: bytes }).formData();
  } catch { return null; }
}

function single(form: FormData, name: string) {
  const entries = form.getAll(name);
  return entries.length === 1 ? entries[0] : null;
}

async function uploadPayload(request: Request): Promise<UploadPayload | null> {
  const form = await boundedFormData(request);
  if (!form) return null;
  const ownerType = single(form, "ownerType");
  const ownerSlug = single(form, "ownerSlug");
  const role = single(form, "role");
  const position = single(form, "position");
  const alt = single(form, "alt");
  if ((ownerType !== 'events' && ownerType !== 'archive') || !isSlug(ownerSlug) || new TextEncoder().encode(ownerSlug).byteLength > MAX_OWNER_SLUG_BYTES || (role !== 'cover' && role !== 'detail') || typeof position !== 'string' || !/^(0|[1-9]\d*)$/.test(position) || !Number.isSafeInteger(Number(position)) || Number(position) > 1_000_000 || (role === "cover" && Number(position) !== 0) || typeof alt !== "string" || alt.length > MAX_ALT_LENGTH) return null;
  const variants: MediaVariant[] = [];
  for (const variant of VARIANTS) {
    const files = form.getAll(variant.field);
    if (!files.length) continue;
    const file = files.length === 1 ? files[0] : null;
    if (!file || typeof file === 'string' || !await validateVariant(file, MAX_VARIANT_BYTES)) return null;
    // validateVariant already inspected this immutable File successfully.
    const dimensions = (await inspectWebp(file))!;
    if (dimensions.width > MAX_FIELD_WIDTH[variant.field]) return null;
    variants.push({ ...variant, file, width: dimensions.width, height: dimensions.height });
  }
  if (!variants.length || variants.some((variant, index) => index && variant.width <= variants[index - 1]!.width)) return null;
  const ratio = variants[0]!.width / variants[0]!.height;
  if (variants.some((variant) => Math.abs((variant.width / variant.height) - ratio) / ratio > ASPECT_RATIO_TOLERANCE)) return null;
  return { ownerType, ownerSlug, role, position: Number(position), alt, variants };
}

async function parentFor(db: WorkerDatabase, ownerType: CollectionKind, ownerSlug: string) {
  const table = ownerType === "events" ? "events" : "archive_items";
  const present = await db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).bind(ownerSlug).first<{ id: number }>();
  return present ?? materializeCollectionItem(db, ownerType, ownerSlug);
}

async function currentMedia(db: DatabaseReader, ownerType: CollectionKind, parentId: number, role: MediaRole, position: number) {
  const { table, parent } = config(ownerType);
  return db.prepare(`SELECT * FROM ${table} WHERE ${parent} = ? AND role = ? AND position = ? AND state = 'active'`).bind(parentId, role, position).first<MediaRow>();
}

function insertStatement(db: DatabaseReader, ownerType: CollectionKind, parentId: number, key: string, role: MediaRole, alt: string, position: number, widths: readonly number[], sources: readonly { key: string; width: number }[], reservationStartedAt: number) {
  const { table, parent, parentTable } = config(ownerType);
  return db.prepare(`INSERT INTO ${table} (${parent}, key, role, alt, position, widths_json, sources_json, state, reservation_started_at, created_at)
    SELECT owner.id, ?, ?, ?, ?, ?, ?, 'pending', ?, ?
    FROM ${parentTable} AS owner
    WHERE owner.id = ? AND owner.deleting = 0`)
    .bind(key, role, alt, position, JSON.stringify(widths), JSON.stringify(sources), reservationStartedAt, reservationStartedAt, parentId);
}

function deleteStatement(db: DatabaseReader, ownerType: CollectionKind, id: number, parentId: number) {
  const { table, parent } = config(ownerType);
  return db.prepare(`UPDATE ${table} SET state = 'tombstone', cleanup_attempts = cleanup_attempts + 1 WHERE id = ? AND ${parent} = ? AND state = 'active'`).bind(id, parentId);
}

function purgeStatement(db: DatabaseReader, ownerType: CollectionKind, id: number) {
  const { table } = config(ownerType);
  return db.prepare(`DELETE FROM ${table} WHERE id = ? AND state IN ('tombstone', 'pending_cleanup')`).bind(id);
}

function pendingCleanupStatement(db: DatabaseReader, ownerType: CollectionKind, id: number) { const { table } = config(ownerType); return db.prepare(`UPDATE ${table} SET state = 'pending_cleanup', cleanup_attempts = cleanup_attempts + 1 WHERE id = ? AND state = 'pending'`).bind(id); }
function activateStatement(db: DatabaseReader, ownerType: CollectionKind, id: number) { const { table } = config(ownerType); return db.prepare(`UPDATE ${table} SET state = 'active' WHERE id = ? AND state = 'pending'`).bind(id); }
function retryStatement(db: DatabaseReader, ownerType: CollectionKind, id: number) { const { table } = config(ownerType); return db.prepare(`UPDATE ${table} SET cleanup_attempts = cleanup_attempts + 1 WHERE id = ? AND state IN ('tombstone', 'pending_cleanup')`).bind(id); }
function claimStalePendingStatement(db: DatabaseReader, ownerType: CollectionKind, id: number, cutoff: number) {
  const { table } = config(ownerType);
  return db.prepare(`UPDATE ${table}
    SET state = 'pending_cleanup', cleanup_attempts = cleanup_attempts + 1
    WHERE id = ? AND state = 'pending' AND reservation_started_at > 0 AND reservation_started_at <= ?`).bind(id, cutoff);
}

function finalizeGatedParentStatement(db: DatabaseReader, ownerType: CollectionKind, parentId: number) {
  const { table, parent, parentTable } = config(ownerType);
  return db.prepare(`DELETE FROM ${parentTable}
    WHERE id = ? AND deleting = 1 AND NOT EXISTS (
      SELECT 1 FROM ${table} WHERE ${parent} = ?
    )`).bind(parentId, parentId);
}

async function runBatch(db: WorkerDatabase, statements: D1PreparedStatement[]) {
  if (typeof db.batch !== "function") throw new Error("Atomic D1 batch unavailable");
  return db.batch(statements);
}

function cleanupKeys(media: MediaRow) {
  let sources: unknown = [];
  try { sources = JSON.parse(media.sources_json ?? ''); } catch { sources = []; }
  const stored = Array.isArray(sources) ? sources.map((source: unknown) => isRecord(source) ? source.key : undefined).filter((key): key is string => typeof key === 'string' && isSafeMediaKey(key)) : [];
  if (stored.length) return [...new Set(stored)];
  let widths: unknown = [];
  try { widths = JSON.parse(media.widths_json); } catch { widths = []; }
  // Preserve failure for malformed legacy values with a truthy length: never
  // invent a fallback deletion target when the old manifest cannot be read.
  if (widths === null || (!Array.isArray(widths) && ((typeof widths === 'string' && widths.length > 0) || (isRecord(widths) && widths.length)))) throw new TypeError('Invalid media widths');
  const values = Array.isArray(widths) ? widths : [];
  return keysForVariantSet(media.key, values.length ? values.filter((width): width is number => typeof width === 'number') : [2048]);
}

async function removeKeys(media: MediaRow, store: MediaStore) {
  const keys = cleanupKeys(media).filter(isSafeMediaKey);
  if (!keys.length) return false;
  const results = await Promise.allSettled(keys.map((key) => store.delete(key)));
  return results.every((result) => result.status === "fulfilled");
}

async function cleanupTombstone(db: DatabaseReader, ownerType: CollectionKind, media: MediaRow, store: MediaStore) {
  try {
    if (!await removeKeys(media, store)) {
      await retryStatement(db, ownerType, media.id).run().catch(() => {});
      return false;
    }
    const purged = await purgeStatement(db, ownerType, media.id).run();
    if (Number(purged?.meta?.changes) !== 1) return false;
    const { parent } = config(ownerType);
    // The selected SQL table determines which parent foreign key is present.
    await finalizeGatedParentStatement(db, ownerType, media[parent]!).run().catch(() => {});
    return true;
  } catch {
    await retryStatement(db, ownerType, media.id).run().catch(() => {});
    return false;
  }
}

export async function retryTombstones(env: WorkerEnv, ownerType?: CollectionKind, now = Date.now()) {
  const kinds: CollectionKind[] = ownerType ? [ownerType] : ["events", "archive"];
  if (!env.DB || !env.MEDIA || kinds.some((kind) => !OWNER_TYPES.has(kind))) return 0;
  let cleaned = 0;
  for (const kind of kinds) {
    const { table } = config(kind);
    const cutoff = now - PENDING_LEASE_MS;
    const result = await env.DB.prepare(`SELECT * FROM ${table}
      WHERE state IN ('tombstone', 'pending_cleanup')
        OR (state = 'pending' AND reservation_started_at > 0 AND reservation_started_at <= ?)
      ORDER BY cleanup_attempts ASC,
        CASE WHEN state = 'pending' THEN reservation_started_at ELSE created_at END ASC,
        id ASC
      LIMIT 25`).bind(cutoff).all<MediaRow>();
    const rows = Array.isArray(result) ? result : result?.results ?? [];
    for (const row of rows) {
      let cleanup = row;
      if (row.state === "pending") {
        const claimed = await claimStalePendingStatement(env.DB, kind, row.id, cutoff).run().catch(() => null);
        if (Number(claimed?.meta?.changes) !== 1) continue;
        cleanup = { ...row, state: "pending_cleanup", cleanup_attempts: Number(row.cleanup_attempts ?? 0) + 1 };
      }
      if (await cleanupTombstone(env.DB, kind, cleanup, env.MEDIA)) cleaned += 1;
    }
  }
  return cleaned;
}

function scheduleWork(ctx: WorkerContext | undefined, work: Promise<unknown>) {
  const guarded = Promise.resolve(work).catch(() => {});
  if (typeof ctx?.waitUntil !== "function") { void guarded; return false; }
  try { ctx.waitUntil(guarded); return true; } catch { void guarded; return false; }
}

function schedulePostCommitWork(ctx: WorkerContext | undefined, work: Promise<unknown>) {
  const guarded = Promise.resolve(work).catch(() => {});
  if (typeof ctx?.waitUntil !== "function") { void guarded; return false; }
  ctx.waitUntil(guarded);
  return true;
}

export function scheduleTombstoneRetry(env: WorkerEnv, ctx?: WorkerContext) {
  if (!env?.DB || !env?.MEDIA || typeof ctx?.waitUntil !== "function") return false;
  return scheduleWork(ctx, retryTombstones(env));
}

function mediaSlotConflict() {
  const cause = Object.assign(new Error("Media slot conflict"), { code: "MEDIA_SLOT_CONFLICT" });
  return cause;
}

function ownerDeletionConflict() {
  const cause = Object.assign(new Error("Media owner deletion in progress"), { code: "MEDIA_OWNER_DELETING" });
  return cause;
}

function ownerNotFound() {
  const cause = Object.assign(new Error("Media owner not found"), { code: "MEDIA_OWNER_NOT_FOUND" });
  return cause;
}

async function zeroReservationCause(db: DatabaseReader, ownerType: CollectionKind, parentId: number) {
  const { parentTable } = config(ownerType);
  const parent = await db.prepare(`SELECT id, deleting FROM ${parentTable} WHERE id = ?`).bind(parentId).first<ParentRow>();
  return parent?.id ? ownerDeletionConflict() : ownerNotFound();
}

function isSlotConflict(cause: unknown) {
  return isRecord(cause) && (cause.code === "MEDIA_SLOT_CONFLICT" || /unique|constraint/i.test(String(cause.message)));
}

function exactMetadata(value: unknown): value is MediaMetadata {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 3 && keys.every((key) => ["role", "alt", "position"].includes(key))
    && (value.role === 'cover' || value.role === 'detail')
    && typeof value.alt === "string"
    && value.alt.length <= MAX_ALT_LENGTH
    && new TextEncoder().encode(value.alt).byteLength <= MAX_ALT_LENGTH
    && typeof value.position === 'number' && Number.isSafeInteger(value.position)
    && value.position >= 0
    && value.position <= MAX_MEDIA_POSITION
    && (value.role !== "cover" || value.position === 0);
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

async function boundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  const declared = request.headers.get("content-length");
  if (!contentType.toLowerCase().startsWith("application/json") || (declared !== null && (!Number.isSafeInteger(Number(declared)) || Number(declared) < 0 || Number(declared) > maximumBytes))) return null;
  try {
    const reader = request.body?.getReader();
    if (!reader) return null;
    const chunks = [];
    let byteLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > maximumBytes) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  } catch { return null; }
}

async function boundedMetadata(request: Request) {
  const payload = await boundedJson(request, MAX_METADATA_BYTES);
  return exactMetadata(payload) ? payload : null;
}

function exactMediaOrder(value: unknown): value is MediaOrderPayload {
  if (!hasExactKeys(value, ["ownerType", "ownerSlug", "items"])
    || (value.ownerType !== 'events' && value.ownerType !== 'archive')
    || !isSlug(value.ownerSlug)
    || new TextEncoder().encode(value.ownerSlug).byteLength > MAX_OWNER_SLUG_BYTES
    || !Array.isArray(value.items)
    || value.items.length > MAX_MEDIA_ORDER_ITEMS) return false;
  const ids = new Set();
  return value.items.every((item: unknown) => hasExactKeys(item, ["id", "position"])
    && typeof item.id === 'number' && Number.isSafeInteger(item.id) && item.id > 0
    && typeof item.position === 'number' && Number.isSafeInteger(item.position) && item.position >= 0 && item.position <= MAX_MEDIA_POSITION
    && !ids.has(item.id) && (ids.add(item.id), true));
}

async function mediaOrderPayload(request: Request) {
  const payload = await boundedJson(request, MAX_MEDIA_ORDER_BYTES);
  return exactMediaOrder(payload) ? payload : null;
}

function rowsFrom<T>(result: T[] | { results?: T[] } | null | undefined): T[] { return Array.isArray(result) ? result : result?.results ?? []; }

function mediaOrderStatements(db: DatabaseReader, ownerType: CollectionKind, parentId: number, current: Pick<MediaRow, 'id' | 'role' | 'position'>[], items: OrderEntry[]) {
  const { table, parent, parentTable } = config(ownerType);
  const ids = current.map(({ id }) => id);
  const byId = new Map(current.map((media) => [media.id, media]));
  const slots = new Set();
  if (items.length !== current.length
    || current.some((media) => !Number.isSafeInteger(media.position) || media.position < 0 || media.position > MAX_MEDIA_POSITION)
    || items.some(({ id, position }) => {
      const media = byId.get(id);
      const slot = media && `${media.role}:${position}`;
      return !media || (media.role === "cover" && position !== 0) || slots.has(slot) || (slots.add(slot), false);
    })) return null;

  const details = items.filter(({ id }) => byId.get(id)?.role === "detail");
  const maximum = Math.max(0, ...current.filter(({ role }) => role === "detail").map(({ position }) => position));
  const temporaryBase = Math.max(MAX_MEDIA_POSITION + 1, maximum + details.length + 1);
  if (!Number.isSafeInteger(temporaryBase)) return null;
  const placeholders = ids.map(() => "?").join(", ");
  const guardedUpdate = (id: number, position: number) => db.prepare(`UPDATE ${table} SET position = ?
    WHERE id = ? AND ${parent} = ? AND state = 'active'
      AND EXISTS (SELECT 1 FROM ${parentTable} WHERE id = ? AND deleting = 0)
      AND (SELECT count(*) FROM ${table} WHERE ${parent} = ? AND state = 'active') = ?
      AND NOT EXISTS (SELECT 1 FROM ${table} WHERE ${parent} = ? AND state = 'active' AND id NOT IN (${placeholders}))`)
    .bind(position, id, parentId, parentId, parentId, ids.length, parentId, ...ids);
  // Covers are constrained to position zero, so only details receive temporary
  // positions before the final complete-set write.
  return [
    ...details.map(({ id }, index) => guardedUpdate(id, temporaryBase + index)),
    ...items.map(({ id, position }) => guardedUpdate(id, position)),
  ];
}

export async function uploadMedia(request: Request, env: WorkerEnv, ctx?: WorkerContext) {
  const admin = await requireAdmin(request, env, { csrf: true }); if (admin instanceof Response) return admin;
  if (!env.DB || !env.MEDIA) return error("Media storage unavailable", 500);
  const payload = await uploadPayload(request); if (!payload) return error("Invalid media upload", 400);
  let reserved: MediaRow | undefined;
  let old: MediaRow | null | undefined;
  let committed = false;
  try {
    const parent = await parentFor(env.DB, payload.ownerType, payload.ownerSlug);
    if (!parent?.id) return error("Media owner not found", 404);
    const uuid = crypto.randomUUID();
    const keys = payload.variants.map((variant) => `${payload.ownerType}/${payload.ownerSlug}/${uuid}/${variant.width}.webp`);
    if (keys.some((key) => !isSafeMediaKey(key))) return error("Invalid media upload", 400);
    // keys is a one-to-one mapping of the non-empty validated variant list.
    const sources = payload.variants.map((variant, index) => ({ width: variant.width, key: keys[index]! }));
    old = await currentMedia(env.DB, payload.ownerType, parent.id, payload.role, payload.position);
    const reservationStartedAt = Date.now();
    const reservation = await insertStatement(env.DB, payload.ownerType, parent.id, keys.at(-1)!, payload.role, payload.alt, payload.position, payload.variants.map((variant) => variant.width), sources, reservationStartedAt).run();
    if (Number(reservation?.meta?.changes) !== 1) throw await zeroReservationCause(env.DB, payload.ownerType, parent.id);
    const reservationId = Number(reservation?.meta?.last_row_id);
    if (!Number.isSafeInteger(reservationId) || reservationId <= 0) throw new Error("Pending reservation id unavailable");
    reserved = { id: reservationId, key: keys.at(-1)!, role: payload.role, alt: payload.alt, position: payload.position, widths_json: JSON.stringify(payload.variants.map((variant) => variant.width)), sources_json: JSON.stringify(sources), state: "pending", reservation_started_at: reservationStartedAt, [config(payload.ownerType).parent]: parent.id };
    for (let index = 0; index < payload.variants.length; index += 1) {
      const { file } = payload.variants[index]!;
      await env.MEDIA.put(keys[index]!, file, { httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" } });
    }
    const statements = [activateStatement(env.DB, payload.ownerType, reserved.id)];
    if (old) statements.unshift(deleteStatement(env.DB, payload.ownerType, old.id, parent.id));
    const results = await runBatch(env.DB, statements);
    const activation = Array.isArray(results) ? results.at(-1) : null;
    if (Number(activation?.meta?.changes) !== 1) throw mediaSlotConflict();
    committed = true;
    const response = jsonResponse(mediaJson(reserved, { ownerType: payload.ownerType, ownerSlug: payload.ownerSlug, role: payload.role }), { status: 201, headers: HEADERS });
    if (old) schedulePostCommitWork(ctx, cleanupTombstone(env.DB, payload.ownerType, old, env.MEDIA));
    return response;
  } catch (cause) {
    if (committed) {
      scheduleTombstoneRetry(env, ctx);
      return error("Media storage unavailable", 500);
    }
    if (reserved?.id) {
      const marked = await pendingCleanupStatement(env.DB, payload.ownerType, reserved.id).run().catch(() => null);
      if (Number(marked?.meta?.changes) === 1) scheduleWork(ctx, cleanupTombstone(env.DB, payload.ownerType, { ...reserved, state: "pending_cleanup" }, env.MEDIA));
      else scheduleTombstoneRetry(env, ctx);
    }
    if (isRecord(cause) && cause.code === "MEDIA_OWNER_DELETING") return error("Media owner deletion in progress", 409);
    if (isRecord(cause) && cause.code === "MEDIA_OWNER_NOT_FOUND") return error("Media owner not found", 404);
    return isSlotConflict(cause) ? error("Media slot conflict", 409) : error("Media storage unavailable", 500);
  }
}

export async function deleteMediaHandler(request: Request, env: WorkerEnv, ownerType: CollectionKind, id: number, ctx?: WorkerContext) {
  const admin = await requireAdmin(request, env, { csrf: true }); if (admin instanceof Response) return admin;
  if (!env.DB || !env.MEDIA) return error("Media storage unavailable", 500);
  if (!OWNER_TYPES.has(ownerType) || !Number.isSafeInteger(id) || id <= 0) return error("Not found", 404);
  try {
    const { table, parent } = config(ownerType);
    const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND state = 'active'`).bind(id).first<MediaRow>();
    if (!row) return error("Not found", 404);
    const result = await deleteStatement(env.DB, ownerType, id, row[parent]!).run();
    if (!result?.meta?.changes) return error("Not found", 404);
    const cleaned = await cleanupTombstone(env.DB, ownerType, { ...row, state: "tombstone" }, env.MEDIA);
    if (!cleaned) scheduleTombstoneRetry(env, ctx);
    return jsonResponse({ id, deleted: true, cleanupPending: !cleaned }, { status: cleaned ? 200 : 202, headers: HEADERS });
  } catch { return error("Media storage unavailable", 500); }
}

export async function updateMediaMetadataHandler(request: Request, env: WorkerEnv, ownerType: CollectionKind, id: number) {
  const admin = await requireAdmin(request, env, { csrf: true }); if (admin instanceof Response) return admin;
  if (!env.DB || !OWNER_TYPES.has(ownerType) || !Number.isSafeInteger(id) || id <= 0) return error("Not found", 404);
  const payload = await boundedMetadata(request);
  if (!payload) return error("Invalid media metadata", 400);
  try {
    const { table, parent } = config(ownerType);
    const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND state = 'active'`).bind(id).first<MediaRow>();
    if (!row) return error("Not found", 404);
    const occupied = await env.DB.prepare(`SELECT id FROM ${table} WHERE ${parent} = ? AND role = ? AND position = ? AND state = 'active' AND id != ?`).bind(row[parent], payload.role, payload.position, id).first();
    if (occupied) return error("Media slot conflict", 409);
    const result = await env.DB.prepare(`UPDATE ${table} SET role = ?, alt = ?, position = ? WHERE id = ? AND state = 'active'`).bind(payload.role, payload.alt, payload.position, id).run();
    if (Number(result?.meta?.changes) !== 1) return error("Not found", 404);
    return jsonResponse({ id, role: payload.role, alt: payload.alt, position: payload.position }, { headers: HEADERS });
  } catch (cause) { return /unique|constraint/i.test(String(isRecord(cause) ? cause.message : undefined)) ? error("Media slot conflict", 409) : error("Media storage unavailable", 500); }
}

export async function reorderMediaHandler(request: Request, env: WorkerEnv) {
  const admin = await requireAdmin(request, env, { csrf: true }); if (admin instanceof Response) return admin;
  if (!env.DB || typeof env.DB.batch !== "function") return error("Media storage unavailable", 500);
  const payload = await mediaOrderPayload(request);
  if (!payload) return error("Invalid media ordering", 400);
  try {
    const { table, parent, parentTable } = config(payload.ownerType);
    const owner = await env.DB.prepare(`SELECT id, deleting FROM ${parentTable} WHERE slug = ?`).bind(payload.ownerSlug).first<ParentRow>();
    if (!owner?.id) return error("Media owner not found", 404);
    if (owner.deleting) return error("Media owner deletion in progress", 409);
    const current = rowsFrom(await env.DB.prepare(`SELECT id, role, position FROM ${table}
      WHERE ${parent} = ? AND state = 'active' ORDER BY id`).bind(owner.id).all<Pick<MediaRow, 'id' | 'role' | 'position'>>());
    const statements = mediaOrderStatements(env.DB, payload.ownerType, owner.id, current, payload.items);
    if (!statements) return error("Invalid media ordering", 400);
    if (!statements.length) return jsonResponse([], { headers: HEADERS });
    const result = await env.DB.batch(statements);
    if (!Array.isArray(result) || result.length !== statements.length || result.some((entry) => Number(entry?.meta?.changes) !== 1)) return error("Media ordering conflict", 409);
    const ordered = rowsFrom(await env.DB.prepare(`SELECT id, role, position FROM ${table}
      WHERE ${parent} = ? AND state = 'active' ORDER BY id`).bind(owner.id).all<Pick<MediaRow, 'id' | 'role' | 'position'>>());
    return jsonResponse(ordered.map(({ id, role, position }) => ({ id, role, position })), { headers: HEADERS });
  } catch (cause) {
    return /unique|constraint/i.test(String(isRecord(cause) ? cause.message : undefined)) ? error("Media slot conflict", 409) : error("Media storage unavailable", 500);
  }
}

export { serveMedia };
