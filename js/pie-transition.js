import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

// state
const STATE = {
  svg: null,
  container: null,
  pieGroup: null,
  dotsGroup: null,
  headerSplit: null,
};

let scaleMultiplier = window.innerWidth < 1000 ? 7 : 6;
const ZOOM_ORIGIN = {
  x: 400,
  y: 330,
};
const LOGO_BOX = {
  x: -20,
  y: -204,
  width: 840,
  height: 1208,
  path: "/work/qia.png",
};
const PIE_RADIUS = 604;
const DOT_RADIUS = 600;
const DOT_COUNT = 3500;

// initialization
document.addEventListener("DOMContentLoaded", init);

function init() {
  STATE.container = document.querySelector(".pie-transition");
  if (!STATE.container) return;

  createSVG();
  createDots();
  createPie();
  setupHeader();
  setupScrollTrigger();

  window.addEventListener("resize", handleResize);
}

// svg setup
function createSVG() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 800 800");
  svg.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(80vw, 80vh);
    height: min(80vw, 80vh);
    overflow: visible;
  `;
  STATE.svg = svg;
  STATE.container.appendChild(svg);
}

// random dots background
function createDots() {
  const dotsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  dotsGroup.style.transformOrigin = `${ZOOM_ORIGIN.x}px ${ZOOM_ORIGIN.y}px`;
  dotsGroup.setAttribute("id", "pie-transition-dots-group");
  dotsGroup.setAttribute("mask", "url(#pie-transition-logo-mask)");
  STATE.dotsGroup = dotsGroup;

  for (let i = 0; i < DOT_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * DOT_RADIUS;
    const x = 400 + Math.cos(angle) * distance;
    const y = 400 + Math.sin(angle) * distance;

    const dot = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", y);
    dot.setAttribute("r", "1");
    dot.setAttribute("fill", "#2444D9");
    dotsGroup.appendChild(dot);
  }

  STATE.svg.appendChild(dotsGroup);
}

// pie chart with mask
function createPie() {
  const pieGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  pieGroup.style.transformOrigin = `${ZOOM_ORIGIN.x}px ${ZOOM_ORIGIN.y}px`;
  pieGroup.setAttribute("id", "pie-transition-pie-group");
  pieGroup.setAttribute("mask", "url(#pie-transition-logo-mask)");
  STATE.pieGroup = pieGroup;

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const mask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
  mask.setAttribute("id", "pie-transition-mask");

  const maskBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  maskBg.setAttribute("x", "0");
  maskBg.setAttribute("y", "0");
  maskBg.setAttribute("width", "800");
  maskBg.setAttribute("height", "800");
  maskBg.setAttribute("fill", "black");

  const slicePath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  slicePath.setAttribute("fill", "white");
  slicePath.setAttribute("id", "pie-transition-slice");
  slicePath.setAttribute("d", "");

  mask.appendChild(maskBg);
  mask.appendChild(slicePath);
  defs.appendChild(mask);

  const logoMask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
  logoMask.setAttribute("id", "pie-transition-logo-mask");
  logoMask.setAttribute("maskUnits", "userSpaceOnUse");
  logoMask.setAttribute("x", "0");
  logoMask.setAttribute("y", "0");
  logoMask.setAttribute("width", "800");
  logoMask.setAttribute("height", "800");
  logoMask.setAttribute("mask-type", "alpha");
  logoMask.style.maskType = "alpha";

  const logoMaskImage = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "image",
  );
  logoMaskImage.setAttribute("href", LOGO_BOX.path);
  logoMaskImage.setAttributeNS(
    "http://www.w3.org/1999/xlink",
    "href",
    LOGO_BOX.path,
  );
  logoMaskImage.setAttribute("x", `${LOGO_BOX.x}`);
  logoMaskImage.setAttribute("y", `${LOGO_BOX.y}`);
  logoMaskImage.setAttribute("width", `${LOGO_BOX.width}`);
  logoMaskImage.setAttribute("height", `${LOGO_BOX.height}`);
  logoMaskImage.setAttribute("preserveAspectRatio", "xMidYMid meet");
  logoMask.appendChild(logoMaskImage);
  defs.appendChild(logoMask);

  const logoFill = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  logoFill.setAttribute("x", "0");
  logoFill.setAttribute("y", "0");
  logoFill.setAttribute("width", "800");
  logoFill.setAttribute("height", "800");
  logoFill.setAttribute("fill", "#2444D9");
  logoFill.setAttribute("mask", "url(#pie-transition-mask)");

  pieGroup.appendChild(logoFill);
  STATE.svg.appendChild(defs);
  STATE.svg.appendChild(pieGroup);
}

// header text split
function setupHeader() {
  const header = document.querySelector(".pie-transition-outro-header h3");
  if (!header) return;

  STATE.headerSplit = SplitText.create(header, {
    type: "words",
    wordsClass: "pie-transition-word",
  });

  gsap.set(STATE.headerSplit.words, { opacity: 0 });
}

// scroll-driven animation
function setupScrollTrigger() {
  ScrollTrigger.create({
    trigger: ".pie-transition",
    start: "top top",
    end: `+=${window.innerHeight * 5}`,
    scrub: true,
    pin: true,
    pinSpacing: true,
    onUpdate: (self) => {
      const progress = self.progress;

      // pie fill (0-50%)
      if (progress <= 0.5) {
        updatePieFill(progress / 0.5);
      } else {
        updatePieFill(1);
      }

      // scale up (50-100%)
      if (progress >= 0.5) {
        const scaleProgress = (progress - 0.5) / 0.5;
        const scale = 1 + scaleProgress * scaleMultiplier;
        STATE.pieGroup.style.transform = `scale(${scale})`;
        STATE.dotsGroup.style.transform = `scale(${scale})`;
      } else {
        STATE.pieGroup.style.transform = `scale(1)`;
        STATE.dotsGroup.style.transform = `scale(1)`;
      }

      // header reveal (75-95%)
      if (STATE.headerSplit && STATE.headerSplit.words.length > 0) {
        if (progress >= 0.75 && progress <= 0.95) {
          const textProgress = (progress - 0.75) / 0.2;
          const totalWords = STATE.headerSplit.words.length;

          STATE.headerSplit.words.forEach((word, index) => {
            const wordRevealProgress = index / totalWords;
            gsap.set(word, {
              opacity: textProgress >= wordRevealProgress ? 1 : 0,
            });
          });
        } else if (progress < 0.75) {
          gsap.set(STATE.headerSplit.words, { opacity: 0 });
        } else if (progress > 0.95) {
          gsap.set(STATE.headerSplit.words, { opacity: 1 });
        }
      }
    },
  });
}

// update pie slice path
function updatePieFill(progress) {
  const slice = document.getElementById("pie-transition-slice");
  const angle = progress * 360;

  if (angle === 0) {
    slice.setAttribute("d", "");
    return;
  }

  if (angle >= 360) {
    slice.setAttribute(
      "d",
      `
      M 400,400
      m -${PIE_RADIUS},0
      a ${PIE_RADIUS},${PIE_RADIUS} 0 1,0 ${PIE_RADIUS * 2},0
      a ${PIE_RADIUS},${PIE_RADIUS} 0 1,0 -${PIE_RADIUS * 2},0
    `,
    );
    return;
  }

  const startAngle = -90;
  const endAngle = startAngle + angle;
  const x1 = 400 + PIE_RADIUS * Math.cos((startAngle * Math.PI) / 180);
  const y1 = 400 + PIE_RADIUS * Math.sin((startAngle * Math.PI) / 180);
  const x2 = 400 + PIE_RADIUS * Math.cos((endAngle * Math.PI) / 180);
  const y2 = 400 + PIE_RADIUS * Math.sin((endAngle * Math.PI) / 180);
  const largeArc = angle > 180 ? 1 : 0;

  slice.setAttribute(
    "d",
    `
    M 400,400
    L ${x1},${y1}
    A ${PIE_RADIUS},${PIE_RADIUS} 0 ${largeArc} 1 ${x2},${y2}
    Z
  `,
  );
}

// resize handler
function handleResize() {
  scaleMultiplier = window.innerWidth < 1000 ? 7 : 6;
  ScrollTrigger.refresh();
}
