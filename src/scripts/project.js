import * as THREE from "three";
import { usesTouchLayout, prefersReducedMotion } from "./motion-policy.js";
import { startAfterCollectionsHydration } from "./collections-readiness.js";
import { loadGalleryImage, galleryTexture, galleryVelocity } from "./gallery-media.js";

const PROJECT_START_EVENT = "tutto-rifiuto:project-start";

// shaders
const vertexShader = `
  uniform float uScrollVelocity;
  uniform vec2 uTextureSize;
  uniform vec2 uQuadSize;
  out vec2 vUvCover;

  vec2 getCoverUv(vec2 uv, vec2 textureSize, vec2 quadSize) {
    vec2 ratio = vec2(
      min((quadSize.x / quadSize.y) / (textureSize.x / textureSize.y), 1.0),
      min((quadSize.y / quadSize.x) / (textureSize.y / textureSize.x), 1.0)
    );
    return vec2(
      uv.x * ratio.x + (1.0 - ratio.x) * 0.5,
      uv.y * ratio.y + (1.0 - ratio.y) * 0.5
    );
  }

  void main() {
    vUvCover = getCoverUv(uv, uTextureSize, uQuadSize);
    vec3 pos = position;
    float dist = length(uv - vec2(0.5));
    float bend = dist * dist * uScrollVelocity * 5.0;
    pos.z += bend;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform sampler2D uTexture;
  in vec2 vUvCover;
  out vec4 outColor;

  void main() {
    outColor = linearToOutputTexel(texture(uTexture, vUvCover));
  }
`;

// scroll-driven image distortion effect
export class ProjectDistortion {
  constructor() {
    const currentStarts = Number.parseInt(document.documentElement.dataset.projectDistortionInitCount ?? "0", 10);
    document.documentElement.dataset.projectDistortionInitCount = String(Number.isFinite(currentStarts) ? currentStarts + 1 : 1);
    this.scrollVelocity = 0;
    this.smoothVelocity = 0;
    this.mediaStore = [];
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.geometry = null;
    this.material = null;
    this.isMobile = usesTouchLayout();
    this.init();
  }

  init() {
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupGeometry();
    this.setupMaterial();
    this.createMeshes();
    this.setupLenisListener();
    this.addEventListeners();
    this.render();
  }

  setupScene() {
    this.scene = new THREE.Scene();
  }

  setupCamera() {
    const CAMERA_POS = 400;
    const calcFov = (pos) =>
      (2 * Math.atan(window.innerHeight / 2 / pos) * 180) / Math.PI;

    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      10,
      1000,
    );
    this.camera.position.z = CAMERA_POS;
    this.camera.fov = calcFov(CAMERA_POS);
    this.camera.updateProjectionMatrix();
  }

  setupRenderer() {
    if (this.isMobile) return;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.addEventListener("webglcontextlost", () => this.showNativeImages());
    this.renderer.debug.onShaderError = () => this.showNativeImages();
    this.renderer.domElement.style.position = "fixed";
    this.renderer.domElement.style.top = "0";
    this.renderer.domElement.style.left = "0";
    this.renderer.domElement.style.pointerEvents = "none";
    this.renderer.domElement.style.zIndex = "10";
    document.body.appendChild(this.renderer.domElement);
  }

  setupGeometry() {
    this.geometry = new THREE.PlaneGeometry(1, 1, 100, 100);
  }

  setupMaterial() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uScrollVelocity: { value: 0 },
        uTexture: { value: null },
        uTextureSize: { value: new THREE.Vector2(100, 100) },
        uQuadSize: { value: new THREE.Vector2(100, 100) },
      },
      vertexShader,
      fragmentShader,
      glslVersion: THREE.GLSL3,
    });
  }

  createMeshes() {
    const media = [...document.querySelectorAll(".project-img img")];
    Promise.all(media.map((image) => loadGalleryImage(image, () => window.scrollY || window.pageYOffset || 0))).then((loadedImages) => {
      this.mediaStore = loadedImages.filter(Boolean).map((bounds) => {
        const mediaElement = bounds.image;
        mediaElement.style.opacity = "1";
        const imageMaterial = this.material.clone();
        const imageMesh = new THREE.Mesh(this.geometry, imageMaterial);

        const texture = galleryTexture(mediaElement);
        texture.onUpdate = () => { this.needsGpuValidation = true; };

        imageMaterial.uniforms.uTexture.value = texture;
        imageMaterial.uniforms.uTextureSize.value.x =
          mediaElement.naturalWidth || 1;
        imageMaterial.uniforms.uTextureSize.value.y =
          mediaElement.naturalHeight || 1;
        imageMaterial.uniforms.uQuadSize.value.x = bounds.width;
        imageMaterial.uniforms.uQuadSize.value.y = bounds.height;

        imageMesh.scale.set(bounds.width, bounds.height, 1);

        if (!this.isMobile) {
          this.scene.add(imageMesh);
        }

        const object = {
          media: mediaElement,
          material: imageMaterial,
          mesh: imageMesh,
          width: bounds.width,
          height: bounds.height,
          top: bounds.top,
          left: bounds.left,
          source: mediaElement.currentSrc || mediaElement.src,
          drawn: false,
        };
        imageMesh.onAfterRender = () => { object.drawn = true; };
        return object;
      });
    });
  }

  setupLenisListener() {
    const checkLenis = () => {
      if (window.lenis) {
        window.lenis.on("scroll", ({ velocity }) => {
          this.scrollVelocity = galleryVelocity(velocity);
        });
      } else {
        setTimeout(checkLenis, 50);
      }
    };
    checkLenis();
  }

  setPositions() {
    this.mediaStore.forEach((object) => {
      // Native media is the authoritative fallback layer. A responsive
      // source swap must never be covered by an obsolete/unallocated texture.
      const source = object.media.currentSrc || object.media.src;
      object.mesh.visible = object.media.complete && object.media.naturalWidth > 0 && source === object.source;
      if (!object.mesh.visible) return;
      // Fonts, hydration and browser chrome can change layout after image load.
      const bounds = object.media.getBoundingClientRect();
      object.mesh.scale.set(bounds.width, bounds.height, 1);
      object.material.uniforms.uQuadSize.value.set(bounds.width, bounds.height);
      object.mesh.position.x = bounds.left - window.innerWidth / 2 + bounds.width / 2;
      object.mesh.position.y = -bounds.top + window.innerHeight / 2 - bounds.height / 2;
    });
  }

  addEventListeners() {
    window.addEventListener("resize", () => this.handleResize());
  }

  handleResize() {
    if (this.failed) return;
    const wasMobile = this.isMobile;
    this.isMobile = usesTouchLayout();

    if (this.isMobile !== wasMobile) {
      this.toggleMode();
    }

    if (this.isMobile) return;

    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.fov = (2 * Math.atan(window.innerHeight / 2 / this.camera.position.z) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    const scrollY = window.scrollY || window.pageYOffset;
    this.mediaStore.forEach((object) => {
      const bounds = object.media.getBoundingClientRect();
      object.width = bounds.width;
      object.height = bounds.height;
      object.top = bounds.top + scrollY;
      object.left = bounds.left;

      object.mesh.scale.set(bounds.width, bounds.height, 1);
      object.material.uniforms.uQuadSize.value.x = bounds.width;
      object.material.uniforms.uQuadSize.value.y = bounds.height;
    });
  }

  toggleMode() {
    if (this.isMobile) {
      if (this.renderer) this.renderer.domElement.style.display = "none";
      this.mediaStore.forEach((object) => {
        object.media.style.opacity = "1";
      });
    } else {
      if (!this.renderer) this.setupRenderer();
      if (this.renderer) this.renderer.domElement.style.display = "block";
      this.mediaStore.forEach((object) => {
        object.media.style.opacity = "1";
        if (!this.scene.children.includes(object.mesh)) {
          this.scene.add(object.mesh);
        }
      });
    }
  }

  showNativeImages() {
    this.failed = true;
    if (this.renderer) this.renderer.domElement.style.display = "none";
    document.querySelectorAll(".project-img img").forEach((image) => { image.style.opacity = "1"; });
  }

  render() {
    if (this.failed) return;
    if (this.isMobile) {
      requestAnimationFrame(() => this.render());
      return;
    }

    this.smoothVelocity += (this.scrollVelocity - this.smoothVelocity) * 0.1;

    this.mediaStore.forEach((object) => {
      object.drawn = false;
      object.material.uniforms.uScrollVelocity.value = this.smoothVelocity;
    });

    this.setPositions();
    try {
      if (this.renderer) this.renderer.render(this.scene, this.camera);
      // WebGL texture upload errors do not necessarily throw JS exceptions.
      if (this.needsGpuValidation && this.renderer) {
        this.needsGpuValidation = false;
        if (this.renderer.getContext().getError() !== 0) this.showNativeImages();
      }
      // Replace native media only for meshes drawn in THIS frame. A previous
      // texture upload says nothing about culling, source swaps or later frames.
      this.mediaStore.forEach((object) => {
        object.media.style.opacity = !this.failed && object.mesh.visible && object.drawn ? "0" : "1";
      });
    } catch { this.showNativeImages(); }
    requestAnimationFrame(() => this.render());
  }
}

function projectImageSnapshot(documentRef) {
  return Object.freeze([...documentRef.querySelectorAll(".project-img img")]
    .map((image) => image.getAttribute("src"))
    .filter((source) => typeof source === "string" && source.startsWith("/") && !source.startsWith("//") && !source.includes("\\")));
}

function canStartProjectEffect(windowRef, documentRef) {
  if (prefersReducedMotion(windowRef)) return false;
  if (!documentRef?.body || typeof windowRef?.requestAnimationFrame !== "function") return false;
  if (usesTouchLayout(windowRef)) return true;
  const canvas = documentRef.createElement?.("canvas");
  if (!canvas || typeof canvas.getContext !== "function") return false;
  try {
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) return false;
    context.getExtension?.("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function announceProjectStart(windowRef, images, outcome) {
  const detail = Object.freeze({ count: images.length, images, ...outcome });
  windowRef.dispatchEvent(new windowRef.CustomEvent(PROJECT_START_EVENT, { detail, cancelable: false }));
}

function attemptProjectStart(windowRef, documentRef) {
  if (!canStartProjectEffect(windowRef, documentRef)) return { started: false, status: "unsupported" };
  try {
    new ProjectDistortion();
    return { started: true, status: "started" };
  } catch {
    return { started: false, status: "error" };
  }
}

export function startProjectEffect({ windowRef = globalThis.window, documentRef = globalThis.document } = {}) {
  return startAfterCollectionsHydration({
    windowRef,
    documentRef,
    create: () => {
      const images = projectImageSnapshot(documentRef);
      const outcome = attemptProjectStart(windowRef, documentRef);
      announceProjectStart(windowRef, images, outcome);
    },
  });
}

if (typeof document !== "undefined" && typeof window !== "undefined") startProjectEffect();
