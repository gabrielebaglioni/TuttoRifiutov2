# Tutto Rifiuto Admin CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private `/admin` CMS that edits every site text plus Eventi and Archivio media without rebuilds, while shrinking the placeholder source assets enough to publish reliably.

**Architecture:** Preserve the Astro-rendered site as the complete visual fallback, then bundle a focused Cloudflare Worker that serves assets, authenticated JSON APIs, D1 content overrides, and R2 media. The admin optimizes images into three WebP variants before upload; public hydration merges validated overrides into the existing DOM, and the Worker rewrites page metadata for crawler-visible SEO.

**Tech Stack:** Astro 6, JavaScript modules, Cloudflare Worker/D1/R2, Drizzle Kit migrations, esbuild, Sharp, Node test runner, browser Canvas APIs.

**Spec:** `docs/superpowers/specs/2026-09-13-tutto-rifiuto-admin-cms-design.md`

## Global Constraints

- Do not modify `/Users/gabrielebaglioni/codeGrid/CGMWTJAN2026/TuttoRifiuto`.
- Preserve the existing layout, fonts, animation timing, routes, Italian copy, and fallback behavior.
- Use `Frank` as the exact admin username; keep the supplied password only in the hosted runtime secret `ADMIN_PASSWORD`.
- Never place the password, session secret, credential digests, or source-repository credentials in source, tests, fixtures, logs, commits, or build output.
- Store structured overrides and sessions in D1 binding `DB`; store optimized media in R2 binding `MEDIA`.
- Future editorial updates must not create commits, push source, or start builds.
- Uploaded originals must not be stored; persist only 640 px, 1280 px, and 2048 px WebP variants.
- Public pages must remain complete when D1, R2, or client hydration is unavailable.
- Use prepared D1 statements with one SQL statement per `prepare()` call.
- Keep the Site owner-private unless the user explicitly requests a different audience.

---

### Task 1: Enforce a small placeholder asset budget

**Files:**
- Create: `scripts/optimize-placeholders.mjs`
- Create: `tests/asset-budget.test.mjs`
- Modify: `src/data/events.js`
- Modify: `src/data/work.js`
- Modify: `src/data/project.js`
- Modify: `src/scripts/particle-visual.js`
- Modify: `public/og.png`
- Create: `public/og.webp`
- Create: `src/assets/optimized/**`
- Move after verification: superseded files under `src/assets/eventi`, `src/assets/work`, `src/assets/project`, and `src/assets/lab` into ignored `work/unused-assets-backup/`

**Interfaces:**
- Consumes: current placeholder images and the existing `sharp` dependency.
- Produces: optimized WebP assets at stable import paths; every tracked raster placeholder is at most 4 MiB.

- [ ] **Step 1: Write the failing asset-budget test**

```js
// tests/asset-budget.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import test from "node:test";

const MAX_BYTES = 4 * 1024 * 1024;

test("tracked raster placeholders stay below the source upload budget", () => {
  const files = execFileSync("git", ["ls-files", "src/assets", "public"], {
    encoding: "utf8",
  }).trim().split("\n").filter((path) => /\.(png|jpe?g|webp)$/i.test(path));
  const oversized = files.filter((path) => statSync(path).size > MAX_BYTES);
  assert.deepEqual(oversized, []);
});
```

- [ ] **Step 2: Run the test and verify the current large placeholders fail**

Run: `node --test tests/asset-budget.test.mjs`

Expected: FAIL listing at least `src/assets/eventi/giornataTR.jpg`.

- [ ] **Step 3: Implement deterministic placeholder optimization**

```js
// scripts/optimize-placeholders.mjs
import { mkdir } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import sharp from "sharp";

const inputs = [
  "src/assets/eventi/attachinoMorto.png",
  "src/assets/eventi/bruciaRifiuti.png",
  "src/assets/eventi/giornataTR.jpg",
  "src/assets/eventi/letture.png",
  "src/assets/eventi/nucleare.png",
  "src/assets/eventi/pianetaSonoro.png",
  "src/assets/eventi/saltaRifiuti.png",
  "src/assets/eventi/storiaDiUnFallimento.png",
  "src/assets/work/work_01.jpg",
  "src/assets/work/work_02.jpg",
  "src/assets/work/work_03.jpg",
  "src/assets/work/work_04.jpg",
  "src/assets/work/work_05.jpg",
  "src/assets/work/qia.png",
  "src/assets/project/project_1.jpg",
  "src/assets/project/project_2.jpg",
  "src/assets/project/project_3.jpg",
  "src/assets/project/project_4.jpg",
  "src/assets/project/project_5.jpg",
  "src/assets/lab/hero-visual.png",
  "src/assets/lab/hero-visual2.png",
  "src/assets/lab/hero-visual3.png",
  "src/assets/lab/hero-visual4.png",
  "src/assets/lab/image.png",
];

for (const input of inputs) {
  const group = basename(dirname(input));
  const name = basename(input, extname(input));
  const output = join("src/assets/optimized", group, `${name}.webp`);
  await mkdir(dirname(output), { recursive: true });
  await sharp(input).rotate().resize({
    width: 2400,
    height: 2400,
    fit: "inside",
    withoutEnlargement: true,
  }).webp({ quality: 88, effort: 6, smartSubsample: true }).toFile(output);
}

await sharp("public/og.png")
  .webp({ quality: 86, effort: 6, smartSubsample: true })
  .toFile("public/og.webp");
```

Run `node scripts/optimize-placeholders.mjs`, update every import to `src/assets/optimized/<group>/<name>.webp`, change the particle texture to the optimized public path, and change social metadata to `/og.webp`. After a successful visual-equivalent build, move superseded originals into the ignored `work/unused-assets-backup/` tree rather than deleting them permanently.

- [ ] **Step 4: Verify the budget and production build**

Run: `node --test tests/asset-budget.test.mjs && npm run build && npm test`

Expected: all tests PASS; all ten existing public pages build.

- [ ] **Step 5: Commit the optimized placeholders**

```bash
git add scripts/optimize-placeholders.mjs tests/asset-budget.test.mjs src public
git commit -m "perf: optimize placeholder media"
```

---

### Task 2: Bundle a modular Worker and declare Sites storage

**Files:**
- Create: `worker/index.js`
- Create: `worker/router.js`
- Create: `worker/response.js`
- Create: `scripts/build-worker.mjs`
- Create: `tests/worker-router.test.mjs`
- Modify: `scripts/prepare-sites-output.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.openai/hosting.json`

**Interfaces:**
- Consumes: `env.ASSETS`, `env.DB`, and `env.MEDIA` supplied by Sites.
- Produces: `routeRequest(request, env, ctx): Promise<Response>` and `dist/server/index.js` as bundled Worker ESM.

- [ ] **Step 1: Write a failing routing test**

```js
// tests/worker-router.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { routeRequest } from "../worker/router.js";

test("unknown non-API requests fall through to static assets", async () => {
  const env = { ASSETS: { fetch: async () => new Response("asset", { status: 200 }) } };
  const response = await routeRequest(new Request("https://site.test/work"), env, {});
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "asset");
});
```

- [ ] **Step 2: Run the router test and verify the missing module failure**

Run: `node --test tests/worker-router.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `worker/router.js`.

- [ ] **Step 3: Implement the Worker boundary and bundler**

```js
// worker/router.js
export async function routeRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === "/api/health") {
    return Response.json({ ok: true });
  }
  return env.ASSETS.fetch(request);
}
```

```js
// worker/index.js
import { routeRequest } from "./router.js";

export default {
  fetch(request, env, ctx) {
    return routeRequest(request, env, ctx);
  },
};
```

```js
// scripts/build-worker.mjs
import { build } from "esbuild";

await build({
  entryPoints: ["worker/index.js"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
});
```

Install `esbuild` as an exact dev dependency. Replace the `copyFile(worker-entry.js)` call in `prepare-sites-output.mjs` with an import of `./build-worker.mjs`. Set `.openai/hosting.json` to:

```json
{
  "d1": "DB",
  "project_id": "appgprj_6aa6a02533488191b108981b3d516223",
  "r2": "MEDIA"
}
```

- [ ] **Step 4: Verify routing and packaged Worker output**

Run: `node --test tests/worker-router.test.mjs && npm run build && npm test`

Expected: PASS and `dist/server/index.js` contains the `/api/health` route.

- [ ] **Step 5: Commit the Worker foundation**

```bash
git add worker scripts package.json package-lock.json .openai/hosting.json tests/worker-router.test.mjs
git commit -m "build: add Sites worker bundle"
```

---

### Task 3: Add the D1 schema and focused database helpers

**Files:**
- Create: `db/schema.ts`
- Create: `drizzle.config.ts`
- Create: `drizzle/0000_admin_cms.sql`
- Create: `worker/db.js`
- Create: `tests/db.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `getContentOverrides(db)`, `setContentOverride(db, key, value)`, `deleteContentOverride(db, key)`, `getCollectionOverrides(db, kind)`, and session/media prepared-statement helpers.
- Consumes later: auth, content, collection, and media handlers.

- [ ] **Step 1: Write failing tests for prepared content operations**

```js
// tests/db.test.mjs
import assert from "node:assert/strict";
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
```

- [ ] **Step 2: Run the database test and verify it fails**

Run: `node --test tests/db.test.mjs`

Expected: FAIL because `worker/db.js` does not exist.

- [ ] **Step 3: Define and generate the schema**

Define these exact tables in `db/schema.ts`: `contentEntries`, `events`, `eventMedia`, `archiveItems`, `archiveMedia`, `sessions`, and `loginAttempts`. Enforce unique slugs, foreign keys with cascade deletion, role checks (`cover` or `detail`), and indexes on collection ordering, media parent/position, and session expiry.

Implement the content upsert as:

```js
// worker/db.js
export async function setContentOverride(db, key, value, updatedAt = Date.now()) {
  return db.prepare(`
    INSERT INTO content_entries (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `).bind(key, JSON.stringify(value), updatedAt).run();
}
```

Install exact compatible versions of `drizzle-orm` and `drizzle-kit`, add `db:generate: "drizzle-kit generate"`, generate the migration, inspect it, and add `PRAGMA optimize;` as its final statement.

- [ ] **Step 4: Verify schema helpers and migration contents**

Run: `npm run db:generate && node --test tests/db.test.mjs && rg -n "CREATE (TABLE|UNIQUE INDEX)|PRAGMA optimize" drizzle`

Expected: database test PASS and migration output includes all seven tables and required indexes.

- [ ] **Step 5: Commit database support**

```bash
git add db drizzle drizzle.config.ts worker/db.js tests/db.test.mjs package.json package-lock.json
git commit -m "feat: add CMS storage schema"
```

---

### Task 4: Implement admin authentication, sessions, CSRF, and throttling

**Files:**
- Create: `worker/auth.js`
- Create: `worker/crypto.js`
- Create: `worker/handlers/auth.js`
- Create: `tests/auth.test.mjs`
- Modify: `worker/router.js`

**Interfaces:**
- Produces: `login(request, env)`, `logout(request, env)`, `getSession(request, env)`, `requireAdmin(request, env, { csrf })`, and `hashToken(value)`.
- Consumes: runtime `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `SESSION_SECRET`; D1 session and login-attempt tables.

- [ ] **Step 1: Write failing authentication tests**

```js
// tests/auth.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { verifyCredentials } from "../worker/auth.js";

test("only the configured credentials authenticate", async () => {
  const env = { ADMIN_USERNAME: "Frank", ADMIN_PASSWORD: "test-secret" };
  assert.equal(await verifyCredentials(env, "Frank", "test-secret"), true);
  assert.equal(await verifyCredentials(env, "frank", "test-secret"), false);
  assert.equal(await verifyCredentials(env, "Frank", "wrong"), false);
});
```

- [ ] **Step 2: Run the auth test and verify it fails**

Run: `node --test tests/auth.test.mjs`

Expected: FAIL because `worker/auth.js` does not exist.

- [ ] **Step 3: Implement constant-time credential checks and server sessions**

```js
// worker/crypto.js
const encoder = new TextEncoder();

export async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}
```

```js
// worker/auth.js
import { digest, equalBytes } from "./crypto.js";

export async function verifyCredentials(env, username, password) {
  const [givenUser, wantedUser, givenPassword, wantedPassword] = await Promise.all([
    digest(username), digest(env.ADMIN_USERNAME), digest(password), digest(env.ADMIN_PASSWORD),
  ]);
  return equalBytes(givenUser, wantedUser) && equalBytes(givenPassword, wantedPassword);
}
```

Create 32-byte random session and CSRF tokens, store only the session-token digest in D1, set `tr_admin=<token>; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`, expire sessions after eight hours, and reject the sixth failed login from the same hashed IP within 15 minutes.

- [ ] **Step 4: Verify login, logout, expiry, CSRF, and rate-limit behavior**

Run: `node --test tests/auth.test.mjs`

Expected: PASS for correct credentials, generic failure responses, cookie flags, expired sessions, missing CSRF, and the sixth failed login.

- [ ] **Step 5: Commit authentication**

```bash
git add worker/auth.js worker/crypto.js worker/handlers/auth.js worker/router.js tests/auth.test.mjs
git commit -m "feat: protect admin API"
```

---

### Task 5: Expose public and private text-content APIs

**Files:**
- Create: `src/data/site-content.js`
- Create: `worker/content-defaults.js`
- Create: `worker/handlers/content.js`
- Create: `worker/validation.js`
- Create: `tests/content-api.test.mjs`
- Modify: `worker/router.js`
- Modify: relevant `src/pages/*.astro`, `src/layouts/*.astro`, and `src/components/*.astro`

**Interfaces:**
- Produces: `GET /api/content`, `PUT /api/admin/content/:key`, and `DELETE /api/admin/content/:key`.
- Produces: `SITE_CONTENT`, a JSON-safe object containing every editable text and link.
- Consumes: `requireAdmin`, content D1 helpers.

- [ ] **Step 1: Write a failing API test for fallback and override merge**

```js
// tests/content-api.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { mergeContent } from "../worker/handlers/content.js";

test("stored overrides replace only matching default keys", () => {
  const defaults = { "home.hero.title": "Nessuna spiegazione", "home.hero.subtitle": "Nessun rimpianto." };
  const result = mergeContent(defaults, [{ key: "home.hero.title", value_json: '"Altro titolo"' }]);
  assert.deepEqual(result, { "home.hero.title": "Altro titolo", "home.hero.subtitle": "Nessun rimpianto." });
});
```

- [ ] **Step 2: Run the content API test and verify it fails**

Run: `node --test tests/content-api.test.mjs`

Expected: FAIL because the content handler does not exist.

- [ ] **Step 3: Centralize all text defaults and implement endpoints**

Move literal user-facing copy from Astro pages/components into `SITE_CONTENT` using stable keys such as `home.hero.title`, `events.hero.title`, `contact.hero.title`, `global.footer.instagram_label`, and `seo.home.description`. Keep values as strings or JSON-safe arrays. Export the same data to the Worker through `worker/content-defaults.js` during the build.

```js
// worker/content-defaults.js
export { SITE_CONTENT } from "../src/data/site-content.js";
```

Implement `mergeContent` defensively:

```js
export function mergeContent(defaults, rows) {
  const merged = { ...defaults };
  for (const row of rows) {
    if (!(row.key in defaults)) continue;
    try { merged[row.key] = JSON.parse(row.value_json); } catch { continue; }
  }
  return merged;
}
```

Validate keys against `SITE_CONTENT`, values against the default value type, strings at 20,000 characters maximum, and links as same-origin paths, `https:`, or `mailto:` only.

- [ ] **Step 4: Verify every visible literal is represented and APIs enforce auth**

Run: `node --test tests/content-api.test.mjs && npm run build && npm test`

Expected: PASS; unauthorized writes return `401`, missing CSRF returns `403`, valid writes merge, and delete restores the default.

- [ ] **Step 5: Commit site-wide editable text support**

```bash
git add src worker tests/content-api.test.mjs
git commit -m "feat: expose editable site copy"
```

---

### Task 6: Implement Eventi and Archivio collection APIs

**Files:**
- Create: `worker/handlers/collections.js`
- Create: `worker/collections-defaults.js`
- Create: `tests/collections-api.test.mjs`
- Modify: `worker/router.js`
- Modify: `src/data/events.js`
- Modify: `src/data/work.js`
- Modify: `src/data/project.js`

**Interfaces:**
- Produces: public `GET /api/events`, `GET /api/events/:slug`, `GET /api/archive`, and `GET /api/archive/:slug`.
- Produces: authenticated collection create/update/delete routes under `/api/admin`.
- Consumes: collection defaults, D1 helpers, `requireAdmin`.

- [ ] **Step 1: Write failing collection merge and slug-validation tests**

```js
// tests/collections-api.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { isSlug, mergeCollection } from "../worker/handlers/collections.js";

test("collection overrides preserve defaults and ordering", () => {
  const defaults = [{ slug: "musica", title: "Musica", position: 2 }];
  const rows = [{ slug: "musica", title: "Suoni", position: 1 }];
  assert.deepEqual(mergeCollection(defaults, rows), [{ slug: "musica", title: "Suoni", position: 1 }]);
});

test("slugs accept only lowercase URL-safe values", () => {
  assert.equal(isSlug("giornata-tutto-rifiuto"), true);
  assert.equal(isSlug("Giornata Tutto Rifiuto"), false);
});
```

- [ ] **Step 2: Run the tests and verify missing implementation failures**

Run: `node --test tests/collections-api.test.mjs`

Expected: FAIL because the collection handler does not exist.

- [ ] **Step 3: Implement collection reads and authenticated mutations**

Use `^[a-z0-9]+(?:-[a-z0-9]+)*$` for slugs; return `409` for duplicates. Preserve the exact event fields `status`, `summary`, `meta`, `description`, `info`, `outro`, `outroInfo`, and `seo`. Preserve archive fields `title`, `code`, `href`, description/detail fields, ordering, and SEO. Mutations run prepared statements in `DB.batch()` when rows and media ordering change together.

- [ ] **Step 4: Verify defaults, overrides, creation, deletion, and conflicts**

Run: `node --test tests/collections-api.test.mjs`

Expected: PASS for merged defaults, newly created records, stable ordering, duplicate `409`, invalid payload `400`, and unauthorized `401`.

- [ ] **Step 5: Commit collection APIs**

```bash
git add worker src/data tests/collections-api.test.mjs
git commit -m "feat: add events and archive APIs"
```

---

### Task 7: Add atomic optimized-media upload and delivery

**Files:**
- Create: `worker/handlers/media.js`
- Create: `worker/media.js`
- Create: `tests/media-api.test.mjs`
- Modify: `worker/router.js`

**Interfaces:**
- Produces: `POST /api/admin/media`, `DELETE /api/admin/media/:id`, and `GET /media/:key`.
- Consumes: multipart fields `small`, `medium`, `large`, `ownerType`, `ownerSlug`, `role`, `position`, and `alt`.
- Produces: media JSON with URLs and widths for public `srcset` rendering.

- [ ] **Step 1: Write failing media validation and rollback tests**

```js
// tests/media-api.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { validateVariant } from "../worker/media.js";

test("media variants must be WebP and within the upload budget", async () => {
  const valid = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])], "small.webp", { type: "image/webp" });
  assert.equal(await validateVariant(valid, 2_500_000), true);
  const invalid = new File([new Uint8Array([1, 2, 3])], "fake.webp", { type: "image/webp" });
  assert.equal(await validateVariant(invalid, 2_500_000), false);
});
```

- [ ] **Step 2: Run the media test and verify it fails**

Run: `node --test tests/media-api.test.mjs`

Expected: FAIL because `worker/media.js` does not exist.

- [ ] **Step 3: Implement signature validation and atomic R2/D1 updates**

Validate the RIFF/WEBP signature, MIME, non-empty body, and 2.5 MiB maximum for each optimized variant. Store objects at `<ownerType>/<ownerSlug>/<uuid>/<width>.webp` with immutable cache metadata. If any `R2.put()` or D1 insert fails, delete every key written by the request. On replacement, commit the new D1 reference before scheduling old-key cleanup with `ctx.waitUntil()`.

Serve media using:

```js
export async function serveMedia(request, env, key) {
  const object = await env.MEDIA.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
```

- [ ] **Step 4: Verify validation, rollback, replacement, and delivery**

Run: `node --test tests/media-api.test.mjs`

Expected: PASS and mock R2 confirms no orphan keys after simulated D1 failure.

- [ ] **Step 5: Commit the media API**

```bash
git add worker/handlers/media.js worker/media.js worker/router.js tests/media-api.test.mjs
git commit -m "feat: store optimized CMS media"
```

---

### Task 8: Build the protected `/admin` editor and browser optimizer

**Files:**
- Create: `src/pages/admin.astro`
- Create: `src/styles/site/admin.css`
- Create: `src/scripts/admin.js`
- Create: `src/scripts/admin-image-optimizer.js`
- Create: `tests/admin-image-optimizer.test.mjs`
- Create: `tests/admin-page.test.mjs`

**Interfaces:**
- Produces: `optimizeImage(file): Promise<Array<{ width: number, blob: Blob }>>`.
- Consumes: all private admin APIs and the CSRF token from `GET /api/admin/session`.
- Produces: forms for Home, Archivio, Eventi, Progetto, Contatti, and Globali.

- [ ] **Step 1: Write failing optimizer and admin-shell tests**

```js
// tests/admin-image-optimizer.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { targetWidths } from "../src/scripts/admin-image-optimizer.js";

test("image variants never upscale and use three responsive targets", () => {
  assert.deepEqual(targetWidths(3000), [640, 1280, 2048]);
  assert.deepEqual(targetWidths(1000), [640, 1000]);
  assert.deepEqual(targetWidths(500), [500]);
});
```

```js
// tests/admin-page.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("admin shell contains login and all editing sections", () => {
  const page = readFileSync("src/pages/admin.astro", "utf8");
  for (const section of ["Home", "Archivio", "Eventi", "Progetto", "Contatti", "Globali"]) {
    assert.match(page, new RegExp(`>${section}<`));
  }
  assert.match(page, /autocomplete="current-password"/);
});
```

- [ ] **Step 2: Run both tests and verify they fail**

Run: `node --test tests/admin-image-optimizer.test.mjs tests/admin-page.test.mjs`

Expected: FAIL because the admin files do not exist.

- [ ] **Step 3: Implement login, editors, uploads, and local WebP conversion**

```js
// src/scripts/admin-image-optimizer.js
export function targetWidths(sourceWidth) {
  return [...new Set([640, 1280, 2048].filter((width) => width < sourceWidth).concat(sourceWidth))]
    .sort((left, right) => left - right)
    .slice(0, 3);
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Impossibile ottimizzare l’immagine")), "image/webp", 0.82);
  });
}

export async function optimizeImage(file) {
  if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error("Formato non supportato");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const variants = [];
  for (const width of targetWidths(bitmap.width)) {
    const height = Math.round(bitmap.height * width / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d", { alpha: true }).drawImage(bitmap, 0, 0, width, height);
    variants.push({ width, blob: await canvasBlob(canvas) });
  }
  bitmap.close();
  return variants;
}
```

The page initially displays only username/password fields. After session success, load editor schemas from the APIs, render text inputs/textareas and repeatable lists, show unsaved-state warnings, and expose Save, Cancel, Restore placeholder, Replace image, Remove image, and Reorder controls. Use `textContent`, DOM properties, and `FormData`; never render API values with `innerHTML`.

- [ ] **Step 4: Verify optimizer policy, admin structure, and production build**

Run: `node --test tests/admin-image-optimizer.test.mjs tests/admin-page.test.mjs && npm run build && npm test`

Expected: PASS and `/admin/index.html` exists in `dist/client`.

- [ ] **Step 5: Commit the admin panel**

```bash
git add src/pages/admin.astro src/styles/site/admin.css src/scripts/admin.js src/scripts/admin-image-optimizer.js tests/admin-image-optimizer.test.mjs tests/admin-page.test.mjs
git commit -m "feat: add private CMS panel"
```

---

### Task 9: Hydrate public copy, collections, and responsive media

**Files:**
- Create: `src/scripts/content-hydration.js`
- Create: `src/scripts/collections-hydration.js`
- Create: `src/components/ResponsiveMedia.astro`
- Create: `tests/public-hydration.test.mjs`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/components/EventCard.astro`
- Modify: `src/components/EventDetail.astro`
- Modify: `src/components/WorkGrid.astro`
- Modify: all public pages/components containing editable copy
- Modify: `worker/router.js`
- Create: `worker/html-metadata.js`

**Interfaces:**
- Consumes: `GET /api/content`, `GET /api/events`, and `GET /api/archive`.
- Produces: `applyContent(root, values)`, `renderEvents(container, events)`, `renderArchive(container, items)`, and `rewriteMetadata(html, metadata)`.
- Preserves: complete Astro-rendered fallback markup before JavaScript runs.

- [ ] **Step 1: Write failing hydration and safe-link tests**

```js
// tests/public-hydration.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedLink } from "../src/scripts/content-hydration.js";
import { escapeAttribute } from "../worker/html-metadata.js";

test("public hydration rejects executable links", () => {
  assert.equal(isAllowedLink("/events"), true);
  assert.equal(isAllowedLink("https://example.com"), true);
  assert.equal(isAllowedLink("javascript:alert(1)"), false);
});

test("metadata attributes escape untrusted values", () => {
  assert.equal(escapeAttribute('a"<b'), "a&quot;&lt;b");
});
```

- [ ] **Step 2: Run the hydration test and verify missing-module failures**

Run: `node --test tests/public-hydration.test.mjs`

Expected: FAIL because the hydration and metadata modules do not exist.

- [ ] **Step 3: Implement non-blocking hydration and metadata rewriting**

Mark every editable fallback node with a stable `data-content-key`. `applyContent` changes text using `textContent`; link values pass `isAllowedLink`; array values are rendered by dedicated `createElement` functions. Fetch after `DOMContentLoaded`, retain existing markup on any non-2xx response, timeout, parse error, missing key, or type mismatch.

`ResponsiveMedia.astro` renders existing optimized local markup when no API media exists and a `<picture>`/`srcset` using `/media/<key>` URLs when it does. Preserve alt text and explicit dimensions to avoid layout shift.

For HTML page requests, fetch the static asset, read only the page’s SEO override keys, and replace `<title>`, description, canonical, Open Graph, and X tags through `rewriteMetadata`; escape `&`, `"`, `<`, and `>` before insertion.

```js
// src/scripts/content-hydration.js
export function isAllowedLink(value) {
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}
```

```js
// worker/html-metadata.js
export function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
```

- [ ] **Step 4: Verify fallback-first rendering and build output**

Run: `node --test tests/public-hydration.test.mjs && npm run build && npm test`

Expected: PASS; static HTML still contains all original copy and images; hydration scripts and data keys are present.

- [ ] **Step 5: Commit public CMS integration**

```bash
git add src worker tests/public-hydration.test.mjs
git commit -m "feat: hydrate public CMS content"
```

---

### Task 10: Support new dynamic Eventi and Archivio detail URLs

**Files:**
- Create: `src/pages/eventi/template.astro`
- Create: `src/pages/archivio/[slug].astro`
- Create: `src/pages/archivio/template.astro`
- Create: `tests/dynamic-routes.test.mjs`
- Modify: `worker/router.js`
- Modify: `src/scripts/collections-hydration.js`

**Interfaces:**
- Consumes: D1 collection records and static template HTML assets.
- Produces: working `/eventi/:slug` and `/archivio/:slug` pages for records created after deployment.

- [ ] **Step 1: Write a failing Worker rewrite test**

```js
// tests/dynamic-routes.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { templatePathFor } from "../worker/router.js";

test("dynamic collection paths resolve to their static templates", () => {
  assert.equal(templatePathFor("/eventi/nuovo-evento"), "/eventi/template/");
  assert.equal(templatePathFor("/archivio/nuovo-pacchetto"), "/archivio/template/");
  assert.equal(templatePathFor("/contact"), null);
});
```

- [ ] **Step 2: Run the route test and verify it fails**

Run: `node --test tests/dynamic-routes.test.mjs`

Expected: FAIL because `templatePathFor` is not exported.

- [ ] **Step 3: Implement template fallback for collection detail routes**

Check the requested slug in D1. Existing static routes continue through `ASSETS`; a valid dynamic record whose asset returns `404` is served from the appropriate template. Unknown slugs return `404`, not the template. The template reads the slug from `location.pathname`, fetches the matching public API record, renders only validated fields with DOM APIs, and uses the same `ResponsiveMedia` contract.

- [ ] **Step 4: Verify known, new, and missing detail routes**

Run: `node --test tests/dynamic-routes.test.mjs && npm run build && npm test`

Expected: PASS; known static events, new D1 records, and unknown slugs resolve respectively to `200`, `200`, and `404`.

- [ ] **Step 5: Commit dynamic details**

```bash
git add src/pages/eventi/template.astro src/pages/archivio worker/router.js src/scripts/collections-hydration.js tests/dynamic-routes.test.mjs
git commit -m "feat: serve dynamic collection details"
```

---

### Task 11: Final security, integration, and deployment verification

**Files:**
- Create: `tests/security.test.mjs`
- Create: `tests/integration.test.mjs`
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `README.md`

**Interfaces:**
- Consumes: complete Worker, admin panel, migrations, D1/R2 bindings, and runtime secrets.
- Produces: validated Sites archive and private production deployment.

- [ ] **Step 1: Write final failing security and integration assertions**

```js
// tests/security.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("tracked source and build output contain no admin password", () => {
  const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n");
  const leaks = files.filter((path) => {
    try {
      const text = readFileSync(path, "utf8");
      return /ADMIN_PASSWORD=\S+/.test(text);
    } catch {
      return false;
    }
  });
  assert.deepEqual(leaks, []);
});
```

```js
// tests/integration.test.mjs
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

test("deployment artifact contains worker, admin, metadata, and migrations", () => {
  for (const path of [
    "dist/server/index.js",
    "dist/client/admin/index.html",
    "dist/.openai/hosting.json",
    "dist/.openai/drizzle/0000_admin_cms.sql",
  ]) assert.equal(existsSync(path), true, path);
});
```

- [ ] **Step 2: Run the tests and verify missing documentation/artifact failures**

Run: `node --test tests/security.test.mjs tests/integration.test.mjs`

Expected: integration FAIL until the build copies migrations; security must never expose the real password.

- [ ] **Step 3: Complete packaging, documentation, and runtime configuration**

Update `prepare-sites-output.mjs` to copy `drizzle/` into `dist/.openai/drizzle/`. Add only variable names to `.env.example`:

```dotenv
ADMIN_USERNAME=
ADMIN_PASSWORD=
SESSION_SECRET=
```

Document `/admin`, supported image types, three output widths, placeholder fallback, and password rotation in `README.md`. Configure hosted values through Sites: username `Frank`, the password supplied in conversation, and a fresh 32-byte random session secret. Do not print secret values.

- [ ] **Step 4: Run fresh complete verification**

Run: `npm test && npm run build && npm test`

Expected: all tests PASS, all ten original pages plus `/admin` and templates build, and output contains no warning or secret.

Run the package helper:

```bash
/Users/gabrielebaglioni/.codex/plugins/cache/openai-bundled/sites/0.1.34/scripts/package-site.sh "$PWD" work/tutto-rifiuto-site.tar.gz
tar -tzf work/tutto-rifiuto-site.tar.gz | rg 'dist/(server/index.js|client/admin/index.html|.openai/hosting.json|.openai/drizzle/0000_admin_cms.sql)'
```

Expected: all four required paths are listed.

- [ ] **Step 5: Commit, create a clean optimized publication history, and deploy privately**

```bash
git add .env.example .gitignore README.md scripts/prepare-sites-output.mjs tests
git commit -m "test: verify admin CMS deployment"
git status --short
git rev-parse --verify HEAD
```

Because the Sites repository is still empty and the earlier local root commit contains oversized superseded binaries, create a temporary clean publication checkout under ignored `work/publish/`, copy the exact tracked source state without `.git`, `node_modules`, `dist`, or `work`, initialize a single root commit, build and test that checkout, push its full `HEAD` SHA to the configured Sites source branch, and package the archive from that same checkout. Do not rewrite the working repository’s history.

Save one Sites version using the pushed full SHA and validated archive, deploy it with `deploy_private_site_version`, poll `get_deployment_status` until `succeeded` or `failed`, and open the exact returned production URL in Codex. After success, verify:

- unauthenticated `GET /api/admin/session` does not expose admin data;
- incorrect login returns the generic failure;
- correct login creates the secure cookie;
- an authenticated text override appears publicly without a build;
- an authenticated optimized cover upload appears through `/media/`;
- deleting those smoke-test overrides restores placeholders;
- logout invalidates the session.

Stop the local development server only after hosting completes.
