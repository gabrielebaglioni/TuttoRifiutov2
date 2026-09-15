const clamp = (value) => Math.min(1, Math.max(0, value));
export function prefersReducedMotion(view = window) {
  return Boolean(view.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}
// Device detection also covers Chrome/Firefox on iOS and iPad desktop-mode UA.
// Feature detection, not an OS version guess, chooses the native scroll timeline.
export function appleHeroScrollMode(view = window) {
  const { userAgent = '', maxTouchPoints = 0 } = view.navigator || {};
  const appleTouch = /iPhone|iPad|iPod/.test(userAgent)
    || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (!appleTouch) return 'standard';
  return view.CSS?.supports('animation-timeline', 'scroll(root block)')
    && view.CSS.supports('animation-range', '0px 150svh') ? 'native' : 'normalized';
}
// Some iOS browser shells resize even small-viewport units while their toolbar
// animates. Keep layout and timeline distance on one snapshot until rotation.
export function lockHeroViewport(hero, view = window) {
  if (!hero) return;
  let width = view.innerWidth;
  const measure = () => {
    hero.style.removeProperty('--hero-height');
    const height = hero.getBoundingClientRect().height;
    if (height > 0) {
      hero.style.setProperty('--hero-height', `${height}px`);
      hero.style.setProperty('--hero-reveal-distance', `${height * 1.5}px`);
    }
  };
  measure();
  view.addEventListener('resize', () => {
    if (width === view.innerWidth) return;
    width = view.innerWidth;
    measure();
  }, { passive: true });
}
// Match the CSS policy, including wide iPads and Android tablets in landscape.
export function usesTouchLayout(view = window) {
  return view.innerWidth <= 1000 || Boolean(view.matchMedia?.('(any-pointer: coarse)').matches);
}
export function particleScale(canvas, rasterSize, logoSize, touch, viewportWidth) {
  return touch ? Math.min(canvas.width * 0.95, canvas.height * 0.75) / rasterSize
    : Math.min(viewportWidth / 1920, 1) * logoSize / rasterSize;
}
export function meaningfulResize(previous, next, touch) {
  return previous.width !== next.width || (!touch && previous.height !== next.height);
}
export function canvasSize(width, height, dpr = 1) {
  const ratio = Math.min(dpr || 1, 1.5, 1024 / Math.max(1, width, height));
  return { width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio)) };
}
export function pieFrame(progress, multiplier) {
  const value = clamp(progress);
  return { fill: clamp(value * 2), scale: 1 + clamp((value - 0.5) * 2) * multiplier };
}
export function clientMotion(viewportTop) {
  const progress = clamp((0.95 - viewportTop) / 0.3 + 1e-9);
  return { opacity: progress, offset: 14 * (1 - progress) };
}
