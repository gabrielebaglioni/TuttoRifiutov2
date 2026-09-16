# Browser TypeScript checkpoint — 2026-09-16

Partial Task 3, not a completion or deployment report.

Converted readiness, page/event transitions, menu audio, theme subscriptions,
icons, grain shader/tile and mobile pie canvas. Animation timings, particle
counts, shader math and viewport sizing remain unchanged. Browser checks now
run in `check:types`; behavioral VM tests transpile through TypeScript first.

The Svelte palette comparison pairs retain their literal token types and its
callback accepts string or ThemePalette instead of any. This small integration
correction removes four Svelte diagnostics exposed by the shared palette types;
the rest of Task 4 is still pending.

Independent source review found no critical/important introduced regression.
It identified inherited icon keys violating the new string return contract:
an own-property check was added after a failing regression test, then verified.
CodeRabbit reviewed the original checkpoint and raised 0 issues (the subsequent
icon guard/test and Svelte correction were not part of that remote snapshot).

Pre-final-fix verification: strict checks, 14-page production build, 377 tests.
Svelte after correction: zero errors/warnings. Icon regression: red then green.
Final checkpoint verification is recorded in the execution ledger.

Measured before final icon guard: home 720805 raw / 205617 gzip bytes versus
baseline 719820 / 205268; this is not a performance improvement claim.
Public asset graphs still exclude the Svelte admin island.

Remaining: complex public controllers/hydration, full admin types, tools/tests
migration, final bundle budgets and responsive browser verification. No push,
merge or publication performed for this checkpoint.

## Second checkpoint

Converted content hydration (remote JSON remains unknown), preloader, animated
copy, clients, navigation clock, Lenis initialization, footer, stats, lab,
menu shader and lazy Three library wrappers. Shared content events are typed.
The nav clock now tolerates absent optional markup (regression red then green).
SplitText mask typing preserves the supported collections and existing timing.

Independent review identified one test still feeding raw TypeScript to Acorn.
The full suite reproduced this failure (379/380); switching that loader to the
existing compiler helper restored all **380/380** tests without removing any
assertions. Final strict check and Svelte check passed (zero errors/warnings),
as did the 14-page production build. This second checkpoint was independently
source-reviewed, not re-submitted to CodeRabbit.

Still authored JavaScript under src/scripts: collection hydration, particle
visual, work, menu, common/home entrypoints, pie transition, contact, skyline,
project, menu-ring-grain and six admin modules. These remain explicit unfinished
work; existing .ts files elsewhere are not proof of a complete strict migration.
