# Task 7 report — Atomic optimized CMS media

Task commit: `7f4ba530b58aba2f18cfe8ee0d0b35bd7041ad28` (`feat: store optimized CMS media`).

## RED → GREEN

- RED: `node --test tests/media-api.test.mjs` failed with `ERR_MODULE_NOT_FOUND` for `worker/media.js`.
- GREEN: the focused media and collection verification passed: 20 tests, 0 failures.

## Delivered behavior

- `POST /api/admin/media` requires the existing admin session and CSRF token, accepts exactly `small`, `medium`, and `large` WebP variants, validates declared MIME, RIFF/WEBP signature, non-empty contents, each 2.5 MB limit, bounded multipart body, owner type/slug, role, position, and alt text.
- Fallback Eventi/Archivio owners are materialized only when their known default slug is uploaded against. Objects use immutable UUID R2 paths and only store the 640, 1280, and 2048 WebP variants.
- R2 write failure and D1 failure both compensate every attempted new R2 key. Replacements commit the new D1 reference before `waitUntil` cleanup of every old variant.
- `DELETE /api/admin/media/:id` removes the D1 reference before deleting all associated variant keys.
- `GET /media/:key` accepts only safe generated paths and returns R2 HTTP metadata, ETag, and immutable one-year caching.
- Collection media JSON now adds `sources` (`width` plus public URL) alongside `src` and `widths`, supporting future `srcset` rendering while retaining Task 6 compatibility.

## Verification

Commands run successfully:

- `node --test tests/media-api.test.mjs tests/collections-api.test.mjs` — 20 passing, 0 failing.
- `npm test` — 50 passing, 0 failing.
- `npm run build` — successful after sandbox permission for Astro's local font helper; 10 static pages built and Worker output prepared.
- `git diff --check` — clean before the task commit.

## Fix Round 1 — RED → GREEN

Fix commit: `94f39c2fc0edbb1439d5e8e702f909703e1ce893` (`fix: harden CMS media lifecycle`).

- RED: new regressions failed for post-commit response lookup, owner-ID collisions, optional real-size variants, tombstone delivery, and tombstone retry.
- GREEN: media, collection, and schema tests pass (31 focused tests, 0 failures); `npm test` passes 60 tests; `npm run db:generate` reports 7 tables and no pending schema changes; `npm run build` completes all 10 static pages.

The fix creates no extra table. It adds lifecycle state and cleanup-attempt fields to existing media rows, a partial active-slot unique index per parent/role/position, and D1-authorized public delivery. Only active D1 references are public; failed R2 deletions retain non-public tombstones for retry.

## Fix Round 2 — RED → GREEN

Fix commit: `e7c85bf322ae962b30ccc18959db7a77927cecb9` (`fix: persist pending media cleanup`).

- RED: field ceilings/aspect-ratio validation failed before the named-variant policy was added.
- GREEN: focused checks passed 32 tests; `npm test` passed 61 tests; schema generation remained at seven tables; build completed 10 pages.

Media is now reserved as a persistent `pending` row with all source keys before R2 writes. Failed work becomes `pending_cleanup`; active and tombstoned rows are the only public-state transitions. Immutable origin URLs are denied once their row becomes inactive; already cached immutable responses are governed by the cache platform until expiry.

## Fix Round 3 — RED → GREEN

Implementation commit: `8cd6962` (`fix: complete round three media lifecycle hardening`).

- RED: the new real-SQLite parent-race regression initially observed no deferred retry work; the rollback-delete retention regression also exposed an incomplete lifecycle-state model in the test double. A mutation changing retry ordering back to `ORDER BY id` made the real-SQLite fairness test fail, confirming that the regression detects the required behavior.
- GREEN: `0003` rebuilds both legacy media tables, deterministically keeps the oldest active slot, tombstones duplicate active-slot losers with an incremented cleanup attempt, and backfills safe 640/1280/2048 source keys. Real SQLite exercises migration, `CHECK`, foreign-key, partial-unique, cascade, transactional activation, cleanup fairness, parent deletion, and collision-proof two-row reordering.
- Shared 180-byte UTF-8 slug validation now covers collection routes, collection payloads/materialization, media upload ownership, and generated media keys. Legacy active rows safely reconstruct one, two, or three source widths when stored source JSON is absent.
- Tombstone retries use fair attempt/time/id ordering, retain and increment failed work, run through production `ctx.waitUntil` on relevant public fetches and retained delete/race paths, and preserve post-commit media when `waitUntil` itself throws.
- Parent deletion marks media non-public before R2 cleanup, tracks cleanup failures, conditionally deletes the parent only when the media snapshot still matches, and retains the parent on a race. Delivery distinguishes D1/R2 operational failures (`500`) from missing objects (`404`).
- RIFF/VP8/VP8L/VP8X parsing now checks container boundaries, frame/header structure, reserved bits, canvas/image agreement, and alpha relationships against independently decodable tiny WebP fixtures plus malformed mutations.

### Verification

Commands run successfully:

- `node --test tests/sqlite-media-lifecycle.test.mjs` — 6 passing, 0 failing (Node's experimental SQLite warning only).
- `node --test tests/media-api.test.mjs tests/collections-api.test.mjs tests/db.test.mjs` — 41 passing, 0 failing.
- `npm test` — 76 passing, 0 failing.
- `npm run db:generate` — confirms exactly 7 tables and no schema changes.
- `npm run build` — successful with 10 static pages after granting Astro's local font helper loopback-listener permission.
- `git diff --check` — clean before the implementation commit.

Immutable-cache caveat: newly inactive origin media paths return `404`, but immutable copies already served from an edge/browser cache can remain cache-served until their configured expiry.

## Fix Round 4 — RED → GREEN

Implementation commits: `9242b51` (`fix: deduplicate legacy media before slot indexes`) and `ee1fe79` (`fix: serialize media deletion reservations`).

- RED: applying the old `0001` migration to an unmodified `0000` database with duplicate legacy media slots failed while creating the partial active-slot index. The real-SQLite interleaving test also showed a parent `DELETE` returning `200` while an upload had reserved its manifest and was paused in `R2.put`.
- GREEN: `0001` now deterministically keeps the oldest `(created_at, id)` slot winner active and copies later duplicates as cleanup-capable tombstones before either partial unique index is created. The complete `0000` through `0004` chain executes on SQLite with the expected indexes, manifests, foreign keys, and exactly seven tables.
- `0004` adds no table: `events` and `archive_items` receive non-null `deleting` gates; the two media tables receive `reservation_started_at` leases, with pre-existing pending rows backfilled from `created_at`.
- Upload reservations use a conditional `INSERT … SELECT` that accepts only a non-deleting parent and checks one inserted row. Parent deletion atomically acquires its gate only if no pending reservation exists, tombstones active media under that gate, purges each tracked manifest only after R2 cleanup, and deletes the gated parent only when no media rows remain. R2/manifest-cleanup failures retain the parent, gate, and retryable row; a final parent-delete conflict retains the gate.
- The real-SQLite barrier test pauses a write after reservation, proves deletion is refused, then proves the resumed upload reaches `active` with its tracked R2 object. A retained gate also rejects later uploads before a new manifest or R2 write can begin.
- Retry now fairly includes stale pending reservations after a five-minute lease as well as tombstone and pending-cleanup rows. It conditionally claims the stale row, increments cleanup attempts, and can recover a failed immediate pending-cleanup transition after a worker/R2 failure; fresh pending work remains untouched.
- The post-commit guard is now reachable: an injected `waitUntil` throw returns a storage error without compensating the already-active new manifest or immutable R2 objects. VP8X validation now rejects duplicate structural chunks, metadata flag/chunk mismatches, animation chunks, and `ALPH` paired with lossless `VP8L`.

### Verification

Commands run successfully:

- `node --test tests/sqlite-media-lifecycle.test.mjs` — 11 passing, 0 failing (Node's experimental SQLite warning only).
- `node --test tests/media-api.test.mjs tests/collections-api.test.mjs tests/db.test.mjs` — 42 passing, 0 failing.
- `npm test` — 82 passing, 0 failing.
- `npm run db:generate` — confirms exactly 7 tables and no schema changes.
- `npm run build` — successful with 10 static pages after granting Astro's local font-helper listener permission.
- `git diff --check` — clean before each commit.

Immutable-cache caveat remains: inactive origin paths are denied, while a previously served immutable edge/browser response can remain cache-served until its expiry.

## Fix Round 5 — Zero-row reservation result safety

Implementation commit: `87713af` (`fix: guard zero-row media reservations`).

- RED: a real SQLite `INSERT … SELECT` that matched no non-deleting parent retained its connection's prior `last_insert_rowid()`. The upload handler assigned that stale ID before checking `changes`, so its compensation path changed an unrelated pending media row to `pending_cleanup` and attempted R2 cleanup.
- GREEN: the handler now requires exactly one changed row before converting `meta.last_row_id` to a reservation ID. A zero-row result re-reads the parent only to classify a deletion gate as `409` or a disappeared parent as `404`; it constructs no reservation, touches no existing media row, and reaches no R2 `put` or `delete`.
- The regression seeds a real SQLite pending manifest with the stale ID, enables the parent deletion gate, and proves the response is `409`, the unrelated key/state/attempt count are unchanged, and both R2 operation lists remain empty.
- The pending lease remains five minutes. There is intentionally no upload heartbeat: this interval must stay comfortably above normal Worker/R2 upload duration, and it must not be shortened without adding a heartbeat that prevents reclaiming a live reservation early.

### Verification

Commands run successfully:

- `node --test tests/sqlite-media-lifecycle.test.mjs tests/media-api.test.mjs` — 36 passing, 0 failing.
- `npm test` — 83 passing, 0 failing.
- `npm run db:generate` — exactly 7 tables and no schema changes.
- `npm run build` — successful with 10 static pages after granting Astro's local font-helper listener permission.
