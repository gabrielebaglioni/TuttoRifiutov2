import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setContentOverride } from "../worker/db.js";

test("content writes use a bound prepared statement", async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      calls.push(sql);
      return { bind: (...args) => ({ run: async () => ({ success: true, args }) }) };
    },
  };

  await setContentOverride(db, "home.hero.title", "Nuovo titolo", 1234);

  assert.match(calls[0], /INSERT INTO content_entries/);
  assert.match(calls[0], /ON CONFLICT\(key\) DO UPDATE/);
});

test("media lifecycle migration keeps seven tables and enforces one active media per slot", () => {
  const migration = readFileSync("drizzle/0003_mysterious_earthquake.sql", "utf8");
  assert.match(migration, /event_media_active_slot_unique[\s\S]*WHERE "event_media"\."state" = 'active'/);
  assert.match(migration, /archive_media_active_slot_unique[\s\S]*WHERE "archive_media"\."state" = 'active'/);
  assert.equal((migration.match(/CREATE TABLE `(?!__new_)/g) ?? []).length, 0);
});

test("media state checks accept every durable lifecycle state", () => {
  const migration = readFileSync("drizzle/0003_mysterious_earthquake.sql", "utf8");
  for (const state of ["active", "tombstone", "pending", "pending_cleanup"]) {
    assert.match(migration, new RegExp(`state.*${state}`));
  }
});
