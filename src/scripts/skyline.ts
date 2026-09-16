import * as THREE from "three";
import { bindThemeUniforms } from './theme.ts';
import { GRAIN_FRAGMENT_SHADER, GRAIN_VERTEX_SHADER } from "./grain-yellow-shader.ts";
import { meaningfulResize, usesTouchLayout, prefersReducedMotion } from "./motion-policy.ts";
let skylineViewport = { width: window.innerWidth, height: window.innerHeight };
let lastNoiseFrame = -1;

// procedural trashscape — cumuli di pacchetti/sacchi abbandonati per strada
// (Tutto Rifiuto: pacchetti lasciati per le strade della città)
const canvas = document.querySelector<HTMLCanvasElement>("#skyline");
if (canvas) initSkyline(canvas);

function initSkyline(canvas: HTMLCanvasElement) {
let stopped = false;
let animationFrame = 0;
const fallback = () => {
  stopped = true;
  cancelAnimationFrame(animationFrame);
  canvas.style.display = 'none';
  canvas.parentElement?.classList.add('has-grain-fallback');
};
if (prefersReducedMotion()) { fallback(); return; }
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: false,
  });
} catch { fallback(); return; }
// Three reports shader failure through this callback, not an exception.
renderer.debug.onShaderError = fallback;
canvas.addEventListener('webglcontextlost', fallback);
let isVisible = true;
const visibilityObserver = new IntersectionObserver(([entry]) => { isVisible = entry?.isIntersecting ?? false; }, { rootMargin: "200px" });
visibilityObserver.observe(canvas);
const isMobile = usesTouchLayout();
const pixelRatioLimit = isMobile ? 1.0 : 1.25;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const geometry = new THREE.PlaneGeometry(2, 2);
const uniforms = { iTime: { value: 0 }, iResolution: { value: new THREE.Vector3() } };
const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: GRAIN_VERTEX_SHADER,
  fragmentShader: GRAIN_FRAGMENT_SHADER,
  depthTest: false,
  depthWrite: false,
});

const mesh = new THREE.Mesh(geometry, material);
const unbindTheme = bindThemeUniforms(material.uniforms, {uColorBg:'background', uColorFg:'foreground'}, () => { lastNoiseFrame = -1; });
scene.add(mesh);

// resize handler with debounce
let resizeTimeout: ReturnType<typeof setTimeout> | undefined;

function handleResize(force: boolean | UIEvent = false) {
  const next = { width: window.innerWidth, height: window.innerHeight };
  if (force !== true && !meaningfulResize(skylineViewport, next, isMobile)) return;
  skylineViewport = next;
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (stopped) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioLimit));
    uniforms.iResolution.value.set(width, height, 1);
    lastNoiseFrame = -1;
  }, 100);
}

// animation loop
function animate(currentTime: number) {
  if (stopped) return;
  animationFrame = requestAnimationFrame(animate);
  if (!isVisible || document.hidden) return;
  // The shader itself changes only at floor(iTime * 5).
  const noiseFrame = Math.floor(currentTime / 200);
  if (noiseFrame === lastNoiseFrame) return;
  lastNoiseFrame = noiseFrame;
  uniforms.iTime.value = currentTime * 0.001;
  renderer.render(scene, camera);
}

// cleanup on page unload
function cleanup(event: PageTransitionEvent) {
  if (event.persisted) return;
  stopped = true;
  cancelAnimationFrame(animationFrame);
  clearTimeout(resizeTimeout);
  unbindTheme();
  visibilityObserver.disconnect();
  geometry.dispose();
  material.dispose();
  renderer.dispose();
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("pagehide", cleanup);
}

// initialize
handleResize(true);
window.addEventListener("resize", handleResize);
window.addEventListener("pagehide", cleanup);
animationFrame = requestAnimationFrame(animate);
}
