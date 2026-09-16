import { ARCHIVE_DEFAULTS, EVENT_DEFAULTS } from "../collections-defaults.ts";
import { getCollectionOverrides, getMediaForCollectionItem } from "../db.ts";
import { jsonResponse } from "../response.ts";
import { requireAdmin } from "../auth.ts";
import { isAllowedLink, MAX_CONTENT_STRING_LENGTH } from "../validation.ts";
import { isSafeMediaKey, keysForVariantSet, mediaJson } from "../media.ts";
import { isSlug } from "../slug.ts";
import { isKnownEventStatus, isPublicEventStatus } from "../../src/data/event-status.ts";
import { isRecord, type CollectionKind, type DatabaseReader, type MediaManifestRow, type MediaProjection, type MediaRow, type MediaStore, type OrderEntry, type WorkerDatabase, type WorkerEnv } from '../types.ts';

type CollectionItem = Record<string, unknown> & { slug: string };
type CollectionPayload = CollectionItem & { position: number; mediaOrder?: OrderEntry[] };
interface CollectionConfig {
  table: string; mediaTable: string; parentColumn: string;
  defaults: CollectionItem[]; fields: string[]; json: Record<string, string>;
}

const HEADERS = { "cache-control": "no-store" };
const MAX_BODY_BYTES = 1_000_000;
export const MAX_COLLECTION_POSITION = 1_000_000;
const CONFIG: Record<CollectionKind, CollectionConfig> = {
  events: {
    table: "events", mediaTable: "event_media", parentColumn: "event_id", defaults: EVENT_DEFAULTS,
    fields: ["slug", "status", "title", "code", "summary", "meta", "description", "info", "outro", "outroInfo", "seo", "position"],
    json: { meta: "meta_json", info: "info_json", outroInfo: "outro_info", seo: "seo_json" },
  },
  archive: {
    table: "archive_items", mediaTable: "archive_media", parentColumn: "archive_item_id", defaults: ARCHIVE_DEFAULTS,
    fields: ["slug", "title", "code", "href", "description", "details", "outro", "seo", "position"],
    json: { details: "details_json", seo: "seo_json" },
  },
};

export { isSlug } from "../slug.ts";
function rowsFrom<T>(result: T[] | { results?: T[] } | null | undefined): T[] { return Array.isArray(result) ? result : Array.isArray(result?.results) ? result.results : []; }
function parseJson(value: unknown, fallback: unknown): unknown { try { return typeof value === "string" ? JSON.parse(value) : value ?? fallback; } catch { return fallback; } }
function configFor(kind: CollectionKind) { const config = CONFIG[kind]; if (!config) throw new TypeError("Unsupported collection kind"); return config; }
function defaultItem(kind: CollectionKind, slug: string) { return configFor(kind).defaults.find((item) => item.slug === slug); }
function error(message: string, status: number) { return jsonResponse({ error: message }, { status, headers: HEADERS }); }

function rowToItem(kind: CollectionKind, row: Record<string, unknown>) {
  const config = configFor(kind);
  const item: Record<string, unknown> = {};
  for (const field of config.fields) {
    const column = config.json[field];
    item[field] = column
      ? parseJson(Object.prototype.hasOwnProperty.call(row, column) ? row[column] : row[field], field === "seo" ? {} : [])
      : row[field];
  }
  if (Number.isInteger(row.id)) item.id = row.id;
  if (row.deleting) item.deleting = 1;
  return item;
}

export function normalizeMediaRows(rows: MediaManifestRow[] | { results?: MediaManifestRow[] }, owner: { ownerType: CollectionKind; ownerSlug: string }) {
  return rowsFrom(rows).map((row) => mediaJson(row, { ...owner, role: row.role })).filter((row): row is MediaProjection => row !== null).sort((left, right) => left.position - right.position || left.id - right.id);
}

function attachMedia(item: Record<string, unknown>, media: MediaProjection[]): Record<string, unknown> & { media: MediaProjection[] } {
  // Fallback fields are part of the public default record. Persisted media is
  // an independent override list so clients can overlay only matching slots
  // and keep unrelated fallback visuals available after a partial edit.
  return { ...item, media };
}

function itemOrder(item: Record<string, unknown>, index: number): [number, number] { return [typeof item.position === 'number' && Number.isInteger(item.position) ? item.position : index, typeof item.id === 'number' && Number.isInteger(item.id) ? item.id : index]; }
export function mergeCollection(defaults: readonly CollectionItem[], rows: readonly Record<string, unknown>[] | null | undefined) {
  const bySlug = new Map<string, CollectionItem>(defaults.map((item, index) => [item.slug, { ...item, position: item.position ?? index }]));
  for (const raw of rows ?? []) {
    if (!raw || !isSlug(raw.slug)) continue;
    bySlug.set(raw.slug, { ...(bySlug.get(raw.slug) ?? {}), ...raw, slug: raw.slug });
  }
  return [...bySlug.values()].map((item, index) => ({ item, index })).sort((left, right) => {
    const [lp, li] = itemOrder(left.item, left.index); const [rp, ri] = itemOrder(right.item, right.index);
    return lp - rp || li - ri || left.item.slug.localeCompare(right.item.slug);
  }).map(({ item }) => item);
}

function nonEmptyString(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= MAX_CONTENT_STRING_LENGTH; }
function string(value: unknown): value is string { return typeof value === "string" && value.length <= MAX_CONTENT_STRING_LENGTH; }
function tuple(value: unknown) { return Array.isArray(value) && value.length === 2 && value.every(nonEmptyString); }
function columns(value: unknown) { return Array.isArray(value) && value.length > 0 && value.every((column: unknown) => Array.isArray(column) && column.length > 0 && column.every(tuple)); }
function seo(value: unknown) { return isRecord(value) && nonEmptyString(value.title) && string(value.description) && Object.keys(value).every((key) => key === "title" || key === "description"); }
function position(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_COLLECTION_POSITION; }
function mediaOrder(value: unknown): value is OrderEntry[] | undefined {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  return value.every((entry: unknown) => isRecord(entry) && Object.keys(entry).every((key) => key === "id" || key === "position") && typeof entry.id === 'number' && Number.isSafeInteger(entry.id) && entry.id > 0 && position(entry.position) && !ids.has(entry.id) && (ids.add(entry.id), true));
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

export function validateCollectionPayload(kind: CollectionKind, value: unknown, expectedSlug?: string): value is CollectionPayload {
  if (!isRecord(value) || !isSlug(value.slug) || (expectedSlug && value.slug !== expectedSlug) || !nonEmptyString(value.title) || !position(value.position) || !mediaOrder(value.mediaOrder)) return false;
  if (kind === "events") return isKnownEventStatus(value.status) && nonEmptyString(value.code) && string(value.summary) && Array.isArray(value.meta) && value.meta.every(nonEmptyString) && string(value.description) && columns(value.info) && string(value.outro) && columns(value.outroInfo) && seo(value.seo);
  if (kind !== "archive") return false;
  return nonEmptyString(value.code) && typeof value.href === "string" && isAllowedLink(value.href) && string(value.description) && Array.isArray(value.details) && value.details.every(tuple) && string(value.outro) && seo(value.seo);
}

async function readJson(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!Number.isSafeInteger(Number(declared)) || Number(declared) < 0 || Number(declared) > MAX_BODY_BYTES)) return null;
  try { const text = await request.text(); return new TextEncoder().encode(text).byteLength <= MAX_BODY_BYTES ? JSON.parse(text) : null; } catch { return null; }
}

function statementFor(db: DatabaseReader, kind: CollectionKind, payload: CollectionItem, updating: boolean) {
  const config = configFor(kind);
  const columns = config.fields.map((field) => config.json[field] ?? field);
  const values = config.fields.map((field) => config.json[field] ? JSON.stringify(payload[field]) : payload[field]);
  const now = Date.now();
  if (updating) return db.prepare(`UPDATE ${config.table} SET ${columns.slice(1).map((column) => `${column} = ?`).join(", ")}, updated_at = ? WHERE slug = ?`).bind(...values.slice(1), now, payload.slug);
  return db.prepare(`INSERT INTO ${config.table} (${columns.join(", ")}, created_at, updated_at) VALUES (${columns.map(() => "?").join(", ")}, ?, ?)`).bind(...values, now, now);
}

function canonicalOrderingStatement(db: DatabaseReader, kind: CollectionKind, ordered: readonly CollectionItem[]) {
  const config = configFor(kind);
  const columns = config.fields.map((field) => config.json[field] ?? field);
  const allColumns = [...columns, "created_at", "updated_at"];
  const placeholders = ordered.map(() => `(${allColumns.map(() => "?").join(", ")})`).join(", ");
  const now = Date.now();
  const values = ordered.flatMap((item) => {
    const canonical = config.fields.map((field) => config.json[field] ? JSON.stringify(item[field]) : item[field]);
    return [...canonical, now, now];
  });
  return db.prepare(`INSERT INTO ${config.table} (${allColumns.join(", ")}) VALUES ${placeholders}
    ON CONFLICT(slug) DO UPDATE SET position = excluded.position, updated_at = excluded.updated_at`).bind(...values);
}

async function existing(db: DatabaseReader, kind: CollectionKind, slug: string) { return db.prepare(`SELECT id FROM ${configFor(kind).table} WHERE slug = ?`).bind(slug).first<{ id: number }>(); }
async function batch(db: WorkerDatabase, statements: D1PreparedStatement[]) { return db.batch ? db.batch(statements) : Promise.all(statements.map((statement) => statement.run())); }
function mediaOrderingStatements(db: DatabaseReader, kind: CollectionKind, parentId: number, order: readonly OrderEntry[] = [], current: readonly MediaRow[] = []) {
  const config = configFor(kind);
  const byId = new Map(current.map((media) => [media.id, media]));
  const details = order.filter(({ id }) => byId.get(id)?.role === "detail");
  const maximum = Math.max(0, ...current.filter((media) => media.role === "detail").map((media) => media.position));
  const temporaryBase = maximum + details.length + 1;
  if (!Number.isSafeInteger(temporaryBase)) throw new Error("Invalid media ordering");
  const temporary = details.map(({ id }, index) => db.prepare(`UPDATE ${config.mediaTable} SET position = ? WHERE id = ? AND ${config.parentColumn} = ?`).bind(temporaryBase + index, id, parentId));
  const final = order.map(({ id, position }) => db.prepare(`UPDATE ${config.mediaTable} SET position = ? WHERE id = ? AND ${config.parentColumn} = ?`).bind(position, id, parentId));
  return [...temporary, ...final];
}

function cleanupKeys(media: MediaRow) {
  let sources: unknown = [];
  try { sources = JSON.parse(media.sources_json ?? ''); } catch { sources = []; }
  const stored = Array.isArray(sources) ? sources.map((source: unknown) => isRecord(source) ? source.key : undefined).filter((key): key is string => typeof key === 'string' && isSafeMediaKey(key)) : [];
  if (stored.length) return [...new Set(stored)];
  if (!isSafeMediaKey(media.key)) return [];
  let widths: unknown = [];
  try { widths = JSON.parse(media.widths_json); } catch { widths = []; }
  if (!Array.isArray(widths)) throw new TypeError('Invalid media widths');
  return keysForVariantSet(media.key, widths.filter((width): width is number => typeof width === 'number')).filter(isSafeMediaKey);
}

async function parentMedia(db: DatabaseReader, kind: CollectionKind, parentId: number) {
  const config = configFor(kind);
  return rowsFrom(await db.prepare(`SELECT * FROM ${config.mediaTable} WHERE ${config.parentColumn} = ? AND state IN ('active', 'tombstone', 'pending', 'pending_cleanup') ORDER BY id`).bind(parentId).all<MediaRow>());
}

function beginParentDeleteStatement(db: DatabaseReader, kind: CollectionKind, parentId: number, slug: string) {
  const config = configFor(kind);
  return db.prepare(`UPDATE ${config.table}
    SET deleting = 1
    WHERE id = ? AND slug = ? AND deleting = 0
      AND NOT EXISTS (
        SELECT 1 FROM ${config.mediaTable}
        WHERE ${config.parentColumn} = ? AND state = 'pending'
      )`).bind(parentId, slug, parentId);
}

function deletionGateStatement(db: DatabaseReader, kind: CollectionKind, parentId: number) {
  const config = configFor(kind);
  return db.prepare(`SELECT id, deleting FROM ${config.table} WHERE id = ?`).bind(parentId);
}

function markParentMediaForCleanup(db: DatabaseReader, kind: CollectionKind, parentId: number) {
  const config = configFor(kind);
  return db.prepare(`UPDATE ${config.mediaTable}
    SET state = 'tombstone', cleanup_attempts = cleanup_attempts + 1
    WHERE ${config.parentColumn} = ? AND state = 'active'
      AND EXISTS (SELECT 1 FROM ${config.table} WHERE id = ? AND deleting = 1)`).bind(parentId, parentId);
}

function incrementParentCleanup(db: DatabaseReader, kind: CollectionKind, id: number, parentId: number) {
  const config = configFor(kind);
  return db.prepare(`UPDATE ${config.mediaTable}
    SET cleanup_attempts = cleanup_attempts + 1
    WHERE id = ? AND ${config.parentColumn} = ? AND state IN ('tombstone', 'pending_cleanup')`).bind(id, parentId);
}

function purgeParentMedia(db: DatabaseReader, kind: CollectionKind, id: number, parentId: number) {
  const config = configFor(kind);
  return db.prepare(`DELETE FROM ${config.mediaTable}
    WHERE id = ? AND ${config.parentColumn} = ? AND state IN ('tombstone', 'pending_cleanup')`).bind(id, parentId);
}

async function cleanupParentMedia(db: WorkerDatabase, kind: CollectionKind, parentId: number, media: readonly MediaRow[], store: MediaStore) {
  const failed = [];
  for (const row of media) {
    if (!["tombstone", "pending_cleanup"].includes(row.state)) { failed.push(row); continue; }
    const keys = cleanupKeys(row);
    const result = keys.length ? await Promise.allSettled(keys.map((key) => store.delete(key))) : [{ status: "rejected" }];
    if (!result.every((entry) => entry.status === "fulfilled")) { failed.push(row); continue; }
    const purged = await purgeParentMedia(db, kind, row.id, parentId).run().catch(() => null);
    if (Number(purged?.meta?.changes) !== 1) failed.push(row);
  }
  if (failed.length) await batch(db, failed.map((row) => incrementParentCleanup(db, kind, row.id, parentId)));
  return failed;
}

function parentDeleteStatement(db: DatabaseReader, kind: CollectionKind, parentId: number, slug: string) {
  const config = configFor(kind);
  return db.prepare(`DELETE FROM ${config.table}
    WHERE id = ? AND slug = ? AND deleting = 1 AND NOT EXISTS (
      SELECT 1 FROM ${config.mediaTable} WHERE ${config.parentColumn} = ?
    )`).bind(parentId, slug, parentId);
}

async function storedItems(env: WorkerEnv, kind: CollectionKind) {
  const db = env.DB;
  if (!db) return [];
  const rows = rowsFrom(await getCollectionOverrides(db, kind));
  return Promise.all(rows.map(async (row) => attachMedia(rowToItem(kind, row), normalizeMediaRows(await getMediaForCollectionItem(db, kind, row.id), { ownerType: kind, ownerSlug: row.slug }))));
}

async function adminItems(env: WorkerEnv, kind: CollectionKind) {
  const stored = await storedItems(env, kind);
  const deletingSlugs = new Set(stored.filter((item) => item.deleting).map((item) => item.slug));
  return mergeCollection(configFor(kind).defaults, stored.filter((item) => !item.deleting))
    .filter((item) => !deletingSlugs.has(item.slug));
}

export async function publicItems(env: WorkerEnv, kind: CollectionKind) {
  return (await adminItems(env, kind))
    .filter((item) => kind !== "events" || isPublicEventStatus(item.status));
}

async function readOne(env: WorkerEnv, kind: CollectionKind, slug: string) {
  const items = await adminItems(env, kind);
  return items.find((item) => item.slug === slug);
}

export async function materializeCollectionItem(db: WorkerDatabase, kind: CollectionKind, slug: string) {
  if (!isSlug(slug)) return null;
  const stored = await existing(db, kind, slug);
  if (stored) return stored;
  const fallback = defaultItem(kind, slug);
  if (!fallback) return null;
  await batch(db, [statementFor(db, kind, fallback, false)]);
  return existing(db, kind, slug);
}

export async function readCollection(_request: Request, env: WorkerEnv, kind: CollectionKind, slug?: string) {
  try {
    const items = await publicItems(env, kind);
    if (!slug) return jsonResponse(items, { headers: HEADERS });
    const item = items.find((candidate) => candidate.slug === slug);
    return item ? jsonResponse(item, { headers: HEADERS }) : error("Not found", 404);
  } catch {
    const fallback = slug ? defaultItem(kind, slug) : null;
    return slug ? (fallback ? jsonResponse(fallback, { headers: HEADERS }) : error("Not found", 404)) : jsonResponse(configFor(kind).defaults, { headers: HEADERS });
  }
}

export async function readAdminCollection(request: Request, env: WorkerEnv, kind: CollectionKind, slug?: string) {
  const admin = await requireAdmin(request, env); if (admin instanceof Response) return admin;
  try {
    const items = await adminItems(env, kind);
    if (!slug) return jsonResponse(items, { headers: HEADERS });
    const item = items.find((candidate) => candidate.slug === slug);
    return item ? jsonResponse(item, { headers: HEADERS }) : error("Not found", 404);
  } catch {
    return error("Collection storage unavailable", 500);
  }
}

export async function createCollectionItem(request: Request, env: WorkerEnv, kind: CollectionKind) {
  const admin = await requireAdmin(request, env, { csrf: true }); if (admin instanceof Response) return admin;
  const payload = await readJson(request); if (!validateCollectionPayload(kind, payload)) return error("Invalid collection value", 400);
  try {
    if (!env.DB) throw new Error('Missing storage');
    if (defaultItem(kind, payload.slug) || await existing(env.DB, kind, payload.slug)) return error("Duplicate slug", 409);
    await batch(env.DB, [statementFor(env.DB, kind, payload, false)]);
    return jsonResponse(await readOne(env, kind, payload.slug), { status: 201, headers: HEADERS });
  } catch (cause) { return /unique|constraint/i.test(String(isRecord(cause) ? cause.message : undefined)) ? error("Duplicate slug", 409) : error("Collection storage unavailable", 500); }
}

export async function updateCollectionItem(request: Request, env: WorkerEnv, kind: CollectionKind, slug: string) {
  const admin = await requireAdmin(request, env, { csrf: true }); if (admin instanceof Response) return admin;
  const payload = await readJson(request); if (!validateCollectionPayload(kind, payload, slug)) return error("Invalid collection value", 400);
  try {
    if (!env.DB) throw new Error('Missing storage');
    const stored = await existing(env.DB, kind, slug);
    if (!stored && !defaultItem(kind, slug)) return error("Not found", 404);
    if (!stored && payload.mediaOrder?.length) return error("Materialize item before reordering media", 400);
    if (stored && payload.mediaOrder) {
      // Ordering operates on every stored row, including a legacy malformed
      // row that public serialization deliberately omits.
      const currentMedia = rowsFrom(await getMediaForCollectionItem(env.DB, kind, stored.id));
      const currentById = new Map(currentMedia.map((entry) => [entry.id, entry]));
      const finalSlots = new Set();
      if (currentMedia.some((media) => !Number.isSafeInteger(media.position)) || payload.mediaOrder.length !== currentById.size || payload.mediaOrder.some(({ id, position: nextPosition }) => {
        const media = currentById.get(id);
        const slot = media && `${media.role}:${nextPosition}`;
        return !media || (media.role === "cover" && nextPosition !== 0) || finalSlots.has(slot) || (finalSlots.add(slot), false);
      })) return error("Invalid media ordering", 400);
      const rowStatement = statementFor(env.DB, kind, payload, Boolean(stored));
      await batch(env.DB, [rowStatement, ...mediaOrderingStatements(env.DB, kind, stored.id, payload.mediaOrder, currentMedia)]);
      return jsonResponse(await readOne(env, kind, slug), { headers: HEADERS });
    }
    const rowStatement = statementFor(env.DB, kind, payload, Boolean(stored));
    await batch(env.DB, [rowStatement]);
    return jsonResponse(await readOne(env, kind, slug), { headers: HEADERS });
  } catch { return error("Collection storage unavailable", 500); }
}

export async function reorderCollectionItems(request: Request, env: WorkerEnv, kind: CollectionKind) {
  const admin = await requireAdmin(request, env, { csrf: true }); if (admin instanceof Response) return admin;
  const payload = await readJson(request);
  if (!hasExactKeys(payload, ["items"]) || !Array.isArray(payload.items)) return error("Invalid collection ordering", 400);
  try {
    const current = await adminItems(env, kind);
    const valid = new Map(current.map((item) => [item.slug, item]));
    const seenSlugs = new Set<string>(); const seenPositions = new Set<number>();
    const orderedEntries: unknown[] = payload.items;
    if (orderedEntries.length !== current.length || !orderedEntries.every((entry): entry is { slug: string; position: number } => hasExactKeys(entry, ["slug", "position"]) && isSlug(entry.slug) && position(entry.position) && valid.has(entry.slug) && !seenSlugs.has(entry.slug) && !seenPositions.has(entry.position) && (seenSlugs.add(entry.slug), seenPositions.add(entry.position), true))) return error("Invalid collection ordering", 400);
    if (seenPositions.size !== current.length || ![...seenPositions].every((value) => value < current.length)) return error("Invalid collection ordering", 400);
    if (typeof env.DB?.batch !== "function") return error("Collection storage unavailable", 500);
    // Each slug was checked against valid above; retain its existing record.
    const ordered = orderedEntries.map(({ slug, position: nextPosition }) => ({ ...valid.get(slug)!, position: nextPosition }));
    // One D1 batch with one UPSERT makes default materialization and every
    // requested position update visible together; a missing batch must never
    // degrade into independently applied materialization writes.
    await env.DB.batch([canonicalOrderingStatement(env.DB, kind, ordered)]);
    return jsonResponse([...ordered].sort((left, right) => left.position - right.position || left.slug.localeCompare(right.slug)), { headers: HEADERS });
  } catch { return error("Collection storage unavailable", 500); }
}

export async function deleteCollectionItem(request: Request, env: WorkerEnv, kind: CollectionKind, slug: string) {
  const admin = await requireAdmin(request, env, { csrf: true }); if (admin instanceof Response) return admin;
  if (!env.DB || !env.MEDIA) return error("Collection storage unavailable", 500);
  try {
    const stored = await existing(env.DB, kind, slug); const fallback = defaultItem(kind, slug);
    if (!stored && !fallback) return error("Not found", 404);
    if (!stored) return jsonResponse({ slug, deleted: false, restored: true }, { headers: HEADERS });
    const gateResults = await batch(env.DB, [
      beginParentDeleteStatement(env.DB, kind, stored.id, slug),
      markParentMediaForCleanup(env.DB, kind, stored.id),
    ]);
    const began = Array.isArray(gateResults) ? gateResults[0] : null;
    if (Number(began?.meta?.changes) !== 1) {
      const gate = await deletionGateStatement(env.DB, kind, stored.id).first();
      if (!gate?.deleting) return error("Collection deletion conflict", 409);
    }
    const media = await parentMedia(env.DB, kind, stored.id);
    if (media.some((row) => row.state === "pending")) return error("Collection deletion conflict", 409);
    if (media.some((row) => row.state === "active")) return error("Collection deletion conflict", 409);
    const failed = await cleanupParentMedia(env.DB, kind, stored.id, media, env.MEDIA);
    if (failed.length) return jsonResponse({ slug, deleted: false, restored: Boolean(fallback), cleanupPending: true }, { status: 202, headers: HEADERS });
    const removed = await parentDeleteStatement(env.DB, kind, stored.id, slug).run();
    if (Number(removed?.meta?.changes) !== 1) return error("Collection deletion conflict", 409);
    return jsonResponse({ slug, deleted: Boolean(stored), restored: Boolean(fallback) }, { headers: HEADERS });
  } catch { return error("Collection storage unavailable", 500); }
}
import type { D1PreparedStatement } from '@cloudflare/workers-types/index.ts';
