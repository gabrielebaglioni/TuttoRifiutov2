import gsap from "gsap";
import { prefersReducedMotion } from './motion-policy.ts';
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// initialization
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    initFooterParallax();
    ScrollTrigger.refresh(true);
  }, 150);
});

// footer parallax - slides up as it enters viewport
function initFooterParallax() {
  const footerContainer = document.querySelector(".footer-container");
  if (!footerContainer) return;
  const menu = document.querySelector(".menu-toggle-btn");
  const darkSurfaces = document.querySelectorAll('footer, .lab-about, .pie-transition');
  const updateContrast = () => {
    if (!menu) return;
    const cap = menu.getBoundingClientRect();
    const sampleY = (cap.top + Math.min(cap.bottom, window.innerHeight)) / 2;
    menu.classList.toggle("is-over-footer", [...darkSurfaces].some(surface => {
      const bounds = surface.getBoundingClientRect();
      return bounds.top <= sampleY && bounds.bottom > sampleY;
    }));
  };
  // Contrast is independent of the footer's parallax range and works on a
  // restored scroll position, reverse scroll and native Android/iPad scrolling.
  let contrastQueued = false;
  const queueContrast = () => {
    if (contrastQueued) return;
    contrastQueued = true;
    requestAnimationFrame(() => { contrastQueued = false; updateContrast(); });
  };
  window.addEventListener('scroll', queueContrast, { passive: true });
  window.addEventListener('resize', queueContrast, { passive: true });
  updateContrast();

  if (prefersReducedMotion()) {
    gsap.set(footerContainer, { y: 0 });
    return;
  }

  ScrollTrigger.create({
    trigger: "footer",
    start: "top bottom",
    end: "bottom bottom",
    scrub: true,
    onRefresh: updateContrast,
    onUpdate: (self) => {
      updateContrast();
      const yValue = -35 * (1 - self.progress);
      gsap.set(footerContainer, { y: `${yValue}%` });
    },
  });
}
