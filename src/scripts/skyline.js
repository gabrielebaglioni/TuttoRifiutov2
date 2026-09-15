import * as THREE from "three";
import { bindThemeUniforms } from './theme.js';
import { GRAIN_FRAGMENT_SHADER, GRAIN_VERTEX_SHADER } from "./grain-yellow-shader.js";
import { meaningfulResize, usesTouchLayout } from "./motion-policy.js";
let skylineViewport = { width: window.innerWidth, height: window.innerHeight };
let lastNoiseFrame = -1;

// procedural trashscape — cumuli di pacchetti/sacchi abbandonati per strada
// (Tutto Rifiuto: pacchetti lasciati per le strade della città)
const canvas = document.getElementById("skyline");
let isVisible = true;
const visibilityObserver = new IntersectionObserver(([entry]) => { isVisible = entry.isIntersecting; }, { rootMargin: "200px" });
visibilityObserver.observe(canvas);
const isMobile = usesTouchLayout();
const pixelRatioLimit = isMobile ? 1.0 : 1.25;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
  stencil: false,
  depth: false,
});

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
  uniforms: {
    iTime: { value: 0 },
    iResolution: { value: new THREE.Vector3() },
  },
  vertexShader: GRAIN_VERTEX_SHADER,
  fragmentShader: GRAIN_FRAGMENT_SHADER,
  depthTest: false,
  depthWrite: false,
});

const mesh = new THREE.Mesh(geometry, material);
const unbindTheme = bindThemeUniforms(material.uniforms, {uColorBg:'background', uColorFg:'foreground'}, () => { lastNoiseFrame = -1; });
scene.add(mesh);

// resize handler with debounce
let resizeTimeout;

function handleResize(force = false) {
  const next = { width: window.innerWidth, height: window.innerHeight };
  if (force !== true && !meaningfulResize(skylineViewport, next, isMobile)) return;
  skylineViewport = next;
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioLimit));
    material.uniforms.iResolution.value.set(width, height, 1);
    lastNoiseFrame = -1;
  }, 100);
}

// animation loop
function animate(currentTime) {
  requestAnimationFrame(animate);
  if (!isVisible || document.hidden) return;
  // The shader itself changes only at floor(iTime * 5).
  const noiseFrame = Math.floor(currentTime / 200);
  if (noiseFrame === lastNoiseFrame) return;
  lastNoiseFrame = noiseFrame;
  material.uniforms.iTime.value = currentTime * 0.001;
  renderer.render(scene, camera);
}

// cleanup on page unload
function cleanup() {
  unbindTheme();
  visibilityObserver.disconnect();
  geometry.dispose();
  material.dispose();
  renderer.dispose();
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("beforeunload", cleanup);
}

// initialize
handleResize(true);
window.addEventListener("resize", handleResize);
window.addEventListener("beforeunload", cleanup);
requestAnimationFrame(animate);
