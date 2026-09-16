# Staging mobile hero regression — 2026-09-16

The production CSS emitted by the Astro 7 default minifier combined the native
hero's animation and animation-timeline declarations into
`animation:linear both apple-hero-reveal scroll(root)`. Browser CSS parsing rejected
that shorthand. The native Apple path expanded the clip-path but lost both the
animation and timeline, exposing the entire 75%-high black panel at scroll zero.
The ordinary GSAP path remained correct, explaining desktop/Android differences.

Fix: select Vite's esbuild CSS minifier. CSS stays minified, but the scroll timeline
remains an independent declaration. No animation timing, layout, JS scroll policy,
authentication, content, or database changes.

Verification:
- New built-artifact regression test failed on the previous output and passes after rebuilding.
- All 371 tests pass; Svelte check: zero errors and warnings; build succeeds.
- Browser rejects old shorthand (`CSS.supports` false) while accepting the timeline longhand.
- Isolated native-path fixture using actual before/after build CSS: initial black
  panel height 540px of a 720px viewport before, 0px after; after scrolling 360px,
  height 153.55px, and back to 0px at scroll zero. No mocked CSS engine.
- Smartphone staging normal-path initial screenshot inspected at 390×844.
- Physical iPhone recheck remains user acceptance; responsive browser testing is
  not a substitute for a physical WebKit device.

Deploy to owner-private staging only. Stable/public branches remain unchanged.
