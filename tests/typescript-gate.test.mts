import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : entry.isFile() ? [path] : [];
  });
}

test('every authored application, Worker, tool and test source is TypeScript', () => {
  const files = ['src', 'worker', 'scripts', 'tests'].flatMap(walk);
  assert.deepEqual(files.filter(path => /\.(?:js|mjs|cjs|jsx)$/.test(path)), []);
  assert.equal(existsSync('astro.config.mjs'), false);
  assert.equal(existsSync('astro.config.ts'), true);
  for (const path of files.filter(path => /\.(?:ts|mts|tsx|astro|svelte)$/.test(path))) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /@ts-(?:nocheck|ignore|expect-error)\b/, `${path}: compiler suppression`);
    if (!/\.(?:ts|mts|tsx)$/.test(path)) continue;
    const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node): void {
      assert.notEqual(node.kind, ts.SyntaxKind.AnyKeyword, `${path}: authored unchecked type`);
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
});

test('all compiler domains enforce strict checking and publication runs every mandatory gate first', () => {
  const configs = ['migration', 'worker', 'browser', 'rocket', 'tools', 'tests'];
  for (const domain of configs) {
    const filename = `tsconfig.${domain}.json`;
    const read = ts.readConfigFile(filename, ts.sys.readFile);
    assert.equal(read.error, undefined);
    const config = ts.parseJsonConfigFileContent(read.config, ts.sys, process.cwd());
    assert.deepEqual(config.errors, []);
    assert.notEqual(config.options.allowJs, true, filename);
    for (const flag of ['strict', 'noUncheckedIndexedAccess', 'exactOptionalPropertyTypes', 'useUnknownInCatchVariables', 'noImplicitOverride'] as const) assert.equal(config.options[flag], true, `${filename}: ${flag}`);
  }
  const pkg: unknown = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.ok(pkg && typeof pkg === 'object' && 'scripts' in pkg);
  const candidate = pkg.scripts;
  assert.ok(candidate && typeof candidate === 'object');
  const scripts: object = candidate;
  function command(name: string, seen = new Set<string>()): string {
    assert.ok(!seen.has(name), `recursive package script ${name}`);
    assert.ok(name in scripts);
    const value: unknown = Reflect.get(scripts, name);
    assert.ok(typeof value === 'string');
    return value.replace(/npm run ([\w:-]+)/g, (_match: string, nested: string) => command(nested, new Set([...seen, name])));
  }
  const build = command('build');
  const publication = build.indexOf('astro build');
  assert.ok(publication > 0, 'type checks must run before the Astro build');
  const gates = build.slice(0, publication);
  for (const domain of ['migration', 'worker', 'browser', 'tools', 'tests']) assert.ok(gates.includes(`tsconfig.${domain}.json`), `missing ${domain} gate`);
  assert.match(gates, /astro check/);
  assert.match(gates, /svelte-check/);
});
