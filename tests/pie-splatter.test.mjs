import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { pieFrame } from '../src/scripts/motion-policy.js';

test('splatter alpha stays transparent outside the silhouette and covers the viewport after zoom', async () => {
  const asset = new URL('../src/assets/animation/splatter.webp', import.meta.url);
  assert.ok(existsSync(asset), 'dedicated splatter mask must exist');
  const { ZOOM_ORIGIN, maskZoomMultiplier } = await import('../src/scripts/pie-geometry.js');
  assert.ok(statSync(asset).size < 100_000, 'mask stays lightweight');
  const { data, info } = await sharp(fileURLToPath(asset)).resize(800, 800).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = (x, y) => data[(y * info.width + x) * 4 + 3] ?? 0;
  assert.equal(alpha(0, 0), 0);
  assert.ok(alpha(424, 400) >= 250, 'zoom enters the solid core');
  // These points lie in the four detached droplets, not the main body.
  for (const [x, y] of [[367, 64], [735, 351], [73, 727], [528, 721]]) {
    assert.ok(alpha(x, y) >= 250, `droplet at ${x},${y} preserved`);
  }
  for (const [width, height] of [[320, 740], [390, 844], [360, 900], [844, 390], [768, 1024], [1920, 1080], [3440, 1440], [5120, 1440]]) {
    const size = Math.min(width, height) * .8;
    const multiplier = maskZoomMultiplier(width, height, size);
    assert.deepEqual(pieFrame(.5, multiplier), { fill: 1, scale: 1 });
    const scale = pieFrame(1, multiplier).scale;
    // Invert the actual stage transform and inspect the shipped mask pixels.
    for (let y = 0; y <= 40; y++) for (let x = 0; x <= 40; x++) {
      const mx = Math.round(ZOOM_ORIGIN.x + ((x * width / 40 - (width - size) / 2) * 800 / size - ZOOM_ORIGIN.x) / scale);
      const my = Math.round(ZOOM_ORIGIN.y + ((y * height / 40 - (height - size) / 2) * 800 / size - ZOOM_ORIGIN.y) / scale);
      assert.ok(alpha(mx, my) >= 250, `uncovered ${width}x${height} at ${x},${y}`);
    }
  }
});
