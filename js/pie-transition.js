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

let scaleMultiplier = window.innerWidth < 1000 ? 3 : 2.5;

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
  dotsGroup.style.transformOrigin = "400px 400px";
  dotsGroup.setAttribute("id", "pie-transition-dots-group");
  STATE.dotsGroup = dotsGroup;

  for (let i = 0; i < 1500; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * 300;
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
  pieGroup.style.transformOrigin = "400px 400px";
  pieGroup.setAttribute("id", "pie-transition-pie-group");
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

  const solidCircle = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle",
  );
  solidCircle.setAttribute("cx", "400");
  solidCircle.setAttribute("cy", "400");
  solidCircle.setAttribute("r", "302");
  solidCircle.setAttribute("fill", "#2444D9");
  solidCircle.setAttribute("mask", "url(#pie-transition-mask)");

  pieGroup.appendChild(solidCircle);
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
      m -302,0
      a 302,302 0 1,0 604,0
      a 302,302 0 1,0 -604,0
    `,
    );
    return;
  }

  const startAngle = -90;
  const endAngle = startAngle + angle;
  const x1 = 400 + 302 * Math.cos((startAngle * Math.PI) / 180);
  const y1 = 400 + 302 * Math.sin((startAngle * Math.PI) / 180);
  const x2 = 400 + 302 * Math.cos((endAngle * Math.PI) / 180);
  const y2 = 400 + 302 * Math.sin((endAngle * Math.PI) / 180);
  const largeArc = angle > 180 ? 1 : 0;

  slice.setAttribute(
    "d",
    `
    M 400,400
    L ${x1},${y1}
    A 302,302 0 ${largeArc} 1 ${x2},${y2}
    Z
  `,
  );
}

// resize handler
function handleResize() {
  scaleMultiplier = window.innerWidth < 1000 ? 3 : 2.5;
  ScrollTrigger.refresh();
}
