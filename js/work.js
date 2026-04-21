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

// scroll-driven image distortion effect
class WorkDistortion {
  constructor() {
    this.scrollVelocity = 0;
    this.smoothVelocity = 0;
    this.mediaStore = [];
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.geometry = null;
    this.material = null;
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
    const scrollY = window.scrollY || window.pageYOffset;
    const media = [...document.querySelectorAll(".work-item img")];

    const loadImage = (img) => {
      return new Promise((resolve) => {
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
        mediaElement.style.opacity = this.isMobile ? "1" : "0";

        const bounds = mediaElement.getBoundingClientRect();
        const imageMaterial = this.material.clone();
        const imageMesh = new THREE.Mesh(this.geometry, imageMaterial);

        const texture = new THREE.Texture(mediaElement);
        texture.needsUpdate = true;

        imageMaterial.uniforms.uTexture.value = texture;
        imageMaterial.uniforms.uTextureSize.value.x =
          mediaElement.naturalWidth || 1;
        imageMaterial.uniforms.uTextureSize.value.y =
          mediaElement.naturalHeight || 1;
        imageMaterial.uniforms.uQuadSize.value.x = bounds.width;
        imageMaterial.uniforms.uQuadSize.value.y = bounds.height;

        imageMesh.scale.set(bounds.width, bounds.height, 1);

        if (!this.isMobile) this.scene.add(imageMesh);

        return {
          media: mediaElement,
          material: imageMaterial,
          mesh: imageMesh,
          width: bounds.width,
          height: bounds.height,
          top: bounds.top + scrollY,
          left: bounds.left,
        };
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
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth < 1000;

    if (this.isMobile !== wasMobile) {
      this.toggleMode();
      return;
    }

    if (this.isMobile) return;

    this.camera.aspect = window.innerWidth / window.innerHeight;
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
        object.media.style.opacity = "0";
        if (!this.scene.children.includes(object.mesh))
          this.scene.add(object.mesh);
      });
    }
  }

  render() {
    if (this.isMobile) {
      requestAnimationFrame(() => this.render());
      return;
    }

    this.smoothVelocity += (this.scrollVelocity - this.smoothVelocity) * 0.1;

    this.mediaStore.forEach((object) => {
      object.material.uniforms.uScrollVelocity.value = this.smoothVelocity;
    });

    this.setPositions();
    if (this.renderer) this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.render());
  }
}

// initialization
document.addEventListener("DOMContentLoaded", () => new WorkDistortion());
