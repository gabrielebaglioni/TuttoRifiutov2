import * as THREE from "three";
import { bindThemeUniforms } from './theme.ts';
import {
  createGrainFragmentShader,
  GRAIN_VERTEX_SHADER,
} from "./grain-yellow-shader.ts";

/** Stessa grana del sito, ma solo nella corona ( tra raggio interno ed esterno del menu ). */
const FRAGMENT = createGrainFragmentShader({ radialMask: true });

let renderer;
let material;
let mesh;
let geometry;
let scene;
let camera;
let stopped = false;

function outerRadiusPx(menuSize) {
  return menuSize * 0.42;
}

/** Allineato a getResponsiveConfig in menu.js */
export function initMenuRingGrain(menuEl, menuSize, isActive = () => true) {
  if (!menuEl || document.querySelector(".menu-ring-grain-canvas")) return;

  const canvas = document.createElement("canvas");
  canvas.className = "menu-ring-grain-canvas";
  canvas.setAttribute("aria-hidden", "true");
  menuEl.prepend(canvas);
  let animationFrame;
  function fallback() {
    stopped = true;
    cancelAnimationFrame(animationFrame);
    canvas.style.display = 'none';
    menuEl.classList.add('has-ring-fallback');
  }
  canvas.addEventListener('webglcontextlost', fallback);

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const pixelRatioLimit = isMobile ? 1.0 : 1.25;

  try { renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
    stencil: false,
    depth: false,
    alpha: true,
    premultipliedAlpha: false,
  }); } catch { fallback(); return; }
  renderer.debug.onShaderError = fallback;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  geometry = new THREE.PlaneGeometry(2, 2);
  const innerPx = 50.0;
  material = new THREE.ShaderMaterial({
    uniforms: {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector3() },
      uInnerPx: { value: innerPx },
      uOuterPx: { value: outerRadiusPx(menuSize) },
    },
    vertexShader: GRAIN_VERTEX_SHADER,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  const unbindTheme = bindThemeUniforms(material.uniforms, {uColorBg:'background', uColorFg:'foreground'}, () => { if (!stopped) renderer.render(scene, camera); });

  function layout() {
    if (stopped) return;
    const w = Math.max(1, Math.floor(menuEl.offsetWidth));
    const h = Math.max(1, Math.floor(menuEl.offsetHeight));
    const side = Math.min(w, h);
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioLimit));
    material.uniforms.iResolution.value.set(w, h, 1);
    material.uniforms.uInnerPx.value = innerPx;
    material.uniforms.uOuterPx.value = outerRadiusPx(side);
  }

  let ro;
  layout();
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => layout());
    ro.observe(menuEl);
  }

  function animate(t) {
    if (stopped) return;
    animationFrame = requestAnimationFrame(animate);
    if (!isActive() || document.hidden) return;
    material.uniforms.iTime.value = t * 0.001;
    renderer.render(scene, camera);
  }
  if (!stopped) animationFrame = requestAnimationFrame(animate);

  function cleanup(event) {
    if (event.persisted) return;
    stopped = true;
    cancelAnimationFrame(animationFrame);
    unbindTheme();
    if (ro) ro.disconnect();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    window.removeEventListener("pagehide", cleanup);
  }
  window.addEventListener("pagehide", cleanup);
}

export function resizeMenuRingGrain(menuEl, menuSize) {
  if (stopped || !material || !renderer || !menuEl) return;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const pixelRatioLimit = isMobile ? 1.0 : 1.25;
  const w = Math.max(1, Math.floor(menuEl.offsetWidth));
  const h = Math.max(1, Math.floor(menuEl.offsetHeight));
  const ms = menuSize || Math.min(w, h);
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioLimit));
  material.uniforms.iResolution.value.set(w, h, 1);
  material.uniforms.uOuterPx.value = outerRadiusPx(ms);
}
