import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import { parseHTML } from 'linkedom';

test('loading progress waits for actual resource completion and renders one percentage symbol', async () => {
  const markup = readFileSync(new URL('../src/components/Preloader.astro', import.meta.url), 'utf8').split('---').slice(2).join('---');
  const { document } = parseHTML(markup);
  const source = readFileSync(new URL('../src/scripts/preloader.js', import.meta.url), 'utf8');
  const functions = parse(source, { ecmaVersion: 'latest', sourceType: 'module' }).body
    .filter(n => n.type === 'FunctionDeclaration' && ['startSequence', 'generateRandomIncrements'].includes(n.id.name))
    .map(n => source.slice(n.start, n.end)).join('\n');
  const outputs = [];
  let progress = 0;
  let completed = false;
  let report;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  vm.runInNewContext(functions + '\nstartSequence();', { document, Math, setTimeout: fn => fn(), complete() { completed = true; }, trackInitialLoad(callback) { report = callback; return pending; }, gsap: {
    set() {}, getProperty: () => progress,
    to(_, options) {
      if ('--progress' in options) progress = options['--progress'];
      options.onUpdate?.();
      outputs.push(document.querySelector('.progress-bar-copy p').textContent);
      options.onComplete?.();
    },
  } });
  assert.equal(completed, false, 'time alone must not complete loading');
  report(25);
  assert.equal(document.querySelector('.progress-bar-copy p').textContent, '25%');
  report(100);
  finish({status:'complete'});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, true);
  assert.equal(document.querySelector('.progress-bar-copy p').textContent, '100%');
});

test('menu footer contrast transitions only colors, leaving geometry and clicks immediate', () => {
  const css = readFileSync(new URL('../src/styles/site/menu.css', import.meta.url), 'utf8');
  const { document } = parseHTML(`<style>${css}</style><div class="menu-toggle-btn"><div class="hamburger-bar"></div></div>`);
  for (const element of document.querySelectorAll('.menu-toggle-btn, .hamburger-bar')) {
    const transition = [...document.querySelector('style').sheet.cssRules]
      .filter(rule => rule.selectorText && !rule.selectorText.includes(':') && element.matches(rule.selectorText))
      .map(rule => rule.style.getPropertyValue('transition')).filter(Boolean).at(-1);
    assert.ok(transition, 'contrast must not switch abruptly');
    assert.match(transition, /background-color/);
    assert.doesNotMatch(transition, /\ball\b|transform|bottom/);
  }
});
