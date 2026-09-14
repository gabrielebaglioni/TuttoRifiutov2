# Task 11 — Security scan AST hardening, round 5

## Scope

This final edge correction starts from `ef5585f`. It does not deploy or access
runtime credentials.

## Changes

- Added an independent recursive sensitive-target search for binding patterns.
  When an outer `AssignmentPattern` contains the password target anywhere in a
  nested `ObjectPattern`, `ArrayPattern`, `RestElement`, alias, or nested
  pattern, its outer default value is now checked with the same conservative
  right-hand-side policy.
- Acorn `PrivateIdentifier` keys are recognized in class
  `PropertyDefinition` nodes and member assignments such as private fields on
  `this`, including compound operators and assignment-pattern defaults.
- `MethodDefinition` remains outside value-property handling, so a private
  method with the same name is not mistaken for a password assignment.

## TDD evidence

The focused suite was run before implementation and two new groups failed:
outer defaults containing nested sensitive targets, and private class fields.
After implementation, the focused suite passes 15/15. Coverage includes the
exact array default example, nested object/array aliases, nested rest patterns,
empty/direct-runtime safe values, private field initialization, compound
member assignment, destructuring default assignment, and a private-method
non-assignment.

## Verification

- `node --test tests/security.test.mjs` — PASS, 15/15 after build.
- `npm test` — PASS, 218/218.
- `npm run db:generate` — PASS; seven tables, no migration change.
- `npm run build` — PASS; 13 pages generated.
- Sites package helper — PASS; Worker, `/admin`, hosting metadata, and initial
  migration are present.
- `git diff --check` — clean.
- Published source maps — 0.
- Generated unsafe-DOM scan — unchanged single trusted static SVG icon
  assignment documented in earlier rounds; no CMS value reaches it.

No deployment, secret access, or secret output occurred.
