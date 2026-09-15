# Rocket implementation verification — 2026-09-15

Branch: `codex/rocket-version`. No merge, push or deployment. The stable checkout and its content snapshots were not changed.

## Delivered

- Astro pinned to 7.2.10, Svelte 5.57.0 / integration 9.0.1, TypeScript 5.9.3. Node 24.21.0 used in an isolated invocation; system Node remains unchanged. Astro 7.3.2 is available, but this experiment deliberately follows the approved 7.2 line.
- Full route-only Svelte admin: authentication UI, all content sections, collections, media, palette, revisions. Existing server authentication, CSRF, upload optimizer and synchronization endpoints are unchanged. `/admin-legacy` is a local comparison route and redirects to `/admin` in production builds.
- Progressive TypeScript for the admin service and navigation warmup. This is not a full-project strict migration; dynamic content boundaries retain transitional types.
- Three.js menu renderer requested on first menu opening; upload optimizer requested on file selection. Public initial dependency graphs contain neither Svelte nor AdminApp. The homepage retains Three.js for its existing animation.
- Small mobile top-centred brand symbol: existing asset used as a mask, 24 × 31 px visual within a 44 × 44 px link. Global palette source preserves difference blending. Desktop SVG remains unchanged.

## Evidence

- Full suite: 368 tests passing after the final logo regression check. Svelte/TypeScript scope: zero errors and warnings. Astro static build and existing Sites Worker packaging succeed (14 routes, 50 cached image derivatives).
- New store tests exercise stale authentication, CSRF saves, late drafts, actual Worker + SQLite content/publication flows, and gallery ordering without virtual cover IDs. Existing optimizer/media endpoint tests remain passing.
- Browser checks: responsive Chromium at 390 × 844 and desktop; admin content edits, draft retention across tabs, save feedback, collection disclosures, theme UI, menu rendering, and visible centred mobile logo. Long text focus loss was reproduced then corrected and rechecked in the browser.
- Admin browser testing used `tests/admin-preview.mjs`, a disposable in-memory local fixture. It does not prove production authentication, real upload UI or deployment end-to-end. Worker integration is tested separately. No production data was edited.
- Independent read-only review found two issues (virtual cover reorder and editor replacement at 130 characters); both were corrected and re-reviewed without remaining findings in that review scope.

## Bundle measurement

`scripts/measure-rocket.mjs` traverses static JS imports of built HTML and island entries. Dynamic imports are excluded; gzip figures are summed per file, not a network timing metric.

| Route | Initial JS bytes | Gzip bytes |
| --- | ---: | ---: |
| / | 719820 | 205268 |
| /work | 204128 | 73849 |
| /events | 206265 | 74834 |
| /contact | 206194 | 74854 |
| /admin | 77299 | 29901 |

The earlier common public graph was 686300 raw / 195627 gzip bytes. The common graph now represented by `/work` is about 62% smaller gzip. This is not a claim of 62% faster page loading or a full-home baseline comparison. No physical-device LCP/INP/frame-rate benchmark was performed.

## Before integration / publication

- Triage dependency advisories: drizzle-orm identifier escaping, sharp native image libraries, transitive svgo sanitization and esbuild Windows development-server exposure. No forced broad dependency upgrade was attempted. Passing application tests does not resolve these advisories.
- Test the packaged Worker on a staging deployment, including authenticated image upload, CSP enforcement, login/logout and manual synchronization with a disposable content snapshot.
- Check real iOS Safari/Chrome/Edge and Android devices before making cross-browser smoothness claims.
- Stop the Astro dev daemon before building in the same worktree, then restart it: concurrent build/dev cache reuse caused stale development modules during this session, resolved by restart.

## Local previews

- Site: `http://127.0.0.1:4324/`.
- Admin comparison fixture (temporary data, no credentials needed): `http://127.0.0.1:4325/admin` and `/admin-legacy`. Run `node tests/admin-preview.mjs` alongside Astro on 4324. Do not expose this fixture beyond loopback.

References: https://docs.astro.build/en/guides/upgrade-to/v7/ and https://docs.astro.build/en/guides/integrations-guide/svelte/.
