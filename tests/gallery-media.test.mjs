import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadGalleryImage, galleryTexture, galleryVelocity } from '../src/scripts/gallery-media.js';

test('fast scroll never bends image vertices through the camera near plane', () => {
  for (const input of [-10000, -100, 0, 100, 10000, NaN, Infinity]) {
    const displacement = 0.5 * Math.abs(galleryVelocity(input)) * 5;
    assert.ok(displacement <= 50);
  }
  assert.equal(galleryVelocity(3), 3);
});

test('late image load uses current scroll position, not the position when loading began', async () => {
  const image = new EventTarget();
  let scroll = 0;
  Object.assign(image, { complete: false, naturalWidth: 0, naturalHeight: 0,
    getBoundingClientRect: () => ({ top: 1800 - scroll, left: 100, width: 900, height: 600 }) });
  const pending = loadGalleryImage(image, () => scroll);
  scroll = 1400;
  image.naturalWidth = 1600; image.naturalHeight = 1000;
  image.dispatchEvent(new Event('load'));
  assert.equal((await pending).top, 1800);
});

test('broken images are not turned into opaque black WebGL planes', async () => {
  const image = new EventTarget();
  Object.assign(image, { complete: true, naturalWidth: 0 });
  assert.equal(await loadGalleryImage(image, () => 0), null);
});

test('gallery textures use the photograph color space and preserve their image source', () => {
  const image = { width: 1200, height: 900 };
  const texture = galleryTexture(image);
  assert.equal(texture.image, image);
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
  assert.ok(texture.version > 0);
});
