import * as THREE from "three";
import { GRAIN_VERTEX_SHADER } from "./grain-yellow-shader.js";

/** Stessa grana del sito, ma solo nella corona ( tra raggio interno ed esterno del menu ). */
const FRAGMENT = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

  uniform float iTime;
  uniform vec3 iResolution;
  uniform float uInnerPx;
  uniform float uOuterPx;
  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p*vec2(123.34, 456.21));
    p += dot(p, p+45.32);
    return fract(p.x*p.y);
  }

  void main() {
    vec2 px = vUv * iResolution.xy;
    vec2 c = iResolution.xy * 0.5;
    float r = distance(px, c);
    if (r < uInnerPx || r > uOuterPx) discard;

    vec3 color = vec3(1.0);
    const float scrollWrap = 1500.0;
    float scroll = mod(floor(iTime * 5.0), scrollWrap);
    vec2 grainUv = vUv * iResolution.xy * 0.9 + vec2(scroll);
    float g1 = hash21(grainUv);
    float g2 = hash21(grainUv * 0.4 + 13.0);
    float specks = step(0.965, g1) * 0.45 + step(0.97, g2) * 0.25;
    color = clamp(color - specks, 0.0, 1.0);
    float haze = (hash21(floor(vUv * iResolution.xy * 0.5)) - 0.5) * 0.04;
    color = clamp(color - haze, 0.0, 1.0);
    const vec3 bgColor = vec3(1.0, 1.0, 0.0);
    color = mix(bgColor, vec3(0.0), 1.0 - color.r);
    gl_FragColor = vec4(color, 1.0);
  }
`;

let renderer;
let material;
let mesh;
let geometry;
let scene;
let camera;

function outerRadiusPx(menuSize) {
  return menuSize * 0.42;
}

/** Allineato a getResponsiveConfig in menu.js */
export function initMenuRingGrain(menuEl, menuSize) {
  if (!menuEl || document.querySelector(".menu-ring-grain-canvas")) return;

  const canvas = document.createElement("canvas");
  canvas.className = "menu-ring-grain-canvas";
  canvas.setAttribute("aria-hidden", "true");
  menuEl.prepend(canvas);

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const pixelRatioLimit = isMobile ? 1.0 : 1.25;

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
    stencil: false,
    depth: false,
    alpha: true,
    premultipliedAlpha: false,
  });
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

  function layout() {
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
    requestAnimationFrame(animate);
    material.uniforms.iTime.value = t * 0.001;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);

  function cleanup() {
    if (ro) ro.disconnect();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    window.removeEventListener("beforeunload", cleanup);
  }
  window.addEventListener("beforeunload", cleanup);
}

export function resizeMenuRingGrain(menuEl, menuSize) {
  if (!material || !renderer || !menuEl) return;
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
