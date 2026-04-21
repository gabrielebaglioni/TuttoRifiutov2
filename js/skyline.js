import * as THREE from "three";
import { GRAIN_FRAGMENT_SHADER, GRAIN_VERTEX_SHADER } from "./grain-yellow-shader.js";

// procedural trashscape — cumuli di pacchetti/sacchi abbandonati per strada
// (Tutto Rifiuto: pacchetti lasciati per le strade della città)
const canvas = document.getElementById("skyline");
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
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
scene.add(mesh);

// resize handler with debounce
let resizeTimeout;

function handleResize() {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioLimit));
    material.uniforms.iResolution.value.set(width, height, 1);
  }, 100);
}

// animation loop
function animate(currentTime) {
  requestAnimationFrame(animate);
  material.uniforms.iTime.value = currentTime * 0.001;
  renderer.render(scene, camera);
}

// cleanup on page unload
function cleanup() {
  geometry.dispose();
  material.dispose();
  renderer.dispose();
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("beforeunload", cleanup);
}

// initialize
handleResize();
window.addEventListener("resize", handleResize);
window.addEventListener("beforeunload", cleanup);
requestAnimationFrame(animate);
