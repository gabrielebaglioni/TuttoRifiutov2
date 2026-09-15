import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ProjectDistortion } from '../src/scripts/project.js';

function fixture(width = 1400, height = 900) {
  const effect = Object.create(ProjectDistortion.prototype);
  globalThis.window = { innerWidth: width, innerHeight: height, scrollY: 0, pageYOffset: 0 };
  globalThis.requestAnimationFrame = () => 0;
  effect.isMobile = width < 1000;
  effect.scene = new THREE.Scene();
  effect.renderer = { setSize() {}, render() {}, getContext: () => ({ getError: () => 0 }), domElement: { style: {} } };
  effect.scrollVelocity = effect.smoothVelocity = 0;
  effect.setupCamera();
  const media = { style: { opacity: '1' }, currentSrc: '/photo.webp', complete: true, naturalWidth: 1400,
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 900, height: 600 }) };
  const object = { media, source: '/photo.webp', uploaded: true, width: 900, height: 600, top: 200, left: 100,
    mesh: new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial()),
    material: { uniforms: { uScrollVelocity: { value: 0 }, uQuadSize: { value: new THREE.Vector2() } } } };
  effect.mediaStore = [object];
  return { effect, object };
}

test('wide touch tablet retains native gallery images after an orientation resize', () => {
  const { effect, object } = fixture(1180, 820);
  window.matchMedia = () => ({ matches: true });
  effect.handleResize();
  assert.equal(effect.isMobile, true);
  assert.equal(object.media.style.opacity, '1');
});

test('a texture upload without a mesh draw never hides the native photograph', () => {
  const { effect, object } = fixture();
  effect.render();
  assert.equal(object.media.style.opacity, '1');
});

test('native photo is restored on the first frame where its mesh is no longer drawn', () => {
  const { effect, object } = fixture();
  effect.renderer.render = () => { object.drawn = true; };
  effect.render();
  assert.equal(object.media.style.opacity, '0', 'one visible layer after a successful mesh draw');
  effect.renderer.render = () => {};
  effect.render();
  assert.equal(object.media.style.opacity, '1', 'no permanent hiding based on an earlier frame');
});

test('a late layout shift cannot leave gallery meshes in their old position', () => {
  const { effect, object } = fixture();
  object.media.getBoundingClientRect = () => ({ left: 120, top: 450, width: 700, height: 500 });
  effect.setPositions();
  assert.equal(object.mesh.position.x, -230);
  assert.equal(object.mesh.position.y, -250);
  assert.equal(object.mesh.scale.x, 700);
});

for (const initial of [[390, 844], [1400, 900]]) {
  test(`resize from ${initial.join('x')} preserves one CSS pixel per world unit`, () => {
    const { effect } = fixture(...initial);
    window.innerWidth = 1280; window.innerHeight = 720;
    effect.handleResize();
    const visibleHeight = 2 * effect.camera.position.z * Math.tan(THREE.MathUtils.degToRad(effect.camera.fov / 2));
    assert.ok(Math.abs(visibleHeight - 720) < 0.001);
    assert.equal(effect.camera.aspect, 1280 / 720);
  });
}

test('responsive source changes suspend an obsolete GPU image instead of covering the current photo', () => {
  const { effect, object } = fixture();
  object.media.currentSrc = '/new-photo.webp';
  effect.setPositions();
  assert.equal(object.mesh.visible, false);
  assert.equal(object.media.style.opacity, '1');
});

test('GPU validation runs after an upload, not on every animation frame', () => {
  const { effect } = fixture();
  let reads = 0;
  effect.needsGpuValidation = true;
  effect.renderer.getContext = () => ({ getError: () => { reads++; return 0; } });
  effect.render(); effect.render();
  assert.equal(reads, 1);
});

test('a non-throwing GPU error hides the overlay and preserves native media', () => {
  const { effect, object } = fixture();
  globalThis.document = { querySelectorAll: () => [object.media] };
  effect.needsGpuValidation = true;
  effect.renderer.getContext = () => ({ getError: () => 1282 });
  effect.render();
  assert.equal(effect.renderer.domElement.style.display, 'none');
  assert.equal(object.media.style.opacity, '1');
  delete globalThis.document;
});

test('resizing after GPU failure cannot reactivate the failed overlay', () => {
  const { effect } = fixture(390, 844);
  effect.failed = true;
  effect.renderer.domElement.style.display = 'none';
  window.innerWidth = 1280;
  effect.handleResize();
  assert.equal(effect.renderer.domElement.style.display, 'none');
});

test.after(() => { delete globalThis.window; delete globalThis.requestAnimationFrame; });
