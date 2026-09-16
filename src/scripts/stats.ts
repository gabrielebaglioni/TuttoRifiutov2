import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// initialization
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    ScrollTrigger.refresh();
    initStatsAnimation();
  }, 100);
});

// stats items slide in from right on scroll
function initStatsAnimation() {
  const statItems = document.querySelectorAll(".stat-item");

  statItems.forEach((item) => {
    ScrollTrigger.create({
      trigger: item,
      start: "top bottom",
      end: "top 25%",
      scrub: true,
      onUpdate: (self) => {
        gsap.set(item, { x: 250 - self.progress * 250 });
      },
    });
  });
}
