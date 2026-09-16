import type { gsap as Gsap } from "gsap";

// Sequence boundaries belong to the animation itself, not absolute timestamps.
export function runEventTransition(
  gsap: typeof Gsap,
  blocks: gsap.TweenTarget,
  onCovered: () => void,
  onComplete: () => void,
): gsap.core.Timeline {
  return gsap.timeline({ onComplete })
    .to(blocks, { opacity: 1, duration: 0.15, stagger: { amount: 0.3, from: "random" }, ease: "none" })
    .call(onCovered)
    .to(blocks, { opacity: 0, duration: 0.45, stagger: { amount: 0.85, from: "random" }, ease: "power1.out" });
}
