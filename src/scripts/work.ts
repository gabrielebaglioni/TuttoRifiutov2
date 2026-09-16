import * as THREE from "three";

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
    float bend = dist * dist * uScrollVelocity * 7.5;
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
    outColor = vec4(texture(uTexture, vUvCover).rgb, 1.0);
  }
`;


type GalleryUniforms = {
  uScrollVelocity: THREE.IUniform<number>;
  uTexture: THREE.IUniform<THREE.Texture | null>;
  uTextureSize: THREE.IUniform<THREE.Vector2>;
  uQuadSize: THREE.IUniform<THREE.Vector2>;
};
class GalleryMaterial extends THREE.ShaderMaterial {
  declare uniforms: GalleryUniforms;
  constructor(uniforms: GalleryUniforms = { uScrollVelocity: { value: 0 }, uTexture: { value: null }, uTextureSize: { value: new THREE.Vector2(100, 100) }, uQuadSize: { value: new THREE.Vector2(100, 100) } }) {
    super({ uniforms, vertexShader, fragmentShader, glslVersion: THREE.GLSL3 });
    this.uniforms = uniforms;
  }
}
function makeMaterial() {
  return new GalleryMaterial({
    uScrollVelocity: { value: 0 }, uTexture: { value: null },
    uTextureSize: { value: new THREE.Vector2(100, 100) },
    uQuadSize: { value: new THREE.Vector2(100, 100) },
  });
}
interface GalleryObject {
  media: HTMLImageElement; material: GalleryMaterial;
  mesh: THREE.Mesh<THREE.PlaneGeometry, GalleryMaterial>;
  width: number; height: number; top: number; left: number;
  source?: string; drawn?: boolean;
}
// scroll-driven image distortion effect
class WorkDistortion {
  scrollVelocity = 0;
  smoothVelocity = 0;
  mediaStore: GalleryObject[] = [];
  scene: THREE.Scene | null = null;
  camera: THREE.PerspectiveCamera | null = null;
  renderer: THREE.WebGLRenderer | null = null;
  geometry: THREE.PlaneGeometry | null = null;
  material: GalleryMaterial | null = null;
  isMobile: boolean;
  failed = false;
  needsGpuValidation = false;
  constructor() {
    this.scrollVelocity = 0;
    this.smoothVelocity = 0;
    this.mediaStore = [];
    this.renderer = null;
    this.isMobile = window.innerWidth < 1000;
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
    const calcFov = (pos: number) =>
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
    if (this.isMobile || this.failed) return;

    try { this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { this.showNativeImages(); return; }
    this.renderer?.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.addEventListener('webglcontextlost', () => this.showNativeImages());
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
    this.material = makeMaterial();
  }

  createMeshes() {
    const { scene, geometry, material } = this;
    if (!scene || !geometry || !material) return;
    const scrollY = window.scrollY || window.pageYOffset;
    const media = [...document.querySelectorAll<HTMLImageElement>(".work-item img")];

    const loadImage = (img: HTMLImageElement) => {
      return new Promise<HTMLImageElement>((resolve) => {
        if (img.complete && img.naturalWidth > 0) {
          resolve(img);
        } else {
          img.onload = () => resolve(img);
          img.onerror = () => resolve(img);
        }
      });
    };

    Promise.all(media.map(loadImage)).then((loadedImages) => {
      this.mediaStore = loadedImages.map((mediaElement) => {
        mediaElement.style.opacity = "1";

        const bounds = mediaElement.getBoundingClientRect();
        const imageMaterial = material.clone();
        const imageMesh = new THREE.Mesh(geometry, imageMaterial);
        imageMesh.visible = mediaElement.complete && mediaElement.naturalWidth > 0;

        const texture = new THREE.Texture(mediaElement);
        texture.needsUpdate = true;
        texture.onUpdate = () => { this.needsGpuValidation = true; };

        imageMaterial.uniforms.uTexture.value = texture;
        imageMaterial.uniforms.uTextureSize.value.x =
          mediaElement.naturalWidth || 1;
        imageMaterial.uniforms.uTextureSize.value.y =
          mediaElement.naturalHeight || 1;
        imageMaterial.uniforms.uQuadSize.value.x = bounds.width;
        imageMaterial.uniforms.uQuadSize.value.y = bounds.height;

        imageMesh.scale.set(bounds.width, bounds.height, 1);

        if (!this.isMobile) scene.add(imageMesh);

        const object: GalleryObject = {
          media: mediaElement,
          material: imageMaterial,
          mesh: imageMesh,
          width: bounds.width,
          height: bounds.height,
          top: bounds.top + scrollY,
          left: bounds.left,
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
          this.scrollVelocity = velocity;
        });
      } else {
        setTimeout(checkLenis, 50);
      }
    };
    checkLenis();
  }

  setPositions() {
    const scrollY = window.scrollY || window.pageYOffset;

    this.mediaStore.forEach((object) => {
      const x = object.left - window.innerWidth / 2 + object.width / 2;
      const y =
        -object.top + scrollY + window.innerHeight / 2 - object.height / 2;
      object.mesh.position.x = x;
      object.mesh.position.y = y;
    });
  }

  addEventListeners() {
    window.addEventListener("resize", () => this.handleResize());
  }

  handleResize() {
    if (this.failed) return;
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth < 1000;

    if (this.isMobile !== wasMobile) {
      this.toggleMode();
      return;
    }

    if (this.isMobile) return;

    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(window.innerWidth, window.innerHeight);

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
    if (this.failed) return;
    const scene = this.scene;
    if (!scene) return;
    if (this.isMobile) {
      if (this.renderer) this.renderer.domElement.style.display = "none";
      this.mediaStore.forEach((object) => {
        object.media.style.opacity = "1";
      });
    } else {
      if (!this.renderer) this.setupRenderer();
      if (this.failed) return;
      if (this.renderer) this.renderer.domElement.style.display = "block";
      this.mediaStore.forEach((object) => {
        object.media.style.opacity = "1";
        if (!scene.children.includes(object.mesh))
          scene.add(object.mesh);
      });
    }
  }

  showNativeImages() {
    this.failed = true;
    if (this.renderer) this.renderer.domElement.style.display = 'none';
    document.querySelectorAll<HTMLImageElement>('.work-item img').forEach((image) => { image.style.opacity = '1'; });
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
      if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
      if (this.needsGpuValidation && this.renderer) {
        this.needsGpuValidation = false;
        if (this.renderer.getContext().getError() !== 0) this.showNativeImages();
      }
      this.mediaStore.forEach((object) => {
        object.media.style.opacity = !this.failed && object.mesh.visible && object.drawn ? '0' : '1';
      });
    } catch { this.showNativeImages(); }
    requestAnimationFrame(() => this.render());
  }
}

// initialization
document.addEventListener("DOMContentLoaded", () => new WorkDistortion());
