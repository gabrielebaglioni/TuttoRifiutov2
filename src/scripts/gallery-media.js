import * as THREE from 'three';

// Keep the distortion within 50 units of the plane, far from the camera at z=400.
export const galleryVelocity = (value) => Number.isFinite(value) ? Math.max(-20, Math.min(20, value)) : 0;

export function loadGalleryImage(image, readScroll) {
  return new Promise((resolve) => {
    const finish = () => {
      image.removeEventListener('load', finish);
      image.removeEventListener('error', finish);
      if (!image.naturalWidth) return resolve(null);
      const bounds = image.getBoundingClientRect();
      resolve({ image, width: bounds.width, height: bounds.height, left: bounds.left, top: bounds.top + readScroll() });
    };
    if (image.complete) finish();
    else {
      image.addEventListener('load', finish, { once: true });
      image.addEventListener('error', finish, { once: true });
    }
  });
}

export function galleryTexture(image) {
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
