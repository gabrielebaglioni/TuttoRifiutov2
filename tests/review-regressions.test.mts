import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parseHTML } from 'linkedom';
import { verifyCredentials } from '../worker/auth.ts';
import { rewriteMetadata } from '../worker/html-metadata.ts';
import { routeRequest } from '../worker/router.ts';
import { d1Double } from './worker-fixtures.mts';
import { readBrowserScript } from './read-browser-script.mts';
import * as THREE from 'three';

test('credential primitives cannot authenticate through string coercion', async () => {
  for (const value of [null, undefined, 123, true, ['admin']]) {
    const env = { ADMIN_USERNAME: String(value), ADMIN_PASSWORD: String(value) };
    assert.equal(await verifyCredentials(env, value, value), false);
  }
});

test('metadata values cannot escape single-quoted HTML attributes', () => {
  const payload = "Title' onload='alert(1)";
  const html = rewriteMetadata("<html><head><meta name='description' content='old'><link rel='canonical' href='/old'></head></html>", { description: payload, canonical: payload });
  const { document } = parseHTML(html);
  assert.equal(document.querySelector('meta')?.getAttribute('content'), payload);
  assert.equal(document.querySelector('link')?.getAttribute('href'), payload);
  assert.equal(document.querySelector('[onload]'), null);
});

test('metadata failure after consuming the asset still returns a readable fallback', async () => {
  class FailedTransformResponse extends Response {
    override async text(): Promise<string> { await super.text(); throw new Error('transform read failed'); }
  }
  const html = '<html><head><title>Original</title></head><body>Preserved</body></html>';
  const DB = d1Double({ prepare() { return { bind() { return this; }, all: async () => ({ results: [] }) }; } });
  const response = await routeRequest(new Request('https://site.test/'), { DB, ASSETS: { fetch: async () => new FailedTransformResponse(html, { headers: { 'content-type': 'text/html' } }) } }, {});
  assert.equal(response.status, 200);
  assert.equal(await response.text(), html);
});

test('menu library is loaded with the initial module, before any menu request', () => {
  const source = ts.transpileModule(readFileSync('src/scripts/menu-library.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, unknown> = {};
  let attempts = 0;
  vm.runInNewContext(source, { exports, require() { attempts++; return { marker: 'loaded' }; } });
  assert.equal(attempts, 1, 'the initial module must already include the renderer');
  const load = exports.loadMenuLibrary;
  assert.equal(typeof load, 'function');
  if (typeof load !== 'function') throw new Error('missing loader');
  const first = load();
  assert.equal(load(), first);
  assert.equal(attempts, 1);
});

for (const component of ['EventCard', 'EventDetail']) test(`${component} retains URL and imported-image video posters`, () => {
  const source = readFileSync(`src/components/${component}.astro`, 'utf8');
  const expression = source.match(/poster=\{([^}]+)\}/)?.[1];
  assert.ok(expression);
  for (const poster of ['/media/video-poster.webp', { src: '/_astro/imported-poster.webp' }]) {
    assert.equal(vm.runInNewContext(expression, { media: { poster } }), typeof poster === 'string' ? poster : poster.src);
  }
});

test('contact clocks show Rome summer and winter time without parsing localized dates', () => {
  const source = readBrowserScript(new URL('../src/scripts/contact.ts', import.meta.url)).replace(/^import .*;$/gm, '');
  for (const [iso, expected] of [['2026-07-01T12:34:00Z', '14:34 CEST'], ['2026-01-01T12:34:00Z', '13:34 CET']] as const) {
    class ClockDate extends Date { constructor() { super(iso); } }
    const context = vm.createContext({ Date: ClockDate, Intl, window: { innerWidth: 1400 }, gsap: { registerPlugin() {} }, ScrollTrigger: {}, document: { addEventListener() {} } });
    vm.runInContext(source, context);
    assert.equal(vm.runInContext('getRomeTime()', context), expected);
  }
});

for (const failure of ['exception', 'gpu', 'no-draw']) test(`work images remain visible on ${failure}`, () => {
  const source = readBrowserScript(new URL('../src/scripts/work.ts', import.meta.url)).replace(/^import .*;$/gm, '');
  const media = { style: { opacity: '0' }, complete: true, naturalWidth: 800 };
  const canvas = { style: { display: 'block' } };
  const context = vm.createContext({ THREE, media, canvas, failure, window: { innerWidth: 1400, innerHeight: 900, scrollY: 0 }, document: { addEventListener() {}, querySelectorAll: () => [media] }, requestAnimationFrame() {} });
  vm.runInContext(source + `
    const effect = Object.create(WorkDistortion.prototype);
    Object.assign(effect, { isMobile: false, failed: false, scrollVelocity: 0, smoothVelocity: 0, needsGpuValidation: true,
      scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
      renderer: { domElement: canvas, render() { if (failure === 'exception') throw new Error('GPU lost'); }, getContext() { return { getError: () => failure === 'gpu' ? 1282 : 0 }; } },
      mediaStore: [{ media, mesh: new THREE.Mesh(), material: { uniforms: { uScrollVelocity: { value: 0 } } }, left: 0, top: 0, width: 800, height: 600 }]
    });
    effect.render();
  `, context);
  assert.equal(media.style.opacity, '1');
  if (failure !== 'no-draw') assert.equal(canvas.style.display, 'none');
});

test('reduced motion keeps stats visible without scrubbed translation', () => {
  const source = readBrowserScript(new URL('../src/scripts/stats.ts', import.meta.url)).replace(/^import .*;$/gm, '');
  const item = { x: 250 };
  let triggers = 0;
  const context = vm.createContext({ prefersReducedMotion: () => true, document: { addEventListener() {}, querySelectorAll: () => [item] }, gsap: { registerPlugin() {}, set(target: typeof item, values: { x: number }) { target.x = values.x; } }, ScrollTrigger: { create() { triggers++; } } });
  vm.runInContext(source, context);
  vm.runInContext('initStatsAnimation()', context);
  assert.equal(item.x, 0);
  assert.equal(triggers, 0);
});
