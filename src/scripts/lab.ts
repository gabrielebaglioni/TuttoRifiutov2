import gsap from "gsap";
import { usesTouchLayout, appleHeroScrollMode, lockHeroViewport, prefersReducedMotion } from "./motion-policy.ts";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const scrollTriggerConfig = {
  trigger: ".lab-hero",
  start: "top top",
  end: "150% top",
  scrub: true,
};

// Preserve the slanted reveal using a fixed polygon scaled from its bottom,
// without changing/rasterizing clip-path on every touch frame.
const appleMode = appleHeroScrollMode();
if (!prefersReducedMotion()) {
if (appleMode !== 'standard') lockHeroViewport(document.querySelector('.lab-hero'));
const nativeHero = appleMode === 'native';
if (nativeHero) {
  document.querySelector('.lab-hero')?.classList.add('has-native-hero-scroll');
} else if (usesTouchLayout()) {
  gsap.fromTo(".lab-about-revealer", {
    scaleY: 0,
    transformOrigin: "50% 100%",
    clipPath: "polygon(0% 100%, 100% 100%, 100% -25%, 0% 0%)",
    willChange: "transform",
  }, { scaleY: 1, ease: "none", scrollTrigger: scrollTriggerConfig });
} else gsap.to(".lab-about-revealer", {
  clipPath: "polygon(0% 100%, 100% 100%, 100% -25%, 0% 0%)",
  ease: "none",
  scrollTrigger: scrollTriggerConfig,
});

// overlay - fades in as hero scrolls
if (!nativeHero) gsap.to(".lab-hero-overlay", {
  opacity: 1,
  ease: "none",
  scrollTrigger: scrollTriggerConfig,
});
}
