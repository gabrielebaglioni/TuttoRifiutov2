import { must, rect, deferred } from './browser-test-utils.mts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { waitForInitialResources } from '../src/scripts/loading-readiness.ts';

function fixture() {
  const {document, window} = parseHTML('<html><body><img id="hero"><img id="gallery" loading="lazy"></body></html>');
  for (const image of document.querySelectorAll<HTMLImageElement>('img')) {
    image.loading = image.getAttribute('loading') === 'lazy' ? 'lazy' : 'eager';
    image.getBoundingClientRect = () => rect();
    Object.assign(image, { complete: false, naturalWidth: 100 });
  }
  return {document,window,hero:must(document.querySelector<HTMLImageElement>('#hero'))};
}
test('readiness waits for content, initial image load and decode, but not lazy images', async () => {
  const {document,window,hero} = fixture();
  const hydration = deferred<void>(), decoding = deferred<void>();
  const hydrate = () => hydration.resolve(), decode = () => decoding.resolve();
  const values: number[] = [];
  const content = hydration.promise;
  hero.decode = () => decoding.promise;
  const pending = waitForInitialResources({documentRef:document,readiness:[content],onProgress:value=>values.push(value)});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(values,[0]);
  hydrate();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(values,[0,50]);
  hero.dispatchEvent(new window.Event('load'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(values.at(-1),50);
  decode();
  assert.equal((await pending).status,'complete');
  assert.equal(values.at(-1),100);
});
test('timeout unlocks without reporting 100 and ignores late completion', async () => {
  const {document} = fixture();
  const hydration = deferred<void>();
  const hydrate = () => hydration.resolve();
  const values: number[]=[];
  const result=await waitForInitialResources({documentRef:document,readiness:[hydration.promise],onProgress:value=>values.push(value),timeoutMs:10});
  assert.equal(result.status,'timeout');
  hydrate();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(values,[0]);
});
test('cached images and failed resources settle without a permanent overlay', async () => {
  const {document,hero}=fixture();
  Object.assign(hero, { complete: true });
  hero.decode=async()=>{throw Error('decode unavailable');};
  const values: number[]=[];
  const result=await waitForInitialResources({documentRef:document,readiness:[Promise.reject(Error('offline'))],onProgress:v=>values.push(v)});
  assert.equal(result.status,'complete');
  assert.equal(values.at(-1),100);
});
test('an upstream hydration timeout releases the fallback without claiming full readiness', async () => {
  const {document,hero}=fixture();
  Object.assign(hero, { complete: true });
  const values: number[]=[];
  const result=await waitForInitialResources({documentRef:document,readiness:[Promise.resolve('timeout')],onProgress:v=>values.push(v)});
  assert.equal(result.status,'timeout');
  assert.ok(values.every(value=>value<100));
});
test('a failed remote hero waits for its newly visible local fallback', async () => {
  const {document,window,hero}=fixture();
  const clone=hero.cloneNode();
  assert.ok(clone instanceof window.HTMLImageElement);
  const fallback = clone;
  Object.assign(fallback, { complete: false, naturalWidth: 100 });
  fallback.getBoundingClientRect=hero.getBoundingClientRect;
  const values: number[]=[];
  let completed=false;
  const pending=waitForInitialResources({documentRef:document,onProgress:v=>values.push(v)}).then(result=>{completed=true;return result;});
  await new Promise(resolve=>setImmediate(resolve));
  hero.addEventListener('error',()=>hero.replaceWith(fallback),{once:true});
  hero.dispatchEvent(new window.Event('error'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(completed,false,'fallback is still downloading');
  assert.ok(must(values.at(-1))<100);
  fallback.dispatchEvent(new window.Event('load'));
  assert.equal((await pending).status,'complete');
  assert.equal(values.at(-1),100);
});
