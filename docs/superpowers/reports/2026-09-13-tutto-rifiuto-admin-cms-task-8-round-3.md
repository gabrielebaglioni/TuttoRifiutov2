# Task 8 Fix Round 3 — SDD report

## Scope and constraints

- Preserved the inherited `3f0ed6d` route-ordering commit; this round adds new
  commits only.
- Kept the existing seven-table SQLite schema and made the cover slot canonical:
  one active cover per parent at position `0`, while detail media retains its
  own zero-based sequence.

## Decisions delivered

1. Collection ordering now accepts only the exact canonical `{ items }` shape
   and full slug/position set. It writes the complete result through one D1
   batch containing one multi-row `INSERT … ON CONFLICT(slug) DO UPDATE`.
   There is no materialization fallback or independently applied write path.
2. Added a generated SQLite migration for the new cover-position constraints.
   It canonicalizes legacy covers to zero and deterministically tombstones
   duplicate active transformed slots (oldest `created_at`, then lowest id,
   remains active), incrementing their cleanup attempts.
3. Upload and metadata endpoints reject noncanonical covers. Metadata requires
   the exact bounded `{ role, alt, position }` JSON envelope; malformed,
   oversized, and invalid values are `400`, while a genuine active-slot
   collision remains `409`.
4. The editor keeps centralized resource-keyed drafts for content, existing
   collections, unsaved collection rows, and media. Ordinary input events
   mutate draft state without rerendering the input; structural edits and
   successful operations render from the retained draft model.
5. Stored media overlays fallback media by `(role, position)`. This keeps
   virtual fallback slots visible beside stored slots, reveals the fallback
   after deleting a stored override, and renders video previews as `<video>`.
6. All interactive asynchronous editor paths run through resource-scoped busy
   guards that deduplicate work, set `aria-busy`, and temporarily disable
   in-scope controls. Auth epochs make stale work inert; reset clears session,
   drafts, dirty/busy state, panels, and editor visibility. A login also
   invalidates the boot-time session probe before requesting credentials.

## TDD evidence

The new coverage was written red first and then made green for:

- exact collection-order envelopes and the one-batch/one-statement SQLite
  router path;
- legacy migration canonicalization, position-zero cover constraints, and
  independent cover/detail position-zero slots;
- upload/metadata invalid-envelope, oversized, noncanonical-cover, and
  collision responses;
- persistent draft/input identity and dirty lifecycle; busy de-duplication;
  stale auth epochs and the login/session-probe race; fallback replacement,
  deletion reveal, video detection, and explicit slug controls.

## Verification

- `node --test tests/admin-page.test.mjs tests/admin-model.test.mjs`
- `npm test`
- `npm run build`
- `npm run db:generate` — reports no schema changes
- `rg` scans of `dist` for common hardcoded-secret signatures and of the
  generated admin bundle for `innerHTML` / `javascript:` — no findings
- `git diff --check`

The sandbox initially blocked Astro's local font helper listener; the same
production build completed successfully when run with the required local
listener permission.

## Fix Round 4 — fallback/media reconciliation and real DOM coverage

### Decisions delivered

1. Persisted collection media is now returned only in `media`. `cardMedia`,
   `heroMedia`, `coverMedia`, and `detailMedia` remain fallback data from the
   merged default record; the client overlays stored media by `(role, position)`
   and retains unrelated virtual slots.
2. `AdminDrafts` records a revision per resource and supports named-path
   rebases plus prefix clear/remap. Reloads refresh server-owned collection and
   media fields while retaining unsaved editorial text; canonical media
   positions are refreshed even for an unsaved media-alt draft.
3. Parent delete clears every matching collection/media draft and dirty key;
   first save remaps child media keys from `new-*` to the saved slug while
   clearing the authoritative parent state. Collection reorder reuses the
   server result, rebases cached positions, and clears only its order key.
4. The browser entry now exports an injectable `createAdminController` and
   `bootAdmin` while preserving guarded auto-start. Real `linkedom` tests cover
   typing/focus, tab draft persistence, rerender-safe busy states, metadata
   reload, upload/delete fallback reveal, identity cleanup, `401` reset, and
   stale transport failures.
5. Every rendered editor scope derives busy state from `BusyResources`, so a
   rerendered card and every tab remain disabled/`aria-busy` until the pending
   operation releases. A revision check also prevents a delayed collection
   save from clearing a later draft.
6. Metadata JSON is read from the request stream in bounded chunks. It counts
   bytes before retaining each chunk, cancels immediately over 16 KiB, then
   decodes only the bounded aggregate. A stale rejected `fetch` is classified
   by auth epoch before it can affect newer-session UI state.

### RED → GREEN evidence

- `node --test --test-name-pattern='stored media' tests/collections-api.test.mjs`
  first reported stored media leaking into fallback fields, then passed after
  `attachMedia` became media-list-only.
- `node --test --test-name-pattern='draft rebase|draft revisions' tests/admin-model.test.mjs`
  first exposed the missing revision/rebase API, then passed with revision and
  prefix-resource behavior.
- `node --test tests/admin-dom.test.mjs` initially failed because the browser
  module had no injectable controller export; the focused DOM suite then
  passed after the controller extraction and busy reconciliation.
- The named busy, child-media-position, `401`, and stale-transport DOM tests
  each failed before their corresponding controller wiring and then passed.
- `node --test --test-name-pattern='media upload and metadata APIs reject' tests/sqlite-media-lifecycle.test.mjs`
  first showed the chunked multibyte request calling `text()`; it passed after
  streaming and cancellation were added.

### Round 4 verification

- Focused admin/model/DOM/collection/SQLite suite: 65 passing, 0 failing.
- `npm test`: 125 passing, 0 failing.
- `npm run db:generate`: seven tables; no schema changes pending.
- Final `git diff --check` is clean. Targeted scans found no literal
  credential assignments in generated output (source maps excluded) and no
  `innerHTML`, `insertAdjacentHTML`, or `javascript:` use in the generated or
  source admin runtime.
- `npm run build`: successful after permitting Astro's required local font
  helper listener; 11 static pages and Worker output built.
- `rg` scans found no literal credential/token signatures in `dist` and no
  `innerHTML` or `javascript:` use in the generated admin output. The Worker
  retains expected runtime `env.ADMIN_PASSWORD` / `env.SESSION_SECRET`
  identifiers without embedding values.
- `git diff --check`: clean before the Round 4 commit.

## Fix Round 5 — stable identity, path rebases, and media-only ordering

### Decisions delivered

1. Existing and default-backed collection drafts now use immutable slug keys;
   only unsaved rows use `new-*` keys. A first upload that materializes a
   fallback parent id therefore cannot strand a live title draft under a
   numeric resource key. New-parent saves atomically move parent and child
   media resources to the saved slug, retaining edits that arrived after the
   request began.
2. `AdminDrafts` now records minimal dirty paths. A rebase starts from a fresh
   server clone and overlays only those paths, so untouched fields fully
   refresh while a local title, summary, media alt, or nested value survives.
3. Every editor mutation captures a draft revision; content, collection,
   upload, metadata, delete, and reorder completions clear only that captured
   revision. Busy resources use monotonic tokens, including safe reset and
   prefix-remap behavior, so old completions cannot release newer work.
4. Media ordering has a dedicated CSRF-protected
   `PUT /api/admin/media/_order` route. It accepts only bounded exact
   `{ ownerType, ownerSlug, items }` payloads, validates the complete active
   owner set, stages detail positions out of collision range, finalizes all
   positions in one guarded D1 batch, checks every result, and returns fresh
   active rows. The client sends no collection editorial fields for this
   operation, then reloads/rebases media positions.
5. A card creates a blank cover editor only when the merged media slots have
   no cover. DOM coverage verifies one cover editor, `<video>` previews with
   source/poster/controls, and the guarded browser auto-start path.

### RED → GREEN evidence

- The fresh-server path rebase test first retained stale server values; it
  passes after `AdminDrafts` began from the new server baseline and overlaid
  explicit dirty paths.
- The default-without-id upload DOM test first produced an id-keyed collection
  record (`collection:events:91`); it passes with the slug-stable identity.
- The busy-generation test first received boolean acquire results and later
  exposed a remap collision releasing the canonical operation; it passes with
  token generations and collision-safe remapping.
- The real SQLite media-order test first observed no dedicated batch; it now
  proves one five-statement two-phase swap, CSRF enforcement, owner/completeness
  rejection, and fresh response rows.
- The media-order DOM test first made no dedicated request; it now proves the
  exact media-only payload, canonical position refresh, and retained title/
  summary paths.
- The cover/video and no-login auto-start tests are green against the real
  `linkedom` DOM. The blank-editor assertion uses deterministic serialization
  because linkedom can hang on an empty-subtree element selector.

### Round 5 verification

- Focused current checks: admin DOM 17/17, admin model 15/15, and real SQLite
  media lifecycle 18/18 passing.
- Full `npm test`: 133 passing, 0 failing.
- `npm run db:generate`: seven tables; no schema changes pending.
- `npm run build`: successful (11 static pages) after allowing Astro's local
  font-helper listener outside the sandbox.
- `git diff --check` and generated-output secret/unsafe-DOM scans are clean.

## Fix Round 6 — leaf draft ownership and stale reorder inertness

### Decisions delivered

1. `valueEditor` now reports the exact relative structural path of every
   leaf/array/object edit. Collection cards prepend their top-level field and
   call `AdminDrafts.set` with that full path, so an edit to `seo.title` marks
   only `['seo', 'title']`; a server refresh may therefore update
   `seo.description` without overwriting the local title.
2. Collection reorder snapshots both its operation resource and every current
   collection draft before issuing the request. The response now verifies both
   snapshots before assigning `state.collections` or invoking any rebase; a
   stale completion leaves server ordering, local collections, and all drafts
   untouched.
3. The DOM suite now holds and resolves real controller operations for content
   save/restore, upload, media metadata, media delete, media reorder, and
   collection reorder. Each test advances the relevant draft while the request
   is pending and asserts that the late response cannot clear or mis-remap it.
4. SQLite route coverage now verifies exact order-object/item shapes, an
   otherwise-valid JSON document over 65 KiB, the 1,001-item limit against a
   real active set, duplicate media ids, duplicate slots, and a cover at a
   nonzero position. Authentication, CSRF, request bounds, and the existing
   guarded two-phase batch remain unchanged.
5. Browser auto-start now has both negative (no login form) and positive
   (real login form/session probe) LinkeDOM coverage.

### RED → GREEN evidence

- The nested SEO DOM regression first reported the coarse dirty path
  `[['seo']]` rather than `[['seo', 'title']]`. It passes after the
  path-aware callback reaches `collectionCard`.
- The pending collection reorder regression first replaced the local order
  with the delayed reversed result. It passes after revision snapshots are
  checked before state assignment/rebase.
- The remaining late-completion and media-order validation tests characterize
  the round-five guards as already correct; they pass against the real
  controller/router without weakening the validation boundary.

### Round 6 verification

- Focused admin model/DOM/SQLite command: 61 passing, 0 failing.
- Full `npm test`: 144 passing, 0 failing.
- `npm run build`: successful with 11 static pages after allowing Astro's
  required local font-helper listener.
- `npm run db:generate`: seven tables; no schema changes pending.
