# Task 8 Round 6 Admin CMS Concurrency Implementation Plan

> **For agentic workers:** Execute inline in this worktree. The user explicitly requested no subagents.

**Goal:** Preserve leaf-level collection edits through refreshes and make stale reorder completions inert while extending regression coverage for every asynchronous admin mutation.

**Architecture:** `valueEditor` will report a relative structural path to its consumer, allowing collection cards to write the exact leaf to `AdminDrafts`. Collection reordering will capture both its order-draft revision and all collection-draft revisions before the request; a response may reconcile collection state only while that snapshot remains current. The protected media-order handler remains unchanged unless its real SQLite boundary tests expose a defect.

**Tech Stack:** Browser ESM admin controller, Node test runner with LinkeDOM, Worker router, D1-compatible SQLite integration harness.

**Spec:** Parent Task 8 review requirements supplied 2026-09-14.

## Global Constraints

- Keep the public site and original worktree untouched; edit only this `admin-cms` worktree.
- Preserve authentication, CSRF, request-size limits, exact-body validation, and atomic two-phase media ordering.
- Use TDD: each production change follows a focused failing regression test.
- Produce exactly one commit after focused and full verification.

---

### Task 1: Leaf collection draft paths

**Files:**
- Modify: `tests/admin-dom.test.mjs`
- Modify: `src/scripts/admin.js`

**Consumes:** `AdminDrafts.set(resource, path, value)` and `AdminDrafts.rebase(resource, serverValue)`.

**Produces:** Nested collection controls call `set` with paths such as `["seo", "title"]`, so only that leaf overlays a fresh server response.

- [x] **Step 1: Write the failing DOM regression**

```js
test("collection SEO leaf edits preserve only the dirty leaf across a server refresh", async () => {
  // Edit the rendered seo.title input, refresh with a changed seo.description,
  // then assert draft.seo is { title: "SEO locale", description: "Server" }
  // and dirtyPaths is [["seo", "title"]].
});
```

- [x] **Step 2: Run it red**

Run: `node --test tests/admin-dom.test.mjs`

Expected: the current top-level `["seo"]` draft path restores the old local description, failing the server-sibling assertion.

- [x] **Step 3: Implement the smallest path-aware editor callback**

```js
valueEditor(value, onChange, label, refresh, live, relativePath)
// leaf: onChange(nextValue, relativePath)
// arrays/objects: recurse with [...relativePath, indexOrKey]
// collection card: drafts.set(resource, [field, ...relativePath], nextValue)
```

- [x] **Step 4: Run focused model and DOM tests green**

Run: `node --test tests/admin-model.test.mjs tests/admin-dom.test.mjs`

Expected: both suites pass and the regression records only the exact nested leaf.

### Task 2: Stale collection reorder guard

**Files:**
- Modify: `tests/admin-dom.test.mjs`
- Modify: `src/scripts/admin.js`

**Consumes:** `AdminDrafts.snapshotPrefix(prefix)` and `snapshot(key)`.

**Produces:** A reorder response only replaces `state.collections[kind]` and clears `collection-order:<kind>` if the order snapshot and all captured collection snapshots still match.

- [x] **Step 1: Write the failing pending-reorder regression**

```js
test("a stale collection reorder completion leaves collection state and drafts untouched", async () => {
  // Hold /api/admin/events/_order, edit a collection title through the DOM,
  // resolve with reversed server order, and assert original order remains,
  // title draft remains dirty, and collection-order:events was not cleared.
});
```

- [x] **Step 2: Run it red**

Run: `node --test tests/admin-dom.test.mjs`

Expected: the existing completion reassigns `state.collections.events` before checking the operation revision.

- [x] **Step 3: Guard before reconciliation**

```js
const operation = state.drafts.snapshot(orderResource);
const collectionRevisions = state.drafts.snapshotPrefix(`collection:${kind}`);
// after api(): return unless every captured key still has its expected revision
// before assigning state.collections or calling reconcileCollectionDraft.
```

- [x] **Step 4: Run the DOM suite green**

Run: `node --test tests/admin-dom.test.mjs`

Expected: stale completion leaves both local collection state and drafts unchanged.

### Task 3: Completion and router-boundary regressions

**Files:**
- Modify: `tests/admin-dom.test.mjs`
- Modify: `tests/sqlite-media-lifecycle.test.mjs`

**Consumes:** Existing controller mutation handlers and `/api/admin/media/_order` router route.

**Produces:** Regression coverage for stale content save/restore, upload, media PATCH/delete/reorder, collection reorder, positive browser autostart, and exact/bounded media-order input.

- [x] **Step 1: Write focused completion and router-boundary regressions**

```js
// Hold each mutation response, advance the relevant draft revision, then
// assert the late completion cannot clear/remap a newer draft incorrectly.
// Import admin.js in a browser-like document containing #admin-login-form
// and assert the session probe runs once.
// Exercise real SQLite with extra keys, >65 KiB body, >1000 items,
// duplicate ids, duplicate detail slots, and cover position 1; expect 400.
```

- [x] **Step 2: Run the focused tests**

Run: `node --test tests/admin-dom.test.mjs tests/sqlite-media-lifecycle.test.mjs`

Observed: the two implementation regressions failed as expected before their fixes;
the pre-existing completion guards and router bounds were characterized as green.

- [x] **Step 3: Make only fixes exposed by red tests**

```js
// Keep existing CSRF, exact-shape, byte, item-count, owner, and batch guards.
// Add production code only if a new test exposes a contract violation.
```

- [x] **Step 4: Verify and commit**

Run: `npm test`, `npm run build`, `npm run db:generate`, `git diff --check`.

Expected: all pass; stage only these scoped files and create one `fix:` commit.
