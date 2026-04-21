import gsap from "gsap";
import * as THREE from "three";
import { SplitText } from "gsap/SplitText";
import { initMenuRingGrain, resizeMenuRingGrain } from "./menu-ring-grain.js";
import { matrixShader } from "./menuShaders";

gsap.registerPlugin(SplitText);

// configuration
const CONFIG = {
  colors: { bg: "#2444D9", fg: "#000000" },
};

const MENU_ITEMS = [
  { label: "Archivio", icon: "cube-sharp", href: "/work" },
  { label: "Eventi", icon: "calendar-sharp", href: "/events" },
  { label: "Contatti", icon: "paper-plane-sharp", href: "/contact" },
  { label: "Manifesto", icon: "flag-sharp", href: "/" },
];

let isOpen = false;
let isMenuAnimating = false;
let responsiveConfig = {};
let resetJoystick = null;
let menuLinkSplits = [];
let menuLinkAnimations = [];

let atmosphereScene, atmosphereCamera, atmosphereRenderer;
let atmosphereMaterial, atmosphereMesh;

// initialization
document.addEventListener("DOMContentLoaded", () => {
  responsiveConfig = getResponsiveConfig();

  const menu = document.querySelector(".circular-menu");
  const joystick = document.querySelector(".joystick");
  const menuOverlayNav = document.querySelector(".menu-overlay-nav");
  const menuOverlayFooter = document.querySelector(".menu-overlay-footer");

  menu.style.width = `${responsiveConfig.menuSize}px`;
  menu.style.height = `${responsiveConfig.menuSize}px`;

  gsap.set(joystick, { scale: 0, x: 0, y: 0 });
  gsap.set([menuOverlayNav, menuOverlayFooter], { opacity: 0 });

  MENU_ITEMS.forEach((item, index) => {
    const segment = createSegment(item, index, MENU_ITEMS.length);

    segment.addEventListener("mouseenter", () => {
      if (isOpen) new Audio("/sfx/menu-select.mp3").play().catch(() => {});
    });

    segment.addEventListener(
      "click",
      (e) => {
        if (isSamePage(segment.href)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (isOpen) toggleMenu();
        }
      },
      { capture: true },
    );

    menu.appendChild(segment);
  });

  initMenuRingGrain(menu, responsiveConfig.menuSize);

  document
    .querySelector(".menu-toggle-btn")
    .addEventListener("click", toggleMenu);
  document.querySelector(".close-btn").addEventListener("click", toggleMenu);

  resetJoystick = initJoystick();
  if (resetJoystick) resetJoystick();

  initAtmosphere();

  window.toggleMenu = toggleMenu;

  window.addEventListener("resize", () => {
    resizeAtmosphere();
    resizeMenu();
  });
});

// utility - check if link points to current page
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

// menu link flicker animations
function initMenuLinkFlicker(link) {
  SplitText.create(link, {
    type: "chars",
    autoSplit: true,
    onSplit(self) {
      gsap.set(self.chars, { opacity: 0 });
      menuLinkSplits.push(self);
    },
  });
}

function animateMenuLinksFlicker(reverse = false) {
  menuLinkAnimations.forEach((anim) => anim.kill());
  menuLinkAnimations = [];

  menuLinkSplits.forEach((split) => {
    if (!split || !split.chars) return;

    const animation = gsap.to(split.chars, {
      opacity: reverse ? 0 : 1,
      duration: 0.05,
      ease: "power2.inOut",
      stagger: { amount: 0.5, each: 0.1, from: "random" },
    });

    menuLinkAnimations.push(animation);
  });
}

// responsive config - calculates menu dimensions based on viewport
function getResponsiveConfig() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const isMobile = viewportWidth < 1000;
  const maxSize = Math.min(viewportWidth * 0.9, viewportHeight * 0.9);
  const menuSize = isMobile ? Math.min(maxSize, 480) : 700;

  return {
    menuSize,
    center: menuSize / 2,
    innerRadius: menuSize * 0,
    outerRadius: menuSize * 0.42,
    contentRadius: menuSize * 0.28,
  };
}

// three.js atmosphere background
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : { r: 0, g: 0, b: 0 };
}

function initAtmosphere() {
  const canvas = document.getElementById("menu-canvas");

  atmosphereScene = new THREE.Scene();
  atmosphereCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  atmosphereRenderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
  });
  atmosphereRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const geometry = new THREE.PlaneGeometry(2, 2);
  const bgColor = hexToRgb(CONFIG.colors.bg);
  const fgColor = hexToRgb(CONFIG.colors.fg);

  atmosphereMaterial = new THREE.ShaderMaterial({
    vertexShader: matrixShader.vertexShader,
    fragmentShader: matrixShader.fragmentShader,
    uniforms: {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector2() },
      uColorBg: { value: new THREE.Vector3(bgColor.r, bgColor.g, bgColor.b) },
      uColorFg: { value: new THREE.Vector3(fgColor.r, fgColor.g, fgColor.b) },
    },
  });

  atmosphereMesh = new THREE.Mesh(geometry, atmosphereMaterial);
  atmosphereScene.add(atmosphereMesh);

  resizeAtmosphere();
  animateAtmosphere();
}

function resizeAtmosphere() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  atmosphereRenderer.setSize(width, height);
  atmosphereMaterial.uniforms.iResolution.value.set(width, height);
}

function animateAtmosphere() {
  atmosphereMaterial.uniforms.iTime.value += 0.016;
  atmosphereRenderer.render(atmosphereScene, atmosphereCamera);
  requestAnimationFrame(animateAtmosphere);
}

// segment geometry - calculates SVG path for pie slice segments
function calculateSegmentGeometry(index, total) {
  const { menuSize, center, innerRadius, outerRadius, contentRadius } =
    responsiveConfig;

  const anglePerSegment = 360 / total;
  const baseStartAngle = anglePerSegment * index;
  const centerAngle = baseStartAngle + anglePerSegment / 2;
  const startAngle = baseStartAngle;
  const endAngle = baseStartAngle + anglePerSegment;

  const innerStartX =
    center + innerRadius * Math.cos(((startAngle - 90) * Math.PI) / 180);
  const innerStartY =
    center + innerRadius * Math.sin(((startAngle - 90) * Math.PI) / 180);
  const outerStartX =
    center + outerRadius * Math.cos(((startAngle - 90) * Math.PI) / 180);
  const outerStartY =
    center + outerRadius * Math.sin(((startAngle - 90) * Math.PI) / 180);
  const innerEndX =
    center + innerRadius * Math.cos(((endAngle - 90) * Math.PI) / 180);
  const innerEndY =
    center + innerRadius * Math.sin(((endAngle - 90) * Math.PI) / 180);
  const outerEndX =
    center + outerRadius * Math.cos(((endAngle - 90) * Math.PI) / 180);
  const outerEndY =
    center + outerRadius * Math.sin(((endAngle - 90) * Math.PI) / 180);

  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  const pathData = [
    `M ${innerStartX} ${innerStartY}`,
    `L ${outerStartX} ${outerStartY}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEndX} ${outerEndY}`,
    `L ${innerEndX} ${innerEndY}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY}`,
    "Z",
  ].join(" ");

  const contentX =
    center + contentRadius * Math.cos(((centerAngle - 90) * Math.PI) / 180);
  const contentY =
    center + contentRadius * Math.sin(((centerAngle - 90) * Math.PI) / 180);

  return { menuSize, pathData, contentX, contentY };
}

function createSegment(item, index, total) {
  const segment = document.createElement("a");
  segment.className = "menu-segment";
  segment.href = item.href;

  const { menuSize, pathData, contentX, contentY } = calculateSegmentGeometry(
    index,
    total,
  );

  segment.style.clipPath = `path('${pathData}')`;
  segment.style.width = `${menuSize}px`;
  segment.style.height = `${menuSize}px`;

  segment.innerHTML = `
    <div class="segment-content" style="left: ${contentX}px; top: ${contentY}px; transform: translate(-50%, -50%);">
      <ion-icon name="${item.icon}"></ion-icon>
      <div class="label">${item.label}</div>
    </div>
  `;

  return segment;
}

function updateSegment(segment, index, total) {
  const { menuSize, pathData, contentX, contentY } = calculateSegmentGeometry(
    index,
    total,
  );

  segment.style.clipPath = `path('${pathData}')`;
  segment.style.width = `${menuSize}px`;
  segment.style.height = `${menuSize}px`;

  const segmentContent = segment.querySelector(".segment-content");
  segmentContent.style.left = `${contentX}px`;
  segmentContent.style.top = `${contentY}px`;
}

function resizeMenu() {
  responsiveConfig = getResponsiveConfig();

  const menu = document.querySelector(".circular-menu");
  menu.style.width = `${responsiveConfig.menuSize}px`;
  menu.style.height = `${responsiveConfig.menuSize}px`;

  const menuSegments = document.querySelectorAll(".menu-segment");
  menuSegments.forEach((segment, index) => {
    updateSegment(segment, index, MENU_ITEMS.length);
  });

  resizeMenuRingGrain(menu, responsiveConfig.menuSize);
}

// toggle menu - open/close with flicker animations
function toggleMenu() {
  if (isMenuAnimating) return;

  const menuOverlay = document.querySelector(".menu-overlay");
  const menuSegments = document.querySelectorAll(".menu-segment");
  const joystick = document.querySelector(".joystick");
  const menuOverlayNav = document.querySelector(".menu-overlay-nav");
  const menuOverlayFooter = document.querySelector(".menu-overlay-footer");

  isMenuAnimating = true;

  if (!isOpen) {
    isOpen = true;
    new Audio("/sfx/menu-open.mp3").play();

    if (resetJoystick) resetJoystick();

    gsap.to(menuOverlay, {
      opacity: 1,
      duration: 0.3,
      ease: "power2.out",
      onStart: () => (menuOverlay.style.pointerEvents = "all"),
    });

    gsap.to(joystick, {
      scale: 1,
      x: 0,
      y: 0,
      duration: 0.4,
      delay: 0.2,
      ease: "back.out(1.7)",
    });

    const menuNavLinks = menuOverlayNav?.querySelectorAll(
      ".menu-overlay-items a",
    );
    const menuFooterLinks = menuOverlayFooter?.querySelectorAll("a");
    const allMenuLinks = [...(menuNavLinks || []), ...(menuFooterLinks || [])];

    menuLinkSplits.forEach((split) => {
      if (split && split.revert) split.revert();
    });
    menuLinkSplits = [];

    gsap.set([menuOverlayNav, menuOverlayFooter], { opacity: 1 });

    allMenuLinks.forEach((link) => initMenuLinkFlicker(link));

    setTimeout(() => animateMenuLinksFlicker(false), 300);

    [...Array(menuSegments.length).keys()]
      .sort(() => Math.random() - 0.5)
      .forEach((originalIndex, shuffledPosition) => {
        const segment = menuSegments[originalIndex];
        gsap.set(segment, { opacity: 0 });
        gsap.to(segment, {
          opacity: 1,
          duration: 0.075,
          delay: shuffledPosition * 0.075,
          repeat: 3,
          yoyo: true,
          ease: "power2.inOut",
          onComplete: () => {
            gsap.set(segment, { opacity: 1 });
            if (originalIndex === menuSegments.length - 1)
              isMenuAnimating = false;
          },
        });
      });
  } else {
    isOpen = false;
    new Audio("/sfx/menu-close.mp3").play();

    animateMenuLinksFlicker(true);

    setTimeout(() => {
      gsap.set([menuOverlayNav, menuOverlayFooter], { opacity: 0 });
    }, 600);

    gsap.to(joystick, {
      scale: 0,
      x: 0,
      y: 0,
      duration: 0.3,
      delay: 0.2,
      ease: "back.in(1.7)",
      onComplete: () => {
        if (resetJoystick) resetJoystick();
      },
    });

    [...Array(menuSegments.length).keys()]
      .sort(() => Math.random() - 0.5)
      .forEach((originalIndex, shuffledPosition) => {
        const segment = menuSegments[originalIndex];
        gsap.to(segment, {
          opacity: 0,
          duration: 0.05,
          delay: shuffledPosition * 0.05,
          repeat: 2,
          yoyo: true,
          ease: "power2.inOut",
          onComplete: () => gsap.set(segment, { opacity: 0 }),
        });
      });

    gsap.to(menuOverlay, {
      opacity: 0,
      duration: 0.3,
      delay: 0.6,
      ease: "power2.out",
      onComplete: () => {
        menuOverlay.style.pointerEvents = "none";
        isMenuAnimating = false;
      },
    });
  }
}

// joystick - drag control for segment selection
function initJoystick() {
  const joystick = document.querySelector(".joystick");
  let isDragging = false;
  let currentX = 0;
  let currentY = 0;
  let targetX = 0;
  let targetY = 0;
  let activeSegment = null;

  function animate() {
    currentX += (targetX - currentX) * 0.15;
    currentY += (targetY - currentY) * 0.15;

    gsap.set(joystick, { x: currentX, y: currentY });

    if (
      isDragging &&
      Math.sqrt(currentX * currentX + currentY * currentY) > 20
    ) {
      const angle = Math.atan2(currentY, currentX) * (180 / Math.PI);
      const segmentIndex =
        Math.floor(((angle + 90 + 360) % 360) / (360 / MENU_ITEMS.length)) %
        MENU_ITEMS.length;
      const segment = document.querySelectorAll(".menu-segment")[segmentIndex];

      if (segment !== activeSegment) {
        if (activeSegment) {
          activeSegment.style.animation = "";
          activeSegment.querySelector(".segment-content").style.animation = "";
          activeSegment.style.zIndex = "";
        }
        activeSegment = segment;
        segment.style.animation = "flickerHover 350ms ease-in-out forwards";
        segment.querySelector(".segment-content").style.animation =
          "contentFlickerHover 350ms ease-in-out forwards";
        segment.style.zIndex = "10";
        if (isOpen) new Audio("/sfx/menu-select.mp3").play().catch(() => {});
      }
    } else {
      if (activeSegment) {
        activeSegment.style.animation = "";
        activeSegment.querySelector(".segment-content").style.animation = "";
        activeSegment.style.zIndex = "";
        activeSegment = null;
      }
    }

    requestAnimationFrame(animate);
  }

  function startDrag(e) {
    isDragging = true;
    const rect = joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    function drag(e) {
      if (!isDragging) return;

      const clientX = e.clientX ?? e.touches?.[0]?.clientX;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY;
      if (clientX === undefined || clientY === undefined) return;

      const deltaX = clientX - centerX;
      const deltaY = clientY - centerY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const maxDrag = 100 * 0.25;

      if (distance <= 20) {
        targetX = targetY = 0;
      } else if (distance > maxDrag) {
        const ratio = maxDrag / distance;
        targetX = deltaX * ratio;
        targetY = deltaY * ratio;
      } else {
        targetX = deltaX;
        targetY = deltaY;
      }

      e.preventDefault();
    }

    function endDrag() {
      isDragging = false;
      targetX = targetY = 0;
      document.removeEventListener("mousemove", drag);
      document.removeEventListener("mouseup", endDrag);
      document.removeEventListener("touchmove", drag);
      document.removeEventListener("touchend", endDrag);
    }

    document.addEventListener("mousemove", drag);
    document.addEventListener("mouseup", endDrag);
    document.addEventListener("touchmove", drag, { passive: false });
    document.addEventListener("touchend", endDrag);

    e.preventDefault();
  }

  joystick.addEventListener("mousedown", startDrag);
  joystick.addEventListener("touchstart", startDrag, { passive: false });

  animate();

  return function reset() {
    currentX = 0;
    currentY = 0;
    targetX = 0;
    targetY = 0;
    gsap.set(joystick, { x: 0, y: 0 });
  };
}
