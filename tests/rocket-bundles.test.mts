import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { measureRoute } from '../scripts/measure-rocket.mts';
test('menu renderer is included in the initial dependency graph without a deferred request', async () => {
  const result = await build({ entryPoints: ['src/scripts/menu.ts'], bundle: true, splitting: true, format: 'esm', outdir: '/tmp/rocket-bundle-check', write: false, metafile: true, logLevel: 'silent' });
  const outputs = result.metafile.outputs;
  const entry = Object.entries(outputs).find(([, value]) => value.entryPoint === 'src/scripts/menu.ts');
  assert.ok(entry, 'menu entry must exist in the bundle graph');
  const inputs = Object.keys(entry[1].inputs);
  assert.equal(inputs.some(path => path.includes('node_modules/three/')), true);
  assert.equal(Object.values(outputs).some(output => output.imports.some(imported => imported.kind === 'dynamic-import')), false);
});

test('built public pages never request the admin island or Svelte renderer', async () => {
  for (const path of ['/', '/work', '/events', '/contact']) {
    const result = await measureRoute(path);
    assert.ok(result.files.length > 0);
    assert.equal(result.files.some(file => /AdminApp|client\.svelte/.test(file)), false, path);
  }
  const admin = await measureRoute('/admin');
  assert.ok(admin.files.some(file => file.includes('AdminApp')));
  assert.equal(admin.files.some(file => /BaseLayout|three|ScrollTrigger/.test(file)), false);
});
