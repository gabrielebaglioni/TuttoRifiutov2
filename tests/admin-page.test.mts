import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("legacy comparison shell starts with a password login and provides all editing sections", () => {
  const page = read("src/pages/admin-legacy.astro");
  for (const section of ["Home", "Archivio", "Eventi", "Progetto", "Contatti", "Globali"]) {
    assert.match(page, new RegExp(`>${section}<`));
  }
  assert.match(page, /autocomplete="current-password"/);
  assert.match(page, /id="admin-editor" hidden/);
});

test("admin implementation does not embed credentials or render server values as HTML", () => {
  const page = read("src/pages/admin.astro");
  const script = read("src/scripts/admin.ts");
  assert.doesNotMatch(`${page}\n${script}`, /Frank|ADMIN_PASSWORD|SESSION_SECRET/);
  assert.doesNotMatch(script, /innerHTML/);
  for (const label of ["Save", "Cancel", "Restore placeholder", "Sostituisci immagine", "Remove image", "Reorder"]) {
    assert.match(`${page}\n${script}`, new RegExp(label));
  }
});

test("production build publishes the isolated admin page", () => {
  assert.equal(existsSync("dist/client/admin/index.html"), false);
  assert.match(read("dist/server/index.js"), /id="admin-login"/);
});

test("production admin runtime preserves draft inputs and connects slots, busy scopes, and auth epochs", () => {
  const script = read("src/scripts/admin.ts");
  for (const dependency of ["AuthEpoch", "collectionSlugControl", "mediaPreviewKind", "mergeMediaSlots", "runBusyResource"]) {
    assert.match(script, new RegExp(`\\b${dependency}\\b`));
  }
  assert.match(script, /state\.auth\.isCurrent/);
  assert.match(script, /aria-busy/);
  assert.match(script, /mergeMediaSlots\(draft\)/);
  assert.match(script, /data-admin-busy-disabled/);
  assert.match(script, /Slug/);
  assert.doesNotMatch(script, /queueMicrotask\(rerender\)/);
});

test("a login attempt invalidates an older session probe before requesting credentials", () => {
  const script = read("src/scripts/admin.ts");
  const loginStart = script.indexOf('loginForm.addEventListener("submit"');
  const loginRequest = script.indexOf('api("/api/admin/login"', loginStart);
  const invalidation = script.indexOf("const epoch = state.auth.invalidate();", loginStart);
  assert.ok(loginStart >= 0 && loginRequest > loginStart);
  assert.ok(invalidation > loginStart && invalidation < loginRequest);
});
