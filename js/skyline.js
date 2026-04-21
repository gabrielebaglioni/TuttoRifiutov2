import * as THREE from "three";

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
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
    #else
      precision mediump float;
    #endif

    uniform float iTime;
    uniform vec3 iResolution;
    varying vec2 vUv;

    // --- hash usato dalla grana ---
    float hash21(vec2 p) {
      p = fract(p*vec2(123.34, 456.21));
      p += dot(p, p+45.32);
      return fract(p.x*p.y);
    }

    // =========================================================================
    // TUTTO QUESTO BLOCCO È DISATTIVATO — lasciato solo come riferimento.
    // Rimettere in vita rimuovendo i commenti e ripristinando le chiamate in main().
    // =========================================================================
    //
    // // hash usato dai pezzi di carta
    // float h1(float n) { return fract(sin(n*91.345) * 47658.3); }
    //
    // // SDF / utilities
    // float sdBox(vec2 p, vec2 b) {
    //   vec2 d = abs(p) - b;
    //   return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    // }
    // vec2 rot(vec2 p, float a) {
    //   float c = cos(a), s = sin(a);
    //   return vec2(c*p.x - s*p.y, s*p.x + c*p.y);
    // }
    //
    // // tunnel radiale: anelli + raggi che scorrono dal centro verso fuori
    // float tunnel(vec2 uv, float t) {
    //   float r = length(uv);
    //   float theta = atan(uv.y, uv.x);
    //   float z = 1.0/max(r, 0.02) + t*1.8;
    //   float ringBand  = abs(fract(z*0.25) - 0.5) * 2.0;
    //   float ring      = smoothstep(0.92, 1.0, 1.0 - ringBand);
    //   float spokeBand = abs(fract(theta*14.0/3.14159265) - 0.5) * 2.0;
    //   float spoke     = smoothstep(0.92, 1.0, 1.0 - spokeBand);
    //   float fadeCenter = smoothstep(0.015, 0.18, r);
    //   float fadeEdge   = smoothstep(1.1, 0.55, r);
    //   return (ring*0.7 + spoke*0.3) * fadeCenter * fadeEdge;
    // }
    //
    // // pezzi di carta che volano dal tunnel e si posano sul fondo
    // #define NUM_SCRAPS 24
    // float scraps(vec2 uv, float t) {
    //   float d = 10.0;
    //   const float groundY    = -0.42;
    //   const float flightEnd  = 2.6;
    //   const float totalLife  = 6.8;
    //   for (int i = 0; i < NUM_SCRAPS; i++) {
    //     float idx   = float(i);
    //     float speed = 0.85 + h1(idx + 0.1) * 0.35;
    //     float phase = h1(idx + 0.3) * 12.0;
    //     float life  = mod(t * speed + phase, totalLife);
    //     float flight = clamp(life / flightEnd, 0.0, 1.0);
    //     float emergeAngle = h1(idx + 0.7) * 6.28318;
    //     vec2  emergeDir   = vec2(cos(emergeAngle), sin(emergeAngle));
    //     float landX = emergeDir.x * 1.1 + (h1(idx + 1.3) - 0.5) * 0.35;
    //     landX = clamp(landX, -0.85, 0.85);
    //     float stackY  = groundY + h1(idx + 1.7) * 0.06;
    //     vec2  restPos = vec2(landX, stackY);
    //     vec2 startPos = vec2(0.0, 0.0);
    //     vec2 midPos   = restPos * 0.5 + vec2(0.0, 0.35 + h1(idx + 0.8) * 0.3);
    //     vec2 pos      = mix(mix(startPos, midPos, flight),
    //                         mix(midPos, restPos, flight),
    //                         flight);
    //     float restSize = 0.045 + h1(idx + 2.1) * 0.030;
    //     float size     = mix(0.004, restSize, flight);
    //     float fadeOut  = 1.0 - smoothstep(totalLife - 0.4, totalLife, life);
    //     size *= fadeOut;
    //     float spinRot = life * 4.5 + h1(idx + 2.5) * 6.28318;
    //     float restRot = (h1(idx + 2.5) - 0.5) * 0.7;
    //     float rr      = mix(spinRot, restRot, smoothstep(0.85, 1.0, flight));
    //     vec2  local   = rot(uv - pos, rr);
    //     float aspect  = 0.6 + h1(idx + 3.1) * 0.7;
    //     float dd      = sdBox(local, vec2(size*1.25, size*aspect));
    //     d = min(d, dd);
    //   }
    //   return d;
    // }

    void main() {
      // base pulita (diventerà gialla in uscita)
      vec3 color = vec3(1.0);

      // grana "fotocopia sporca" — macchioline scure sparse
      vec2 grainUv = vUv * iResolution.xy * 0.9 + floor(iTime*5.);
      float g1 = hash21(grainUv);
      float g2 = hash21(grainUv*0.4 + 13.0);
      float specks = step(0.965, g1)*0.45 + step(0.97, g2)*0.25;
      color = clamp(color - specks, 0.0, 1.0);

      // haze a bassa frequenza per sporcare il giallo
      float haze = (hash21(floor(vUv * iResolution.xy * 0.5)) - 0.5) * 0.04;
      color = clamp(color - haze, 0.0, 1.0);

      // mappatura finale: bianco → giallo, pieno → nero
      const vec3 bgColor = vec3(1.0, 1.0, 0.0);
      color = mix(bgColor, vec3(0.0), 1.0 - color.r);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
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
