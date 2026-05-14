import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

const STATE = {
  svg: null,
  container: null,
  pieGroup: null,
  dotsGroup: null,
  headerSplit: null,
  scrollTrigger: null,
};

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

const ZOOM_ORIGIN = { x: 410, y: 330 };
const LOGO_BOX = {
  x: -20,
  y: -204,
  width: 840,
  height: 1208,
  /** Asset raw: evita pipeline che può alterare l’alpha della maschera */
  path: new URL("../assets/work/qia.png", import.meta.url).href,
};

const PIE_RADIUS = 604;
const DOT_RADIUS = 600;
const DOT_COUNT = 3500;
const PIN_LENGTH_VIEWPORTS = 5;

const LOGO_FILL_COLOR = "#2444D9";

let scaleMultiplier = window.innerWidth < 1000 ? 7 : 6;

function createSvgElement(tagName) {
  return document.createElementNS(SVG_NS, tagName);
}

document.addEventListener("DOMContentLoaded", init);

function init() {
  STATE.container = document.querySelector(".pie-transition");
  if (!STATE.container) return;

  createSVG();
  /** defs prima dei layer che usano url(#…‑mask): così la sagoma PNG si applica ai puntini */
  appendMaskDefs();
  createDots();
  createPieGroup();
  setupHeader();
  setupScrollTrigger();

  window.addEventListener("resize", handleResize);
}

function createSVG() {
  const svg = createSvgElement("svg");
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

function appendMaskDefs() {
  const defs = createSvgElement("defs");

  const mask = createSvgElement("mask");
  mask.setAttribute("id", "pie-transition-mask");
  mask.setAttribute("maskUnits", "userSpaceOnUse");
  mask.setAttribute("maskContentUnits", "userSpaceOnUse");

  const maskBg = createSvgElement("rect");
  maskBg.setAttribute("x", "0");
  maskBg.setAttribute("y", "0");
  maskBg.setAttribute("width", "800");
  maskBg.setAttribute("height", "800");
  maskBg.setAttribute("fill", "black");

  const slicePath = createSvgElement("path");
  slicePath.setAttribute("fill", "white");
  slicePath.setAttribute("id", "pie-transition-slice");
  slicePath.setAttribute("d", "");

  mask.appendChild(maskBg);
  mask.appendChild(slicePath);
  defs.appendChild(mask);

  const logoMask = createSvgElement("mask");
  logoMask.setAttribute("id", "pie-transition-logo-mask");
  logoMask.setAttribute("maskUnits", "userSpaceOnUse");
  logoMask.setAttribute("maskContentUnits", "userSpaceOnUse");
  logoMask.setAttribute("x", "0");
  logoMask.setAttribute("y", "0");
  logoMask.setAttribute("width", "800");
  logoMask.setAttribute("height", "800");
  logoMask.setAttribute("mask-type", "alpha");
  logoMask.style.maskType = "alpha";

  const logoMaskImage = createSvgElement("image");
  logoMaskImage.setAttribute("href", LOGO_BOX.path);
  logoMaskImage.setAttributeNS(XLINK_NS, "href", LOGO_BOX.path);
  logoMaskImage.setAttribute("x", String(LOGO_BOX.x));
  logoMaskImage.setAttribute("y", String(LOGO_BOX.y));
  logoMaskImage.setAttribute("width", String(LOGO_BOX.width));
  logoMaskImage.setAttribute("height", String(LOGO_BOX.height));
  logoMaskImage.setAttribute("preserveAspectRatio", "xMidYMid meet");
  logoMaskImage.setAttribute("decoding", "async");
  logoMask.appendChild(logoMaskImage);
  defs.appendChild(logoMask);

  STATE.svg.appendChild(defs);

  if (typeof logoMaskImage.decode === "function") {
    logoMaskImage.decode().then(() => ScrollTrigger.refresh()).catch(() => {});
  }
}

function createDots() {
  const dotsGroup = createSvgElement("g");
  dotsGroup.style.transformOrigin = `${ZOOM_ORIGIN.x}px ${ZOOM_ORIGIN.y}px`;
  dotsGroup.style.transformBox = "view-box";
  dotsGroup.setAttribute("id", "pie-transition-dots-group");
  dotsGroup.setAttribute("mask", "url(#pie-transition-logo-mask)");
  STATE.dotsGroup = dotsGroup;

  for (let i = 0; i < DOT_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * DOT_RADIUS;
    const x = ZOOM_ORIGIN.x + Math.cos(angle) * distance;
    const y = ZOOM_ORIGIN.y + Math.sin(angle) * distance;

    const dot = createSvgElement("circle");
    dot.setAttribute("cx", String(x));
    dot.setAttribute("cy", String(y));
    dot.setAttribute("r", "1");
    dot.setAttribute("fill", LOGO_FILL_COLOR);
    dotsGroup.appendChild(dot);
  }

  STATE.svg.appendChild(dotsGroup);
}

function createPieGroup() {
  const pieGroup = createSvgElement("g");
  pieGroup.style.transformOrigin = `${ZOOM_ORIGIN.x}px ${ZOOM_ORIGIN.y}px`;
  pieGroup.style.transformBox = "view-box";
  pieGroup.setAttribute("id", "pie-transition-pie-group");
  pieGroup.setAttribute("mask", "url(#pie-transition-logo-mask)");
  STATE.pieGroup = pieGroup;

  const logoFill = createSvgElement("rect");
  logoFill.setAttribute("x", "0");
  logoFill.setAttribute("y", "0");
  logoFill.setAttribute("width", "800");
  logoFill.setAttribute("height", "800");
  logoFill.setAttribute("fill", LOGO_FILL_COLOR);
  logoFill.setAttribute("mask", "url(#pie-transition-mask)");

  pieGroup.appendChild(logoFill);
  STATE.svg.appendChild(pieGroup);
}

function setupHeader() {
  const header = STATE.container.querySelector(
    ".pie-transition-outro-header h3",
  );
  if (!header) return;

  STATE.headerSplit = SplitText.create(header, {
    type: "words",
    wordsClass: "pie-transition-word",
  });

  gsap.set(STATE.headerSplit.words, { opacity: 0 });
}

function setupScrollTrigger() {
  STATE.scrollTrigger = ScrollTrigger.create({
    trigger: STATE.container,
    start: "top top",
    end: () => `+=${window.innerHeight * PIN_LENGTH_VIEWPORTS}`,
    scrub: true,
    pin: true,
    pinSpacing: true,
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      const progress = self.progress;

      if (progress <= 0.5) {
        updatePieFill(progress / 0.5);
      } else {
        updatePieFill(1);
      }

      if (progress >= 0.5) {
        const scaleProgress = (progress - 0.5) / 0.5;
        const scale = 1 + scaleProgress * scaleMultiplier;
        STATE.pieGroup.style.transform = `scale(${scale})`;
        STATE.dotsGroup.style.transform = `scale(${scale})`;
      } else {
        STATE.pieGroup.style.transform = "scale(1)";
        STATE.dotsGroup.style.transform = "scale(1)";
      }

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

function updatePieFill(progress) {
  const slice = STATE.container.querySelector("#pie-transition-slice");
  if (!slice) return;

  const angle = progress * 360;

  if (angle === 0) {
    slice.setAttribute("d", "");
    return;
  }

  if (angle >= 360) {
    slice.setAttribute(
      "d",
      `
      M ${ZOOM_ORIGIN.x},${ZOOM_ORIGIN.y}
      m -${PIE_RADIUS},0
      a ${PIE_RADIUS},${PIE_RADIUS} 0 1,0 ${PIE_RADIUS * 2},0
      a ${PIE_RADIUS},${PIE_RADIUS} 0 1,0 -${PIE_RADIUS * 2},0
    `,
    );
    return;
  }

  const startAngle = -90;
  const endAngle = startAngle + angle;
  const x1 =
    ZOOM_ORIGIN.x + PIE_RADIUS * Math.cos((startAngle * Math.PI) / 180);
  const y1 =
    ZOOM_ORIGIN.y + PIE_RADIUS * Math.sin((startAngle * Math.PI) / 180);
  const x2 =
    ZOOM_ORIGIN.x + PIE_RADIUS * Math.cos((endAngle * Math.PI) / 180);
  const y2 =
    ZOOM_ORIGIN.y + PIE_RADIUS * Math.sin((endAngle * Math.PI) / 180);
  const largeArc = angle > 180 ? 1 : 0;

  slice.setAttribute(
    "d",
    `
    M ${ZOOM_ORIGIN.x},${ZOOM_ORIGIN.y}
    L ${x1},${y1}
    A ${PIE_RADIUS},${PIE_RADIUS} 0 ${largeArc} 1 ${x2},${y2}
    Z
  `,
  );
}

function handleResize() {
  scaleMultiplier = window.innerWidth < 1000 ? 7 : 6;
  ScrollTrigger.refresh();
}
