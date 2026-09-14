# Task 11 — Security scan AST hardening, round 3

## Scope

This round replaces the hand-written JavaScript lexer used by the deployment
secret scan. It does not deploy, configure runtime values, or change public
site content.

## Implementation

- Added exact-pinned development dependency `acorn@8.15.0`.
- Scans now select their parser from the filename rather than guessing from
  content:
  - only `.env*` files use the dotenv line parser, including `#` comments,
    `export`, unquoted values, and empty placeholders;
  - JSON uses `JSON.parse()` plus a recursive value walk;
  - `.js`, `.mjs`, and `.cjs` use Acorn, trying module syntax before script
    syntax;
  - `.astro` files extract frontmatter and inline script blocks, then parse
    each JavaScript fragment with Acorn.
- Any malformed JavaScript, JSON, or extracted Astro fragment is counted as an
  issue without including a filename or source contents in the test failure.
- The AST visit covers bare declarations, assignments (`=`, `||=`, `??=`),
  object properties, JSON properties, static bracket/template keys, and nested
  `process["env"]["ADMIN_PASSWORD"]` reads.
- The only accepted values are an empty string, a direct runtime environment
  read, or a template with no literal text whose expressions are direct runtime
  reads. Static, numeric, composed, and fallback values are flagged.

Astro frontmatter may validly include a top-level `return` alongside module
imports. Acorn still attempts module before script; `allowReturnOutsideFunction`
is enabled so that valid Astro frontmatter is not treated as an unreadable
production fragment.

## TDD evidence

The new path-aware tests were first run against the former lexer and failed on
the required bypasses: multiline/line-separated assignment syntax, nested
computed keys, template keys, regex literals after `if`/`throw`, dotenv comment
handling, malformed JSON, and Astro fragments. After the AST implementation,
the focused security suite passes 11/11.

## Verification

- `node --test tests/security.test.mjs` — PASS, 11/11.
- `npm test` — PASS, 214/214.
- `npm run db:generate` — PASS; seven tables and no schema changes.
- `npm run build` — PASS; 13 pages generated.
- Sites package helper — PASS; archive contains the Worker, `/admin`, hosting
  metadata, and initial migration.
- `git diff --check` — clean.
- Source-map scan — 0 published maps.
- The generated-output unsafe-DOM scan finds one pre-existing, trusted static
  SVG icon assignment in the menu bundle. It is not fed by editable CMS data;
  all CMS-rendered values continue to use DOM APIs and the existing admin
  no-HTML-rendering test passes.

No runtime credentials or deployment secrets were read, written, or printed.
