import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Behavioral VM tests run the compiler's JavaScript, never regex-erased types.
export function readBrowserScript(url: URL): string {
  const source = readFileSync(url, 'utf8');
  if (!/\.tsx?$/.test(url.pathname)) return source;
  const result = ts.transpileModule(source, {
    fileName: url.pathname,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true },
  });
  if (result.diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)) throw new Error('Invalid TypeScript browser fixture');
  return result.outputText;
}
