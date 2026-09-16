import test from 'node:test';
import assert from 'node:assert/strict';
import { getIconSvg } from '../src/scripts/icons.ts';

test('local icon lookup returns SVG only for owned names', () => {
  assert.match(getIconSvg('cube-sharp'), /^<svg\b/);
  assert.match(getIconSvg('calendar-sharp'), /^<svg\b/);
  for (const name of ['', 'missing', 'toString', 'constructor', '__proto__']) {
    assert.equal(getIconSvg(name), '', `${name} must not expose inherited object properties`);
  }
});
