import { meaningfulResize, usesTouchLayout, particleScale, prefersReducedMotion } from "./motion-policy.ts";
import { publicTheme } from './theme.ts';
import { installTouchExplosion } from './touch-explosion.ts';
let particleViewport = { width: window.innerWidth, height: window.innerHeight };
// webgl particle system with mouse distortion
const PV = {
  config: {
    logoSize: 3000,
    distortionRadius: 2000,
    forceStrength: 0.05,
    maxDisplacement: 1000,
    returnForce: 0.1,
    logoPath: "/lab/hero-visual3.webp",
    particleSpacing: 2,
  },
  canvas: null,
  gl: null,
  program: null,
  geometry: null,
  particles: [],
  posArray: null,
  colorArray: null,
  mouse: { x: 0, y: 0 },
  execCount: 0,
  isMobile: false,
  animFrame: null,
  isAnimating: false,
  isVisible: true,
  failed: false,
  touch: null,
  touchStrength: 0,
  touchPoint: {x:0,y:0},
  bounds: null,
};

// initialization
document.addEventListener("DOMContentLoaded", init);

function init() {
  PV.canvas = document.getElementById("particle-canvas");
  if (!PV.canvas) return;
  if (prefersReducedMotion()) { showParticleFallback(); return; }
  PV.canvas.addEventListener('webglcontextlost', showParticleFallback);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    PV.isVisible = entry.isIntersecting;
    if (PV.isMobile && PV.isVisible && PV.geometry) render();
  }, { rootMargin: "200px" });
  visibilityObserver.observe(PV.canvas);
  window.addEventListener("pagehide", (event) => { if (!event.persisted) visibilityObserver.disconnect(); });

  PV.isMobile = usesTouchLayout();
  const dpr = Math.min(devicePixelRatio || 1, 2);

  PV.canvas.width = innerWidth * dpr;
  PV.canvas.height = innerHeight * dpr;
  PV.canvas.style.width = innerWidth + "px";
  PV.canvas.style.height = innerHeight + "px";

  try { PV.gl = PV.canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    powerPreference: "high-performance",
    desynchronized: true,
  }); } catch { showParticleFallback(); return; }

  if (!PV.gl) { showParticleFallback(); return; }

  PV.gl.enable(PV.gl.BLEND);
  PV.gl.blendFunc(PV.gl.SRC_ALPHA, PV.gl.ONE_MINUS_SRC_ALPHA);

  try {
    if (!setupShaders()) { showParticleFallback(); return; }
  } catch { showParticleFallback(); return; }
  const unbindTheme = publicTheme().subscribe(({rgb}) => {
    if (PV.failed) return;
    PV.gl.useProgram(PV.program);
    PV.gl.uniform3fv(PV.gl.getUniformLocation(PV.program, 'uInk'), rgb.foreground);
    PV.gl.uniform3fv(PV.gl.getUniformLocation(PV.program, 'uHighlight'), rgb.highlight);
    if (PV.geometry) render();
  });
  window.addEventListener('pagehide', (event) => { if (!event.persisted) unbindTheme(); });
  loadImage();

  if (!PV.isMobile) {
    document.addEventListener("mousemove", handleMouseMove, { passive: true });
  }
  window.addEventListener("resize", handleResize);
}

function showParticleFallback() {
  PV.failed = true;
  PV.touch?.destroy();
  cancelAnimationFrame(PV.animFrame);
  PV.canvas.style.display = 'none';
  if (PV.canvas.parentElement.querySelector('.particle-fallback')) return;
  const image = document.createElement('img');
  image.className = 'particle-fallback';
  image.src = PV.config.logoPath;
  image.alt = 'Tutto Rifiuto';
  PV.canvas.after(image);
}

// shader setup
function setupShaders() {
  const vs = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_pointSize;
    uniform vec2 uTouchPoint;
    uniform float uTouchStrength;
    uniform float uTouchRadius;
    attribute vec2 a_position;
    attribute vec4 a_color;
    varying vec4 v_color;
    void main() {
      vec2 position = a_position;
      if (uTouchStrength > 0.0) {
        vec2 delta = position - uTouchPoint;
        float distance = length(delta);
        float falloff = 1.0 - smoothstep(0.0, uTouchRadius, distance);
        position += delta / max(distance, 1.0) * falloff * uTouchStrength * uTouchRadius * 0.45;
      }
      vec2 clip = (position / u_resolution * 2.0 - 1.0) * vec2(1.0, -1.0);
      v_color = a_color;
      gl_Position = vec4(clip, 0.0, 1.0);
      gl_PointSize = u_pointSize;
    }`;

  const fs = `
    precision mediump float;
    uniform vec3 uInk;
    uniform vec3 uHighlight;
    varying vec4 v_color;
    void main() {
      if (v_color.a < 0.01) discard;
      float dist = length(gl_PointCoord - 0.5);
      float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
      gl_FragColor = vec4(mix(uInk, uHighlight, v_color.rgb), v_color.a * alpha);
    }`;

  const vShader = PV.gl.createShader(PV.gl.VERTEX_SHADER);
  PV.gl.shaderSource(vShader, vs);
  PV.gl.compileShader(vShader);
  if (!PV.gl.getShaderParameter(vShader, PV.gl.COMPILE_STATUS)) return false;

  const fShader = PV.gl.createShader(PV.gl.FRAGMENT_SHADER);
  PV.gl.shaderSource(fShader, fs);
  PV.gl.compileShader(fShader);
  if (!PV.gl.getShaderParameter(fShader, PV.gl.COMPILE_STATUS)) return false;

  PV.program = PV.gl.createProgram();
  PV.gl.attachShader(PV.program, vShader);
  PV.gl.attachShader(PV.program, fShader);
  PV.gl.linkProgram(PV.program);
  return PV.gl.getProgramParameter(PV.program, PV.gl.LINK_STATUS);
}

// image loading and particle creation
function loadImage() {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    if (PV.failed) return;
    const temp = document.createElement("canvas");
    const ctx = temp.getContext("2d", { willReadFrequently: true });
    if (!ctx) { showParticleFallback(); return; }
    // Touch deformation stays on the GPU. Sample at display scale rather than reading
    // nine million pixels and constructing millions of invisible particles.
    PV.rasterSize = PV.isMobile ? 640 : PV.config.logoSize;
    temp.width = temp.height = PV.rasterSize;

    const s = PV.rasterSize * 0.9;
    const o = (PV.rasterSize - s) / 2;
    ctx.drawImage(img, o, o, s, s);

    createParticles(
      ctx.getImageData(0, 0, PV.rasterSize, PV.rasterSize).data,
    );
  };
  img.onerror = showParticleFallback;
  img.src = PV.config.logoPath;
}

function createParticles(pixels) {
  const cx = PV.canvas.width / 2;
  const cy = PV.canvas.height / 2;
  const dim = PV.rasterSize;
  const scale = particleScale(PV.canvas, dim, PV.config.logoSize, PV.isMobile, innerWidth);
  const spacing = PV.config.particleSpacing;

  const pos = [];
  const colors = [];
  PV.particles = [];
  PV.bounds={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};

  for (let i = 0; i < dim; i += spacing) {
    for (let j = 0; j < dim; j += spacing) {
      const idx = (i * dim + j) * 4;
      if (pixels[idx + 3] > 50) {
        const x = cx + (j - dim / 2) * scale;
        const y = cy + (i - dim / 2) * scale;
        PV.bounds.left=Math.min(PV.bounds.left,x);PV.bounds.right=Math.max(PV.bounds.right,x);
        PV.bounds.top=Math.min(PV.bounds.top,y);PV.bounds.bottom=Math.max(PV.bounds.bottom,y);

        pos.push(x, y);
        colors.push(
          pixels[idx] / 255,
          pixels[idx + 1] / 255,
          pixels[idx + 2] / 255,
          pixels[idx + 3] / 255,
        );
        PV.particles.push({ ox: x, oy: y, vx: 0, vy: 0, i, j });
      }
    }
  }

  PV.posArray = new Float32Array(pos);
  const posBuf = PV.gl.createBuffer();
  PV.gl.bindBuffer(PV.gl.ARRAY_BUFFER, posBuf);
  PV.gl.bufferData(PV.gl.ARRAY_BUFFER, PV.posArray, PV.gl.DYNAMIC_DRAW);

  const colBuf = PV.gl.createBuffer();
  PV.gl.bindBuffer(PV.gl.ARRAY_BUFFER, colBuf);
  PV.gl.bufferData(
    PV.gl.ARRAY_BUFFER,
    new Float32Array(colors),
    PV.gl.STATIC_DRAW,
  );

  PV.geometry = { posBuf, colBuf, count: PV.particles.length };
  if (PV.isMobile && PV.particles.length) {
    PV.touch?.destroy();
    PV.touch = installTouchExplosion({
      canvas: PV.canvas, bounds:()=>PV.bounds,
      enabled:()=>PV.isMobile && !PV.failed && PV.isVisible && !prefersReducedMotion() &&
        !document.querySelector('.menu-toggle-btn[aria-expanded="true"]') && PV.canvas.getBoundingClientRect().top > -24,
      onFrame:(x,y,strength)=>{PV.touchPoint.x=x;PV.touchPoint.y=y;PV.touchStrength=strength;if(!document.hidden)render();},
    });
  }
  console.log(`Particles created: ${PV.particles.length}`);
  animate();
}

// animation loop with physics
function animate() {
  if (PV.failed) return;
  if (PV.isMobile) {
    if (PV.isVisible && !document.hidden) render();
    return;
  }
  PV.animFrame = requestAnimationFrame(animate);
  if (!PV.isVisible || document.hidden) return;

  if (!PV.isMobile && PV.execCount > 0) {
    PV.execCount--;
    const rad = PV.config.distortionRadius ** 2;
    let needsUpdate = false;

    for (let i = 0; i < PV.particles.length; i++) {
      const x = PV.posArray[i * 2];
      const y = PV.posArray[i * 2 + 1];
      const p = PV.particles[i];
      const dx = PV.mouse.x - x;
      const dy = PV.mouse.y - y;
      const dis = dx * dx + dy * dy;

      if (dis < rad && dis > 0) {
        const f = -rad / dis;
        const distOrig = Math.sqrt((x - p.ox) ** 2 + (y - p.oy) ** 2);
        const mult = Math.max(
          0.1,
          1 - distOrig / (PV.config.maxDisplacement * 2),
        );
        p.vx +=
          f * Math.cos(Math.atan2(dy, dx)) * PV.config.forceStrength * mult;
        p.vy +=
          f * Math.sin(Math.atan2(dy, dx)) * PV.config.forceStrength * mult;
        needsUpdate = true;
      }

      if (Math.abs(p.vx) > 0.01 || Math.abs(p.vy) > 0.01) {
        const nx = x + (p.vx *= 0.82) + (p.ox - x) * PV.config.returnForce;
        const ny = y + (p.vy *= 0.82) + (p.oy - y) * PV.config.returnForce;
        const dox = nx - p.ox;
        const doy = ny - p.oy;
        const distOrig = Math.sqrt(dox * dox + doy * doy);

        if (distOrig > PV.config.maxDisplacement) {
          const s = PV.config.maxDisplacement / distOrig;
          const ds =
            s +
            (1 - s) * Math.exp(-(distOrig - PV.config.maxDisplacement) * 0.02);
          PV.posArray[i * 2] = p.ox + dox * ds;
          PV.posArray[i * 2 + 1] = p.oy + doy * ds;
          p.vx *= 0.7;
          p.vy *= 0.7;
        } else {
          PV.posArray[i * 2] = nx;
          PV.posArray[i * 2 + 1] = ny;
        }
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      PV.gl.bindBuffer(PV.gl.ARRAY_BUFFER, PV.geometry.posBuf);
      PV.gl.bufferSubData(PV.gl.ARRAY_BUFFER, 0, PV.posArray);
    }
  }

  render();
}

// webgl render
function render() {
  if (PV.failed) return;
  PV.gl.viewport(0, 0, PV.canvas.width, PV.canvas.height);
  PV.gl.clearColor(0, 0, 0, 0);
  PV.gl.clear(PV.gl.COLOR_BUFFER_BIT);
  PV.gl.useProgram(PV.program);
  // Keep coverage when touch sampling uses fewer points; desktop stays at 3px.
  if (PV.isMobile) {
    PV.gl.uniform2f(PV.gl.getUniformLocation(PV.program,'uTouchPoint'),PV.touchPoint.x,PV.touchPoint.y);
    PV.gl.uniform1f(PV.gl.getUniformLocation(PV.program,'uTouchStrength'),PV.touchStrength);
    PV.gl.uniform1f(PV.gl.getUniformLocation(PV.program,'uTouchRadius'),110*PV.canvas.width/PV.canvas.clientWidth);
  } else PV.gl.uniform1f(PV.gl.getUniformLocation(PV.program,'uTouchStrength'),0);
  const pointSize = PV.isMobile ? Math.max(3, particleScale(PV.canvas, PV.rasterSize, PV.config.logoSize, true, innerWidth) * PV.config.particleSpacing * 1.5) : 3;
  PV.gl.uniform1f(PV.gl.getUniformLocation(PV.program, "u_pointSize"), pointSize);

  PV.gl.uniform2f(
    PV.gl.getUniformLocation(PV.program, "u_resolution"),
    PV.canvas.width,
    PV.canvas.height,
  );

  PV.gl.bindBuffer(PV.gl.ARRAY_BUFFER, PV.geometry.posBuf);
  PV.gl.enableVertexAttribArray(0);
  PV.gl.vertexAttribPointer(0, 2, PV.gl.FLOAT, false, 0, 0);

  PV.gl.bindBuffer(PV.gl.ARRAY_BUFFER, PV.geometry.colBuf);
  PV.gl.enableVertexAttribArray(1);
  PV.gl.vertexAttribPointer(1, 4, PV.gl.FLOAT, false, 0, 0);

  PV.gl.drawArrays(PV.gl.POINTS, 0, PV.geometry.count);
}

// event handlers
function handleMouseMove(e) {
  const rect = PV.canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  PV.mouse.x = (e.clientX - rect.left) * dpr;
  PV.mouse.y = (e.clientY - rect.top) * dpr;
  PV.execCount = 300;
}

function handleResize() {
  if (PV.failed) return;
  const next = { width: innerWidth, height: innerHeight };
  if (!meaningfulResize(particleViewport, next, PV.isMobile)) return;
  particleViewport = next;
  PV.isMobile = usesTouchLayout();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  PV.canvas.width = innerWidth * dpr;
  PV.canvas.height = innerHeight * dpr;
  PV.canvas.style.width = innerWidth + "px";
  PV.canvas.style.height = innerHeight + "px";

  const cx = PV.canvas.width / 2;
  const cy = PV.canvas.height / 2;
  if (!PV.geometry) return;
  const dim = PV.rasterSize;
  const scale = particleScale(PV.canvas, dim, PV.config.logoSize, PV.isMobile, innerWidth);

  PV.bounds={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
  for (let i = 0; i < PV.particles.length; i++) {
    const p = PV.particles[i];
    p.ox = cx + (p.j - dim / 2) * scale;
    p.oy = cy + (p.i - dim / 2) * scale;
    PV.bounds.left=Math.min(PV.bounds.left,p.ox);PV.bounds.right=Math.max(PV.bounds.right,p.ox);
    PV.bounds.top=Math.min(PV.bounds.top,p.oy);PV.bounds.bottom=Math.max(PV.bounds.bottom,p.oy);
    p.vx = p.vy = 0;
    PV.posArray[i * 2] = p.ox;
    PV.posArray[i * 2 + 1] = p.oy;
  }

  PV.gl.bindBuffer(PV.gl.ARRAY_BUFFER, PV.geometry.posBuf);
  PV.gl.bufferSubData(PV.gl.ARRAY_BUFFER, 0, PV.posArray);
  cancelAnimationFrame(PV.animFrame);
  PV.touch?.layout();
  animate();
}
