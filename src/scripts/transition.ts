import gsap from "gsap";
import { usesTouchLayout, prefersReducedMotion } from "./motion-policy.ts";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { playMenuSound } from "./menu-audio.ts";

gsap.registerPlugin(ScrollTrigger);

let blocks: Array<{ element: HTMLElement }> = [];

// initialization
document.addEventListener("DOMContentLoaded", init);

function init() {
  const transitionGrid = document.querySelector<HTMLElement>(".transition-grid");
  if (!transitionGrid) return;

  let isPageNavigation = false;
  try { isPageNavigation = sessionStorage.getItem("pageTransition") === "true"; }
  catch { /* Navigation does not require storage. */ }
  const blockElements = Array.from(
    transitionGrid.querySelectorAll<HTMLElement>(".transition-block"),
  );
  blocks = blockElements.map((block) => ({ element: block }));

  if (isPageNavigation) {
    try { sessionStorage.removeItem("pageTransition"); } catch { /* Optional hint. */ }
    const style = document.querySelector("style[data-transition]");
    if (style) style.remove();

    gsap.set(blockElements, { opacity: 1 });
    const startReveal = () => {
      transitionGrid.style.backgroundColor = "";
      reveal();
    };
    // Let the destination paint its covered state before dissolving it.
    if (usesTouchLayout()) requestAnimationFrame(() => requestAnimationFrame(startReveal));
    else setTimeout(startReveal, 300);
  } else {
    gsap.set(blockElements, { opacity: 0 });
  }

  setupLinkHandlers();
}

// animate blocks to cover screen before navigation
function animateOut() {
  if (prefersReducedMotion()) return Promise.resolve();
  const mobile = usesTouchLayout();
  return new Promise<void>((resolve) => {
    const blockElements = blocks.map((b) => b.element);
    const transitionGrid = document.querySelector<HTMLElement>(".transition-grid");

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
        duration: mobile ? 0.04 : 0.075,
        ease: "power2.inOut",
        delay: index * (mobile ? 0.008 : 0.025),
        repeat: 1,
        yoyo: true,
        onComplete: () => {
          gsap.set(block, { opacity: 1 });
          if (index === shuffled.length - 1) {
            if (mobile) resolve();
            else setTimeout(() => resolve(), 300);
          }
        },
      });
    });
  });
}

// reveal page by animating blocks away
function reveal() {
  const mobile = usesTouchLayout();
  const blockElements = blocks.map((b) => b.element);
  if (blockElements.length === 0) return;

  const transitionGrid = document.querySelector<HTMLElement>(".transition-grid");
  if (prefersReducedMotion()) {
    gsap.set(blockElements, { opacity: 0 });
    if (transitionGrid) transitionGrid.style.pointerEvents = "none";
    return;
  }
  const shuffled = [...blockElements].sort(() => Math.random() - 0.5);

  shuffled.forEach((block, index) => {
    gsap.to(block, {
      opacity: 0,
      duration: mobile ? 0.12 : 0.075,
      ease: "power2.inOut",
      delay: index * (mobile ? 0.035 : 0.025),
      repeat: 1,
      yoyo: true,
      onComplete: () => {
        gsap.set(block, { opacity: 0 });
        if (index === shuffled.length - 1) {
          if (transitionGrid) transitionGrid.style.pointerEvents = "none";
          ScrollTrigger.sort();
          ScrollTrigger.refresh(true);
        }
      },
    });
  });
}

// link utilities
function isExternalLink(href: string | null) {
  if (!href) return false;
  return (
    href.startsWith("http") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("#")
  );
}

function isSamePage(href: string | null) {
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
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    isTransitioning = false;
    const grid = document.querySelector<HTMLElement>('.transition-grid');
    gsap.killTweensOf?.(blocks.map(block => block.element));
    gsap.set(blocks.map(block => block.element), { opacity: 0 });
    if (grid) { grid.style.pointerEvents = 'none'; grid.style.backgroundColor = ''; }
    try { sessionStorage.removeItem('pageTransition'); } catch { /* Optional hint. */ }
  });

  const handleLinkClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (event.button != null && event.button !== 0)) return;
    if (isTransitioning) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a');
    if (!link) return;
    if (link.hasAttribute('download') || (link.target && link.target !== '_self')) return;

    // This capture handler stops propagation: play here, before interception,
    // so mouse, touch and keyboard activation all receive the same feedback.
    if (link.closest(".menu-overlay")) playMenuSound("select");

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

    const transitionGrid = document.querySelector<HTMLElement>(".transition-grid");
    if (transitionGrid) transitionGrid.style.pointerEvents = "auto";

    try { sessionStorage.setItem("pageTransition", "true"); } catch { /* Still navigate. */ }

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
