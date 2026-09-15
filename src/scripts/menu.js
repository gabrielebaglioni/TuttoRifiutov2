import gsap from "gsap";
import * as THREE from "three";
import { bindThemeUniforms } from './theme.js';
import { SplitText } from "gsap/SplitText";
import { getIconSvg } from "./icons.js";
import { matrixShader } from "./menuShaders.js";
import { SITE_CONTENT } from "../data/site-content.js";
import { isAllowedLink } from "./content-hydration.js";
import { playMenuSound } from "./menu-audio.js";
import { meaningfulResize, usesTouchLayout, prefersReducedMotion } from "./motion-policy.js";
let menuViewport = { width: window.innerWidth, height: window.innerHeight };

gsap.registerPlugin(SplitText);

const MENU_ICONS = ["cube-sharp", "calendar-sharp", "paper-plane-sharp", "flag-sharp"];
let menuItems = SITE_CONTENT["global.menu.items"].map(([label, href], index) => ({
  label,
  icon: MENU_ICONS[index % MENU_ICONS.length],
  href,
}));

let isOpen = false;
let isMenuAnimating = false;
let responsiveConfig = {};
let resetJoystick = null;
let menuLinkSplits = [];
let menuLinkAnimations = [];
let returnFocus = null;
let backgroundAccess = [];
let previousOverflow = '';
let resumeScroll = false;

let atmosphereScene, atmosphereCamera, atmosphereRenderer;
let atmosphereMaterial, atmosphereMesh;
let lastAtmosphereFrame = null;
let atmosphereAttempted = false;
let atmosphereFailed = false;
let atmosphereFrame;

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

  renderSegments(menu);
  setMenuAccess(false);
  document.addEventListener('keydown', handleMenuKeydown);

  // The outer ring uses the shared static grain tile on every device.
  // The old WebGL implementation is retained in menu-ring-grain.js for comparison.

  document
    .querySelector(".menu-toggle-btn")
    .addEventListener("click", toggleMenu);
  document.querySelector(".close-btn").addEventListener("click", toggleMenu);

  resetJoystick = initJoystick();
  if (resetJoystick) resetJoystick();

  ensureAtmosphere();

  window.toggleMenu = toggleMenu;

  window.addEventListener("resize", () => {
    const next = { width: window.innerWidth, height: window.innerHeight };
    if (!meaningfulResize(menuViewport, next, usesTouchLayout())) return;
    menuViewport = next;
    resizeAtmosphere();
    resizeMenu();
  });
});

function renderSegments(menu) {
  menu.querySelectorAll(".menu-segment").forEach((segment) => segment.remove());
  menuItems.forEach((item, index) => {
    const segment = createSegment(item, index, menuItems.length);
    segment.addEventListener("mouseenter", () => {
      if (isOpen) playMenuSound("select");
    });
    segment.addEventListener("click", (event) => {
      if (isSamePage(segment.href)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (isOpen) toggleMenu();
      }
    }, { capture: true });
    menu.appendChild(segment);
  });
}

document.addEventListener("tutto-rifiuto:content", (event) => {
  const rows = event.detail?.["global.menu.items"];
  if (!Array.isArray(rows) || !rows.every((row) => Array.isArray(row) && row.length === 2 && typeof row[0] === "string" && isAllowedLink(row[1]))) return;
  menuItems = rows.map(([label, href], index) => ({ label, href, icon: MENU_ICONS[index % MENU_ICONS.length] }));
  const menu = document.querySelector(".circular-menu");
  if (menu) renderSegments(menu);
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
  const viewportHeight = document.querySelector('.menu-overlay')?.clientHeight || window.innerHeight;
  const maxSize = Math.max(160, Math.min(viewportWidth - 32, viewportHeight - 160));
  const menuSize = Math.min(maxSize, usesTouchLayout() ? 560 : 700);

  return {
    menuSize,
    center: menuSize / 2,
    innerRadius: menuSize * 0,
    outerRadius: menuSize * 0.42,
    contentRadius: menuSize * 0.28,
  };
}

function ensureAtmosphere() {
  if (prefersReducedMotion()) { showAtmosphereFallback(); return; }
  if (atmosphereAttempted || (usesTouchLayout() && !isOpen)) return;
  atmosphereAttempted = true;
  try { initAtmosphere(); }
  catch {
    atmosphereRenderer?.dispose();
    atmosphereRenderer = null;
    showAtmosphereFallback();
  }
}

function showAtmosphereFallback() {
  atmosphereFailed = true;
  cancelAnimationFrame(atmosphereFrame);
  document.querySelector('.menu-overlay')?.classList.add('has-atmosphere-fallback');
  const canvas = document.getElementById('menu-canvas');
  if (canvas) canvas.style.display = 'none';
}

function initAtmosphere() {
  const canvas = document.getElementById("menu-canvas");
  canvas.addEventListener('webglcontextlost', showAtmosphereFallback);

  atmosphereScene = new THREE.Scene();
  atmosphereCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  atmosphereRenderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
  });
  atmosphereRenderer.debug.onShaderError = showAtmosphereFallback;
  atmosphereRenderer.setPixelRatio(usesTouchLayout() ? 1 : Math.min(window.devicePixelRatio, 2));

  const geometry = new THREE.PlaneGeometry(2, 2);

  atmosphereMaterial = new THREE.ShaderMaterial({
    vertexShader: matrixShader.vertexShader,
    fragmentShader: matrixShader.fragmentShader,
    uniforms: {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector2() },
    },
  });

  atmosphereMesh = new THREE.Mesh(geometry, atmosphereMaterial);
  atmosphereScene.add(atmosphereMesh);
  const unbindTheme = bindThemeUniforms(atmosphereMaterial.uniforms, {uColorBg:'accent', uColorFg:'foreground'}, () => {
    if (!atmosphereFailed) atmosphereRenderer.render(atmosphereScene, atmosphereCamera);
  });
  window.addEventListener('pagehide', (event) => { if (!event.persisted) unbindTheme(); });

  resizeAtmosphere();
  animateAtmosphere();
}

function resizeAtmosphere() {
  if (!atmosphereRenderer || atmosphereFailed) return;
  const ratio = usesTouchLayout() ? Math.min(1, 720 / Math.max(window.innerWidth, window.innerHeight)) : 1;
  const width = Math.max(1, Math.round(window.innerWidth * ratio));
  const height = Math.max(1, Math.round(window.innerHeight * ratio));

  atmosphereRenderer.setSize(width, height, false);
  atmosphereMaterial.uniforms.iResolution.value.set(width, height);
}

function animateAtmosphere(time = 0) {
  if (atmosphereFailed) return;
  atmosphereFrame = requestAnimationFrame(animateAtmosphere);
  if ((!isOpen && !isMenuAnimating) || document.hidden) { lastAtmosphereFrame = null; return; }
  const touch = usesTouchLayout();
  const elapsed = lastAtmosphereFrame === null ? 34 : time - lastAtmosphereFrame;
  if (touch && elapsed < 1000 / 30) return;
  lastAtmosphereFrame = time;
  atmosphereMaterial.uniforms.iTime.value += touch ? Math.min(elapsed, 100) / 1000 : 0.016;
  atmosphereRenderer.render(atmosphereScene, atmosphereCamera);
}

// Keep the invisible overlay out of keyboard/accessibility navigation; while
// open, native buttons and a focus loop provide the same routes as the joystick.
function setMenuAccess(open) {
  const overlay = document.querySelector('.menu-overlay');
  const toggle = document.querySelector('.menu-toggle-btn');
  if (open) {
    returnFocus = document.activeElement;
    backgroundAccess = [...document.body.children].filter(node => node !== overlay && !node.contains(overlay)).map(node => [node, Boolean(node.inert)]);
    backgroundAccess.forEach(([node]) => { node.inert = true; });
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    resumeScroll = Boolean(window.lenis && !window.lenis.isStopped);
    if (resumeScroll) window.lenis.stop();
    overlay.inert = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.querySelector('.close-btn').focus({ preventScroll: true });
  } else {
    backgroundAccess.forEach(([node, inert]) => { node.inert = inert; });
    if (backgroundAccess.length) document.body.style.overflow = previousOverflow;
    backgroundAccess = [];
    if (resumeScroll) window.lenis?.start();
    resumeScroll = false;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
    overlay.inert = true;
    overlay.setAttribute('aria-hidden', 'true');
  }
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Chiudi menu' : 'Apri menu');
}

function handleMenuKeydown(event) {
  if (!isOpen) return;
  if (event.key === 'Escape') { event.preventDefault(); toggleMenu(); return; }
  if (event.key !== 'Tab') return;
  const links = [...document.querySelector('.menu-overlay').querySelectorAll('button, a[href]')];
  const first = links[0], last = links[links.length - 1];
  if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last) || !links.includes(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
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

  const content = document.createElement("div");
  content.className = "segment-content";
  content.style.left = `${contentX}px`;
  content.style.top = `${contentY}px`;
  content.style.transform = "translate(-50%, -50%)";
  const icon = document.createElement("span");
  icon.className = "segment-icon";
  icon.innerHTML = getIconSvg(item.icon);
  const label = document.createElement("div");
  label.className = "label";
  label.textContent = item.label;
  content.append(icon, label);
  segment.appendChild(content);

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
    updateSegment(segment, index, menuItems.length);
  });

}

// toggle menu - open/close with flicker animations
function toggleMenu() {
  if (isMenuAnimating) return;

  const menuOverlay = document.querySelector(".menu-overlay");
  const menuSegments = document.querySelectorAll(".menu-segment");
  const joystick = document.querySelector(".joystick");
  const menuOverlayNav = document.querySelector(".menu-overlay-nav");
  const menuOverlayFooter = document.querySelector(".menu-overlay-footer");

  if (prefersReducedMotion()) {
    isOpen = !isOpen;
    setMenuAccess(isOpen);
    playMenuSound(isOpen ? 'open' : 'close');
    if (isOpen) ensureAtmosphere();
    gsap.set([menuOverlay, menuOverlayNav, menuOverlayFooter, ...menuSegments], { opacity: isOpen ? 1 : 0 });
    gsap.set(joystick, { scale: isOpen ? 1 : 0, x: 0, y: 0 });
    menuOverlay.style.pointerEvents = isOpen ? 'all' : 'none';
    return;
  }

  isMenuAnimating = true;

  if (!isOpen) {
    isOpen = true;
    setMenuAccess(true);
    playMenuSound("open");
    // Allocate the mobile shader only on first open, never during hero startup.
    ensureAtmosphere();

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
    setMenuAccess(false);
    playMenuSound("close");

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
        Math.floor(((angle + 90 + 360) % 360) / (360 / menuItems.length)) %
        menuItems.length;
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
        if (isOpen) playMenuSound("select");
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
