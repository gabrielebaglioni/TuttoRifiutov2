# Rocket implementation

Scope approved: Rocket Lean, Astro 7.2, the whole admin in Svelte 5, and the small top-centred mobile logo. Work remains on codex/rocket-version; production and main stay unchanged.

## Independent checkpoints

- [ ] Upgrade: pin Astro 7.2.10 and compatible Svelte integration; preserve HTML whitespace (`compressHTML: true`), CSP and Worker packaging. Remove obsolete queuedRendering flag. Run build and all existing tests before UI migration.
- [ ] Lean: progressively type isolated modules. Separate expensive menu rendering from its interaction controller and load it on menu intent, preserving its fallback and reduced-motion behaviour. Validate the public dependency graph and disposal behaviour.
- [ ] Logo: reproduce mobile bounds/contrast for SiteLogo; reuse existing brand asset, not a new mark. Preserve desktop layout and link semantics.
- [ ] Admin: create route-only Svelte app, with declarative content, collection, media and palette editors. Keep existing server APIs, cookies, CSRF, authentication epochs, draft revision checks, upload optimizer and manual Git synchronization. The legacy controller remains the comparison baseline, not a DOM renderer hidden inside Svelte.
- [ ] Verification: authentication race and late-edit tests, uploads/reorder/disclosures, build CSP, bundle separation, responsive browser checks. Compare measured build/bundle results with docs/reviews/rocket-version-analysis.md. No claimed physical-device measurements without hardware evidence.

## Boundaries

The Svelte runtime must not be imported by BaseLayout or public scripts. `/admin` alone requests the editor. No changes to Worker authentication or production data. No ClientRouter migration in this experiment: existing animation lifecycles assume full navigation.

## References

- https://docs.astro.build/en/guides/upgrade-to/v7/
- https://docs.astro.build/en/guides/integrations-guide/svelte/
- docs/reviews/rocket-version-analysis.md
