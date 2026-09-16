import assert from 'node:assert/strict';
import test from 'node:test';
import type { ImageMetadata } from 'astro';
import { plainImage } from '../src/data/static-media.ts';

test('static image metadata preserves its JSON value while making Astro proxies cloneable', () => {
  const metadata: ImageMetadata = { src: '/_astro/photo.webp', width: 640, height: 480, format: 'webp' };
  const proxy = new Proxy(metadata, {});
  assert.throws(() => structuredClone(proxy), { name: 'DataCloneError' });
  const plain = plainImage(proxy);
  assert.notEqual(plain, proxy);
  assert.deepEqual(structuredClone(plain), metadata);
  assert.equal(JSON.stringify(plain), JSON.stringify(proxy));
  assert.equal(plainImage('/photo.webp'), '/photo.webp');
});
