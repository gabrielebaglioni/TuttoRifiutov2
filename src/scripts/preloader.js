import gsap from "gsap";
import { prefersReducedMotion } from './motion-policy.js';
import { contentReady } from './content-hydration.js';
import { ensureCollectionsReadiness } from './collections-readiness.js';
import { waitForInitialResources } from './loading-readiness.js';

function trackInitialLoad(onProgress) {
  return waitForInitialResources({ documentRef: document, readiness: [document.fonts?.ready, contentReady, ensureCollectionsReadiness(window).promise], onProgress });
}
let resolvePreloader;
export const preloaderReady = new Promise((resolve) => { resolvePreloader = resolve; });

// initialization
document.addEventListener("DOMContentLoaded", init);

function init() {
  let hasSeenPreloader = false;
  try { hasSeenPreloader = sessionStorage.getItem("preloaderSeen") === "true"; }
  catch { /* Storage is optional in private/embedded browser contexts. */ }
  const preloader = document.querySelector(".preloader");

  if (!preloader) { resolvePreloader(); return; }

  if (hasSeenPreloader || prefersReducedMotion()) {
    preloader.style.display = "none";
    resolvePreloader();
    return;
  }

  startSequence();
}

// The percentage measures completed initial-readiness tasks, never elapsed time.
function startSequence() {
  const progressIndicator = document.querySelector(".progress-bar-indicator");
  const progressText = document.querySelector(".progress-bar-copy span");
  const progressBar = document.querySelector(".progress-bar");
  if (!progressIndicator || !progressText || !progressBar) {
    document.querySelector(".preloader")?.remove();
    resolvePreloader();
    return;
  }
  gsap.set(progressBar, { opacity: 1 });
  trackInitialLoad((percent) => {
    progressIndicator.style.setProperty("--progress", String(percent / 100));
    progressText.textContent = String(percent);
  }).then((result) => {
    document.querySelector(".preloader")?.setAttribute("data-loading-status", result.status);
    complete();
  });
}

// complete and remove preloader with flicker animations
function complete() {
  const preloader = document.querySelector(".preloader");
  const progressBar = document.querySelector(".progress-bar");
  const preloaderBlocks = document.querySelectorAll(".preloader-block");

  if (!preloader) { resolvePreloader(); return; }

  try { sessionStorage.setItem("preloaderSeen", "true"); } catch { /* Continue revealing. */ }
  if (!preloaderBlocks.length) {
    preloader.style.display = "none";
    resolvePreloader();
    return;
  }

  gsap.to(progressBar, {
    opacity: 0,
    duration: 0.075,
    ease: "power2.inOut",
    delay: 0.3,
    repeat: 1,
    yoyo: true,
    onComplete: () => {
      gsap.set(progressBar, { opacity: 0 });

      setTimeout(() => {
        const shuffledBlocks = [...preloaderBlocks].sort(
          () => Math.random() - 0.5,
        );

        shuffledBlocks.forEach((block, index) => {
          gsap.to(block, {
            opacity: 0,
            duration: 0.075,
            ease: "power2.inOut",
            delay: index * 0.025,
            repeat: 1,
            yoyo: true,
            onComplete: () => {
              gsap.set(block, { opacity: 0 });
              if (index === shuffledBlocks.length - 1) {
                preloader.style.display = "none";
                resolvePreloader();
              }
            },
          });
        });
      }, 200);
    },
  });
}
