# Complete TypeScript Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace authored JavaScript with checked TypeScript while preserving existing site behavior.
**Architecture:** Domain-by-domain conversion, strict environment-specific checks and preserved runtime validation. Keep Astro rendering, isolated Svelte admin and existing animation engines.
**Tech Stack:** Astro 7.2.10, Svelte 5, TypeScript 5.9.3, Node 24, GSAP, Three, Cloudflare Worker.
**Spec:** docs/superpowers/specs/2026-09-16-typescript-design.md

## Global Constraints

- Work only on codex/typescript, never merge or publish during implementation.
- Preserve visual behavior, animation timing, authentication, CSRF, upload limits and content synchronization.
- No `any`, `@ts-ignore`, `@ts-nocheck`, blanket ambient module declarations or unchecked casts to silence diagnostics.
- Runtime input validation remains necessary; untrusted JSON is unknown until narrowed.
- Target strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, useUnknownInCatchVariables and noImplicitOverride.
- Generated JavaScript and dependencies are exempt; authored app, Worker, tools and tests are not.
- Keep esbuild CSS minification and built-native-timeline regression test.
- Use apply_patch for edits; mechanical renames/import updates may use a mechanical transformation.
- Existing test behavior must remain checked: do not delete tests to pass migration.
- Use isolated Node 24 at /Users/gabrielebaglioni/.npm/_npx/387698761821791d/node_modules/node/bin/node.

### Task 1: Shared data and pure motion foundation

**Files:** Convert src/data/*.js to .ts; convert src/scripts/motion-policy.js, pie-geometry.js, event-transition.js and gallery-media.js to .ts. Add tsconfig.migration.json, tests/types/contracts.ts and tests/typescript-contracts.test.mjs. Update imports and affected source-reading tests across the repository, without changing unrelated module logic. Add package check:types command.

**Interfaces:** Preserve existing exported function names and runtime results. Export inferred or explicit domain interfaces for existing consumers. Inputs crossing storage or HTTP boundaries must not become trusted merely by annotation.

- [ ] Capture build/test baseline and dependencies. Read every owned module and its existing tests before edits.
- [ ] Add a failing type-contract test using the TypeScript compiler API: import pieFrame and assert its input is number, not an implicit any; compile the migration project. Verify the test fails before conversion.
- [ ] Convert files with parameter/return types, checked optional/index access, and minimal domain types. Example contract: `pieFrame(progress: number, multiplier: number): { fill: number; scale: number }`.
- [ ] Update module paths in consumers/test harnesses. Preserve test semantics even where VM scripts must strip TypeScript first.
- [ ] Run focused motion/data tests, strict compiler, full suite and build. Report exact commands and counts; commit scoped files.

### Task 2: Worker and API boundaries

**Files:** Convert worker/**/*.js and scripts/worker-entry.js to .ts; update scripts/build-worker.mjs entrypoints and affected test imports. Add worker/types.ts and tsconfig.worker.json; update check command.

**Interfaces:** Use real Workers binding definitions for D1/R2/environment/context; preserve Worker fetch and route exports. Reuse Task 1 shared models rather than competing copies. Keep node and DOM global environments separate.

- [ ] Read route/handler contracts and tests; add a failing compile fixture proving invalid binding and payload types are rejected.
- [ ] Convert small primitives then auth/media/storage helpers then route handlers. Treat request.json() as unknown and narrow with runtime validation. Preserve every status code and authorization check.
- [ ] Update esbuild and test entrypoints to load TypeScript. No reimplementation of platform APIs just to satisfy tests.
- [ ] Run auth, security, API, media lifecycle tests and packaged Worker auth/upload test. Build, typecheck and full suite; commit.

### Task 3: Public animation and DOM controllers

**Files:** Remaining src/scripts/*.js except admin*.js; shared browser types in src/types/browser.ts; tsconfig.browser.json; affected source-path tests and Astro imports.

**Interfaces:** Preserve script entrypoints and exported functions. Type custom events, controller lifecycles and animation resources. Keep lazy menu loading and shared media/data models.

- [ ] Read touch, mobile-motion, transition and hydration tests. Add failing type contracts for controller callbacks and gesture coordinates.
- [ ] Convert animation utilities and shaders, then controllers and hydration. Use typed DOM queries and null handling; maintain gesture direction thresholds and frame scheduling.
- [ ] Model mutually exclusive controller states only where it prevents real invalid combinations; avoid unnecessary new abstractions.
- [ ] Verify frame/listener teardown, reduced motion, hidden page, viewport resize and navigation interruption. Keep runtime changes independently tested.
- [ ] Run strict check, focused tests, full suite and production build. Compare bundle isolation and original animation constants; commit.

### Task 4: Admin and Astro integration

**Files:** Remaining src/scripts/admin*.js to .ts; src/admin/*.svelte and store.ts; src/pages/*.astro and components/layouts as needed for strict checking; tsconfig.rocket.json and project checking scripts.

**Interfaces:** Preserve legacy editor comparator and Svelte admin contracts, CSRF and save/upload/sync APIs. Shared DTOs from Task 1/2. No public Svelte imports.

- [ ] Add compile contracts for editor values/media upload results and capture failing diagnostics.
- [ ] Type legacy/admin helpers, unknown JSON narrowing, event payloads and store state. Remove implicit JS holes without suppressions.
- [ ] Install compatible Astro checking/types packages only when needed; keep Astro/Svelte versions fixed.
- [ ] Run Astro and Svelte checks, admin DOM tests, packaged auth/upload, bundle isolation and complete suite; commit.

### Task 5: Tools, tests and final verification

**Files:** scripts/*.mjs to .mts or .ts, tests/*.mjs to .mts or .ts, astro.config.mjs to .ts where supported; package scripts, tsconfig.tools.json and tsconfig.tests.json. Keep generated output extensions required by hosting.

**Interfaces:** Preserve command-line interfaces, source synchronization security and Workers deployment contract. Build must run full type checks before emitting publication artifacts.

- [ ] Convert tools/tests with Node types and typed doubles using the same minimal interfaces consumed by production. Use TypeScript transpilation for VM test loading, not regex type erasure.
- [ ] Add compiler failure fixtures as strings to prove illegal inputs fail, rather than suppression comments in production/tests.
- [ ] Enforce zero authored JS/MJS under app/worker/scripts/tests, and no unchecked source files or diagnostics suppression.
- [ ] Run all checks, all tests, clean production build, dependency audit, bundle budgets and packaged auth/upload.
- [ ] Inspect actual responsive browser flows at 390x844, 768x1024, 1024x768 and 1440x900. State device/browser coverage limitations explicitly.
- [ ] Record verification and remaining risks, independent final review, commit; do not merge or deploy without user approval.
