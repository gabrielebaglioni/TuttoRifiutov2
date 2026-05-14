import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const scrollTriggerConfig = {
  trigger: ".lab-hero",
  start: "top top",
  end: "150% top",
  scrub: true,
};

// revealer - clip path animates to reveal about section
gsap.to(".lab-about-revealer", {
  clipPath: "polygon(0% 100%, 100% 100%, 100% -25%, 0% 0%)",
  ease: "none",
  scrollTrigger: scrollTriggerConfig,
});

// overlay - fades in as hero scrolls
gsap.to(".lab-hero-overlay", {
  opacity: 1,
  ease: "none",
  scrollTrigger: scrollTriggerConfig,
});
