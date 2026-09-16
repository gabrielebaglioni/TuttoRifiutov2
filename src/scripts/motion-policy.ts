interface MotionView {
  innerWidth: number;
  navigator?: { userAgent?: string; maxTouchPoints?: number };
  CSS?: { supports(property: string, value: string): boolean };
  matchMedia?(query: string): { matches: boolean };
  addEventListener(type: "resize", listener: () => void, options?: AddEventListenerOptions): void;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface MotionFrame {
  fill: number;
  scale: number;
}

export interface ClientMotionFrame {
  opacity: number;
  offset: number;
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));
export function prefersReducedMotion(view: Pick<MotionView, "matchMedia"> = window): boolean {
  return Boolean(view.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}
// Device detection also covers Chrome/Firefox on iOS and iPad desktop-mode UA.
// Feature detection, not an OS version guess, chooses the native scroll timeline.
export function appleHeroScrollMode(view: Pick<MotionView, "navigator" | "CSS"> = window): "standard" | "native" | "normalized" {
  const { userAgent = '', maxTouchPoints = 0 } = view.navigator || {};
  const appleTouch = /iPhone|iPad|iPod/.test(userAgent)
    || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (!appleTouch) return 'standard';
  return view.CSS?.supports('animation-timeline', 'scroll(root block)')
    && view.CSS.supports('animation-range', '0px 150svh') ? 'native' : 'normalized';
}
// Some iOS browser shells resize even small-viewport units while their toolbar
// animates. Keep layout and timeline distance on one snapshot until rotation.
export function lockHeroViewport(hero: HTMLElement | null, view: Pick<MotionView, "innerWidth" | "addEventListener"> = window): void {
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
export function usesTouchLayout(view: Pick<MotionView, "innerWidth" | "matchMedia"> = window): boolean {
  return view.innerWidth <= 1000 || Boolean(view.matchMedia?.('(any-pointer: coarse)').matches);
}
export function particleScale(canvas: Pick<HTMLCanvasElement, "width" | "height">, rasterSize: number, logoSize: number, touch: boolean, viewportWidth: number): number {
  return touch ? Math.min(canvas.width * 0.95, canvas.height * 0.75) / rasterSize
    : Math.min(viewportWidth / 1920, 1) * logoSize / rasterSize;
}
export function meaningfulResize(previous: ViewportSize, next: ViewportSize, touch: boolean): boolean {
  return previous.width !== next.width || (!touch && previous.height !== next.height);
}
export function canvasSize(width: number, height: number, dpr = 1): ViewportSize {
  const ratio = Math.min(dpr || 1, 1.5, 1024 / Math.max(1, width, height));
  return { width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio)) };
}
export function pieFrame(progress: number, multiplier: number): MotionFrame {
  const value = clamp(progress);
  return { fill: clamp(value * 2), scale: 1 + clamp((value - 0.5) * 2) * multiplier };
}
export function clientMotion(viewportTop: number): ClientMotionFrame {
  const progress = clamp((0.95 - viewportTop) / 0.3 + 1e-9);
  return { opacity: progress, offset: 14 * (1 - progress) };
}
