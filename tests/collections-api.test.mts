import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { hashToken } from "../worker/auth.ts";
import { isSlug, materializeCollectionItem, mergeCollection, validateCollectionPayload } from "../worker/handlers/collections.ts";
import { routeRequest } from "../worker/router.ts";
import { ARCHIVE_DEFAULTS, EVENT_DEFAULTS } from "../worker/collections-defaults.ts";
import { d1Double, r2Double, required, sqlNumber, sqlString, jsonRecord, jsonRows, recordRows } from './worker-fixtures.mts';
import type { D1PreparedStatement } from '@cloudflare/workers-types/index.ts';
type StoredRow = Record<string, unknown> & { id: number; slug: string; position: number; deleting?: number };
// These database fixtures intentionally include malformed legacy role/key data.
type StoredMedia = { id: number; event_id?: number; archive_item_id?: number; key: string; role: string; alt: string; position: number; widths_json: string; sources_json?: string; state?: string; cleanup_attempts?: number };

test("collection overrides preserve defaults and ordering", () => {
  const defaults = [{ ...required(EVENT_DEFAULTS[0]), slug: "musica", title: "Musica", position: 2 }];
  const rows = [{ slug: "musica", title: "Suoni", position: 1 }];
  assert.deepEqual(mergeCollection(defaults, rows), [{ ...defaults[0], slug: "musica", title: "Suoni", position: 1 }]);
});

test("slugs accept only lowercase URL-safe values", () => {
  assert.equal(isSlug("giornata-tutto-rifiuto"), true);
  assert.equal(isSlug("Giornata Tutto Rifiuto"), false);
  assert.equal(isSlug("-inizio"), false);
  assert.equal(isSlug("fine-"), false);
});

test("the shared slug policy rejects URL-safe values over the 180 UTF-8 byte limit", async () => {
  const tooLong = "a".repeat(181);
  assert.equal(isSlug("a".repeat(180)), true);
  assert.equal(isSlug(tooLong), false);

  const env = await environmentWithSession();
  assert.equal((await routeRequest(new Request(`https://site.test/api/events/${tooLong}`), env, {})).status, 400);
  assert.equal((await routeRequest(new Request(`https://site.test/api/admin/events/${tooLong}`, {
    method: "DELETE", headers: { cookie: env.cookie, "x-csrf-token": env.csrfToken },
  }), env, {})).status, 400);
});

test("fallback media expose browser-usable URLs and stable source identifiers", () => {
  assert.equal(required(EVENT_DEFAULTS[0]).cardMedia.src, "/fallback/eventi/bruciaRifiuti.webp");
  const card = required(EVENT_DEFAULTS[0]).cardMedia;
  assert.ok(card.type === 'image');
  assert.equal(card.fallbackAsset, "src/assets/optimized/eventi/bruciaRifiuti.webp");
  assert.equal(required(ARCHIVE_DEFAULTS[0]).coverMedia.src, "/fallback/work/work_01.webp");
});

function createDb() {
  const rows: { events: StoredRow[]; archive: StoredRow[] } = { events: [], archive: [] };
  const media: { events: StoredMedia[]; archive: StoredMedia[] } = { events: [], archive: [] };
  let nextId = 1;
  const sessions = new Map<unknown, { token_hash: string; csrf_token: string; expires_at: number }>();
  const db = {
    rows,
    media,
    sessions,
    batchCalls: 0,
    prepare(sql: string) {
      const statement = {
        async all() {
          const kind = sql.includes("archive_items") ? "archive" : "events";
          if (sql.includes("FROM events") || sql.includes("FROM archive_items")) {
            return { results: [...rows[kind]].sort((a, b) => a.position - b.position || a.id - b.id) };
          }
          return { results: [] };
        },
        bind: (...args: unknown[]) => ({
          async first() {
            if (sql.includes("FROM sessions")) return sessions.get(args[0]) ?? null;
            if (sql.includes("SELECT id FROM")) {
              const kind = sql.includes("archive_items") ? "archive" : "events";
              return rows[kind].find((row) => row.slug === args[0]) ?? null;
            }
            if ((sql.includes("FROM events") || sql.includes("FROM archive_items")) && sql.includes("WHERE id = ?")) {
              const kind = sql.includes("archive_items") ? "archive" : "events";
              return rows[kind].find((row) => row.id === args[0]) ?? null;
            }
            return null;
          },
          async all() {
            if (sql.includes("FROM event_media") || sql.includes("FROM archive_media")) {
              const mediaKind = sql.includes("archive_media") ? "archive" : "events";
              const parent = mediaKind === "archive" ? "archive_item_id" : "event_id";
              return { results: media[mediaKind].filter((row) => row[parent] === args[0] && (!sql.includes("state = 'active'") || row.state !== "tombstone")).sort((a, b) => a.position - b.position || a.id - b.id) };
            }
            const kind = sql.includes("archive_items") ? "archive" : "events";
            if (sql.includes("FROM events") || sql.includes("FROM archive_items")) {
              return { results: [...rows[kind]].sort((a, b) => a.position - b.position || a.id - b.id) };
            }
            return { results: [] };
          },
          async run() {
            if (sql.startsWith("UPDATE event_media") || sql.startsWith("UPDATE archive_media")) {
              const mediaKind = sql.includes("archive_media") ? "archive" : "events";
              const parent = mediaKind === "archive" ? "archive_item_id" : "event_id";
              if (sql.includes("SET state = 'tombstone'")) {
                const owner = rows[mediaKind].find((candidate) => candidate.id === args[1] && candidate.deleting);
                const active = media[mediaKind].filter((candidate) => candidate[parent] === args[0] && candidate.state === "active");
                active.forEach((candidate) => { candidate.state = "tombstone"; candidate.cleanup_attempts = (candidate.cleanup_attempts ?? 0) + 1; });
                return { success: true, meta: { changes: owner ? active.length : 0 } };
              }
              const row = media[mediaKind].find((candidate) => candidate.id === args[1] && candidate[parent] === args[2]);
              if (row) row.position = sqlNumber(args[0]);
              return { success: true, meta: { changes: row ? 1 : 0 } };
            }
            if (sql.startsWith("DELETE FROM event_media") || sql.startsWith("DELETE FROM archive_media")) {
              const mediaKind = sql.includes("archive_media") ? "archive" : "events";
              const parent = mediaKind === "archive" ? "archive_item_id" : "event_id";
              const index = media[mediaKind].findIndex((candidate) => candidate.id === args[0] && candidate[parent] === args[1] && ["tombstone", "pending_cleanup"].includes(candidate.state ?? ''));
              if (index >= 0) media[mediaKind].splice(index, 1);
              return { success: true, meta: { changes: index >= 0 ? 1 : 0 } };
            }
            const kind = sql.includes("archive_items") ? "archive" : "events";
            if (sql.startsWith("INSERT INTO")) {
              const columns = required(required(sql.match(/\(([^)]+)\)/))[1]).split(",").map((column) => column.trim());
              const values: Record<string, unknown> = Object.fromEntries(columns.map((column, index) => [column, args[index]]));
              const row: StoredRow = { ...values, id: nextId++, deleting: 0, slug: sqlString(values.slug), position: sqlNumber(values.position) };
              rows[kind].push(row);
              return { success: true, meta: { changes: 1, last_row_id: row.id } };
            }
            if (sql.startsWith("UPDATE events") || sql.startsWith("UPDATE archive_items")) {
              if (sql.includes("SET deleting = 1")) {
                const owner = rows[kind].find((candidate) => candidate.id === args[0] && candidate.slug === args[1] && !candidate.deleting);
                const parent = kind === "archive" ? "archive_item_id" : "event_id";
                const pending = owner && media[kind].some((candidate) => candidate[parent] === args[2] && candidate.state === "pending");
                if (!owner || pending) return { success: true, meta: { changes: 0 } };
                owner.deleting = 1;
                return { success: true, meta: { changes: 1 } };
              }
            }
            if (sql.startsWith("UPDATE")) {
              const slug = args.at(-1);
              const row = rows[kind].find((candidate) => candidate.slug === slug);
              if (!row) return { success: true, meta: { changes: 0 } };
              const columns = [...sql.matchAll(/(\w+) = \?/g)].map((match) => match[1]);
              columns.forEach((column, index) => { row[required(column)] = args[index]; });
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.startsWith("DELETE FROM")) {
              const parent = kind === "archive" ? "archive_item_id" : "event_id";
              const index = rows[kind].findIndex((row) => row.id === args[0] && row.slug === args[1] && row.deleting && !media[kind].some((candidate) => candidate[parent] === row.id));
              if (index >= 0) rows[kind].splice(index, 1);
              return { success: true, meta: { changes: index >= 0 ? 1 : 0 } };
            }
            if (sql.includes("DELETE FROM sessions")) sessions.delete(args[0]);
            return { success: true };
          },
        }),
      };
      return statement;
    },
    async batch(statements: D1PreparedStatement[]) {
      db.batchCalls += 1;
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
  return d1Double(db);
}

async function environmentWithSession() {
  const DB = createDb();
  const SESSION_SECRET = globalThis.crypto.randomUUID();
  const csrfToken = globalThis.crypto.randomUUID();
  const token = globalThis.crypto.randomUUID();
  DB.sessions.set(await hashToken(token, SESSION_SECRET), {
    token_hash: await hashToken(token, SESSION_SECRET), csrf_token: csrfToken, expires_at: Date.now() + 60_000,
  });
  return {
    DB,
    MEDIA: r2Double({ delete: async () => {}, get: async () => null }),
    SESSION_SECRET,
    csrfToken,
    cookie: `tr_admin=${token}`,
    ASSETS: { fetch: async () => new Response("asset") },
  };
}

const eventPayload = {
  slug: "nuovo-evento", status: "upcoming", title: "Nuovo evento", code: "TR·E—06", summary: "Un riepilogo",
  meta: ["Uno"], description: "Descrizione", info: [[["Etichetta", "Valore"]]], outro: "Finale",
  outroInfo: [[["Etichetta", "Valore"]]], seo: { title: "SEO", description: "Descrizione SEO" }, position: 0,
};

test("event code is represented by both Drizzle schema and migration", () => {
  assert.match(readFileSync("db/schema.ts", "utf8"), /export const events[\s\S]*code: text\("code"\)/);
  assert.match(readFileSync("drizzle/0000_admin_cms.sql", "utf8"), /CREATE TABLE `events` \([\s\S]*`code` text/);
});

test("nested collection values and SEO are validated exactly", () => {
  const valid = { ...eventPayload, info: [[['Etichetta', 'Valore']]], outroInfo: [[['Etichetta', 'Valore']]] };
  assert.equal(validateCollectionPayload("events", valid), true);
  for (const invalid of [
    { ...valid, meta: [1] },
    { ...valid, info: [[['Label']]] },
    { ...valid, outroInfo: [[['Label', null]]] },
    { ...valid, seo: { title: "Missing description" } },
    { ...valid, code: null },
  ]) assert.equal(validateCollectionPayload("events", invalid), false);
});

test("public collection reads retain complete default records and append stored records in stable order", async () => {
  const env = await environmentWithSession();
  const created = await routeRequest(new Request("https://site.test/api/admin/events", {
    method: "POST", headers: { cookie: env.cookie, "content-type": "application/json", "x-csrf-token": env.csrfToken }, body: JSON.stringify(eventPayload),
  }), env, {});
  assert.equal(created.status, 201);
  const createdBody = await jsonRecord(created.clone());
  for (const field of ["meta", "info", "outroInfo", "seo"] as const) assert.deepEqual(createdBody[field], eventPayload[field], field);
  assert.equal(env.DB.batchCalls, 1);
  const response = await routeRequest(new Request("https://site.test/api/events"), env, {});
  const events = await jsonRows(response);
  assert.equal(response.status, 200);
  assert.deepEqual(events.map((event) => event.position), [...events].map((event) => sqlNumber(event.position)).sort((left, right) => left - right));
  assert.ok(events.some((event) => event.slug === "nuovo-evento"));
  const fallback = events.find((event) => event.slug === "giornata-tutto-rifiuto");
  assert.ok(fallback);
  for (const field of ["status", "summary", "meta", "description", "info", "outro", "outroInfo", "seo", "cardMedia", "heroMedia", "detailMedia"]) assert.ok(field in fallback, field);
  assert.equal((await jsonRecord((await routeRequest(new Request("https://site.test/api/events/nuovo-evento"), env, {})))).title, "Nuovo evento");
});

test("draft events remain editable API values but are excluded from public list and slug reads", async () => {
  const env = await environmentWithSession();
  const headers = { cookie: env.cookie, "content-type": "application/json", "x-csrf-token": env.csrfToken };
  const draft = { ...eventPayload, slug: "evento-bozza", status: "draft" };
  const created = await routeRequest(new Request("https://site.test/api/admin/events", {
    method: "POST", headers, body: JSON.stringify(draft),
  }), env, {});
  assert.equal(created.status, 201);
  assert.equal((await jsonRows((await routeRequest(new Request("https://site.test/api/events"), env, {})))).some((item) => item.slug === draft.slug), false);
  assert.equal((await routeRequest(new Request(`https://site.test/api/events/${draft.slug}`), env, {})).status, 404);
});

test("authenticated admin collection reads include drafts, hide deleting rows, and never cache", async () => {
  const env = await environmentWithSession();
  const headers = { cookie: env.cookie, "content-type": "application/json", "x-csrf-token": env.csrfToken };
  const draft = { ...eventPayload, slug: "evento-bozza", status: "draft" };
  assert.equal((await routeRequest(new Request("https://site.test/api/admin/events", { method: "POST", headers, body: JSON.stringify(draft) }), env, {})).status, 201);
  env.DB.rows.events.push({ ...required(env.DB.rows.events[0]), id: 99, slug: "in-eliminazione", deleting: 1 });

  const unauthenticated = await routeRequest(new Request("https://site.test/api/admin/events"), env, {});
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get("cache-control"), "no-store");
  const response = await routeRequest(new Request("https://site.test/api/admin/events", { headers: { cookie: env.cookie } }), env, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const adminItems = await jsonRows(response);
  assert.equal(adminItems.some((item) => item.slug === draft.slug && item.status === "draft"), true);
  assert.equal(adminItems.some((item) => item.slug === "in-eliminazione"), false);
  assert.equal((await jsonRows((await routeRequest(new Request("https://site.test/api/events"), env, {})))).some((item) => item.slug === draft.slug), false);
});

test("admin collection list and detail advertise every supported method on 405", async () => {
  const list = await routeRequest(new Request("https://site.test/api/admin/events", { method: "DELETE" }), {}, {});
  assert.equal(list.status, 405);
  assert.equal(list.headers.get("allow"), "GET, POST");
  assert.equal(list.headers.get("cache-control"), "no-store");

  const detail = await routeRequest(new Request("https://site.test/api/admin/events/musica", { method: "POST" }), {}, {});
  assert.equal(detail.status, 405);
  assert.equal(detail.headers.get("allow"), "GET, PUT, DELETE");
  assert.equal(detail.headers.get("cache-control"), "no-store");
});

test("collection reorder validates and returns the complete non-deleting admin set including drafts", async () => {
  const env = await environmentWithSession();
  const headers = { cookie: env.cookie, "content-type": "application/json", "x-csrf-token": env.csrfToken };
  const draft = { ...eventPayload, slug: "evento-bozza", status: "draft", position: EVENT_DEFAULTS.length };
  await routeRequest(new Request("https://site.test/api/admin/events", { method: "POST", headers, body: JSON.stringify(draft) }), env, {});
  const admin = await jsonRows((await routeRequest(new Request("https://site.test/api/admin/events", { headers: { cookie: env.cookie } }), env, {})));
  const items = admin.map((item, position) => ({ slug: item.slug, position }));
  const reordered = await routeRequest(new Request("https://site.test/api/admin/events/_order", {
    method: "PUT", headers, body: JSON.stringify({ items }),
  }), env, {});
  assert.equal(reordered.status, 200);
  assert.equal((await jsonRows(reordered)).some((item) => item.slug === draft.slug && item.status === "draft"), true);
});

test("stored media are joined, normalized, ordered, and exposed only through media", async () => {
  const env = await environmentWithSession();
  const headers = { cookie: env.cookie, "content-type": "application/json", "x-csrf-token": env.csrfToken };
  await routeRequest(new Request("https://site.test/api/admin/events", { method: "POST", headers, body: JSON.stringify(eventPayload) }), env, {});
  const parent = required(env.DB.rows.events[0]);
  env.DB.media.events.push(
    { id: 8, event_id: parent.id, key: "events/nuovo-evento/00000000-0000-4000-8000-000000000008/1280.webp", role: "detail", alt: "Secondo", position: 2, widths_json: '[640,1280]' },
    { id: 7, event_id: parent.id, key: "events/nuovo-evento/00000000-0000-4000-8000-000000000007/2048.webp", role: "cover", alt: "Cover", position: 0, widths_json: '[640,1280,2048]' },
    { id: 9, event_id: parent.id, key: "events/nuovo-evento/00000000-0000-4000-8000-000000000009/2048.webp", role: "detail", alt: "Primo", position: 1, widths_json: '[640]', state: "tombstone" },
    { id: 10, event_id: parent.id, key: "events/altro/00000000-0000-4000-8000-000000000010/640.webp", role: "detail", alt: "Wrong slug", position: 3, widths_json: "[640]" },
    { id: 11, event_id: parent.id, key: "archive/nuovo-evento/00000000-0000-4000-8000-000000000011/640.webp", role: "detail", alt: "Wrong type", position: 4, widths_json: "[640]" },
    { id: 12, event_id: parent.id, key: "events/nuovo-evento/00000000-0000-4000-8000-000000000012/640.webp", role: "hero", alt: "Wrong role", position: 5, widths_json: "[640]" },
  );
  const item = await jsonRecord((await routeRequest(new Request("https://site.test/api/events/nuovo-evento"), env, {})));
  assert.deepEqual(recordRows(item.media).map((entry) => entry.id), [7, 8]);
  assert.equal(item.cardMedia, undefined);
  assert.equal(item.heroMedia, undefined);
  assert.equal(item.detailMedia, undefined);
  assert.deepEqual(required(recordRows(item.media)[0]).widths, [640, 1280, 2048]);
  assert.deepEqual(required(recordRows(item.media)[0]).sources, [
    { width: 640, src: "/media/events/nuovo-evento/00000000-0000-4000-8000-000000000007/640.webp" },
    { width: 1280, src: "/media/events/nuovo-evento/00000000-0000-4000-8000-000000000007/1280.webp" },
    { width: 2048, src: "/media/events/nuovo-evento/00000000-0000-4000-8000-000000000007/2048.webp" },
  ]);
});

test("stored media never overwrite an untouched default's fallback media fields", async () => {
  const env = await environmentWithSession();
  const parent = await materializeCollectionItem(env.DB, "events", "giornata-tutto-rifiuto");
  assert.ok(parent);
  env.DB.media.events.push(
    { id: 71, event_id: parent.id, key: "events/giornata-tutto-rifiuto/00000000-0000-4000-8000-000000000071/640.webp", role: "cover", alt: "Stored cover", position: 0, widths_json: "[640]" },
    { id: 72, event_id: parent.id, key: "events/giornata-tutto-rifiuto/00000000-0000-4000-8000-000000000072/640.webp", role: "detail", alt: "Stored detail", position: 1, widths_json: "[640]" },
  );

  const item = await jsonRecord((await routeRequest(new Request("https://site.test/api/events/giornata-tutto-rifiuto"), env, {})));
  const fallback = EVENT_DEFAULTS.find((entry) => entry.slug === "giornata-tutto-rifiuto");
  assert.ok(fallback);
  assert.deepEqual(item.cardMedia, fallback.cardMedia);
  assert.deepEqual(item.heroMedia, fallback.heroMedia);
  assert.deepEqual(item.detailMedia, fallback.detailMedia);
  assert.deepEqual(recordRows(item.media).map(({ id, role, position }) => ({ id, role, position })), [
    { id: 71, role: "cover", position: 0 },
    { id: 72, role: "detail", position: 1 },
  ]);

  const archiveParent = await materializeCollectionItem(env.DB, "archive", "parole");
  assert.ok(archiveParent);
  env.DB.media.archive.push({
    id: 73, archive_item_id: archiveParent.id, key: "archive/parole/00000000-0000-4000-8000-000000000073/640.webp", role: "cover", alt: "Stored archive cover", position: 0, widths_json: "[640]",
  });
  const archive = await jsonRecord((await routeRequest(new Request("https://site.test/api/archive/parole"), env, {})));
  const archiveFallback = ARCHIVE_DEFAULTS.find((entry) => entry.slug === "parole");
  assert.ok(archiveFallback);
  assert.deepEqual(archive.coverMedia, archiveFallback.coverMedia);
  assert.deepEqual(archive.detailMedia, archiveFallback.detailMedia);
  assert.deepEqual(recordRows(archive.media).map(({ id, role, position }) => ({ id, role, position })), [{ id: 73, role: "cover", position: 0 }]);
});

test("row and media position changes execute in one batch", async () => {
  const env = await environmentWithSession();
  const headers = { cookie: env.cookie, "content-type": "application/json", "x-csrf-token": env.csrfToken };
  await routeRequest(new Request("https://site.test/api/admin/events", { method: "POST", headers, body: JSON.stringify(eventPayload) }), env, {});
  const parent = required(env.DB.rows.events[0]);
  env.DB.media.events.push({ id: 7, event_id: parent.id, key: "events/nuovo-evento/00000000-0000-4000-8000-000000000007/640.webp", role: "detail", alt: "A", position: 0, widths_json: '[640]' });
  const before = env.DB.batchCalls;
  const body = { ...eventPayload, position: 4, mediaOrder: [{ id: 7, position: 3 }] };
  const response = await routeRequest(new Request("https://site.test/api/admin/events/nuovo-evento", { method: "PUT", headers, body: JSON.stringify(body) }), env, {});
  assert.equal(response.status, 200);
  assert.equal(env.DB.batchCalls, before + 1);
  assert.equal(required(env.DB.media.events[0]).position, 3);
  const invalid = await routeRequest(new Request("https://site.test/api/admin/events/nuovo-evento", { method: "PUT", headers, body: JSON.stringify({ ...eventPayload, mediaOrder: [{ id: 999, position: 0 }] }) }), env, {});
  assert.equal(invalid.status, 400);
});

test("decoded invalid public and delete slugs return 400", async () => {
  const env = await environmentWithSession();
  assert.equal((await routeRequest(new Request("https://site.test/api/events/Bad%20Slug"), env, {})).status, 400);
  assert.equal((await routeRequest(new Request("https://site.test/api/admin/events/Bad%20Slug", { method: "DELETE", headers: { cookie: env.cookie, "x-csrf-token": env.csrfToken } }), env, {})).status, 400);
});

test("untouched fallbacks can be materialized to a stable D1 parent id", async () => {
  const db = createDb();
  const first = await materializeCollectionItem(db, "events", "musica");
  const second = await materializeCollectionItem(db, "events", "musica");
  assert.equal(required(first).id, required(second).id);
  assert.equal(db.rows.events.length, 1);
});

test("admin collection mutations reject unauthenticated, invalid, and duplicate records", async () => {
  const env = await environmentWithSession();
  const request = (body: unknown, headers: Record<string, string> = {}) => new Request("https://site.test/api/admin/events", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  assert.equal((await routeRequest(request(eventPayload), env, {})).status, 401);
  assert.equal((await routeRequest(request({ ...eventPayload, slug: "Not Valid" }, { cookie: env.cookie, "x-csrf-token": env.csrfToken }), env, {})).status, 400);
  assert.equal((await routeRequest(request(eventPayload, { cookie: env.cookie, "x-csrf-token": env.csrfToken }), env, {})).status, 201);
  assert.equal((await routeRequest(request(eventPayload, { cookie: env.cookie, "x-csrf-token": env.csrfToken }), env, {})).status, 409);
});

test("authenticated parent deletion reports a missing media binding as a storage failure", async () => {
  const env = await environmentWithSession();
  const headers = { cookie: env.cookie, "content-type": "application/json", "x-csrf-token": env.csrfToken };
  assert.equal((await routeRequest(new Request("https://site.test/api/admin/events", {
    method: "POST", headers, body: JSON.stringify(eventPayload),
  }), env, {})).status, 201);
  const { MEDIA: _removedMedia, ...withoutMedia } = env;
  assert.equal((await routeRequest(new Request("https://site.test/api/admin/events/nuovo-evento", {
    method: "DELETE", headers,
  }), withoutMedia, {})).status, 500);
});

test("archive updates preserve exact fields and deletes remove only the override", async () => {
  const env = await environmentWithSession();
  const headers = { cookie: env.cookie, "content-type": "application/json", "x-csrf-token": env.csrfToken };
  const payload = { slug: "nuovo-archivio", title: "Nuovo archivio", code: "TR—06", href: "/project", description: "Descrizione", details: [["A", "B"]], outro: "Finale", seo: { title: "SEO", description: "Descrizione SEO" }, position: 3 };
  assert.equal((await routeRequest(new Request("https://site.test/api/admin/archive", { method: "POST", headers, body: JSON.stringify(payload) }), env, {})).status, 201);
  const changed = { ...payload, title: "Archivio cambiato", position: 1 };
  assert.equal((await routeRequest(new Request("https://site.test/api/admin/archive/nuovo-archivio", { method: "PUT", headers, body: JSON.stringify(changed) }), env, {})).status, 200);
  const archive = await jsonRecord((await routeRequest(new Request("https://site.test/api/archive/nuovo-archivio"), env, {})));
  assert.deepEqual(Object.fromEntries((["title", "code", "href", "description", "details", "outro", "seo", "position"] as const).map((key) => [key, archive[key]])), Object.fromEntries((["title", "code", "href", "description", "details", "outro", "seo", "position"] as const).map((key) => [key, changed[key]])));
  assert.equal((await routeRequest(new Request("https://site.test/api/admin/archive/nuovo-archivio", { method: "DELETE", headers }), env, {})).status, 200);
  assert.equal((await routeRequest(new Request("https://site.test/api/archive/nuovo-archivio"), env, {})).status, 404);
  assert.equal((await routeRequest(new Request("https://site.test/api/archive/parole"), env, {})).status, 200);
});

test("reserved collection order action reaches its protected handler before slug validation", async () => {
  const response = await routeRequest(new Request("https://site.test/api/admin/archive/_order", { method: "PUT", body: "{}" }), { ASSETS: { fetch: async () => new Response("asset") } }, {});
  assert.equal(response.status, 401);
});

test("collection reorder requires the exact complete canonical item set", async () => {
  const env = await environmentWithSession();
  const headers = { cookie: env.cookie, "content-type": "application/json", "x-csrf-token": env.csrfToken };
  const items = EVENT_DEFAULTS.map((item, position) => ({ slug: item.slug, position }));

  const response = await routeRequest(new Request("https://site.test/api/admin/events/_order", {
    method: "PUT", headers, body: JSON.stringify({ items, unexpected: true }),
  }), env, {});

  assert.equal(response.status, 400);
  assert.deepEqual(env.DB.rows.events, []);
});

test("updating and deleting a fallback event creates and restores only its override", async () => {
  const env = await environmentWithSession();
  const headers = { cookie: env.cookie, "content-type": "application/json", "x-csrf-token": env.csrfToken };
  const fallback = await jsonRecord((await routeRequest(new Request("https://site.test/api/events/musica"), env, {})));
  const changed = { ...fallback, title: "Musica aggiornata", position: 7 };
  const update = await routeRequest(new Request("https://site.test/api/admin/events/musica", { method: "PUT", headers, body: JSON.stringify(changed) }), env, {});
  assert.equal(update.status, 200);
  assert.equal((await jsonRecord((await routeRequest(new Request("https://site.test/api/events/musica"), env, {})))).title, "Musica aggiornata");
  const remove = await routeRequest(new Request("https://site.test/api/admin/events/musica", { method: "DELETE", headers }), env, {});
  assert.equal(remove.status, 200);
  assert.equal((await jsonRecord((await routeRequest(new Request("https://site.test/api/events/musica"), env, {})))).title, fallback.title);
});

test("malformed legacy media without a safe key remains pending and retryable during parent deletion", async () => {
  const env = await environmentWithSession();
  const headers = { cookie: env.cookie, "content-type": "application/json", "x-csrf-token": env.csrfToken };
  await routeRequest(new Request("https://site.test/api/admin/events", { method: "POST", headers, body: JSON.stringify(eventPayload) }), env, {});
  const parent = required(env.DB.rows.events[0]);
  env.DB.media.events.push({ id: 77, event_id: parent.id, key: 'invalid', role: 'cover', alt: '', position: 0,
    sources_json: '[]', widths_json: '{}', state: 'active', cleanup_attempts: 0 });
  const response = await routeRequest(new Request("https://site.test/api/admin/events/nuovo-evento", { method: 'DELETE', headers }), env, {});
  assert.equal(response.status, 202);
  assert.equal((await jsonRecord(response)).cleanupPending, true);
  assert.ok(required(required(env.DB.media.events[0]).cleanup_attempts) >= 1);
  assert.equal(required(env.DB.rows.events[0]).deleting, 1);
});

test("a cleanup-pending deletion is immediately absent from public collection routes but remains retryable", async () => {
  const env = await environmentWithSession();
  const headers = { cookie: env.cookie, "content-type": "application/json", "x-csrf-token": env.csrfToken };
  await routeRequest(new Request("https://site.test/api/admin/events", { method: "POST", headers, body: JSON.stringify(eventPayload) }), env, {});
  const parent = required(env.DB.rows.events[0]);
  env.DB.media.events.push({
    id: 77, event_id: parent.id,
    key: "events/nuovo-evento/00000000-0000-4000-8000-000000000077/640.webp",
    role: "cover", alt: "Cover", position: 0, widths_json: "[640]", state: "active", cleanup_attempts: 0,
  });
  let failCleanup = true;
  env.MEDIA.delete = async () => { if (failCleanup) throw new Error("R2 unavailable"); };

  const pending = await routeRequest(new Request("https://site.test/api/admin/events/nuovo-evento", { method: "DELETE", headers }), env, {});
  assert.equal(pending.status, 202);
  const list = await jsonRows((await routeRequest(new Request("https://site.test/api/events"), env, {})));
  assert.equal(list.some((item) => item.slug === "nuovo-evento"), false);
  assert.equal((await routeRequest(new Request("https://site.test/api/events/nuovo-evento"), env, {})).status, 404);

  failCleanup = false;
  const retry = await routeRequest(new Request("https://site.test/api/admin/events/nuovo-evento", { method: "DELETE", headers }), env, {});
  assert.equal(retry.status, 200);
  assert.equal(env.DB.rows.events.some((item) => item.slug === "nuovo-evento"), false);
});
