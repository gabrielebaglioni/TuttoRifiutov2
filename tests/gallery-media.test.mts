import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadGalleryImage, galleryTexture, galleryVelocity } from '../src/scripts/gallery-media.ts';
import { parseHTML } from 'linkedom';
import { required } from './worker-fixtures.mts';
import { rect } from './browser-test-utils.mts';

test('fast scroll never bends image vertices through the camera near plane', () => {
  for (const input of [-10000, -100, 0, 100, 10000, NaN, Infinity]) {
    const displacement = 0.5 * Math.abs(galleryVelocity(input)) * 5;
    assert.ok(displacement <= 50);
  }
  assert.equal(galleryVelocity(3), 3);
});

test('late image load uses current scroll position, not the position when loading began', async () => {
  const { document, window } = parseHTML('<img>');
  const image = required(document.querySelector('img'));
  let scroll = 0;
  Object.defineProperties(image, { complete: {value:false}, naturalWidth: {value:0, writable:true}, naturalHeight: {value:0,writable:true} });
  image.getBoundingClientRect = () => rect(100, 1800 - scroll, 900, 600);
  const pending = loadGalleryImage(image, () => scroll);
  scroll = 1400;
  Object.defineProperties(image, { naturalWidth: {value:1600}, naturalHeight: {value:1000} });
  image.dispatchEvent(new window.Event('load'));
  assert.equal(required(await pending).top, 1800);
});

test('broken images are not turned into opaque black WebGL planes', async () => {
  const image = required(parseHTML('<img>').document.querySelector('img'));
  Object.defineProperties(image, { complete: {value:true}, naturalWidth: {value:0} });
  assert.equal(await loadGalleryImage(image, () => 0), null);
});

test('gallery textures use the photograph color space and preserve their image source', () => {
  const image = required(parseHTML('<img>').document.querySelector('img'));
  image.width = 1200; image.height = 900;
  const texture = galleryTexture(image);
  assert.equal(texture.image, image);
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
  assert.ok(texture.version > 0);
});
