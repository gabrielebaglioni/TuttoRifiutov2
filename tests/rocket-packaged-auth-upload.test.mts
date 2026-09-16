import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadCompiledWorker } from './compiled-worker.mts';
import { rocketWorkerFixture } from './rocket-worker-fixture.mts';
import { r2Double, required, sqlString, jsonRecord } from './worker-fixtures.mts';
import type { MediaStore } from '../worker/types.ts';
import type { R2HTTPMetadata, R2PutOptions } from '@cloudflare/workers-types/index.ts';

// Exercises the built release entrypoint, not a pre-authorized editor fixture.
// Removing session/CSRF checks or breaking upload persistence must fail this test.
test('packaged Worker authenticates, gates upload, delivers persisted WebP and invalidates logout', async () => {
  const fixture = await rocketWorkerFixture();
  const worker = await loadCompiledWorker();
  const objects = new Map<string, { bytes: Blob; options: { httpMetadata: R2HTTPMetadata } }>();
  fixture.env.ADMIN_USERNAME = `test-${randomUUID()}`;
  fixture.env.ADMIN_PASSWORD = randomUUID();
  fixture.env.MEDIA = r2Double({
    async put(key: string, bytes: Parameters<MediaStore['put']>[1], options?: R2PutOptions) {
      assert.ok(bytes instanceof Blob);
      const httpMetadata = required(options?.httpMetadata);
      assert.ok(!('get' in httpMetadata));
      objects.set(key, {bytes, options: { httpMetadata }});
    },
    async delete(key: string | string[]) { assert.ok(typeof key === 'string'); objects.delete(key); },
    async get(key: string) {
      const object = objects.get(key);
      return object ? {body:object.bytes.stream(),httpEtag:'"fixture"',writeHttpMetadata(headers: Headers){headers.set('content-type',required(object.options.httpMetadata.contentType));}} : null;
    },
  });
  const call = (path: string, options: RequestInit={}) => worker.fetch(new Request(`https://release.test${path}`, options), fixture.env, {waitUntil(){}});
  const login = (password: string) => call('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:fixture.env.ADMIN_USERNAME,password})});
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
    const setCookie = required(response.headers.get('set-cookie'));
    for (const flag of ['HttpOnly','Secure','SameSite=Strict']) assert.ok(setCookie.includes(flag));
    const cookie = required(setCookie.split(';')[0]), csrf = sqlString((await jsonRecord(response)).csrfToken);
    const headers = {cookie,'x-csrf-token':csrf};
    assert.equal((await call('/api/admin/session',{headers})).status,200);
    assert.equal((await call('/api/admin/media',{method:'POST',headers:{cookie},body:uploadBody()})).status,403);
    const uploaded = await call('/api/admin/media',{method:'POST',headers,body:uploadBody()});
    assert.equal(uploaded.status,201);
    const media = await jsonRecord(uploaded);
    assert.deepEqual(media.widths,[2]);
    const delivered = await call(sqlString(media.src),{headers});
    assert.equal(delivered.status,200);
    assert.equal(delivered.headers.get('content-type'),'image/webp');
    assert.deepEqual(Buffer.from(await delivered.arrayBuffer()),bytes);
    assert.equal((await call(`/api/admin/media/events/${media.id}`,{method:'DELETE',headers})).status,200);
    assert.equal((await call(sqlString(media.src),{headers})).status,404);
    assert.equal((await call('/api/admin/logout',{method:'POST',headers})).status,200);
    assert.equal((await call('/api/admin/session',{headers})).status,401);
  } finally { fixture.close(); }
});
