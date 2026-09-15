# Rocket dependency security — 2026-09-15

## Resolved dependency advisories

The full npm audit and the production-only audit both return zero known vulnerabilities after these targeted changes:

| Dependency | Previous | Updated | Reason |
| --- | --- | --- | --- |
| drizzle-orm | 0.44.7 | 0.45.2 | SQL identifier escaping advisory GHSA-gpj5-g38j-94v9 |
| sharp | 0.34.5 | 0.35.4 | Patched native libvips/libheif libraries |
| direct esbuild | 0.27.7 | 0.28.2 | Windows development-server file-read advisory |
| svgo (transitive) | 4.0.1 | 4.1.0 | removeScripts sanitization bypasses |
| @esbuild-kit/core-utils > esbuild | 0.18.20 | 0.25.12 | Development-server cross-origin exposure |

The last change is narrowly scoped via npm overrides, not a global override. Drizzle Kit remains 0.31.4. Its schema generation successfully loads the TypeScript schema and reports no changes; no applied migration files were modified. Keep this override until the obsolete loader dependency is removed upstream. The lockfile records exact artifacts/integrities. No audit suppression or forced downgrade was used.

## Verification

- Svelte/TypeScript check: zero errors, zero warnings.
- Astro build and Sites Worker packaging: success.
- Existing suite: 368/368 passed after dependency update.
- Additional packaged-Worker test passes: unauthenticated session/upload rejection, invalid login, successful login and HttpOnly/Secure/SameSite cookie, missing-CSRF rejection, WebP upload, exact stored-byte retrieval, media deletion and invalidation after logout. This uses real SQLite and an in-memory R2 boundary, not hosted Cloudflare services.
- Remote staging and publication remain gated on an isolated staging Site. The current public Site is not a safe test environment; Sites has no independent staging deployment on the same project.

Zero npm findings is a snapshot of known dependency advisories, not a guarantee of overall security. Production credentials and content have not been changed by these checks.

## Sources

- https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9
- https://sharp.pixelplumbing.com/changelog/v0.35.4/
- https://github.com/evanw/esbuild/security/advisories/GHSA-g7r4-m6w7-qqqr
- Advisory URLs and affected ranges returned by npm audit on 2026-09-15.
