import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { readBrowserScript } from './read-browser-script.mjs';

function runClock(markup) {
  const { document } = parseHTML(markup);
  const timers = new Map();
  let reduced = false;
  const source = readBrowserScript(new URL('../src/scripts/nav.ts', import.meta.url)).replace(/^import .*;$/m, '');
  vm.runInNewContext(source, {
    document, prefersReducedMotion: () => reduced,
    setInterval(callback, delay) { timers.set(delay, callback); },
  });
  return { document, timers, reduce() { reduced = true; } };
}

test('navigation clock keeps its digits and reduced-motion colon behavior', () => {
  const clock = runClock('<div class="nav-clock"><p><span data-content-key="global.nav.clock_hours"></span><span data-clock-colon>:</span><span data-content-key="global.nav.clock_minutes"></span><span data-content-key="global.nav.clock_timezone"></span></p></div>');
  assert.match(clock.document.querySelector('[data-content-key="global.nav.clock_hours"]').textContent, /^\d{2}$/);
  const colon = clock.document.querySelector('[data-clock-colon]');
  clock.timers.get(500)(); assert.equal(colon.style.visibility, 'hidden');
  clock.timers.get(500)(); assert.equal(colon.style.visibility, 'visible');
  clock.reduce(); clock.timers.get(500)(); assert.equal(colon.style.visibility, 'visible');
});

test('missing optional clock markup does not interrupt other controllers', () => {
  const clock = runClock('<html><body></body></html>');
  for (const update of clock.timers.values()) assert.doesNotThrow(update);
});
