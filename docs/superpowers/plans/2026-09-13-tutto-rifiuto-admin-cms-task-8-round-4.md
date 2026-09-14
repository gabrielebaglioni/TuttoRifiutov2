# Task 8 Fix Round 4 Implementation Plan

> **For agentic workers:** Execute inline because the task explicitly forbids subagents. Each behavior change must have a witnessed RED → GREEN cycle before its implementation.

**Goal:** Preserve fallback-only collection media while making the private editor’s drafts, asynchronous UI state, identity cleanup, and auth epochs correct under reloads and real DOM interaction.

**Architecture:** The worker returns immutable fallback fields alongside a separate normalized `media` override list. The client derives visual slots by overlaying that list, while a draft store tracks revisions and reconciles only server-owned fields after reload. `admin.js` becomes an injectable controller that the browser auto-starts and a lightweight DOM test drives through real events.

**Tech Stack:** Astro/ESM browser controller, Cloudflare Worker-style APIs, Node test runner, `linkedom@0.18.12`, SQLite integration tests, Drizzle.

**Spec:** `docs/superpowers/specs/2026-09-13-tutto-rifiuto-admin-cms-design.md`

## Global Constraints

- Do not alter the original checkout, existing migrations, canonical reorder endpoint, cover constraints, route fixes, or partial preview behavior.
- Preserve seven SQLite tables, fallback public fields, CSRF/auth requirements, and no-secret policy.
- Use only new commits; never amend the Round 3 commits.
- Every async editor action must use the central busy/epoch mechanism and every externally observable behavior must have a real API, SQLite, or DOM test.

---

### Task 1: Keep fallback media separate from stored media

**Files:** `worker/handlers/collections.js`, `tests/collections-api.test.mjs`, `src/scripts/admin-model.js`, `tests/admin-model.test.mjs`

- [x] Add a failing collection route test whose stored cover/detail rows leave `cardMedia`, `heroMedia`, `coverMedia`, and fallback `detailMedia` unchanged while exposing only stored rows in `media`.
- [x] Run the named test and observe the current overwrite failure.
- [x] Make `attachMedia` attach only `media`; keep defaults/merged fallback properties intact.
- [x] Add a failing slot-overlay test with a stored detail in one fallback slot and an unrelated fallback detail; expect one stored replacement, no duplicates, and retained virtual siblings.
- [x] Implement the slot overlay and rerun both focused suites.

### Task 2: Add revision-aware draft reconciliation and resource cleanup

**Files:** `src/scripts/admin-model.js`, `src/scripts/admin.js`, `tests/admin-model.test.mjs`

- [x] Add failing model tests for server refresh rebasing only server-owned paths, preserving unsaved editorial draft paths, revision-token protection, resource-prefix cleanup, and new-parent resource remapping.
- [x] Run the named model tests and observe missing APIs/incorrect retained state.
- [x] Implement `AdminDrafts` revisions/rebase plus prefix clear/remap helpers, then make reload/save/delete/reorder use them.
- [x] Re-run focused model tests and verify stale completions cannot clear a later draft revision.

### Task 3: Make the real admin controller testable and busy-safe across rerenders

**Files:** `package.json`, `package-lock.json`, `src/scripts/admin.js`, `tests/admin-dom.test.mjs`

- [x] Add exact `linkedom@0.18.12` as a development dependency with its lockfile entry.
- [x] Write a failing real-DOM test importing the controller against the admin skeleton: type multiple characters, switch tabs, and verify the original focused input is not replaced by normal edits while drafts survive a rerender.
- [x] Export an injectable `createAdminController` / `bootAdmin` while retaining guarded browser auto-start; implement the smallest wiring needed for the test.
- [x] Add failing DOM cases for busy tab controls after rerender, media upload/delete reload and fallback reveal, parent dirty-prefix cleanup, `401` reset, and stale transport rejection.
- [x] Implement controller-scoped busy rendering, exact cleanup/remap, and epoch-safe rejected-fetch handling; rerun DOM tests.

### Task 4: Stream bounded metadata before decoding

**Files:** `worker/handlers/media.js`, `tests/sqlite-media-lifecycle.test.mjs`

- [x] Add a failing chunked, no-Content-Length multibyte JSON metadata request that exceeds 16 KiB and assert it returns `400` without a full-body `text()` read.
- [x] Replace the metadata `request.text()` path with a reader that counts bytes before accumulating/decoding JSON.
- [x] Re-run the metadata/SQLite route tests and confirm valid exact-shape metadata still returns success and slot races return `409`.

### Task 5: Complete verification, report, and commit

**Files:** `docs/superpowers/reports/2026-09-13-tutto-rifiuto-admin-cms-task-8-round-3.md`

- [x] Run focused collection, model, DOM, metadata, and real SQLite tests.
- [x] Run `npm test`, `npm run db:generate`, `npm run build`, `git diff --check`, and dist secret/unsafe scans.
- [x] Append Round 4 decisions and witnessed RED/GREEN commands to the SDD report.
- [x] Commit the implementation, test dependency/lockfile, tests, and report as a new commit.
