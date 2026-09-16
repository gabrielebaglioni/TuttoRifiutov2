import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

for (const configName of ["tsconfig.migration.json", "tsconfig.worker.json", "tsconfig.browser.json", "tsconfig.tools.json", "tsconfig.tests.json"]) {
test(`${configName} sources satisfy strict TypeScript contracts`, () => {
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, configName);
  assert.ok(configPath, "tsconfig.migration.json must exist");

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(configFile.error, undefined, ts.formatDiagnosticsWithColorAndContext(configFile.error ? [configFile.error] : [], formatHost));
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd());
  assert.deepEqual(parsed.errors, []);

  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost));
});
}

const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => "\n",
};

test('compiler rejects invalid motion, gesture, Worker binding and media-role inputs', () => {
  const filename = `${process.cwd()}/tests/negative-contract-fixture.mts`;
  const imports = `
    import { pieFrame } from '../src/scripts/motion-policy.ts';
    import { createTouchGesture } from '../src/scripts/touch-explosion.ts';
    import type { WorkerEnv, MediaRole } from '../worker/types.ts';
  `;
  function diagnosticsFor(body: string) {
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler, noEmit: true,
      strict: true, allowImportingTsExtensions: true, skipLibCheck: true,
      types: ['node'],
    };
    const host = ts.createCompilerHost(options);
    const read = host.getSourceFile.bind(host);
    host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) => path === filename
      ? ts.createSourceFile(path, imports + body, languageVersion, true)
      : read(path, languageVersion, onError, shouldCreateNewSourceFile);
    const program = ts.createProgram({ rootNames: [filename], options, host });
    return ts.getPreEmitDiagnostics(program).filter(diagnostic => diagnostic.file?.fileName === filename);
  }
  assert.deepEqual(diagnosticsFor(`pieFrame(0.5, 7); createTouchGesture().start(1, 2); const env: WorkerEnv = { SESSION_SECRET: 'secret' }; const role: MediaRole = 'cover';`), []);
  const rejected = diagnosticsFor(`pieFrame('0.5', 7); createTouchGesture().start('1', 2); const env: WorkerEnv = { SESSION_SECRET: 123 }; const role: MediaRole = 'hero';`);
  assert.deepEqual(rejected.map(diagnostic => diagnostic.code).sort(), [2322, 2322, 2345, 2345]);
});
