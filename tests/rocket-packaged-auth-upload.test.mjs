import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import worker from '../dist/server/index.js';
import { rocketWorkerFixture } from './rocket-worker-fixture.mjs';

// Exercises the built release entrypoint, not a pre-authorized editor fixture.
// Removing session/CSRF checks or breaking upload persistence must fail this test.
test('packaged Worker authenticates, gates upload, delivers persisted WebP and invalidates logout', async () => {
  const fixture = await rocketWorkerFixture();
  const objects = new Map();
  fixture.env.ADMIN_USERNAME = `test-${randomUUID()}`;
  fixture.env.ADMIN_PASSWORD = randomUUID();
  fixture.env.MEDIA = {
    async put(key, bytes, options) { objects.set(key, {bytes, options}); },
    async delete(key) { objects.delete(key); },
    async head(key) { return objects.has(key) ? {} : null; },
    async get(key) {
      const object = objects.get(key);
      return object ? {body:object.bytes,httpEtag:'"fixture"',writeHttpMetadata(headers){headers.set('content-type',object.options.httpMetadata.contentType);}} : null;
    },
  };
  const call = (path, options={}) => worker.fetch(new Request(`https://release.test${path}`, options), fixture.env, {waitUntil(){}});
  const login = password => call('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:fixture.env.ADMIN_USERNAME,password})});
  const bytes = Buffer.from('UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoCAAMAAUAmJaACdLoAA5gA/vFNr+LaR0KZD/7xn/9xn/9xn/yIAAAA','base64');
  function uploadBody() {
    const form = new FormData();
    for (const [name,value] of Object.entries({ownerType:'events',ownerSlug:'musica',role:'cover',position:'0',alt:'Disposable release test'})) form.set(name,value);
    form.set('small',new File([bytes],'fixture.webp',{type:'image/webp'}));
    return form;
  }
  try {
    assert.equal((await call('/api/admin/session')).status,401);
    assert.equal((await call('/api/admin/media',{method:'POST',body:uploadBody()})).status,401);
    assert.equal((await login('invalid')).status,401);
    const response = await login(fixture.env.ADMIN_PASSWORD);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const setCookie = response.headers.get('set-cookie');
    for (const flag of ['HttpOnly','Secure','SameSite=Strict']) assert.ok(setCookie.includes(flag));
    const cookie = setCookie.split(';')[0], csrf = (await response.json()).csrfToken;
    const headers = {cookie,'x-csrf-token':csrf};
    assert.equal((await call('/api/admin/session',{headers})).status,200);
    assert.equal((await call('/api/admin/media',{method:'POST',headers:{cookie},body:uploadBody()})).status,403);
    const uploaded = await call('/api/admin/media',{method:'POST',headers,body:uploadBody()});
    assert.equal(uploaded.status,201);
    const media = await uploaded.json();
    assert.deepEqual(media.widths,[2]);
    const delivered = await call(media.src,{headers});
    assert.equal(delivered.status,200);
    assert.equal(delivered.headers.get('content-type'),'image/webp');
    assert.deepEqual(Buffer.from(await delivered.arrayBuffer()),bytes);
    assert.equal((await call(`/api/admin/media/events/${media.id}`,{method:'DELETE',headers})).status,200);
    assert.equal((await call(media.src,{headers})).status,404);
    assert.equal((await call('/api/admin/logout',{method:'POST',headers})).status,200);
    assert.equal((await call('/api/admin/session',{headers})).status,401);
  } finally { fixture.close(); }
});
