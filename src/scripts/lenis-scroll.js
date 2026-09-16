import Lenis from "lenis";
import { usesTouchLayout, appleHeroScrollMode, prefersReducedMotion } from "./motion-policy.ts";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

let lenis = null;

// initialization
document.addEventListener("DOMContentLoaded", () => initLenisScroll());

// smooth scroll setup with responsive config
function initLenisScroll() {
  if (prefersReducedMotion()) return;
  const appleMode = document.querySelector('.lab-hero') ? appleHeroScrollMode() : 'standard';
  if (appleMode !== 'standard') {
    // One scroll owner only: do not combine Lenis with iOS normalization.
    // Older WebKit needs scroll and JS-driven reveal on the same thread.
    if (appleMode === 'normalized') ScrollTrigger.normalizeScroll({
      type: 'touch', allowNestedScroll: true,
      ignore: document.querySelector('.menu-overlay'),
    });
    return;
  }
  const isMobile = usesTouchLayout();

  lenis = new Lenis({
    duration: isMobile ? 0.8 : 1.2,
    lerp: isMobile ? 0.075 : 0.1,
    smoothWheel: true,
    syncTouch: false,
    touchMultiplier: isMobile ? 1.5 : 2,
  });

  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  window.lenis = lenis;
}

export { lenis };
