import gsap from "gsap";
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
let lastCenteredRow = null;
let gapScrollTriggers = [];
let isMobile = window.innerWidth < CONFIG.mobileBreakpoint;

// initialization
document.addEventListener("DOMContentLoaded", () => {
  const contactVisual = document.querySelector(".contact-visual");
  const contactVisualIcon = document.querySelector(".contact-visual-icon img");
  const contactInfo = document.querySelector(".contact-info");

  updateClocks();
  setInterval(updateClocks, 1000);

  createClones(contactInfo);

  waitForLenis(() => {
    initGapAnimations(contactVisual);
    trackCenterRow(contactVisualIcon);
  });

  window.addEventListener("resize", () => handleResize(contactVisual));
});

// clock - updates all contact clocks with Rome time
function getRomeTime() {
  const now = new Date();
  const romeTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Rome" }),
  );
  const hours = String(romeTime.getHours()).padStart(2, "0");
  const minutes = String(romeTime.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes} CET`;
}

function updateClocks() {
  const timeString = getRomeTime();
  document.querySelectorAll(".contact-clock").forEach((clock) => {
    clock.textContent = timeString;
  });
}

// clone contact info rows for infinite scroll
function createClones(contactInfo) {
  for (let i = 0; i < CONFIG.cloneCount; i++) {
    const clone = contactInfo.cloneNode(true);
    contactInfo.parentElement.appendChild(clone);
  }
}

// icon cycling - changes icon when new row enters center
function changeIcon(contactVisualIcon) {
  currentIconIndex = (currentIconIndex + 1) % CONFIG.icons.length;
  contactVisualIcon.src = CONFIG.icons[currentIconIndex];
}

function trackCenterRow(contactVisualIcon) {
  window.lenis.on("scroll", () => {
    const viewportCenter = window.innerHeight / 2;
    const rows = document.querySelectorAll(".contact-info-row");

    let closestRow = null;
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
  document.querySelectorAll(".contact-info-row").forEach((row) => {
    row.style.gap = `${CONFIG.gapMin}rem`;
  });
}

function killGapAnimations() {
  gapScrollTriggers.forEach((trigger) => trigger.kill());
  gapScrollTriggers = [];
  resetRowGaps();
}

function initGapAnimations(_contactVisual) {
  killGapAnimations();

  if (isMobile) return;

  const w = CONFIG.gapWindowPx;

  document.querySelectorAll(".contact-info-row").forEach((row) => {
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
function handleResize(contactVisual) {
  const wasMobile = isMobile;
  isMobile = window.innerWidth < CONFIG.mobileBreakpoint;

  if (wasMobile !== isMobile) {
    initGapAnimations(contactVisual);
  }
}

// wait for Lenis to be available and enable infinite scroll
function waitForLenis(callback) {
  const checkLenis = setInterval(() => {
    if (window.lenis) {
      clearInterval(checkLenis);
      window.lenis.options.infinite = true;
      callback();
    }
  }, 100);
}
