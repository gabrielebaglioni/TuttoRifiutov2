import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

// Regression: the Astro 7 default CSS minifier folded animation-timeline into
// an animation shorthand browsers reject, exposing the 75%-high black panel.
test('packaged native hero retains separate scroll timeline declarations', async () => {
  const directory = new URL('../dist/client/_astro/', import.meta.url);
  const files = (await readdir(directory)).filter(name => name.endsWith('.css'));
  const css = (await Promise.all(files.map(name => readFile(new URL(name, directory), 'utf8')))).join('\n');
  for (const selector of ['lab-about-revealer', 'lab-hero-overlay']) {
    const rule = css.match(new RegExp(`\\.has-native-hero-scroll \\.${selector}\\s*\\{([^}]+)\\}`))?.[1];
    assert.ok(rule, `missing ${selector} native scroll rule`);
    assert.match(rule, /animation-timeline:\s*scroll\(root(?: block)?\)/, 'scroll timeline must not be folded into animation shorthand');
    assert.doesNotMatch(rule, /(?:^|;)\s*animation:[^;]*scroll\(/, 'unsupported animation shorthand');
    assert.match(rule, /animation-range:\s*0px /);
  }
});
