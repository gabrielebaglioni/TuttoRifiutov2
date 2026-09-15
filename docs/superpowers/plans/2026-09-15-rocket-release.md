# Rocket security and release plan

Approved scope: resolve dependency advisories, verify authentication/upload in isolated staging, merge Rocket into finalRev then the existing main branch, publish the existing public Site. No schema/authentication redesign, no overwriting local content snapshots.

- [ ] Capture npm audit; update drizzle-orm to 0.45.2, sharp to 0.35.4 and direct esbuild to 0.28.2. Update compatible SVGO and override only the obsolete esbuild nested under @esbuild-kit/core-utils to patched 0.25.12. Verify full and production audits, build, Svelte checks, migrations and all tests.
- [ ] Resolve staging availability without using the public Site as a test target. Ask approval for a second private Site because Sites has no independent preview deployment. Exercise real login, invalid credentials, session cookie, CSRF rejection, optimized upload, stored media retrieval, publication and logout with disposable data. Never copy production secrets into staging.
- [ ] Review final diff and results. Commit verified source. Preserve user's modified content/published files; compare them before integrating. Fetch and confirm finalRev/main have not diverged. Merge in the requested order only after staging succeeds.
- [ ] Build the integrated revision, push GitHub and the Sites source repository, package that exact revision and deploy to the existing public audience. Check terminal deployment success and read-only public responses. Do not change public content during smoke tests.

Existing finalRev and main start at 30df1633be13f9c053ebbfd71e3603bc0571cb02; recheck before merging. Existing Rocket starts at 9410003. Rollback uses the previously saved Sites version, not a destructive Git reset.
