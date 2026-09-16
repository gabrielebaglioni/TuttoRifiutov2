import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { readBrowserScript } from './read-browser-script.mts';

function runClock(markup: string) {
  const { document } = parseHTML(markup);
  const timers = new Map<number, () => void>();
  let reduced = false;
  const source = readBrowserScript(new URL('../src/scripts/nav.ts', import.meta.url)).replace(/^import .*;$/m, '');
  vm.runInNewContext(source, {
    document, prefersReducedMotion: () => reduced,
    setInterval(callback: () => void, delay: number) { timers.set(delay, callback); },
  });
  return { document, timers, reduce() { reduced = true; } };
}

test('navigation clock keeps its digits and reduced-motion colon behavior', () => {
  const clock = runClock('<div class="nav-clock"><p><span data-content-key="global.nav.clock_hours"></span><span data-clock-colon>:</span><span data-content-key="global.nav.clock_minutes"></span><span data-content-key="global.nav.clock_timezone"></span></p></div>');
  const hours = clock.document.querySelector('[data-content-key="global.nav.clock_hours"]');
  assert.ok(hours);
  assert.match(hours.textContent, /^\d{2}$/);
  const colon = clock.document.querySelector<HTMLElement>('[data-clock-colon]');
  assert.ok(colon);
  const tick = clock.timers.get(500);
  assert.ok(tick);
  tick(); assert.equal(colon.style.visibility, 'hidden');
  tick(); assert.equal(colon.style.visibility, 'visible');
  clock.reduce(); tick(); assert.equal(colon.style.visibility, 'visible');
});

test('missing optional clock markup does not interrupt other controllers', () => {
  const clock = runClock('<html><body></body></html>');
  for (const update of clock.timers.values()) assert.doesNotThrow(update);
});
