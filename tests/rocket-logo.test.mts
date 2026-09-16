import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('mobile logo uses the global blend source instead of the black link color',()=>{
  const css=readFileSync(new URL('../src/styles/site/nav.css',import.meta.url),'utf8');
  const mobile=css.slice(css.indexOf('@media (max-width: 1024px), (pointer: coarse)'));
  assert.match(mobile,/\.site-logo-mobile\s*\{[^}]*background:\s*var\(--bg\)/);
});
