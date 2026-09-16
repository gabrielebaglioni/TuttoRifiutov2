import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

for (const configName of ["tsconfig.migration.json", "tsconfig.worker.json"]) {
test(`${configName} sources satisfy strict TypeScript contracts`, () => {
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, configName);
  assert.ok(configPath, "tsconfig.migration.json must exist");

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(configFile.error, undefined, ts.formatDiagnosticsWithColorAndContext([configFile.error].filter(Boolean), formatHost));
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd());
  assert.deepEqual(parsed.errors, []);

  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost));
});
}

const formatHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => "\n",
};
