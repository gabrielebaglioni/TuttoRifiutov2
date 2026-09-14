# Task 8 Fix Round 5 Implementation Plan

> **For agentic workers:** Execute inline with strict RED → GREEN slices. The parent explicitly forbids subagents for this task.

**Goal:** Make the admin editor resilient to server materialization, late async completions, path-level draft rebases, media-only ordering, and busy-resource reacquisition races.

**Architecture:** Collection drafts have a stable slug identity once saved/default-backed; only new rows use a temporary draft key. `AdminDrafts` will retain a fresh server baseline plus explicitly dirty paths, allowing rebase to refresh everything else. Media ordering becomes a separate CSRF-protected Worker API whose transactional two-phase updates cannot persist collection editorial fields. Busy acquisition returns a token so an old completion cannot release a newer operation after key remapping.

**Tech Stack:** Astro/ESM browser controller, Cloudflare Worker APIs, D1/SQLite, Node test runner, linkedom, Drizzle.

**Spec:** Parent Task 8 Fix Round 5 request (2026-09-14); preserves `docs/superpowers/specs/2026-09-13-tutto-rifiuto-admin-cms-design.md`.

## Global Constraints

- Preserve all Round 4 fallback-only media behavior, collection reorder route, auth epoch protections, metadata streaming bound, migrations, and seven-table SQLite schema.
- Use only a new commit on `feature/admin-cms`; do not amend `5f89b0c` or edit the original checkout.
- No embedded credentials, unsafe DOM insertion, or media/editor regression.
- Every behavior change begins with a focused failing test and ends with its focused green command.

---

### Task 1: Stable collection identity and path-aware draft model

**Files:** `src/scripts/admin-model.js`, `src/scripts/admin.js`, `tests/admin-model.test.mjs`, `tests/admin-dom.test.mjs`

- [ ] Write model and DOM tests that prove existing/default rows use `collection:<kind>:<slug>` before and after a first media upload materializes an id; a title draft and its dirty path survive reload.
- [ ] Run the named tests to observe id-keyed draft loss.
- [ ] Make existing collection resources slug-only, keep temporary `new-*` resources for unsaved rows, and atomically remap new parent and child prefixes to the saved slug.
- [ ] Extend `AdminDrafts` with dirty-path bookkeeping. `set` marks the exact path; structural replacement marks the root; rebase starts with a fresh server clone and overlays only dirty paths.
- [ ] Re-run the focused model/DOM tests; verify a mounted untouched draft fully reflects changed server values while a dirty title/summary persists.

### Task 2: Revision and busy-generation safety

**Files:** `src/scripts/admin-model.js`, `src/scripts/admin.js`, `tests/admin-model.test.mjs`, `tests/admin-dom.test.mjs`

- [ ] Write failing tests for late content, collection, upload, metadata update, delete, collection reorder, and new-parent completion paths. Each test changes the relevant draft after capture and asserts the old completion does not clear it.
- [ ] Write failing model tests where a resource is released/reacquired, remapped while active, or reset; an old token must not release the later operation.
- [ ] Change `BusyResources.acquire` to return an opaque generation token (or no token on conflict), make `release(key, token)` match only the current generation, and move an active generation during prefix remap.
- [ ] Capture draft revision and busy token for each async UI operation. Clear/remap only when the captured revision remains current; preserve later new-parent child edits under the slug key.
- [ ] Re-run focused model and DOM tests.

### Task 3: Dedicated media-order API and UI contract

**Files:** `worker/handlers/media.js`, `worker/router.js`, `src/scripts/admin-model.js`, `src/scripts/admin.js`, `tests/sqlite-media-lifecycle.test.mjs`, `tests/admin-dom.test.mjs`

- [ ] Add failing real-SQLite/router tests for `PUT /api/admin/media/_order`: authentication/CSRF, exact bounded `{ ownerType, ownerSlug, items }` shape, complete active-id set, owner match, canonical role/position constraints, and two detail-row swaps.
- [ ] Add a failing DOM test that reorders detail media, sends only the media-order body, reloads canonical positions, and preserves dirty title/summary paths without issuing a collection `PUT`.
- [ ] Add a bounded JSON parser/reorder validator and owner lookup in the media handler; use a collision-safe temporary phase then final phase in one `DB.batch`, checking each result before returning re-read media.
- [ ] Match `/api/admin/media/_order` ahead of typed media-id routing and add a `buildMediaReorderRequest` client helper. Make `reorderMedia` use it, then reload/rebase media only.
- [ ] Re-run focused SQLite/router and DOM tests.

### Task 4: Media rendering and auto-start regressions

**Files:** `src/scripts/admin.js`, `tests/admin-dom.test.mjs`

- [ ] Add failing DOM tests that a merged cover produces exactly one cover editor, an absent merged cover produces one blank editor, and video fallback/stored media renders a `<video>` preview.
- [ ] Add a failing module-level auto-start guard test: importing without an admin login form must not perform a fetch; browser-shaped input with the form retains guarded start behavior.
- [ ] Render the blank cover editor only when `mergeMediaSlots` has no cover; retain the safe DOM/video implementation and guarded auto-start.
- [ ] Re-run focused DOM tests.

### Task 5: Release verification, report, and commit

**Files:** `docs/superpowers/reports/2026-09-13-tutto-rifiuto-admin-cms-task-8-round-3.md`

- [ ] Run focused model, DOM, collection, media-route, and real SQLite tests.
- [ ] Run `npm test`, `npm run db:generate`, `npm run build`, tracked/untracked `git diff --check`, and generated-output secret/unsafe-DOM scans.
- [ ] Append Round 5 design decisions and witnessed RED/GREEN evidence to the SDD report.
- [ ] Stage only Round 5 files and create one new commit.
