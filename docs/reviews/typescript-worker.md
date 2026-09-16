# TypeScript migration — Worker checkpoint

All authored modules under `worker/` and the alternate `scripts/worker-entry.ts` are TypeScript. The production bundle remains JavaScript, as required by the hosting runtime. No deployment or merge is part of this checkpoint.

## Boundaries

- Independent strict Worker compiler configuration using the official platform binding types, without browser/Node globals.
- D1 result projections and R2 operations typed; serialized editorial values remain unknown until runtime validation.
- Existing session duration, cookies, login throttling, CSRF, request-size/image-size limits and cleanup sequencing retained.
- Authentication, upload and routing type contracts reject malformed bindings and media metadata.
- An invalid file reader that returns an array instead of an ArrayBuffer is now rejected explicitly; regression demonstrated before implementing the guard.
- Source security scanning understands TypeScript using the compiler and retains detection of initializers erased by ambient declarations. It still checks generated JavaScript and fails on malformed syntax.

## Verification

Using Node 24.21.0:

- `npm run check:types`: passed, browser foundation plus entire Worker.
- `npm run build`: passed, 14 pages and the packaged Worker.
- `npm test`: 376 passed, 0 failed, including packaged authentication/upload, SQLite media lifecycle, source-secret detection and motion regressions.
- Independent read-only review caught a legacy malformed-media cleanup response change; reproduced as 500 versus 202, corrected and covered by a passing API regression test.
- Independent review also caught erased ambient initializers in the TypeScript scanner; added positive and negative fixtures across seven TypeScript suffixes.

The touch gesture controller is also typed in this checkpoint with unchanged gesture thresholds and scheduling. Its six existing interaction/lifecycle tests pass.

## Still pending

Remaining public controllers, admin internals, tools/tests, complete Astro checking and the final responsive visual review. This checkpoint is **not** completion of the full migration or proof of physical-device performance.
