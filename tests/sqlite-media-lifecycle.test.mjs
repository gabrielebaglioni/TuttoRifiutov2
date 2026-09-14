import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { hashToken } from "../worker/auth.js";
import { PENDING_LEASE_MS, retryTombstones } from "../worker/handlers/media.js";
import { routeRequest } from "../worker/router.js";

const migrations = [
  "drizzle/0000_admin_cms.sql",
  "drizzle/0001_lying_jane_foster.sql",
  "drizzle/0002_massive_meteorite.sql",
  "drizzle/0003_mysterious_earthquake.sql",
  "drizzle/0004_magenta_blockbuster.sql",
  "drizzle/0005_needy_leopardon.sql",
];
const UUID = "00000000-0000-4000-8000-000000000001";

function createDatabase(lastMigration = migrations.length - 1) {
  const db = new DatabaseSync(":memory:");
  for (const path of migrations.slice(0, lastMigration + 1)) db.exec(readFileSync(path, "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

function insertEvent(db, { id = 1, slug = "fixture" } = {}) {
  db.prepare(`INSERT INTO events (
    id, slug, status, title, code, position, created_at, updated_at
  ) VALUES (?, ?, 'published', 'Fixture', 'TR·E—00', 0, 1, 1)`).run(id, slug);
}

function insertArchive(db, { id = 1, slug = "archive-fixture" } = {}) {
  db.prepare(`INSERT INTO archive_items (
    id, slug, title, position, created_at, updated_at
  ) VALUES (?, ?, 'Archive fixture', 0, 1, 1)`).run(id, slug);
}

function insertEventMedia(db, {
  id,
  eventId = 1,
  key,
  role = "cover",
  position = 0,
  widths = "[640,1280,2048]",
  state = "active",
  createdAt = id,
} = {}) {
  db.prepare(`INSERT INTO event_media (
    id, event_id, key, role, alt, position, widths_json, state, created_at
  ) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?)`)
    .run(id, eventId, key, role, position, widths, state, createdAt);
}

function insertArchiveMedia(db, {
  id,
  archiveItemId = 1,
  key,
  role = "cover",
  position = 0,
  widths = "[640,1280,2048]",
  state = "active",
  createdAt = id,
} = {}) {
  db.prepare(`INSERT INTO archive_media (
    id, archive_item_id, key, role, alt, position, widths_json, state, created_at
  ) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?)`)
    .run(id, archiveItemId, key, role, position, widths, state, createdAt);
}

function eventKey(width, suffix = UUID) {
  return `events/fixture/${suffix}/${width}.webp`;
}

function archiveKey(width, suffix = UUID) {
  return `archive/archive-fixture/${suffix}/${width}.webp`;
}

function rows(result) {
  return result.map((row) => ({ ...row }));
}

function d1(db, { failParentDelete = false, failPendingCleanupOnce = false } = {}) {
  let pendingCleanupFailures = failPendingCleanupOnce ? 1 : 0;
  function bound(statement, sql, args) {
    return {
      async all() { return { results: rows(statement.all(...args)) }; },
      async first() { const row = statement.get(...args); return row ? { ...row } : null; },
      async run() {
        if (failParentDelete && /^DELETE FROM (events|archive_items)\s+WHERE id = \?/i.test(sql)) return { success: true, meta: { changes: 0 } };
        if (pendingCleanupFailures && /^UPDATE (event_media|archive_media)\s+SET state = 'pending_cleanup'/i.test(sql)) {
          pendingCleanupFailures -= 1;
          throw new Error("injected pending cleanup transition failure");
        }
        const result = statement.run(...args);
        const lastRow = db.prepare("SELECT last_insert_rowid() AS id").get().id;
        return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(lastRow) } };
      },
    };
  }

  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        async all() { return { results: rows(statement.all()) }; },
        async first() { const row = statement.get(); return row ? { ...row } : null; },
        bind: (...args) => bound(statement, sql, args),
      };
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        db.exec("COMMIT");
        return result;
      } catch (cause) {
        db.exec("ROLLBACK");
        throw cause;
      }
    },
  };
}

async function adminEnvironment(db, media, options) {
  const token = "a".repeat(64);
  const csrfToken = "b".repeat(64);
  const SESSION_SECRET = "sqlite-round-three-session-secret";
  db.prepare("INSERT INTO sessions (token_hash, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(await hashToken(token, SESSION_SECRET), csrfToken, Date.now() + 60_000, Date.now());
  return {
    DB: d1(db, options), MEDIA: media, SESSION_SECRET, csrfToken, cookie: `tr_admin=${token}`,
    ASSETS: { fetch: async () => new Response("asset") },
  };
}

function eventPayload(slug, mediaOrder) {
  return {
    slug, status: "published", title: "Fixture", code: "TR·E—00", summary: "", meta: [], description: "",
    info: [[['Etichetta', 'Valore']]], outro: "", outroInfo: [[['Etichetta', 'Valore']]],
    seo: { title: "Fixture", description: "" }, position: 0, mediaOrder,
  };
}

function objectStore({ fail = false } = {}) {
  const deleted = [];
  return {
    deleted,
    async put() {},
    async delete(key) {
      deleted.push(key);
      if (fail) throw new Error("R2 unavailable");
    },
    async get() { return null; },
  };
}

function webp(width = 640, height = 384) {
  const little32 = (value) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
  const payload = [0x50, 0x01, 0, 0x9d, 0x01, 0x2a, width & 255, width >>> 8, height & 255, height >>> 8, ...new Array(10).fill(0)];
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, ...little32(12 + 8 + payload.length - 8), 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, ...little32(payload.length), ...payload]);
}

function uploadRequest(env, ownerSlug = "fixture", { role = "cover", position = 0 } = {}) {
  const form = new FormData();
  form.set("ownerType", "events");
  form.set("ownerSlug", ownerSlug);
  form.set("role", role);
  form.set("position", String(position));
  form.set("alt", "Fixture image");
  form.set("small", new File([webp()], "small.webp", { type: "image/webp" }));
  return new Request("https://site.test/api/admin/media", {
    method: "POST", headers: { cookie: env.cookie, "x-csrf-token": env.csrfToken }, body: form,
  });
}

function barrierStore() {
  const objects = new Map();
  let releasePut;
  let observePut;
  const firstPut = new Promise((resolve) => { observePut = resolve; });
  const putBarrier = new Promise((resolve) => { releasePut = resolve; });
  let puts = 0;
  return {
    objects,
    waitForFirstPut: () => firstPut,
    releasePut: () => releasePut(),
    async put(key, value, options) {
      puts += 1;
      if (puts === 1) {
        observePut();
        await putBarrier;
      }
      objects.set(key, { value, options });
    },
    async delete(key) { objects.delete(key); },
    async get() { return null; },
  };
}

test("0003 upgrades a 0001/0002 database, deterministically tombstones duplicate active slots, and backfills legacy sources", () => {
  const db = createDatabase(2);
  insertEvent(db);
  insertArchive(db);

  // A deployed legacy database can contain rows written before the partial index
  // was present.  Model that historical state rather than testing migration text.
  db.exec("DROP INDEX event_media_active_slot_unique; DROP INDEX archive_media_active_slot_unique;");
  insertEventMedia(db, { id: 10, key: eventKey(2048), createdAt: 5 });
  insertEventMedia(db, { id: 11, key: eventKey(2048, "00000000-0000-4000-8000-000000000002"), createdAt: 6 });
  insertArchiveMedia(db, { id: 10, key: archiveKey(2048), createdAt: 5 });
  insertArchiveMedia(db, { id: 11, key: archiveKey(2048, "00000000-0000-4000-8000-000000000002"), createdAt: 6 });

  db.exec(readFileSync(migrations[3], "utf8"));

  const eventRows = db.prepare("SELECT id, state, cleanup_attempts, sources_json FROM event_media ORDER BY id").all();
  const archiveRows = db.prepare("SELECT id, state, cleanup_attempts, sources_json FROM archive_media ORDER BY id").all();
  const expectedStates = [
    { id: 10, state: "active", cleanup_attempts: 0 },
    { id: 11, state: "tombstone", cleanup_attempts: 1 },
  ];
  assert.deepEqual(eventRows.map(({ id, state, cleanup_attempts }) => ({ id, state, cleanup_attempts })), expectedStates);
  assert.deepEqual(archiveRows.map(({ id, state, cleanup_attempts }) => ({ id, state, cleanup_attempts })), expectedStates);
  assert.deepEqual(JSON.parse(eventRows[0].sources_json), [
    { width: 640, key: eventKey(640) },
    { width: 1280, key: eventKey(1280) },
    { width: 2048, key: eventKey(2048) },
  ]);
  assert.deepEqual(JSON.parse(archiveRows[0].sources_json), [
    { width: 640, key: archiveKey(640) },
    { width: 1280, key: archiveKey(1280) },
    { width: 2048, key: archiveKey(2048) },
  ]);
  assert.equal(db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().count, 7);
  assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
});

test("0001 deterministically upgrades duplicate 0000 slots before its active-slot indexes exist", () => {
  const db = createDatabase(0);
  insertEvent(db);
  insertArchive(db);
  const insertLegacyEvent = db.prepare(`INSERT INTO event_media (
    id, event_id, key, role, alt, position, widths_json, created_at
  ) VALUES (?, ?, ?, ?, '', ?, ?, ?)`);
  const insertLegacyArchive = db.prepare(`INSERT INTO archive_media (
    id, archive_item_id, key, role, alt, position, widths_json, created_at
  ) VALUES (?, ?, ?, ?, '', ?, ?, ?)`);
  insertLegacyEvent.run(1, 1, eventKey(2048), "cover", 0, "[640,1280,2048]", 10);
  insertLegacyEvent.run(2, 1, eventKey(2048, "00000000-0000-4000-8000-000000000002"), "cover", 0, "[640,1280,2048]", 11);
  insertLegacyArchive.run(1, 1, archiveKey(2048), "cover", 0, "[640,1280,2048]", 10);
  insertLegacyArchive.run(2, 1, archiveKey(2048, "00000000-0000-4000-8000-000000000002"), "cover", 0, "[640,1280,2048]", 11);

  for (const path of migrations.slice(1)) db.exec(readFileSync(path, "utf8"));

  for (const table of ["event_media", "archive_media"]) {
    assert.deepEqual(rows(db.prepare(`SELECT id, state, cleanup_attempts FROM ${table} ORDER BY id`).all()), [
      { id: 1, state: "active", cleanup_attempts: 0 },
      { id: 2, state: "tombstone", cleanup_attempts: 1 },
    ]);
    assert.ok(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`).get(`${table}_active_slot_unique`));
  }
  assert.deepEqual(JSON.parse(db.prepare("SELECT sources_json FROM event_media WHERE id = 1").get().sources_json), [
    { width: 640, key: eventKey(640) },
    { width: 1280, key: eventKey(1280) },
    { width: 2048, key: eventKey(2048) },
  ]);
  assert.equal(db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().count, 7);
});

test("the migrated SQLite schema enforces checks, foreign keys, active-slot uniqueness, cascades, and transactional activation", () => {
  const db = createDatabase();
  insertEvent(db);

  assert.throws(
    () => insertEventMedia(db, { id: 1, eventId: 99, key: eventKey(640) }),
    /FOREIGN KEY constraint failed/,
  );
  assert.throws(
    () => insertEventMedia(db, { id: 1, key: eventKey(640), role: "invalid" }),
    /CHECK constraint failed/,
  );
  assert.throws(
    () => insertEventMedia(db, { id: 1, key: eventKey(640), state: "invalid" }),
    /CHECK constraint failed/,
  );

  insertEventMedia(db, { id: 1, key: eventKey(640), state: "active" });
  assert.throws(
    () => insertEventMedia(db, { id: 2, key: eventKey(1280), state: "active" }),
    /UNIQUE constraint failed/,
  );
  insertEventMedia(db, { id: 2, key: eventKey(1280), state: "pending" });

  db.exec(`BEGIN;
    UPDATE event_media SET state = 'tombstone' WHERE id = 1 AND state = 'active';
    UPDATE event_media SET state = 'active' WHERE id = 2 AND state = 'pending';
    COMMIT;`);
  assert.equal(db.prepare("SELECT changes() AS count").get().count, 1);
  assert.deepEqual(db.prepare("SELECT id, state FROM event_media ORDER BY id").all().map((row) => ({ ...row })), [
    { id: 1, state: "tombstone" },
    { id: 2, state: "active" },
  ]);

  db.prepare("DELETE FROM events WHERE id = ?").run(1);
  assert.equal(db.prepare("SELECT count(*) AS count FROM event_media").get().count, 0);
});

test("the existing seven tables persist parent deletion gates and media reservation leases", () => {
  const db = createDatabase();
  insertEvent(db);
  insertArchive(db);

  assert.deepEqual({ ...db.prepare("SELECT deleting FROM events WHERE id = 1").get() }, { deleting: 0 });
  assert.deepEqual({ ...db.prepare("SELECT deleting FROM archive_items WHERE id = 1").get() }, { deleting: 0 });
  assert.equal(db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().count, 7);

  const upgrade = createDatabase(3);
  insertEvent(upgrade);
  insertArchive(upgrade);
  insertEventMedia(upgrade, { id: 1, key: eventKey(640), widths: "[640]", state: "pending", createdAt: 123 });
  insertArchiveMedia(upgrade, { id: 1, key: archiveKey(640), widths: "[640]", state: "pending", createdAt: 456 });
  upgrade.exec(readFileSync(migrations[4], "utf8"));
  assert.deepEqual({ ...upgrade.prepare("SELECT reservation_started_at FROM event_media WHERE id = 1").get() }, { reservation_started_at: 123 });
  assert.deepEqual({ ...upgrade.prepare("SELECT reservation_started_at FROM archive_media WHERE id = 1").get() }, { reservation_started_at: 456 });
});

test("0005 canonicalizes every legacy cover into its singular active zero-position slot", () => {
  const db = createDatabase(4);
  insertEvent(db);
  insertArchive(db);
  insertEventMedia(db, { id: 1, key: eventKey(640), role: "cover", position: 4, createdAt: 10 });
  insertEventMedia(db, { id: 2, key: eventKey(1280), role: "cover", position: 0, createdAt: 20 });
  insertArchiveMedia(db, { id: 1, key: archiveKey(640), role: "cover", position: 3, createdAt: 10 });
  insertArchiveMedia(db, { id: 2, key: archiveKey(1280), role: "cover", position: 0, createdAt: 20 });

  db.exec(readFileSync(migrations[5], "utf8"));

  for (const table of ["event_media", "archive_media"]) {
    assert.deepEqual(rows(db.prepare(`SELECT id, role, position, state, cleanup_attempts FROM ${table} ORDER BY id`).all()), [
      { id: 1, role: "cover", position: 0, state: "active", cleanup_attempts: 0 },
      { id: 2, role: "cover", position: 0, state: "tombstone", cleanup_attempts: 1 },
    ]);
  }
  assert.equal(db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().count, 7);
});

test("retry fairness selects low-attempt tombstones on a real SQLite query and retains failed work with an incremented attempt", async () => {
  const db = createDatabase();
  insertEvent(db);
  for (let id = 1; id <= 26; id += 1) {
    const suffix = `00000000-0000-4000-8000-${id.toString(16).padStart(12, "0")}`;
    insertEventMedia(db, { id, key: eventKey(640, suffix), widths: "[640]", state: "tombstone", createdAt: id });
  }
  db.exec("UPDATE event_media SET cleanup_attempts = 5 WHERE id <= 25");
  const store = {
    async delete(key) {
      if (!key.includes("00000000001a")) throw new Error("still unavailable");
    },
  };

  assert.equal(await retryTombstones({ DB: d1(db), MEDIA: store }, "events"), 1);
  assert.equal(db.prepare("SELECT id FROM event_media WHERE id = 26").get(), undefined);
  assert.deepEqual({ ...db.prepare("SELECT state, cleanup_attempts FROM event_media WHERE id = 1").get() }, { state: "tombstone", cleanup_attempts: 6 });
});

test("stale pending reservations are reclaimed after their lease while fresh pending uploads remain untouched", async () => {
  const db = createDatabase();
  insertEvent(db);
  const now = 20_000_000;
  insertEventMedia(db, { id: 1, key: eventKey(640), widths: "[640]", state: "pending", createdAt: now - 10 });
  insertEventMedia(db, { id: 2, key: eventKey(640, "00000000-0000-4000-8000-000000000002"), widths: "[640]", state: "pending", createdAt: now - PENDING_LEASE_MS });
  db.prepare("UPDATE event_media SET reservation_started_at = ? WHERE id = ?").run(now - 1, 1);
  db.prepare("UPDATE event_media SET reservation_started_at = ? WHERE id = ?").run(now - PENDING_LEASE_MS, 2);
  const store = objectStore();

  assert.equal(await retryTombstones({ DB: d1(db), MEDIA: store }, "events", now), 1);
  assert.deepEqual(rows(db.prepare("SELECT id, state, cleanup_attempts FROM event_media ORDER BY id").all()), [
    { id: 1, state: "pending", cleanup_attempts: 0 },
  ]);
  assert.deepEqual(store.deleted, [eventKey(640, "00000000-0000-4000-8000-000000000002")]);
});

test("a failed immediate pending-cleanup transition is recovered after its lease with tracked attempts", async () => {
  const db = createDatabase();
  insertEvent(db);
  let deleteAttempts = 0;
  const store = {
    async put() { throw new Error("injected put failure"); },
    async delete() {
      deleteAttempts += 1;
      if (deleteAttempts === 1) throw new Error("injected delayed cleanup failure");
    },
    async get() { return null; },
  };
  const env = await adminEnvironment(db, store, { failPendingCleanupOnce: true });
  const response = await routeRequest(uploadRequest(env), env, {});
  assert.equal(response.status, 500);
  const pending = db.prepare("SELECT id, state, cleanup_attempts FROM event_media").get();
  assert.deepEqual({ ...pending, state: pending.state, cleanup_attempts: pending.cleanup_attempts }, {
    id: pending.id, state: "pending", cleanup_attempts: 0,
  });
  const now = Date.now() + PENDING_LEASE_MS + 1;
  db.prepare("UPDATE event_media SET reservation_started_at = ? WHERE id = ?").run(now - PENDING_LEASE_MS, pending.id);

  assert.equal(await retryTombstones(env, "events", now), 0);
  assert.deepEqual({ ...db.prepare("SELECT state, cleanup_attempts FROM event_media WHERE id = ?").get(pending.id) }, {
    state: "pending_cleanup", cleanup_attempts: 2,
  });
  assert.equal(await retryTombstones(env, "events", now + 1), 1);
  assert.equal(db.prepare("SELECT count(*) AS count FROM event_media").get().count, 0);
});

test("parent deletion retains a tombstoned media record and its parent when R2 cleanup fails", async () => {
  const db = createDatabase();
  insertEvent(db, { slug: "delete-me" });
  insertEventMedia(db, { id: 1, key: eventKey(640), widths: "[640]" });
  const env = await adminEnvironment(db, objectStore({ fail: true }));
  const response = await routeRequest(new Request("https://site.test/api/admin/events/delete-me", {
    method: "DELETE", headers: { cookie: env.cookie, "x-csrf-token": env.csrfToken },
  }), env, {});

  assert.equal(response.status, 202);
  assert.equal(db.prepare("SELECT id FROM events WHERE slug = 'delete-me'").get().id, 1);
  assert.equal(db.prepare("SELECT deleting FROM events WHERE slug = 'delete-me'").get().deleting, 1);
  assert.deepEqual({ ...db.prepare("SELECT state, cleanup_attempts FROM event_media WHERE id = 1").get() }, { state: "tombstone", cleanup_attempts: 2 });
  const publicList = await (await routeRequest(new Request("https://site.test/api/events"), env, {})).json();
  assert.equal(publicList.some((item) => item.slug === "delete-me"), false);
  assert.equal((await routeRequest(new Request("https://site.test/api/events/delete-me"), env, {})).status, 404);
  const blockedUpload = await routeRequest(uploadRequest(env, "delete-me"), env, {});
  assert.equal(blockedUpload.status, 409);
  assert.equal(db.prepare("SELECT count(*) AS count FROM event_media").get().count, 1);
});

test("a gated zero-row reservation never reuses a stale insert id to touch an unrelated pending manifest", async () => {
  const db = createDatabase();
  insertEvent(db);
  const unrelatedKey = eventKey(640, "00000000-0000-4000-8000-000000000099");
  insertEventMedia(db, { id: 1, key: unrelatedKey, widths: "[640]", state: "pending", createdAt: 123 });
  const puts = [];
  const deleted = [];
  const store = {
    async put(key) { puts.push(key); },
    async delete(key) { deleted.push(key); },
    async get() { return null; },
  };
  const env = await adminEnvironment(db, store);
  db.prepare("UPDATE events SET deleting = 1 WHERE id = 1").run();
  assert.equal(db.prepare("SELECT last_insert_rowid() AS id").get().id, 1);

  const response = await routeRequest(uploadRequest(env), env, {});

  assert.equal(response.status, 409);
  assert.deepEqual({ ...db.prepare("SELECT id, key, state, cleanup_attempts FROM event_media WHERE id = 1").get() }, {
    id: 1, key: unrelatedKey, state: "pending", cleanup_attempts: 0,
  });
  assert.deepEqual(puts, []);
  assert.deepEqual(deleted, []);
});

test("a pending real-SQLite reservation blocks parent deletion until its paused R2 put commits", async () => {
  const db = createDatabase();
  insertEvent(db);
  const store = barrierStore();
  const env = await adminEnvironment(db, store);
  const upload = routeRequest(uploadRequest(env), env, {});
  await store.waitForFirstPut();
  assert.deepEqual(rows(db.prepare("SELECT state FROM event_media").all()), [{ state: "pending" }]);

  let deletion;
  try {
    deletion = await routeRequest(new Request("https://site.test/api/admin/events/fixture", {
      method: "DELETE", headers: { cookie: env.cookie, "x-csrf-token": env.csrfToken },
    }), env, {});
    assert.equal(deletion.status, 409);
  } finally {
    store.releasePut();
  }
  const uploaded = await upload;
  assert.equal(uploaded.status, 201);
  assert.equal(db.prepare("SELECT id FROM events WHERE id = 1").get().id, 1);
  assert.deepEqual(rows(db.prepare("SELECT state FROM event_media").all()), [{ state: "active" }]);
  assert.equal(store.objects.size, 1);
});

test("parent deletion deletes media objects before atomically removing its parent and preserves the parent on a delete race", async () => {
  const successDb = createDatabase();
  insertEvent(successDb, { slug: "clean-delete" });
  insertEventMedia(successDb, { id: 1, key: eventKey(640), widths: "[640]" });
  const store = objectStore();
  const success = await adminEnvironment(successDb, store);
  const successResponse = await routeRequest(new Request("https://site.test/api/admin/events/clean-delete", {
    method: "DELETE", headers: { cookie: success.cookie, "x-csrf-token": success.csrfToken },
  }), success, {});
  assert.equal(successResponse.status, 200);
  assert.equal(successDb.prepare("SELECT id FROM events WHERE slug = 'clean-delete'").get(), undefined);
  assert.deepEqual(store.deleted, [eventKey(640)]);

  const raceDb = createDatabase();
  insertEvent(raceDb, { slug: "racing-delete" });
  insertEventMedia(raceDb, { id: 1, key: eventKey(640), widths: "[640]" });
  const race = await adminEnvironment(raceDb, objectStore(), { failParentDelete: true });
  const scheduled = [];
  const raceResponse = await routeRequest(new Request("https://site.test/api/admin/events/racing-delete", {
    method: "DELETE", headers: { cookie: race.cookie, "x-csrf-token": race.csrfToken },
  }), race, { waitUntil(promise) { scheduled.push(promise); } });
  assert.equal(raceResponse.status, 409);
  assert.equal(scheduled.length, 1);
  await Promise.all(scheduled);
  assert.equal(raceDb.prepare("SELECT id FROM events WHERE slug = 'racing-delete'").get().id, 1);
  assert.equal(raceDb.prepare("SELECT count(*) AS count FROM event_media").get().count, 0);
});

test("a real SQLite active-slot unique index permits a collision-proof two-row swap and rejects unbounded media positions", async () => {
  const db = createDatabase();
  insertEvent(db, { slug: "swap-me" });
  insertEventMedia(db, { id: 1, key: eventKey(640), role: "detail", position: 0, widths: "[640]" });
  insertEventMedia(db, { id: 2, key: eventKey(640, "00000000-0000-4000-8000-000000000002"), role: "detail", position: 1_000_000_000, widths: "[640]" });
  const env = await adminEnvironment(db, objectStore());
  const headers = { cookie: env.cookie, "x-csrf-token": env.csrfToken, "content-type": "application/json" };
  const swap = await routeRequest(new Request("https://site.test/api/admin/events/swap-me", {
    method: "PUT", headers, body: JSON.stringify(eventPayload("swap-me", [{ id: 1, position: 1 }, { id: 2, position: 0 }])),
  }), env, {});
  assert.equal(swap.status, 200);
  assert.deepEqual(rows(db.prepare("SELECT id, position FROM event_media ORDER BY id").all()), [{ id: 1, position: 1 }, { id: 2, position: 0 }]);

  const tooLarge = await routeRequest(new Request("https://site.test/api/admin/events/swap-me", {
    method: "PUT", headers, body: JSON.stringify(eventPayload("swap-me", [{ id: 1, position: 1_000_001 }, { id: 2, position: 0 }])),
  }), env, {});
  assert.equal(tooLarge.status, 400);
});

test("the final SQLite schema allows an active cover only in its singular position-zero slot", () => {
  const db = createDatabase();
  insertEvent(db);
  insertArchive(db);
  insertEventMedia(db, { id: 1, key: eventKey(640), role: "cover", position: 0 });
  insertArchiveMedia(db, { id: 1, key: archiveKey(640), role: "cover", position: 0 });

  assert.throws(
    () => insertEventMedia(db, { id: 2, key: eventKey(1280), role: "cover", position: 1 }),
    /CHECK constraint failed/,
  );
  assert.throws(
    () => insertArchiveMedia(db, { id: 2, key: archiveKey(1280), role: "cover", position: 1 }),
    /CHECK constraint failed/,
  );
  assert.equal(db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().count, 7);
});

test("media upload and metadata APIs reject noncanonical covers and reserve 409 for an occupied active slot", async () => {
  const db = createDatabase();
  insertEvent(db);
  const env = await adminEnvironment(db, objectStore());
  const headers = { cookie: env.cookie, "x-csrf-token": env.csrfToken, "content-type": "application/json" };

  const invalidUpload = await routeRequest(uploadRequest(env, "fixture", { position: 1 }), env, {});
  assert.equal(invalidUpload.status, 400);
  assert.deepEqual(await invalidUpload.json(), { error: "Invalid media upload" });

  insertEventMedia(db, { id: 1, key: eventKey(640), role: "detail", position: 0 });
  insertEventMedia(db, { id: 2, key: eventKey(1280), role: "detail", position: 1 });
  const invalidEnvelope = await routeRequest(new Request("https://site.test/api/admin/media/events/1", {
    method: "PUT", headers, body: JSON.stringify({ role: "detail", alt: "Alt", position: 0, extra: true }),
  }), env, {});
  assert.equal(invalidEnvelope.status, 400);
  assert.deepEqual(await invalidEnvelope.json(), { error: "Invalid media metadata" });

  const oversizedMetadata = await routeRequest(new Request("https://site.test/api/admin/media/events/1", {
    method: "PUT",
    headers: { ...headers, "content-length": "16385" },
    body: JSON.stringify({ role: "detail", alt: "Alt", position: 0 }),
  }), env, {});
  assert.equal(oversizedMetadata.status, 400);
  assert.deepEqual(await oversizedMetadata.json(), { error: "Invalid media metadata" });

  const encoder = new TextEncoder();
  let cancelled = false;
  let usedText = false;
  const chunks = [
    encoder.encode('{"role":"detail","alt":"'),
    encoder.encode("é".repeat(8_192)),
    encoder.encode('","position":0}'),
  ];
  const stream = new ReadableStream({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() { cancelled = true; },
  });
  const undeclaredOversized = new Request("https://site.test/api/admin/media/events/1", {
    method: "PUT", headers, body: stream, duplex: "half",
  });
  Object.defineProperty(undeclaredOversized, "text", {
    value: async () => { usedText = true; throw new Error("metadata must be bounded before buffering"); },
  });
  const streamedOversize = await routeRequest(undeclaredOversized, env, {});
  assert.equal(streamedOversize.status, 400);
  assert.equal(usedText, false);
  assert.equal(cancelled, true);

  const invalidCover = await routeRequest(new Request("https://site.test/api/admin/media/events/1", {
    method: "PUT", headers, body: JSON.stringify({ role: "cover", alt: "Alt", position: 1 }),
  }), env, {});
  assert.equal(invalidCover.status, 400);
  assert.deepEqual(await invalidCover.json(), { error: "Invalid media metadata" });

  const conflict = await routeRequest(new Request("https://site.test/api/admin/media/events/1", {
    method: "PUT", headers, body: JSON.stringify({ role: "detail", alt: "Alt", position: 1 }),
  }), env, {});
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "Media slot conflict" });
});

test("collection media ordering keeps a cover and first detail together at position zero", async () => {
  const db = createDatabase();
  insertEvent(db);
  insertEventMedia(db, { id: 1, key: eventKey(640), role: "cover", position: 0 });
  insertEventMedia(db, { id: 2, key: eventKey(1280), role: "detail", position: 0 });
  const env = await adminEnvironment(db, objectStore());
  const response = await routeRequest(new Request("https://site.test/api/admin/events/fixture", {
    method: "PUT",
    headers: { cookie: env.cookie, "x-csrf-token": env.csrfToken, "content-type": "application/json" },
    body: JSON.stringify(eventPayload("fixture", [{ id: 1, position: 0 }, { id: 2, position: 0 }])),
  }), env, {});

  assert.equal(response.status, 200);
  assert.deepEqual(rows(db.prepare("SELECT id, role, position FROM event_media ORDER BY id").all()), [
    { id: 1, role: "cover", position: 0 },
    { id: 2, role: "detail", position: 0 },
  ]);
});

test("the dedicated protected media-order route atomically swaps a complete owner-owned active set", async () => {
  const db = createDatabase();
  insertEvent(db);
  insertEvent(db, { id: 2, slug: "other-owner" });
  insertEventMedia(db, { id: 1, key: eventKey(640), role: "cover", position: 0 });
  insertEventMedia(db, { id: 2, key: eventKey(1280), role: "detail", position: 0 });
  insertEventMedia(db, { id: 3, key: eventKey(2048), role: "detail", position: 1 });
  insertEventMedia(db, { id: 4, eventId: 2, key: eventKey(640, "00000000-0000-4000-8000-000000000004"), role: "detail", position: 0 });
  const env = await adminEnvironment(db, objectStore());
  const base = env.DB;
  const batches = [];
  env.DB = {
    ...base,
    async batch(statements) {
      batches.push(statements);
      return base.batch(statements);
    },
  };
  const headers = { cookie: env.cookie, "x-csrf-token": env.csrfToken, "content-type": "application/json" };
  const items = [{ id: 1, position: 0 }, { id: 2, position: 1 }, { id: 3, position: 0 }];
  const response = await routeRequest(new Request("https://site.test/api/admin/media/_order", {
    method: "PUT", headers, body: JSON.stringify({ ownerType: "events", ownerSlug: "fixture", items }),
  }), env, {});

  assert.equal(response.status, 200);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 5);
  assert.deepEqual(await response.json(), [
    { id: 1, role: "cover", position: 0 }, { id: 2, role: "detail", position: 1 }, { id: 3, role: "detail", position: 0 },
  ]);
  assert.deepEqual(rows(db.prepare("SELECT id, position FROM event_media WHERE event_id = 1 ORDER BY id").all()), [
    { id: 1, position: 0 }, { id: 2, position: 1 }, { id: 3, position: 0 },
  ]);

  const noCsrf = await routeRequest(new Request("https://site.test/api/admin/media/_order", {
    method: "PUT", headers: { cookie: env.cookie, "content-type": "application/json" }, body: JSON.stringify({ ownerType: "events", ownerSlug: "fixture", items }),
  }), env, {});
  assert.equal(noCsrf.status, 403);

  const incomplete = await routeRequest(new Request("https://site.test/api/admin/media/_order", {
    method: "PUT", headers, body: JSON.stringify({ ownerType: "events", ownerSlug: "fixture", items: items.slice(0, 2) }),
  }), env, {});
  assert.equal(incomplete.status, 400);

  const foreign = await routeRequest(new Request("https://site.test/api/admin/media/_order", {
    method: "PUT", headers, body: JSON.stringify({ ownerType: "events", ownerSlug: "fixture", items: [{ id: 1, position: 0 }, { id: 2, position: 0 }, { id: 4, position: 1 }] }),
  }), env, {});
  assert.equal(foreign.status, 400);

  const wrongMethod = await routeRequest(new Request("https://site.test/api/admin/media/_order", { method: "GET" }), env, {});
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "PUT");
});

test("the dedicated protected media-order route rejects non-exact, duplicate, and invalid-slot SQLite payloads", async () => {
  const db = createDatabase();
  insertEvent(db);
  insertEventMedia(db, { id: 1, key: eventKey(640), role: "cover", position: 0 });
  insertEventMedia(db, { id: 2, key: eventKey(1280), role: "detail", position: 0 });
  insertEventMedia(db, { id: 3, key: eventKey(2048), role: "detail", position: 1 });
  const env = await adminEnvironment(db, objectStore());
  const headers = { cookie: env.cookie, "x-csrf-token": env.csrfToken, "content-type": "application/json" };
  const validItems = [{ id: 1, position: 0 }, { id: 2, position: 1 }, { id: 3, position: 0 }];
  const payloads = [
    { ownerType: "events", ownerSlug: "fixture", items: validItems, unexpected: true },
    { ownerType: "events", ownerSlug: "fixture", items: [{ id: 1, position: 0, unexpected: true }, ...validItems.slice(1)] },
    { ownerType: "events", ownerSlug: "fixture", items: [{ id: 1, position: 0 }, { id: 2, position: 0 }, { id: 2, position: 1 }] },
    { ownerType: "events", ownerSlug: "fixture", items: [{ id: 1, position: 0 }, { id: 2, position: 0 }, { id: 3, position: 0 }] },
    { ownerType: "events", ownerSlug: "fixture", items: [{ id: 1, position: 1 }, { id: 2, position: 0 }, { id: 3, position: 1 }] },
  ];

  for (const payload of payloads) {
    const result = await routeRequest(new Request("https://site.test/api/admin/media/_order", {
      method: "PUT", headers, body: JSON.stringify(payload),
    }), env, {});
    assert.equal(result.status, 400);
  }
  assert.deepEqual(rows(db.prepare("SELECT id, role, position FROM event_media ORDER BY id").all()), [
    { id: 1, role: "cover", position: 0 }, { id: 2, role: "detail", position: 0 }, { id: 3, role: "detail", position: 1 },
  ]);
});

test("the dedicated protected media-order route bounds actual JSON bytes and item arrays before SQLite batches", async () => {
  const db = createDatabase();
  insertEvent(db);
  insertEventMedia(db, { id: 1, key: eventKey(640), role: "cover", position: 0 });
  insertEventMedia(db, { id: 2, key: eventKey(1280), role: "detail", position: 0 });
  insertEventMedia(db, { id: 3, key: eventKey(2048), role: "detail", position: 1 });
  const env = await adminEnvironment(db, objectStore());
  const headers = { cookie: env.cookie, "x-csrf-token": env.csrfToken, "content-type": "application/json" };
  const valid = JSON.stringify({ ownerType: "events", ownerSlug: "fixture", items: [{ id: 1, position: 0 }, { id: 2, position: 1 }, { id: 3, position: 0 }] });
  const oversized = `${" ".repeat(65_537)}${valid}`;
  assert.ok(new TextEncoder().encode(oversized).byteLength > 65_536);
  const oversizedResult = await routeRequest(new Request("https://site.test/api/admin/media/_order", {
    method: "PUT", headers, body: oversized,
  }), env, {});
  assert.equal(oversizedResult.status, 400);

  const manyDb = createDatabase();
  insertEvent(manyDb);
  const manyItems = [];
  for (let id = 1; id <= 1_001; id += 1) {
    const role = id === 1 ? "cover" : "detail";
    const position = id === 1 ? 0 : id - 2;
    insertEventMedia(manyDb, { id, key: `events/fixture/order-${id}/640.webp`, role, position });
    manyItems.push({ id, position });
  }
  const manyEnv = await adminEnvironment(manyDb, objectStore());
  const manyHeaders = { cookie: manyEnv.cookie, "x-csrf-token": manyEnv.csrfToken, "content-type": "application/json" };
  const manyResult = await routeRequest(new Request("https://site.test/api/admin/media/_order", {
    method: "PUT", headers: manyHeaders, body: JSON.stringify({ ownerType: "events", ownerSlug: "fixture", items: manyItems }),
  }), manyEnv, {});
  assert.equal(manyResult.status, 400);
  assert.equal(manyDb.prepare("SELECT count(*) AS count FROM event_media WHERE state = 'active'").get().count, 1_001);
});

test("router reorders a full collection through one canonical multi-row upsert batch", async () => {
  const db = createDatabase();
  const env = await adminEnvironment(db, objectStore());
  const base = env.DB;
  const batches = [];
  env.DB = {
    ...base,
    async batch(statements) {
      batches.push(statements);
      return base.batch(statements);
    },
  };
  const current = await (await routeRequest(new Request("https://site.test/api/events"), env, {})).json();
  const items = [...current].reverse().map((item, position) => ({ slug: item.slug, position }));
  const response = await routeRequest(new Request("https://site.test/api/admin/events/_order", {
    method: "PUT",
    headers: { cookie: env.cookie, "x-csrf-token": env.csrfToken, "content-type": "application/json" },
    body: JSON.stringify({ items }),
  }), env, {});

  assert.equal(response.status, 200);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 1);
  assert.deepEqual(rows(db.prepare("SELECT slug, position FROM events ORDER BY position").all()), items);
});
