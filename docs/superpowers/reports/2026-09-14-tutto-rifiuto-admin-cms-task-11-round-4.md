# Task 11 — Security scan AST hardening, round 4

## Scope

This correction starts from `8b8dbec` and closes the remaining AST coverage
gaps identified in review. It does not deploy the site or read/configure any
runtime secret.

## Changes

- A sensitive assignment target is now either the bare identifier or any
  member whose final static property is `ADMIN_PASSWORD`. The object chain is
  deliberately unrestricted, covering ordinary, nested, computed, template,
  `this`, and Acorn `ChainExpression` shapes.
- Every Acorn `AssignmentExpression` operator is inspected. Static, numeric,
  composed, and fallback right-hand sides are rejected for arithmetic,
  concatenating, bitwise, logical, nullish, and ordinary assignments alike.
- Binding and assignment patterns are traversed recursively through
  `ObjectPattern`, `ArrayPattern`, `RestElement`, and `AssignmentPattern`.
  Sensitive property aliases retain their context, so static defaults are
  detected in declarations, destructuring assignments, function parameters,
  rest parameters, and `catch` bindings.
- Object-expression properties, Acorn class `PropertyDefinition` nodes, and
  compatible `ObjectProperty` nodes use the same static-key and safe-value
  checks.
- `allowReturnOutsideFunction` now defaults to false for `.js`, `.mjs`, `.cjs`,
  and Astro inline script blocks. It is enabled only for Astro frontmatter,
  where top-level return is valid. Unparseable production JavaScript remains a
  fail-closed aggregate issue.

The right-hand-side allowlist is unchanged: only an empty string, a direct
runtime environment read, or a pure runtime-only template is safe.

## TDD evidence

The new regression tests were first run against `8b8dbec`: four focused test
groups failed on arbitrary member chains, non-whitelisted assignment
operators, aliased destructuring defaults, and invalid top-level returns. The
implementation then made the focused suite pass 13/13. Tests include the exact
review examples plus nested/template keys, all assignment operator families,
array/rest/default-parameter/catch patterns, class fields, valid Astro
frontmatter return, and invalid JavaScript/Astro-script return.

## Verification

- `node --test tests/security.test.mjs` — PASS, 13/13 after the fresh build.
- `npm test` — PASS, 216/216.
- `npm run db:generate` — PASS; seven tables, no migration change.
- `npm run build` — PASS; 13 pages generated.
- Sites package helper — PASS; archive contains Worker, `/admin`, hosting
  metadata, and initial migration.
- `git diff --check` — clean.
- Published source maps — 0.
- Generated unsafe-DOM scan — the same single pre-existing trusted static SVG
  icon assignment documented in round 3; no CMS value reaches it and no new
  occurrence was introduced.

No deployment, credential access, or secret output occurred in this round.
