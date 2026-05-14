import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// initialization
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    initFooterParallax();
    ScrollTrigger.refresh();
  }, 150);
});

// footer parallax - slides up as it enters viewport
function initFooterParallax() {
  const footerContainer = document.querySelector(".footer-container");
  if (!footerContainer) return;

  ScrollTrigger.create({
    trigger: "footer",
    start: "top bottom",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      const yValue = -35 * (1 - self.progress);
      gsap.set(footerContainer, { y: `${yValue}%` });
    },
  });
}
