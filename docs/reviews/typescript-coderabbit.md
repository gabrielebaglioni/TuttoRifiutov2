# CodeRabbit review — 2026-09-16

Authenticated CLI 0.6.5. The full main-to-TypeScript diff exceeded the free service's 150-file limit (205 files), so two completed committed reviews cover the migration sequentially:

1. `89fb16b..623379b` in an isolated checkout: 7 issues.
2. `623379b..fdae1c1` in the working checkout: 7 issues, including a duplicate admin-build prerequisite report.

Total: 14 emitted issues, 13 distinct; 8 major, 6 minor including that duplicate; no critical issues reported. These are the review service's severities, not proof of production exploitability.

## Verified dispositions

| Severity | File | Disposition |
| --- | --- | --- |
| Major | src/scripts/menu-library.ts | Clear a rejected import promise so later callers can retry; retain successful/in-flight sharing. |
| Major | worker/router.ts | Preserve a response clone before metadata processing consumes its body; failure still returns readable original HTML. |
| Major | src/scripts/stats.ts | Reduced-motion preference keeps items at x=0 without scrub triggers; currently dormant module remains dormant. |
| Major | tsconfig.migration.json | No change: allowImportingTsExtensions is already true through astro/tsconfigs/strict → base. All strict compiler projects verify this effective behavior. Do not restore the review suggestion's obsolete allowJs=true. |
| Major | worker/auth.ts | Reject non-string credential inputs before hashing. HTTP login already validates them; this hardens the underlying helper too. |
| Major | worker/html-metadata.ts | Escape apostrophes as well as double quotes, preventing values from breaking single-quoted attributes. |
| Major | worker/handlers/collections.ts | Place temporary media order slots above both existing positions and the entire accepted final-position range; verified against SQLite's actual unique index. |
| Major | src/scripts/work.ts | Keep native images until an actual draw; restore them after shader/context/render/GPU failure. This legacy controller is not currently imported by public pages and remains disconnected. |
| Minor | src/components/EventCard.astro | Preserve string URL posters as well as imported image metadata. |
| Minor | src/components/EventDetail.astro | Same video poster correction in details. |
| Minor | src/scripts/contact.ts | Use Intl Europe/Rome formatting directly, including seasonal CET/CEST abbreviation, without reparsing locale strings. |
| Minor | src/scripts/admin.ts | Optional window access during legacy boot; missing confirmation fails closed for deletion. |
| Minor (twice) | tests/admin-page.test.mts | Explicitly require built Worker artifact; do not skip a release assertion when the artifact is missing. |

Regression tests reproduce rejected-import caching, metadata attribute injection, consumed-response fallback failure, credential coercion, missing posters, optional window, reduced motion, media-order slot collision and native-image fallback. Expected failures were observed before the corresponding fixes. Contact clock checks cover both seasons. No external commands from review output were executed.

The two CodeRabbit runs completed against the pre-fix revisions above. Follow-up fixes are verified locally; this report does not claim an additional remote approval of the follow-up diff.

Private staging uses a separate Site project, D1 database, R2 bucket and session secret. Production and GitHub main remain unchanged.
