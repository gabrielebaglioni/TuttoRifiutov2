import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminStore } from '../src/admin/store.ts';
import { collectionKey } from '../src/admin/store.ts';
import { rocketWorkerFixture } from './rocket-worker-fixture.mjs';
import { THEME_KEY } from '../src/data/theme.js';

const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
test('Svelte admin store ignores a session response superseded by logout', async () => {
  let resolve;
  const store = createAdminStore(async (path) => path.endsWith('/session')
    ? new Promise(done => { resolve = done; }) : json({ ok: true }));
  const probe = store.boot();
  await store.logout();
  resolve(json({ authenticated: true, csrfToken: 'old' }));
  await probe;
  assert.equal(store.state.authenticated, false);
});

test('gallery reorder excludes the virtual cover and preserves sparse stored positions', async () => {
  let order;
  const item = { slug: 'fixture', title: 'Fixture', position: 0, coverMedia: { src: '/fallback.webp' }, media: [
    { id: 1, role: 'detail', position: 2, state: 'active' },
    { id: 2, role: 'detail', position: 7, state: 'active' },
  ] };
  const store = createAdminStore(async (path, options) => {
    if (path.endsWith('/session')) return json({ csrfToken: 'csrf' });
    if (path === '/api/content') return json({});
    if (path === '/api/admin/events') return json([item]);
    if (path === '/api/admin/archive') return json([]);
    if (path === '/api/admin/media/_order') { order = JSON.parse(options.body); return json({ ok: true }); }
    throw new Error(path);
  });
  await store.boot();
  await store.reorderMedia('events', item, item.media[0], 1);
  assert.deepEqual(order.items.sort((a,b)=>a.id-b.id), [{ id: 1, position: 7 }, { id: 2, position: 2 }]);
});

test('Svelte editor writes through the unchanged Worker, preserves drafts and updates public reads', async () => {
  const fixture = await rocketWorkerFixture();
  try {
    const store = createAdminStore(fixture.fetch);
    await store.boot();
    assert.equal(store.state.authenticated, true);
    const key = 'home.hero.title', resource = `content:${key}`;
    store.draft(resource, store.state.content[key]); store.edit(resource, [], 'Rocket fixture');
    store.select('events'); store.select('home');
    assert.equal(store.draft(resource, ''), 'Rocket fixture');
    await store.saveContent(key);
    assert.equal(store.state.error, false, store.state.message);
    assert.equal((await (await fixture.fetch('/api/content')).json())[key], 'Rocket fixture');
    const paletteKey = `content:${THEME_KEY}`;
    store.draft(paletteKey, store.state.content[THEME_KEY]); store.edit(paletteKey, ['foreground'], 'url(invalid)');
    await store.saveContent(THEME_KEY);
    assert.equal(store.state.error, true);
    assert.notEqual((await (await fixture.fetch('/api/content')).json())[THEME_KEY].foreground, 'url(invalid)');
    store.cancel(paletteKey);
    store.add('events');
    const item = store.state.collections.events.find(item => item.isNew), itemKey = collectionKey('events', item);
    store.edit(itemKey, ['meta'], ['Fixture']); store.edit(itemKey, ['status'], 'draft');
    await store.saveCollection('events', item);
    assert.equal(store.state.error, false, store.state.message);
    const saved = store.state.collections.events.find(entry => entry.slug === item.slug);
    assert.ok(saved && !saved.isNew);
    assert.equal((await (await fixture.fetch('/api/events')).json()).some(entry => entry.slug === item.slug), false);
    store.draft(collectionKey('events', saved), saved); store.edit(collectionKey('events', saved), ['status'], 'upcoming');
    await store.saveCollection('events', saved);
    assert.equal(store.state.error, false, store.state.message);
    assert.equal((await (await fixture.fetch('/api/events')).json()).some(entry => entry.slug === item.slug), true);
    await store.removeCollection('events', saved);
    assert.equal(store.state.error, false, store.state.message);
    assert.equal(store.state.collections.events.some(entry => entry.slug === item.slug), false);
    await store.logout();
    assert.equal(store.state.authenticated, false);
  } finally { fixture.close(); }
});
test('Svelte content saves use CSRF and preserve an edit made during the request', async () => {
  let resolve;
  const requests = [];
  const store = createAdminStore(async (path, options) => {
    requests.push({ path, options });
    if (path.endsWith('/session')) return json({ authenticated: true, csrfToken: 'csrf' });
    if (path === '/api/content') return json({ 'home.test': 'Before' });
    if (path === '/api/admin/events' || path === '/api/admin/archive') return json([]);
    return new Promise(done => { resolve = done; });
  });
  await store.boot();
  const key = 'content:home.test';
  store.draft(key, 'Before');
  store.edit(key, [], 'First');
  const pending = store.saveContent('home.test');
  store.edit(key, [], 'Later');
  resolve(json({ ok: true }));
  await pending;
  assert.equal(store.draft(key, ''), 'Later');
  assert.equal(store.state.dirty, 1);
  assert.equal(new Headers(requests.at(-1).options.headers).get('x-csrf-token'), 'csrf');
  assert.deepEqual(JSON.parse(requests.at(-1).options.body), { value: 'First' });
});
