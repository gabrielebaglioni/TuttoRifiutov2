# TypeScript migration baseline

2026-09-16. Stable code: main 89fb16b (only published content differs from
7e27f98). Baseline built runtime measured in the isolated main-release checkout.
371 tests passed before migration.

| Route | Initial JS bytes | Gzip bytes |
|---|---:|---:|
| / | 719820 | 205268 |
| /work | 204128 | 73849 |
| /events | 206265 | 74834 |
| /contact | 206194 | 74854 |
| /admin | 77299 | 29901 |

Measurement: `node scripts/measure-rocket.mjs`, Node 24, static import graph
and route island imports; dynamic menu imports excluded until requested.
These are asset bytes, not browser timing or frame-rate measurements.

Known migration-sensitive contracts:

- Tests extract functions with Acorn before VM execution. TypeScript sources
  must first be transpiled by the real compiler, then parsed/executed; existing
  behavioral assertions must not become source-text-only checks.
- Worker tests use minimal D1/R2 doubles and SQLite transactions. Production
  bindings need platform types; test doubles should satisfy consumed interfaces,
  not hide missing behavior through casts.
- Current Svelte store and media props contain transitional `any` definitions.
  Task 4 must replace them, not merely convert surrounding file extensions.
- Native hero CSS timeline remains separate after esbuild minification. Preserve
  built CSS test; TypeScript cannot prevent CSS optimizer regressions.
- Public routes must never statically import the Svelte admin graph.

Official reference checks:
- https://nodejs.org/api/typescript.html — type stripping does not typecheck;
  explicit type imports and full import extensions remain important.
- https://www.typescriptlang.org/docs/handbook/2/narrowing — narrow unknown inputs
  and discriminated controller states rather than asserting them.
- https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html
  — `satisfies` checks contracts without unnecessarily widening literal values.

Physical mobile-browser verification is not inferred from these measurements.
