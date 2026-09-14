# Task 7 Round 4 Implementation Plan

> **For agentic workers:** Execute inline because the task explicitly forbids subagents. Every behavior change follows a real SQLite RED → GREEN cycle.

**Goal:** Make the complete Task 7 migration chain and media lifecycle safe against legacy slot duplicates, parent-delete/upload races, and stranded pending reservations.

**Architecture:** Keep seven tables. Add a `deleting` gate to parent collection rows and a `reservation_started_at` lease timestamp to media rows. Media reservation becomes an `INSERT … SELECT` guarded by the parent gate; deletion atomically acquires that gate before cleanup, and retry reclaims stale pending manifests before finalizing gated parents.

**Tech Stack:** Cloudflare Worker-style D1/R2 APIs, SQLite migrations, Node `node:sqlite` integration tests, Astro project test runner.

**Spec:** `docs/superpowers/specs/2026-09-13-tutto-rifiuto-admin-cms-design.md`

## Global Constraints

- Keep exactly seven database tables and preserve Task 6 public collection behavior.
- Historical migrations may be corrected because the project is not deployed; fresh and upgrade chains must both execute on SQLite.
- Require admin authentication before storage-binding checks; never commit secrets.
- Use bound D1 statements, check affected row counts, and leave failed R2 work non-public and retryable.
- Make new commits only; do not amend existing commits.

---

### Task 1: Make the historical migration chain deduplicate before uniqueness

**Files:**
- Modify: `drizzle/0001_lying_jane_foster.sql`
- Modify: `tests/sqlite-media-lifecycle.test.mjs`

**Interfaces:**
- Consumes an unmodified `0000` schema containing duplicate `(parent, role, position)` media rows.
- Produces one deterministic active winner and tombstone losers before `0001` creates the partial active-slot indexes.

- [x] Write a real SQLite test that applies `0000`, inserts duplicate event and archive slots, then applies unmodified `0001`, `0002`, and `0003`.
- [x] Run `node --test --test-name-pattern='0001' tests/sqlite-media-lifecycle.test.mjs`; expect the current `UNIQUE constraint failed` failure.
- [x] Change the `0001` copy statements to select the earliest `(created_at, id)` winner as `active` and copy later duplicates as `tombstone` with `cleanup_attempts = 1` before index creation.
- [x] Re-run the named SQLite test; assert final states, source manifests, partial indexes, and seven-table count.

### Task 2: Add gate and lease fields without adding tables

**Files:**
- Modify: `db/schema.ts`
- Create: generated `drizzle/0004_*.sql` and matching Drizzle metadata
- Modify: `tests/sqlite-media-lifecycle.test.mjs`

**Interfaces:**
- Parent rows expose `deleting` as a non-null boolean/integer defaulting to false.
- Media rows expose `reservation_started_at` as a non-null integer lease timestamp.

- [x] Write SQLite assertions that fresh and upgrade migrations provide the four new columns with defaults and retain foreign keys/checks.
- [x] Run the named migration test; expect missing-column failure.
- [x] Add the schema fields and generate the migration, then backfill existing pending lease values from `created_at`.
- [x] Re-run the SQLite migration assertion and `npm run db:generate`; expect no second generated migration.

### Task 3: Serialize reservation and parent deletion through the parent gate

**Files:**
- Modify: `worker/handlers/media.js`
- Modify: `worker/handlers/collections.js`
- Modify: `tests/sqlite-media-lifecycle.test.mjs`
- Modify: `tests/media-api.test.mjs`

**Interfaces:**
- `uploadMedia` reserves via a conditional `INSERT … SELECT` only when `deleting = 0` and checks exactly one inserted row.
- `deleteCollectionItem` acquires `deleting = 1` only when no `pending` media exists, checks one changed row, then either deletes the parent after cleanup or preserves its gate and media tracking.

- [x] Write a barrier-backed real SQLite route test: pause upload after reservation and before R2 `put`, request deletion, then release upload; assert deletion is refused, the parent survives, and the manifest reaches `active` with tracked objects.
- [x] Run the named test; expect deletion to race into the existing unsafe path.
- [x] Add conditional reservation, conditional deletion gate, and gated final parent deletion with affected-row checks.
- [x] Re-run the interleaving test; assert no cascade removes an in-flight manifest and a gated parent rejects later reservations before any R2 write.

### Task 4: Recover stale pending reservations fairly

**Files:**
- Modify: `worker/handlers/media.js`
- Modify: `tests/sqlite-media-lifecycle.test.mjs`
- Modify: `tests/media-api.test.mjs`

**Interfaces:**
- `retryTombstones(env, ownerType, now)` selects tombstones, pending cleanup, and pending rows older than `PENDING_LEASE_MS`.
- A stale pending row conditionally transitions to `pending_cleanup`, increments attempts, removes manifest keys, and is purged only after cleanup succeeds.

- [x] Write real SQLite cases for fresh pending unchanged, stale pending reclaimed, transient pending-cleanup transition failure remaining retryable, and attempts incrementing.
- [x] Run the pending-recovery regression against the pre-change handler; it fails because the lease-aware retry API and selector are absent.
- [x] Add lease-aware selection and conditional transition; keep failures retained and let retry finalize gated parents after successful cleanup.
- [x] Re-run the named tests; assert fresh pending work remains untouched and stale recovery increments attempts before cleanup.

### Task 5: Make post-commit behavior and VP8X validation meaningful

**Files:**
- Modify: `worker/handlers/media.js`
- Modify: `worker/media.js`
- Modify: `tests/media-api.test.mjs`

**Interfaces:**
- A real post-commit `waitUntil` throw is caught by the committed branch without compensating active R2 objects.
- VP8X rejects duplicate structural chunks and invalid `ALPH`/`VP8L` combinations while retaining the independently decodable fixtures.

- [x] Change the post-commit regression to expect a storage error while asserting the committed active manifest and objects survive; add malformed VP8X fixtures for duplicate chunks and `ALPH` with `VP8L`.
- [x] Run the named tests; expect the stale dead-guard response/invalid containers to be accepted.
- [x] Move deferred cleanup into the guarded post-commit path and tighten only the tested VP8X checks.
- [x] Re-run the named tests and the existing fixture set.

### Task 6: Verify, report, and commit

**Files:**
- Modify: `docs/superpowers/reports/2026-09-13-tutto-rifiuto-admin-cms-task-7.md`

- [x] Run `node --test tests/sqlite-media-lifecycle.test.mjs`.
- [x] Run `node --test tests/media-api.test.mjs tests/collections-api.test.mjs tests/db.test.mjs`.
- [x] Run `npm test`, `npm run db:generate`, `npm run build`, and `git diff --check`.
- [x] Append Round 4 RED/GREEN evidence and the immutable-cache caveat to the Task 7 report.
- [x] Commit implementation/tests and report without amending prior commits.
