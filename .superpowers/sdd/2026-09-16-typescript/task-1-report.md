# Task 1 report — Shared data and pure motion foundation

## Status

Implemented the approved Task 1 scope on `codex/typescript`: all seven `src/data` modules and the four pure motion/media utilities are TypeScript, strict migration checking is available through `npm run check:types`, runtime and source consumers point to the new TypeScript entrypoints, and the compiler contract is part of the normal Node test suite.

No merge, push, publication, or deployment was performed. The independently created `docs/reviews/typescript-baseline.md` was deliberately left untracked and unstaged.

## Baseline and dependencies

- Runtime required by the plan: `/Users/gabrielebaglioni/.npm/_npx/387698761821791d/node_modules/node/bin/node` (`v24.21.0`).
- `npm ci` installed the lockfile dependencies after the checkout-local `node_modules` proved incomplete.
- Added `@types/three@0.182.0`, matching the installed Three.js minor, because the package does not ship declarations consumed by this strict configuration.
- The first dependency-complete test run found 371 tests. It ran before a fresh production artifact existed and therefore reported two artifact-dependent failures. The final build followed by the final suite is recorded below and passes the complete suite.

## RED evidence

Added `tests/types/contracts.ts`, `tests/typescript-contracts.test.mjs`, and `tsconfig.migration.json` before converting production sources.

Command:

```text
/Users/gabrielebaglioni/.npm/_npx/387698761821791d/node_modules/node/bin/node --test tests/typescript-contracts.test.mjs
```

Observed result: 0 passed, 1 failed. The compiler reported 48 diagnostics, including `TS7006` on both `pieFrame` parameters and `TS2344` because the required `[progress: number, multiplier: number]` contract was not satisfied. This was the expected failure mode.

## Implementation

- Converted `src/data/event-status`, `events`, `media-source`, `project`, `site-content`, `theme`, and `work` from `.js` to `.ts`.
- Exported domain types for event publication/content/media, archive/project/work records, canonical media keys and responsive sources, site content, theme tokens/palettes, and public event groups.
- Kept storage/HTTP-facing and malformed values as `unknown` in palette, media-source, and event-status validation paths, then narrowed them with existing runtime rules.
- Converted `motion-policy`, `pie-geometry`, `event-transition`, and `gallery-media` from `.js` to `.ts`, retaining function names, animation constants, ordering, callbacks, and return values.
- Updated all source, Worker, script, Astro/Svelte, and test imports that consume the renamed modules. Node tests use the plan's Node 24 runtime for native erasable TypeScript execution; existing VM extraction continues to execute unchanged JavaScript controllers and does not regex-strip TypeScript.
- Added strict options: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, and `noImplicitOverride`.
- Added the `check:types` package command.

## GREEN and verification evidence

Strict compiler and compiler contract:

```text
PATH=/Users/gabrielebaglioni/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH npm run check:types
/Users/gabrielebaglioni/.npm/_npx/387698761821791d/node_modules/node/bin/node --test tests/typescript-contracts.test.mjs
```

Result: typecheck exit 0; contract 1/1 passed.

Focused motion/data/API compatibility suite:

```text
/Users/gabrielebaglioni/.npm/_npx/387698761821791d/node_modules/node/bin/node --test tests/mobile-motion.test.mjs tests/mobile-performance.test.mjs tests/apple-menu-motion.test.mjs tests/tablet-regression.test.mjs tests/browser-compatibility.test.mjs tests/pie-splatter.test.mjs tests/event-transition.test.mjs tests/gallery-media.test.mjs tests/theme.test.mjs tests/public-hydration.test.mjs tests/public-hydration-round5.test.mjs tests/content-api.test.mjs tests/dynamic-routes.test.mjs
```

Result: 139/139 passed.

Production build (outside the filesystem/network sandbox only so Astro could bind its temporary local font server):

```text
PATH=/Users/gabrielebaglioni/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH npm run build
```

Result: exit 0; 14 pages built; Sites packaging completed.

Complete suite after the build:

```text
/Users/gabrielebaglioni/.npm/_npx/387698761821791d/node_modules/node/bin/node --test tests/*.test.mjs
```

Result: 372/372 passed, 0 failed (baseline 371 plus the new compiler contract).

Repository checks:

```text
git diff --cached --check
rg -n "\\bany\\b|@ts-ignore|@ts-nocheck" <owned TypeScript/config/contract files>
```

Result: no whitespace errors and no diagnostic suppressions or `any` types in the owned migration sources. The only text match was the CSS media query phrase `any-pointer`, not a TypeScript type.

## Self-review and concerns

- Reviewed all owned modules and their existing focused tests before conversion.
- Confirmed the runtime validators remain active; annotations do not accept palette/media/status values without checks.
- Confirmed build-time import resolution and packaged bundle isolation through the full suite.
- No behavior/timing/security changes were intentionally introduced.
- Browser/device visual inspection was not part of Task 1; the existing behavioral and packaging tests are the verification available for this pure-foundation checkpoint.
- Future tasks must continue using Node 24 (or explicit TypeScript transpilation for VM-loaded TypeScript) because the repository's default Node 23 runtime is not the approved execution environment.
