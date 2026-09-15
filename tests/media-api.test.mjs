import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { hashToken } from "../worker/auth.js";
import { routeRequest } from "../worker/router.js";
import { retryTombstones } from "../worker/handlers/media.js";
import { inspectWebp, mediaJson, serveMedia, validateVariant } from "../worker/media.js";

const WEBP = webp(640, 360);
const widths = [640, 1280, 2048];
const FIXTURE_UUID = "00000000-0000-4000-8000-000000000001";

function le32(value) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }
function webp(width, height) {
  // A structurally valid VP8 key-frame header plus a non-empty first partition.
  const payload = [0x50, 0x01, 0, 0x9d, 0x01, 0x2a, width & 255, width >>> 8, height & 255, height >>> 8, ...new Array(10).fill(0)];
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, ...le32(12 + 8 + payload.length - 8), 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, ...le32(payload.length), ...payload]);
}
function webpLossless(width, height) {
  const bits = (width - 1) | ((height - 1) << 14);
  const payload = [0x2f, ...le32(bits)];
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, ...le32(12 + 8 + payload.length + 1 - 8), 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, ...le32(payload.length), ...payload, 0]);
}
function webpExtended(width, height) {
  const vp8 = [0x50, 0x01, 0, 0x9d, 0x01, 0x2a, width & 255, width >>> 8, height & 255, height >>> 8, ...new Array(10).fill(0)];
  const vp8x = [0, 0, 0, 0, (width - 1) & 255, (width - 1) >>> 8, (width - 1) >>> 16, (height - 1) & 255, (height - 1) >>> 8, (height - 1) >>> 16];
  const chunks = [0x56, 0x50, 0x38, 0x58, ...le32(vp8x.length), ...vp8x, 0x56, 0x50, 0x38, 0x20, ...le32(vp8.length), ...vp8];
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, ...le32(4 + chunks.length), 0x57, 0x45, 0x42, 0x50, ...chunks]);
}
function webpChunk(type, payload) {
  return [...type.split("").map((character) => character.charCodeAt(0)), ...le32(payload.length), ...payload, ...(payload.length % 2 ? [0] : [])];
}
function vp8Payload(width, height) {
  return [0x50, 0x01, 0, 0x9d, 0x01, 0x2a, width & 255, width >>> 8, height & 255, height >>> 8, ...new Array(10).fill(0)];
}
function vp8lPayload(width, height) {
  const bits = (width - 1) | ((height - 1) << 14);
  return [0x2f, ...le32(bits), 0];
}
function vp8xPayload(width, height, flags = 0) {
  return [flags, 0, 0, 0, (width - 1) & 255, (width - 1) >>> 8, (width - 1) >>> 16, (height - 1) & 255, (height - 1) >>> 8, (height - 1) >>> 16];
}
function extendedWebp(chunks) {
  const body = [0x57, 0x45, 0x42, 0x50, ...chunks.flat()];
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, ...le32(body.length), ...body]);
}

function image(width, { type = "image/webp", bytes = webp(width, Math.max(1, Math.floor(width * 0.6))) } = {}) {
  return new File([bytes], `${width}.webp`, { type });
}

const DECODED_WEBP_FIXTURES = [
  { kind: "VP8", width: 2, height: 3, bytes: "UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoCAAMAAUAmJaACdLoAA5gA/vFNr+LaR0KZD/7xn/9xn/9xn/yIAAAA" },
  { kind: "VP8L", width: 2, height: 3, bytes: "UklGRh4AAABXRUJQVlA4TBEAAAAvAYAAEAdQjyIXpYCBiOh/AAA=" },
  { kind: "VP8X", width: 2, height: 3, bytes: "UklGRlwAAABXRUJQVlA4WAoAAAAQAAAAAQAAAgAAQUxQSAcAAAAAgICAgICAAFZQOCAuAAAAkAEAnQEqAgADAAFAJiWgAnS6AAOYAP7xTa/i2kdCmQ/+8Z//cZ//cZ/8iAAAAA==" },
];

function fixtureFile(base64, name = "fixture.webp") {
  return new File([Buffer.from(base64, "base64")], name, { type: "image/webp" });
}

function corrupt(file, changes) {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    for (const [offset, value] of changes) bytes[offset] = value;
    return new File([bytes], "malformed.webp", { type: "image/webp" });
  });
}

function form(fields = {}) {
  const body = new FormData();
  body.set("ownerType", fields.ownerType ?? "events");
  body.set("ownerSlug", fields.ownerSlug ?? "musica");
  body.set("role", fields.role ?? "cover");
  body.set("position", String(fields.position ?? 0));
  body.set("alt", fields.alt ?? "Una copertina accessibile");
  for (const [field, width] of [["small", 640], ["medium", 1280], ["large", 2048]]) {
    if (fields[field] !== null) body.set(field, fields[field] ?? image(width));
  }
  return body;
}

function makeMedia(key = "events/musica/00000000-0000-4000-8000-000000000001/2048.webp") {
  return { id: 1, event_id: 1, key, role: "cover", alt: "Vecchia copertina", position: 0, widths_json: "[640,1280,2048]" };
}

function deliveryEnvironment(row, { dbFailure = false, objectFailure = false, object = true, parentSlug = row.key.split("/")[1] } = {}) {
  return {
    DB: {
      prepare(sql) {
        const isEvents = sql.includes("event_media") || sql.includes("FROM events");
        const isParent = sql.includes("FROM events") || sql.includes("FROM archive_items");
        const parentId = isEvents ? row.event_id ?? 1 : row.archive_item_id;
        return {
          bind: (...args) => ({
            async first() {
              if (dbFailure) throw new Error("D1 unavailable");
              if (sql.includes("JOIN")) return isEvents && parentSlug === args[0] && row.state !== "tombstone" ? { ...row, owner_slug: parentSlug } : null;
              if (isParent) return Number.isSafeInteger(parentId) && parentSlug === args[0] ? { id: parentId, slug: parentSlug, status: 'published', deleting: 0 } : null;
              return isEvents && row.state !== "tombstone" && row.key === args[0] ? row : null;
            },
            async all() {
              if (dbFailure) throw new Error("D1 unavailable");
              if (sql.includes("JOIN")) return { results: isEvents && parentSlug === args[0] && row.state !== "tombstone" ? [{ ...row, owner_slug: parentSlug }] : [] };
              if (!isParent && Number.isSafeInteger(parentId) && args[0] === parentId) return { results: row.state !== "tombstone" ? [row] : [] };
              const prefix = String(args[0]).replace(/%$/, "");
              return { results: isEvents && row.state !== "tombstone" && row.key.startsWith(prefix) ? [row] : [] };
            },
          }),
        };
      },
    },
    MEDIA: {
      async get(key) {
        if (objectFailure) throw new Error("R2 unavailable");
        if (!object) return null;
        return {
          body: new Blob([key]).stream(),
          httpEtag: '"fixture-etag"',
          writeHttpMetadata(headers) { headers.set("content-type", "image/webp"); },
        };
      },
    },
  };
}

function createDb({ media = [], archiveMedia = [], failInsert = false, enforceSlotUnique = false, synchronizeInitialSlotReads = false, activationChanges, parents = [{ id: 1, slug: "musica" }] } = {}) {
  const rows = { events: parents.map((parent) => ({ status: 'published', deleting: 0, ...parent })), archive: [] };
  const storedMedia = { events: media.map((item) => ({ state: "active", ...item })), archive: archiveMedia.map((item) => ({ state: "active", ...item })) };
  let nextMediaId = Math.max(0, ...media.map((item) => item.id), ...archiveMedia.map((item) => item.id)) + 1;
  const statements = [];
  let slotReads = 0;
  let releaseSlotReads;
  const slotReadsReady = new Promise((resolve) => { releaseSlotReads = resolve; });
  const db = {
    rows, storedMedia, statements,
    prepare(sql) {
      return {
        async all() {
          const kind = sql.includes("archive_media") ? "archive" : "events";
          if (sql.includes("tombstone") || sql.includes("pending_cleanup")) return { results: storedMedia[kind].filter((entry) => entry.state === "tombstone" || entry.state === "pending_cleanup") };
          return { results: [] };
        },
        bind: (...args) => ({
          async first() {
            if (sql.includes("JOIN")) {
              const kind = sql.includes("archive_media") ? "archive" : "events";
              const parent = kind === "archive" ? "archive_item_id" : "event_id";
              const owner = rows[kind].find((entry) => entry.slug === args[0]);
              const media = owner && storedMedia[kind].find((entry) => entry[parent] === owner.id && entry.state === "active" && entry.key.startsWith(String(args[1]).replace(/%$/, "")));
              return media ? { ...media, owner_slug: owner.slug } : null;
            }
            if ((sql.includes("FROM events") || sql.includes("FROM archive_items")) && sql.includes("WHERE slug = ?")) {
              const kind = sql.includes("archive_items") ? "archive" : "events";
              return rows[kind].find((entry) => entry.slug === args[0]) ?? null;
            }
            if ((sql.includes("FROM events") || sql.includes("FROM archive_items")) && sql.includes("WHERE id = ?")) {
              const kind = sql.includes("archive_items") ? "archive" : "events";
              return rows[kind].find((entry) => entry.id === args[0]) ?? null;
            }
            if (sql.includes("SELECT * FROM event_media") || sql.includes("SELECT * FROM archive_media")) {
              const kind = sql.includes("archive_media") ? "archive" : "events";
              const parent = kind === "archive" ? "archive_item_id" : "event_id";
              if (sql.includes("WHERE id")) return storedMedia[kind].find((entry) => entry.id === args[0] && (args.length === 1 || entry[parent] === args[1])) ?? null;
              if (sql.includes("key = ?")) return storedMedia[kind].find((entry) => entry.state === "active" && (entry.key === args[0] || String(entry.sources_json ?? "").includes(args[0]))) ?? null;
              slotReads += 1;
              if (synchronizeInitialSlotReads && slotReads <= 2) {
                if (slotReads === 2) releaseSlotReads();
                await slotReadsReady;
              }
              return storedMedia[kind].find((entry) => entry[parent] === args[0] && entry.role === args[1] && entry.position === args[2] && entry.state === "active") ?? null;
            }
            if (sql.includes("SELECT id FROM event_media") || sql.includes("SELECT id FROM archive_media")) {
              const kind = sql.includes("archive_media") ? "archive" : "events";
              return storedMedia[kind].find((entry) => entry.key === args[0] && entry.state === "active") ?? null;
            }
            return null;
          },
          async all() {
            const kind = sql.includes("archive_media") ? "archive" : "events";
            if ((sql.includes("SELECT * FROM event_media") || sql.includes("SELECT * FROM archive_media")) && sql.includes("state = 'active'")) {
              const parent = kind === "archive" ? "archive_item_id" : "event_id";
              return { results: storedMedia[kind].filter((entry) => entry[parent] === args[0] && entry.state === "active") };
            }
            if (sql.includes("reservation_started_at")) {
              const cutoff = args[0];
              return { results: storedMedia[kind].filter((entry) => entry.state === "tombstone" || entry.state === "pending_cleanup" || (entry.state === "pending" && entry.reservation_started_at > 0 && entry.reservation_started_at <= cutoff)) };
            }
            if (sql.includes("tombstone") || sql.includes("pending_cleanup")) return { results: storedMedia[kind].filter((entry) => entry.state === "tombstone" || entry.state === "pending_cleanup") };
            return { results: [] };
          },
          async run() {
            statements.push({ sql, args });
            const kind = sql.includes("archive_media") || sql.includes("archive_items") ? "archive" : "events";
            const parent = kind === "archive" ? "archive_item_id" : "event_id";
            if (sql.startsWith("INSERT INTO events") || sql.startsWith("INSERT INTO archive_items")) {
              const inserted = { id: rows[kind].length + 1, slug: args[0] };
              rows[kind].push(inserted);
              return { success: true, meta: { changes: 1, last_row_id: inserted.id } };
            }
            if (sql.startsWith("INSERT INTO event_media") || sql.startsWith("INSERT INTO archive_media")) {
              if (failInsert) throw new Error("D1 insert failed");
              const parentId = args.at(-1);
              const owner = rows[kind].find((entry) => entry.id === parentId && !entry.deleting);
              if (!owner) return { success: true, meta: { changes: 0, last_row_id: 0 } };
              storedMedia[kind].push({ id: nextMediaId++, [parent]: parentId, key: args[0], role: args[1], alt: args[2], position: args[3], widths_json: args[4], sources_json: args[5], state: "pending", reservation_started_at: args[6], created_at: args[7], cleanup_attempts: 0 });
              return { success: true, meta: { changes: 1, last_row_id: nextMediaId - 1 } };
            }
            if (sql.startsWith("UPDATE event_media") || sql.startsWith("UPDATE archive_media")) {
              const row = storedMedia[kind].find((entry) => entry.id === args[0] && entry[parent] === args[1] && entry.state === "active");
              if (sql.includes("SET state = 'pending_cleanup'")) {
                const pending = storedMedia[kind].find((entry) => entry.id === args[0] && entry.state === "pending" && (!sql.includes("reservation_started_at <=") || (entry.reservation_started_at > 0 && entry.reservation_started_at <= args[1])));
                if (pending) {
                  pending.state = "pending_cleanup";
                  pending.cleanup_attempts = (pending.cleanup_attempts ?? 0) + 1;
                }
                return { success: true, meta: { changes: pending ? 1 : 0 } };
              }
              if (sql.includes("SET cleanup_attempts = cleanup_attempts + 1")) {
                const retained = storedMedia[kind].find((entry) => entry.id === args[0] && ["tombstone", "pending_cleanup"].includes(entry.state));
                if (retained) retained.cleanup_attempts = (retained.cleanup_attempts ?? 0) + 1;
                return { success: true, meta: { changes: retained ? 1 : 0 } };
              }
              if (sql.includes("SET state = 'active'")) {
                const pending = storedMedia[kind].find((entry) => entry.id === args[0] && entry.state === "pending");
                if (enforceSlotUnique && pending && storedMedia[kind].some((entry) => entry !== pending && entry[parent] === pending[parent] && entry.role === pending.role && entry.position === pending.position && entry.state === "active")) throw new Error("UNIQUE constraint failed: active media slot");
                const changes = activationChanges ?? Number(Boolean(pending));
                if (pending && changes === 1) pending.state = "active";
                return { success: true, meta: { changes } };
              }
              if (row) { row.state = "tombstone"; row.cleanup_attempts = (row.cleanup_attempts ?? 0) + 1; }
              return { success: true, meta: { changes: row ? 1 : 0 } };
            }
            if (sql.startsWith("DELETE FROM event_media") || sql.startsWith("DELETE FROM archive_media")) {
              const index = storedMedia[kind].findIndex((entry) => entry.id === args[0] && ["tombstone", "pending_cleanup"].includes(entry.state));
              if (index >= 0) storedMedia[kind].splice(index, 1);
              return { success: true, meta: { changes: index >= 0 ? 1 : 0 } };
            }
            if (sql.startsWith("DELETE FROM events") || sql.startsWith("DELETE FROM archive_items")) {
              const owner = rows[kind].find((entry) => entry.id === args[0] && entry.deleting);
              if (!owner || storedMedia[kind].some((entry) => entry[parent] === owner.id)) return { success: true, meta: { changes: 0 } };
              rows[kind].splice(rows[kind].indexOf(owner), 1);
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 1 } };
          },
        }),
      };
    },
    async batch(items) { return Promise.all(items.map((item) => item.run())); },
  };
  return db;
}

function createR2({ failPutAt, failDeleteAt } = {}) {
  const objects = new Map();
  const deleted = [];
  let puts = 0;
  let deletes = 0;
  return {
    objects, deleted,
    async put(key, value, options) {
      puts += 1;
      if (puts === failPutAt) throw new Error("R2 write failed");
      objects.set(key, { value, options });
    },
    async delete(key) { deleted.push(key); deletes += 1; if (deletes === failDeleteAt) throw new Error("R2 delete failed"); objects.delete(key); },
    async get(key) {
      const entry = objects.get(key);
      return entry && {
        body: entry.value.stream(), httpEtag: '"fixture-etag"',
        writeHttpMetadata(headers) { headers.set("content-type", entry.options.httpMetadata.contentType); },
      };
    },
  };
}

async function environment(options = {}) {
  const DB = options.DB ?? createDb(options);
  const SESSION_SECRET = "session-secret";
  const token = "a".repeat(64);
  const csrfToken = "b".repeat(64);
  DB.prepare = DB.prepare.bind(DB);
  // Preserve the Task 4 session lookup contract without adding a media-only DB double.
  const originalPrepare = DB.prepare;
  DB.prepare = (sql) => {
    if (sql.includes("FROM sessions")) return { bind: () => ({ first: async () => ({ token_hash: "hash", csrf_token: csrfToken, expires_at: Date.now() + 60_000 }) }) };
    return originalPrepare(sql);
  };
  return { DB, MEDIA: options.MEDIA ?? createR2(options), SESSION_SECRET, csrfToken, cookie: `tr_admin=${token}`, ASSETS: { fetch: async () => new Response("asset") } };
}

function uploadRequest(env, body = form()) {
  return new Request("https://site.test/api/admin/media", { method: "POST", headers: { cookie: env.cookie, "x-csrf-token": env.csrfToken }, body });
}

test("media variants require a nonempty WebP MIME/signature pair within their exact budget", async () => {
  assert.equal(await validateVariant(image(640), 2_500_000), true);
  assert.equal(await validateVariant(image(640, { type: "image/png" }), 2_500_000), false);
  assert.equal(await validateVariant(image(640, { bytes: new Uint8Array([1, 2, 3]) }), 2_500_000), false);
  assert.equal(await validateVariant(new File([], "empty.webp", { type: "image/webp" }), 2_500_000), false);
  assert.equal(await validateVariant(image(640, { bytes: new Uint8Array(2_500_001) }), 2_500_000), false);
});

test("WebP inspection reads dimensions from independently decodable VP8 variants", async () => {
  for (const fixture of DECODED_WEBP_FIXTURES) {
    assert.deepEqual(await inspectWebp(fixtureFile(fixture.bytes)), { width: fixture.width, height: fixture.height });
  }
});

test("only structurally valid RIFF VP8 VP8L and VP8X WebPs pass after independent decoding", async () => {
  const fixtures = DECODED_WEBP_FIXTURES.map(({ bytes }) => fixtureFile(bytes));
  for (const [index, fixture] of fixtures.entries()) {
    const metadata = await sharp(Buffer.from(await fixture.arrayBuffer())).metadata();
    assert.deepEqual(await inspectWebp(fixture), {
      width: DECODED_WEBP_FIXTURES[index].width,
      height: DECODED_WEBP_FIXTURES[index].height,
    });
    assert.equal(metadata.format, "webp");
    assert.equal(await validateVariant(fixture), true);
  }

  const malformed = [
    await corrupt(fixtures[0], [[20, 1]]), // VP8 inter-frame tag, not a still-image key frame.
    await corrupt(fixtures[1], [[24, 0xe0]]), // VP8L reserved version bits.
    await corrupt(fixtures[2], [[21, 1]]), // VP8X reserved bytes must be zero.
    await corrupt(fixtures[2], [[24, 2]]), // VP8X canvas must agree with the encoded image.
    await corrupt(fixtures[2], [[46, 0x41], [47, 0x4e], [48, 0x4d], [49, 0x46]]), // ANMF cannot stand in for image data.
    await corrupt(fixtures[0], [[4, 0]]), // Incorrect RIFF length.
  ];
  for (const fixture of malformed) {
    assert.equal(await inspectWebp(fixture), null);
    assert.equal(await validateVariant(fixture), false);
  }
});

test("VP8X rejects duplicate structural chunks, metadata flag mismatches, and ALPH with lossless VP8L", async () => {
  const valid = extendedWebp([
    webpChunk("VP8X", vp8xPayload(2, 3)),
    webpChunk("VP8 ", vp8Payload(2, 3)),
  ]);
  assert.deepEqual(await inspectWebp(image(2, { bytes: valid })), { width: 2, height: 3 });

  const malformed = [
    extendedWebp([
      webpChunk("VP8X", vp8xPayload(2, 3)),
      webpChunk("VP8X", vp8xPayload(2, 3)),
      webpChunk("VP8 ", vp8Payload(2, 3)),
    ]),
    extendedWebp([
      webpChunk("VP8X", vp8xPayload(2, 3, 0x20)),
      webpChunk("VP8 ", vp8Payload(2, 3)),
    ]),
    extendedWebp([
      webpChunk("VP8X", vp8xPayload(2, 3, 0x10)),
      webpChunk("ALPH", [0, 0]),
      webpChunk("VP8L", vp8lPayload(2, 3)),
    ]),
  ];
  for (const bytes of malformed) {
    assert.equal(await inspectWebp(image(2, { bytes })), null);
    assert.equal(await validateVariant(image(2, { bytes })), false);
  }
});

test("legacy active rows safely reconstruct and deliver every one, two, or three declared source widths", async () => {
  for (const sourceWidths of [[640], [640, 1280], [640, 1280, 2048]]) {
    const row = makeMedia(`events/musica/${FIXTURE_UUID}/${sourceWidths.at(-1)}.webp`);
    row.widths_json = JSON.stringify(sourceWidths);
    row.sources_json = "[]";
    const media = mediaJson(row, { ownerType: "events", ownerSlug: "musica", role: "cover" });
    assert.deepEqual(media.sources.map((source) => source.width), sourceWidths);
    const env = deliveryEnvironment(row);
    for (const source of media.sources) {
      const key = new URL(source.src, "https://site.test").pathname.slice("/media/".length);
      assert.equal((await serveMedia(new Request(`https://site.test/media/${key}`), env, key)).status, 200, `${sourceWidths.join(",")} → ${source.width}`);
    }
  }
});

test("media delivery reports storage failures as 500 while retaining true missing-object 404s", async () => {
  const row = makeMedia();
  const key = row.key;
  assert.equal((await serveMedia(new Request(`https://site.test/media/${key}`), deliveryEnvironment(row, { dbFailure: true }), key)).status, 500);
  assert.equal((await serveMedia(new Request(`https://site.test/media/${key}`), deliveryEnvironment(row, { objectFailure: true }), key)).status, 500);
  assert.equal((await serveMedia(new Request(`https://site.test/media/${key}`), deliveryEnvironment(row, { object: false }), key)).status, 404);
});

test("media delivery remains available when D1 rejects the joined lookup used by the old route", async () => {
  const row = makeMedia();
  const base = deliveryEnvironment(row);
  const env = {
    ...base,
    DB: {
      prepare(sql) {
        if (sql.includes("JOIN")) {
          return { bind: () => ({ async first() { throw new Error("joined D1 reads are unavailable"); } }) };
        }
        return {
          bind: (...args) => ({
            async first() {
              if (sql.includes("FROM events")) return args[0] === "musica" ? { id: 1, slug: "musica", status: 'published', deleting: 0 } : null;
              if (sql.includes("FROM event_media")) return args[0] === 1 ? row : null;
              return null;
            },
            async all() {
              if (sql.includes("FROM event_media") && args[0] === 1) return { results: [row] };
              return { results: [] };
            },
          }),
        };
      },
    },
  };

  assert.equal((await serveMedia(new Request(`https://site.test/media/${row.key}`), env, row.key)).status, 200);
});

test("media delivery binds canonical keys to their real database owner and role", async () => {
  const valid = makeMedia("events/musica/00000000-0000-4000-8000-000000000001/640.webp");
  valid.widths_json = "[640]";
  assert.equal((await serveMedia(new Request(`https://site.test/media/${valid.key}`), deliveryEnvironment(valid), valid.key)).status, 200);

  const crossSlug = { ...valid, key: valid.key.replace("/musica/", "/altro/") };
  assert.equal((await serveMedia(new Request(`https://site.test/media/${crossSlug.key}`), deliveryEnvironment(crossSlug, { parentSlug: "musica" }), crossSlug.key)).status, 404);

  const crossType = { ...valid, key: valid.key.replace("events/", "archive/") };
  assert.equal((await serveMedia(new Request(`https://site.test/media/${crossType.key}`), deliveryEnvironment(crossType, { parentSlug: "musica" }), crossType.key)).status, 404);

  const crossRole = { ...valid, role: "hero" };
  assert.equal((await serveMedia(new Request(`https://site.test/media/${crossRole.key}`), deliveryEnvironment(crossRole), crossRole.key)).status, 404);
});

test("upload requires an authenticated CSRF request and accepts one to three correctly ordered optimized variants", async () => {
  const env = await environment();
  assert.equal((await routeRequest(new Request("https://site.test/api/admin/media", { method: "POST", body: form() }), env, {})).status, 401);
  assert.equal((await routeRequest(new Request("https://site.test/api/admin/media", { method: "POST", headers: { cookie: env.cookie }, body: form() }), env, {})).status, 403);
  const response = await routeRequest(uploadRequest(env, form({ medium: null, large: null, small: image(500) })), env, {});
  assert.equal(response.status, 201);
  assert.equal(env.MEDIA.objects.size, 1);
  assert.ok([...env.MEDIA.objects.keys()][0].endsWith("/500.webp"));
});

test("upload preserves actual no-upscale widths and rejects field-order or pixel-limit violations", async () => {
  const valid = await environment();
  const accepted = await routeRequest(uploadRequest(valid, form({ small: image(640), medium: image(1000), large: null })), valid, {});
  assert.equal(accepted.status, 201);
  assert.deepEqual((await accepted.json()).widths, [640, 1000]);

  const reversed = await environment();
  assert.equal((await routeRequest(uploadRequest(reversed, form({ small: image(1000), medium: image(640), large: null })), reversed, {})).status, 400);
  const huge = await environment();
  assert.equal((await routeRequest(uploadRequest(huge, form({ small: image(6000, { bytes: webp(6000, 6000) }), medium: null, large: null })), huge, {})).status, 400);
});

test("a thrown post-commit waitUntil path preserves newly committed R2 objects", async () => {
  const env = await environment({ media: [makeMedia()] });
  const response = await routeRequest(uploadRequest(env), env, { waitUntil() { throw new Error("injected post-commit failure"); } });
  assert.equal(response.status, 500);
  assert.equal(env.MEDIA.objects.size, 3);
  assert.equal(env.DB.storedMedia.events.filter((entry) => entry.state === "active").length, 1);
  assert.equal(env.DB.storedMedia.events.some((entry) => entry.state === "pending_cleanup"), false);
});

test("media deletion names its owner type, so colliding event and archive IDs cannot delete each other", async () => {
  const event = makeMedia();
  const archive = { ...makeMedia("archive/parole/00000000-0000-4000-8000-000000000002/2048.webp"), archive_item_id: 1 };
  delete archive.event_id;
  const env = await environment({ media: [event], archiveMedia: [archive] });
  const response = await routeRequest(new Request("https://site.test/api/admin/media/events/1", { method: "DELETE", headers: { cookie: env.cookie, "x-csrf-token": env.csrfToken } }), env, {});
  assert.equal(response.status, 200);
  assert.equal(env.DB.storedMedia.events[0], undefined);
  assert.equal(env.DB.storedMedia.archive[0]?.state, "active");
});

test("a tombstoned media row is never publicly delivered when R2 cleanup fails", async () => {
  const media = makeMedia();
  const env = await environment({ media: [media], failDeleteAt: 1 });
  const key = media.key;
  await env.MEDIA.put(key, image(2048), { httpMetadata: { contentType: "image/webp" } });
  const deleted = await routeRequest(new Request("https://site.test/api/admin/media/events/1", { method: "DELETE", headers: { cookie: env.cookie, "x-csrf-token": env.csrfToken } }), env, {});
  assert.equal(deleted.status, 202);
  assert.equal((await routeRequest(new Request(`https://site.test/media/${key}`), env, {})).status, 404);
  assert.equal(env.DB.storedMedia.events[0]?.state, "tombstone");
});

test("tombstone cleanup can be retried until every orphaned R2 key is gone", async () => {
  const media = makeMedia();
  const env = await environment({ media: [media], failDeleteAt: 1 });
  const response = await routeRequest(new Request("https://site.test/api/admin/media/events/1", { method: "DELETE", headers: { cookie: env.cookie, "x-csrf-token": env.csrfToken } }), env, {});
  assert.equal(response.status, 202);
  assert.equal(await retryTombstones(env, "events"), 1);
  assert.equal(env.DB.storedMedia.events.length, 0);
});

test("a relevant public fetch schedules retained tombstone retry through the production waitUntil context", async () => {
  const media = makeMedia();
  const env = await environment({ media: [media], failDeleteAt: 1 });
  const deletion = await routeRequest(new Request("https://site.test/api/admin/media/events/1", {
    method: "DELETE", headers: { cookie: env.cookie, "x-csrf-token": env.csrfToken },
  }), env, {});
  assert.equal(deletion.status, 202);
  assert.equal(env.DB.storedMedia.events[0].cleanup_attempts, 2);

  const scheduled = [];
  const fetch = await routeRequest(new Request(`https://site.test/media/${media.key}`), env, {
    waitUntil(promise) { scheduled.push(promise); },
  });
  assert.equal(fetch.status, 404);
  assert.equal(scheduled.length, 1);
  await Promise.all(scheduled);
  assert.equal(env.DB.storedMedia.events.length, 0);
});

test("concurrent uploads rely on the active-slot constraint so only one reference and variant set survive", async () => {
  const env = await environment({ enforceSlotUnique: true, synchronizeInitialSlotReads: true });
  const [first, second] = await Promise.all([
    routeRequest(uploadRequest(env), env, {}),
    routeRequest(uploadRequest(env), env, {}),
  ]);
  assert.deepEqual([first.status, second.status].sort(), [201, 409]);
  assert.equal(env.DB.storedMedia.events.filter((entry) => entry.state === "active").length, 1);
  assert.equal(env.MEDIA.objects.size, 3);
});

test("a zero-change activation is a tracked race loser, never a successful media response", async () => {
  const env = await environment({ activationChanges: 0, failDeleteAt: 1 });
  const response = await routeRequest(uploadRequest(env), env, {});
  assert.equal(response.status, 409);
  assert.equal(env.DB.storedMedia.events.some((entry) => entry.state === "pending_cleanup"), true);
  assert.equal(env.MEDIA.objects.size > 0, true);
});

test("media mutations fail with 500 when either required storage binding is absent", async () => {
  const missingMedia = await environment();
  delete missingMedia.MEDIA;
  assert.equal((await routeRequest(uploadRequest(missingMedia), missingMedia, {})).status, 500);
  const missingDb = await environment();
  delete missingDb.DB;
  assert.equal((await routeRequest(uploadRequest(missingDb), missingDb, {})).status, 401);
});

test("every R2 put and delete stage compensates or leaves a non-public retryable tombstone", async () => {
  for (const failPutAt of [1, 2, 3]) {
    const env = await environment({ failPutAt });
    assert.equal((await routeRequest(uploadRequest(env), env, {})).status, 500);
    assert.equal(env.MEDIA.objects.size, 0);
  }
  for (const failDeleteAt of [1, 2, 3]) {
    const media = makeMedia();
    const env = await environment({ media: [media], failDeleteAt });
    const response = await routeRequest(new Request("https://site.test/api/admin/media/events/1", { method: "DELETE", headers: { cookie: env.cookie, "x-csrf-token": env.csrfToken } }), env, {});
    assert.equal(response.status, 202);
    assert.equal(env.DB.storedMedia.events[0].state, "tombstone");
    assert.equal(await retryTombstones(env, "events"), 1);
    assert.equal(env.DB.storedMedia.events.length, 0);
  }
});

test("a rollback delete failure stays tracked as pending cleanup until a retry can remove it", async () => {
  const env = await environment({ failPutAt: 2, failDeleteAt: 1 });
  const scheduled = [];
  const response = await routeRequest(uploadRequest(env), env, { waitUntil(promise) { scheduled.push(promise); } });
  assert.equal(response.status, 500);
  await Promise.all(scheduled);
  assert.deepEqual(env.DB.storedMedia.events.map(({ state, cleanup_attempts }) => ({ state, cleanup_attempts })), [
    { state: "pending_cleanup", cleanup_attempts: 2 },
  ]);
  assert.equal(env.MEDIA.objects.size, 1);
  assert.equal(await retryTombstones(env, "events"), 1);
  assert.equal(env.DB.storedMedia.events.length, 0);
  assert.equal(env.MEDIA.objects.size, 0);
});

test("named variants enforce their no-upscale ceilings and a shared aspect ratio", async () => {
  const overSmall = await environment();
  assert.equal((await routeRequest(uploadRequest(overSmall, form({ small: image(641), medium: null, large: null })), overSmall, {})).status, 400);
  const differentRatio = await environment();
  assert.equal((await routeRequest(uploadRequest(differentRatio, form({ small: image(640, { bytes: webp(640, 320) }), medium: image(1000, { bytes: webp(1000, 900) }), large: null })), differentRatio, {})).status, 400);
});

test("upload materializes a fallback parent and stores only immutable optimized WebP variants", async () => {
  const env = await environment({ parents: [] });
  const response = await routeRequest(uploadRequest(env), env, {});
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.widths.join(","), "640,1280,2048");
  assert.deepEqual(body.sources.map((source) => source.width), widths);
  assert.ok(body.sources.every((source) => /^\/media\/events\/musica\/[0-9a-f-]+\/(640|1280|2048)\.webp$/.test(source.src)));
  assert.equal(env.DB.rows.events.length, 1);
  assert.equal(env.MEDIA.objects.size, 3);
  assert.ok([...env.MEDIA.objects.entries()].every(([key, object]) => /\/(640|1280|2048)\.webp$/.test(key) && object.options.httpMetadata.contentType === "image/webp" && object.options.httpMetadata.cacheControl === "public, max-age=31536000, immutable"));
});

test("invalid ownership and any failed R2 or D1 stage leaves no new object keys", async () => {
  const invalidOwner = await environment();
  assert.equal((await routeRequest(uploadRequest(invalidOwner, form({ ownerSlug: "missing" })), invalidOwner, {})).status, 404);
  assert.equal(invalidOwner.MEDIA.objects.size, 0);

  const r2Failure = await environment({ failPutAt: 2 });
  assert.equal((await routeRequest(uploadRequest(r2Failure), r2Failure, {})).status, 500);
  assert.equal(r2Failure.MEDIA.objects.size, 0);
  assert.equal(r2Failure.DB.storedMedia.events.some((entry) => entry.state === "pending_cleanup"), true);

  const d1Failure = await environment({ failInsert: true });
  assert.equal((await routeRequest(uploadRequest(d1Failure), d1Failure, {})).status, 500);
  assert.equal(d1Failure.MEDIA.objects.size, 0);
  assert.equal(d1Failure.MEDIA.deleted.length, 0);
});

test("replacement commits the new reference before deferred cleanup of every old variant", async () => {
  const old = makeMedia();
  const env = await environment({ media: [old] });
  const scheduled = [];
  const ctx = { waitUntil(promise) { scheduled.push(promise); } };
  const response = await routeRequest(uploadRequest(env), env, ctx);
  assert.equal(response.status, 201);
  assert.equal(env.DB.storedMedia.events.filter((entry) => entry.state === "active").length, 1);
  assert.notEqual(env.DB.storedMedia.events.find((entry) => entry.state === "active").key, old.key);
  assert.equal(scheduled.length, 1);
  await Promise.all(scheduled);
  assert.equal(env.DB.storedMedia.events.length, 1);
  assert.equal(env.DB.storedMedia.events[0].id !== old.id, true);
  assert.deepEqual(env.MEDIA.deleted.sort(), [640, 1280, 2048].map((width) => `events/musica/00000000-0000-4000-8000-000000000001/${width}.webp`).sort());
});

test("deletion removes the D1 reference before deleting all variant keys", async () => {
  const media = makeMedia();
  const env = await environment({ media: [media] });
  const response = await routeRequest(new Request("https://site.test/api/admin/media/events/1", { method: "DELETE", headers: { cookie: env.cookie, "x-csrf-token": env.csrfToken } }), env, {});
  assert.equal(response.status, 200);
  assert.equal(env.DB.storedMedia.events.length, 0);
  assert.deepEqual(env.MEDIA.deleted.sort(), [640, 1280, 2048].map((width) => `events/musica/00000000-0000-4000-8000-000000000001/${width}.webp`).sort());
});

test("public delivery rejects unsafe keys and serves WebP metadata with visibility revalidation", async () => {
  const key = "events/musica/00000000-0000-4000-8000-000000000001/640.webp";
  const env = await environment({ media: [{ id: 1, event_id: 1, key, role: "cover", alt: "", position: 0, widths_json: "[640]" }] });
  await env.MEDIA.put(key, image(640), { httpMetadata: { contentType: "image/webp" } });
  const served = await routeRequest(new Request(`https://site.test/media/${key}`), env, {});
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/webp");
  assert.equal(served.headers.get("etag"), '"fixture-etag"');
  assert.equal(served.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  assert.equal((await routeRequest(new Request("https://site.test/media/events/musica/not-a-uuid/640.webp"), env, {})).status, 404);
  assert.equal((await routeRequest(new Request("https://site.test/media/events%2Fmusica%2F00000000-0000-4000-8000-000000000001%2F640.webp"), env, {})).status, 404);
});
