import gsap from "gsap";
import { prefersReducedMotion } from './motion-policy.ts';
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// configuration
const CONFIG = {
  // le icone ciclano nell'ordine della bio: parole, suoni, immagini,
  // pellicole, fantasie — più la firma del collettivo (logo).
  icons: [
    "/contact/tr_paper.svg",    // parole
    "/contact/tr_music.svg",    // suoni
    "/contact/tr_brush.svg",    // immagini
    "/contact/tr_film.svg",     // pellicole
    "/contact/tr_notebook.svg", // fantasie
    "/logo-cropped.png",        // collettivo
  ],
  cloneCount: 10,
  gapMin: 1,
  gapMax: 10,
  rowThreshold: 25,
  // ampiezza (in px di scroll) della finestra di animazione della gap,
  // simmetrica attorno al centro viewport (dove sta l'icona).
  // windowPx piccolo = texts si separano solo in prossimità dell'icona
  gapWindowPx: 120,
  mobileBreakpoint: 1000,
};

let currentIconIndex = 0;
let lastCenteredRow: Element | null = null;
let gapScrollTriggers: ScrollTrigger[] = [];
let isMobile = window.innerWidth < CONFIG.mobileBreakpoint;

// initialization
document.addEventListener("DOMContentLoaded", () => {
  const contactVisual = document.querySelector(".contact-visual");
  const contactVisualIcon = document.querySelector<HTMLImageElement>(".contact-visual-icon img");
  const contactInfo = document.querySelector(".contact-info");

  updateClocks();
  setInterval(updateClocks, 1000);
  if (prefersReducedMotion()) return;

  if (!contactInfo || !contactVisualIcon) return;
  createClones(contactInfo);

  waitForLenis(() => {
    initGapAnimations(contactVisual);
    trackCenterRow(contactVisualIcon);
  });

  window.addEventListener("resize", () => handleResize(contactVisual));
});

// clock - updates all contact clocks with Rome time
const romeClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23', timeZoneName: 'short',
});
function getRomeTime() {
  const parts = romeClock.formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('hour')}:${part('minute')} ${part('timeZoneName')}`;
}

function updateClocks() {
  const timeString = getRomeTime();
  document.querySelectorAll(".contact-clock").forEach((clock) => {
    clock.textContent = timeString;
  });
}

// clone contact info rows for infinite scroll
function createClones(contactInfo: Element) {
  for (let i = 0; i < CONFIG.cloneCount; i++) {
    const clone = contactInfo.cloneNode(true);
    contactInfo.parentElement?.appendChild(clone);
  }
}

// icon cycling - changes icon when new row enters center
function changeIcon(contactVisualIcon: HTMLImageElement) {
  currentIconIndex = (currentIconIndex + 1) % CONFIG.icons.length;
  const source = CONFIG.icons[currentIconIndex];
  if (source) contactVisualIcon.src = source;
}

function trackCenterRow(contactVisualIcon: HTMLImageElement) {
  window.lenis?.on("scroll", () => {
    const viewportCenter = window.innerHeight / 2;
    const rows = document.querySelectorAll<HTMLElement>(".contact-info-row");

    let closestRow: Element | null = null;
    let minDistance = Infinity;

    rows.forEach((row) => {
      const rect = row.getBoundingClientRect();
      const rowCenter = rect.top + rect.height / 2;
      const distance = Math.abs(rowCenter - viewportCenter);

      if (distance < minDistance && distance < CONFIG.rowThreshold) {
        minDistance = distance;
        closestRow = row;
      }
    });

    if (closestRow && closestRow !== lastCenteredRow) {
      lastCenteredRow = closestRow;
      changeIcon(contactVisualIcon);
    }
  });
}

// gap animations — la gap tra i due <p> sale a campana (sin) con picco
// esatto nel punto in cui il centro della riga passa sul centro schermo
// (dove sta l'icona fissa di .contact-visual).
function resetRowGaps() {
  document.querySelectorAll<HTMLElement>(".contact-info-row").forEach((row) => {
    row.style.gap = `${CONFIG.gapMin}rem`;
  });
}

function killGapAnimations() {
  gapScrollTriggers.forEach((trigger) => trigger.kill());
  gapScrollTriggers = [];
  resetRowGaps();
}

function initGapAnimations(_contactVisual: Element | null) {
  killGapAnimations();

  if (isMobile) return;

  const w = CONFIG.gapWindowPx;

  document.querySelectorAll<HTMLElement>(".contact-info-row").forEach((row) => {
    const trigger = ScrollTrigger.create({
      trigger: row,
      // start: centro riga W px sotto il centro viewport (row in arrivo)
      // end:   centro riga W px sopra il centro viewport (row in uscita)
      // a progress=0.5 il centro riga è sul centro schermo = sull'icona.
      start: `center center+=${w}`,
      end: `center center-=${w}`,
      scrub: true,
      onUpdate: (self) => {
        const bell = Math.sin(self.progress * Math.PI);
        const currentGap =
          CONFIG.gapMin + (CONFIG.gapMax - CONFIG.gapMin) * bell;
        row.style.gap = `${currentGap}rem`;
      },
    });

    gapScrollTriggers.push(trigger);
  });
}

// resize handler - reinit gap animations on breakpoint change
function handleResize(contactVisual: Element | null) {
  const wasMobile = isMobile;
  isMobile = window.innerWidth < CONFIG.mobileBreakpoint;

  if (wasMobile !== isMobile) {
    initGapAnimations(contactVisual);
  }
}

// wait for Lenis to be available and enable infinite scroll
function waitForLenis(callback: () => void) {
  const checkLenis = setInterval(() => {
    if (window.lenis) {
      clearInterval(checkLenis);
      window.lenis.options.infinite = true;
      callback();
    }
  }, 100);
}
