import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

let blocks = [];

// initialization
document.addEventListener("DOMContentLoaded", init);

function init() {
  const transitionGrid = document.querySelector(".transition-grid");
  if (!transitionGrid) return;

  const isPageNavigation = sessionStorage.getItem("pageTransition") === "true";
  const blockElements = Array.from(
    transitionGrid.querySelectorAll(".transition-block"),
  );
  blocks = blockElements.map((block) => ({ element: block }));

  if (isPageNavigation) {
    sessionStorage.removeItem("pageTransition");
    const style = document.querySelector("style[data-transition]");
    if (style) style.remove();

    gsap.set(blockElements, { opacity: 1 });
    setTimeout(() => {
      transitionGrid.style.backgroundColor = "";
      reveal();
    }, 300);
  } else {
    gsap.set(blockElements, { opacity: 0 });
  }

  setupLinkHandlers();
}

// animate blocks to cover screen before navigation
function animateOut() {
  return new Promise((resolve) => {
    const blockElements = blocks.map((b) => b.element);
    const transitionGrid = document.querySelector(".transition-grid");

    if (!blockElements.length || !transitionGrid) {
      setTimeout(() => resolve(), 100);
      return;
    }

    transitionGrid.style.pointerEvents = "auto";
    transitionGrid.style.zIndex = "1000";

    gsap.set(blockElements, { opacity: 0 });

    const shuffled = [...blockElements].sort(() => Math.random() - 0.5);

    shuffled.forEach((block, index) => {
      gsap.to(block, {
        opacity: 1,
        duration: 0.075,
        ease: "power2.inOut",
        delay: index * 0.025,
        repeat: 1,
        yoyo: true,
        onComplete: () => {
          gsap.set(block, { opacity: 1 });
          if (index === shuffled.length - 1) {
            setTimeout(() => resolve(), 300);
          }
        },
      });
    });
  });
}

// reveal page by animating blocks away
function reveal() {
  const blockElements = blocks.map((b) => b.element);
  if (blockElements.length === 0) return;

  const transitionGrid = document.querySelector(".transition-grid");
  const shuffled = [...blockElements].sort(() => Math.random() - 0.5);

  shuffled.forEach((block, index) => {
    gsap.to(block, {
      opacity: 0,
      duration: 0.075,
      ease: "power2.inOut",
      delay: index * 0.025,
      repeat: 1,
      yoyo: true,
      onComplete: () => {
        gsap.set(block, { opacity: 0 });
        if (index === shuffled.length - 1) {
          if (transitionGrid) transitionGrid.style.pointerEvents = "none";
          ScrollTrigger.refresh();
        }
      },
    });
  });
}

// link utilities
function isExternalLink(href) {
  if (!href) return false;
  return (
    href.startsWith("http") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("#")
  );
}

function isSamePage(href) {
  if (!href) return true;

  let current = window.location.pathname;
  current = current.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  if (current === "/index") current = "/";

  let target = href.trim();
  if (
    target === "/" ||
    target === "/index" ||
    target === "/index.html" ||
    target === "index.html" ||
    !target
  ) {
    target = "/";
  } else {
    if (!target.startsWith("/")) target = "/" + target;
    target = target.replace(/\.html$/, "").replace(/\/$/, "");
  }

  return current === target;
}

// click handler for internal navigation
function setupLinkHandlers() {
  let isTransitioning = false;

  const handleLinkClick = (event) => {
    if (isTransitioning) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const link = event.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href || isExternalLink(href)) return;

    if (isSamePage(href)) {
      event.preventDefault();
      event.stopPropagation();

      if (link.classList.contains("menu-segment")) {
        const toggleMenu = window.toggleMenu;
        if (toggleMenu && typeof toggleMenu === "function") toggleMenu();
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    isTransitioning = true;

    const transitionGrid = document.querySelector(".transition-grid");
    if (transitionGrid) transitionGrid.style.pointerEvents = "auto";

    sessionStorage.setItem("pageTransition", "true");

    animateOut()
      .then(() => {
        window.location.href = href;
      })
      .catch(() => {
        window.location.href = href;
      });
  };

  document.addEventListener("click", handleLinkClick, {
    capture: true,
    passive: false,
  });
}
