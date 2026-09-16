import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { parse } from "acorn";
import type { AnyNode, Property, PropertyDefinition } from 'acorn';
import type { PathLike } from 'node:fs';
import ts from "typescript";

const PASSWORD_KEY = ["ADMIN", "PASSWORD"].join("_");

function normalizePath(path: unknown) {
  return String(path ?? "").replaceAll("\\", "/");
}

function isDotenvPath(path: unknown) {
  return normalizePath(path).split("/").at(-1)?.startsWith(".env") === true;
}

function scanMode(path: string) {
  const normalized = normalizePath(path || "inline.js").toLowerCase();
  if (isDotenvPath(normalized)) return "dotenv";
  if (normalized.endsWith(".json")) return "json";
  if (normalized.endsWith(".astro")) return "astro";
  if (/\.(?:cts|mts|ts|tsx)$/.test(normalized)) return "typescript";
  if (/\.(?:cjs|mjs|js)$/.test(normalized)) return "javascript";
  return "unknown";
}

interface ParseOptions { allowReturnOutsideFunction?: boolean }
function parseJavaScript(source: string, options: ParseOptions = {}) {
  const parseOptions = {
    allowHashBang: true,
    allowReturnOutsideFunction: options.allowReturnOutsideFunction === true,
    ecmaVersion: "latest" as const,
  };
  for (const sourceType of ["module", "script"] as const) {
    try {
      return parse(source, { ...parseOptions, sourceType });
    } catch {
      // CommonJS sources are parsed as scripts after module parsing rejects them.
    }
  }
  return null;
}

function unwrapExpression(node: AnyNode | null | undefined): AnyNode | null | undefined {
  let value = node;
  // Acorn's default parser unwraps parentheses itself (preserveParens is off).
  while (value?.type === "ChainExpression") value = value.expression;
  return value;
}

function staticString(node: AnyNode | null | undefined): string | null {
  const value = unwrapExpression(node);
  if (!value) return null;
  if (value.type === "Literal") return typeof value.value === "string" ? value.value : null;
  if (value.type === "TemplateLiteral") {
    let output = value.quasis[0]?.value.cooked;
    if (typeof output !== "string") return null;
    for (let index = 0; index < value.expressions.length; index += 1) {
      const expression = staticString(value.expressions[index]);
      const suffix = value.quasis[index + 1]?.value.cooked;
      if (expression === null || typeof suffix !== "string") return null;
      output += expression + suffix;
    }
    return output;
  }
  if (value.type === "BinaryExpression" && value.operator === "+") {
    const left = staticString(value.left);
    const right = staticString(value.right);
    return left === null || right === null ? null : left + right;
  }
  return null;
}

function memberPropertyName(node: AnyNode | null | undefined): string | null {
  const member = unwrapExpression(node);
  if (member?.type !== "MemberExpression") return null;
  if (!member.computed && (member.property.type === 'Identifier' || member.property.type === 'PrivateIdentifier')) {
    return member.property.name;
  }
  return staticString(member.property);
}

function isProcessEnvMember(node: AnyNode | null | undefined): boolean {
  const member = unwrapExpression(node);
  const object = member?.type === 'MemberExpression' ? unwrapExpression(member.object) : undefined;
  return member?.type === "MemberExpression"
    && memberPropertyName(member) === "env"
    && object?.type === "Identifier"
    && object.name === "process";
}

function isRuntimePasswordRead(node: AnyNode | null | undefined): boolean {
  const member = unwrapExpression(node);
  if (member?.type !== "MemberExpression" || memberPropertyName(member) !== PASSWORD_KEY) return false;
  const object = unwrapExpression(member.object);
  return (object?.type === "Identifier" && object.name === "env") || isProcessEnvMember(object);
}

function isAssignmentTarget(node: AnyNode | null | undefined): boolean {
  const value = unwrapExpression(node);
  return (value?.type === "Identifier" && value.name === PASSWORD_KEY)
    || (value?.type === "MemberExpression" && memberPropertyName(value) === PASSWORD_KEY);
}

function isPureRuntimeTemplate(node: AnyNode | null | undefined): boolean {
  const value = unwrapExpression(node);
  return value?.type === "TemplateLiteral"
    && value.quasis.every((quasi) => quasi.value.cooked === "")
    && value.expressions.every(isRuntimePasswordRead);
}

function isSafeRightHandSide(node: AnyNode | null | undefined): boolean {
  const value = unwrapExpression(node);
  if (!value) return true;
  if (value.type === "Literal") return value.value === "";
  return isRuntimePasswordRead(value) || isPureRuntimeTemplate(value);
}

function propertyHasPasswordKey(node: AnyNode | null | undefined): boolean {
  if (!node || !('key' in node)) return false;
  if ((!('computed' in node) || !node.computed) && (node.key.type === 'Identifier' || node.key.type === 'PrivateIdentifier')) {
    return node.key.name === PASSWORD_KEY;
  }
  return staticString(node.key) === PASSWORD_KEY;
}

function patternContainsSensitiveTarget(node: AnyNode | null | undefined, passwordContext = false): boolean {
  const value = unwrapExpression(node);
  if (!value) return false;
  if (passwordContext || isAssignmentTarget(value)) return true;
  if (value.type === "AssignmentPattern") return patternContainsSensitiveTarget(value.left);
  if (value.type === "ObjectPattern") {
    return value.properties.some((property) => {
      if (property.type === "RestElement") return patternContainsSensitiveTarget(property.argument);
      return patternContainsSensitiveTarget(property.value, propertyHasPasswordKey(property));
    });
  }
  if (value.type === "ArrayPattern") return value.elements.some((element) => patternContainsSensitiveTarget(element));
  if (value.type === "RestElement") return patternContainsSensitiveTarget(value.argument);
  return false;
}

function patternContainsEmbeddedPassword(node: AnyNode | null | undefined, passwordContext = false): boolean {
  const value = unwrapExpression(node);
  if (!value) return false;
  if (value.type === "AssignmentPattern") {
    const assignsPassword = patternContainsSensitiveTarget(value.left, passwordContext);
    return (assignsPassword && !isSafeRightHandSide(value.right))
      || patternContainsEmbeddedPassword(value.left, passwordContext);
  }
  if (value.type === "ObjectPattern") {
    return value.properties.some((property) => {
      if (property.type === "RestElement") return patternContainsEmbeddedPassword(property.argument, passwordContext);
      const propertyContext = passwordContext || propertyHasPasswordKey(property);
      return patternContainsEmbeddedPassword(property.value, propertyContext);
    });
  }
  if (value.type === "ArrayPattern") {
    return value.elements.some((element) => patternContainsEmbeddedPassword(element, passwordContext));
  }
  if (value.type === "RestElement") return patternContainsEmbeddedPassword(value.argument, passwordContext);
  return false;
}

function isValueProperty(node: AnyNode, parent: AnyNode | null): node is Property | PropertyDefinition {
  return (node.type === "Property" && parent?.type === "ObjectExpression")
    || node.type === "PropertyDefinition";
}

// Called only on trees returned by Acorn, never on untrusted JSON objects.
function isAstNode(node: object): node is AnyNode { return 'type' in node && typeof node.type === 'string'; }
function walkAst(node: unknown, visit: (node: AnyNode, parent: AnyNode | null) => void, parent: AnyNode | null = null): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walkAst(child, visit, parent);
    return;
  }
  if (!isAstNode(node)) return;
  visit(node, parent);
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") walkAst(value, visit, node);
  }
}

function astContainsEmbeddedPassword(ast: AnyNode): boolean {
  let embedded = false;
  walkAst(ast, (node, parent) => {
    if (embedded) return;
    if (node.type === "VariableDeclarator" && isAssignmentTarget(node.id) && !isSafeRightHandSide(node.init)) {
      embedded = true;
      return;
    }
    if (node.type === "AssignmentExpression"
      && isAssignmentTarget(node.left)
      && !isSafeRightHandSide(node.right)) {
      embedded = true;
      return;
    }
    if (["AssignmentPattern", "ObjectPattern", "ArrayPattern", "RestElement"].includes(node.type)
      && patternContainsEmbeddedPassword(node)) {
      embedded = true;
      return;
    }
    if (isValueProperty(node, parent)
      && propertyHasPasswordKey(node)
      && !isSafeRightHandSide(node.value)) embedded = true;
  });
  return embedded;
}

function javascriptContainsEmbeddedPassword(source: string, options?: ParseOptions): boolean {
  const ast = parseJavaScript(source, options);
  return ast === null || astContainsEmbeddedPassword(ast);
}

function typescriptContainsEmbeddedPassword(source: string, path: string, options?: ParseOptions): boolean {
  const compiled = ts.transpileModule(source, {
    // Declaration files also need source inspection, not declaration-only emit.
    fileName: path.replace(/\.d\.(cts|mts|ts)$/i, '.$1'),
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    // Scan value-bearing declarations even when `declare` would erase them.
    // This transform is only for inspection, never the deployment build.
    transformers: { before: [(context) => {
      const hasInitializer = (node: ts.Node): boolean => ('initializer' in node && Boolean(node.initializer)) || Boolean(ts.forEachChild(node, hasInitializer));
      const visit = (node: ts.Node, ambient = false): ts.Node => {
        const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
        const declared = Boolean(modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword));
        // A pure ambient binding has no value to inspect and must stay erased:
        // dropping declare from `declare const name: Type` emits invalid JS.
        if ((ambient || declared) && ts.isVariableStatement(node) && !hasInitializer(node)) return context.factory.createNotEmittedStatement(node);
        const inspected = declared && ts.canHaveModifiers(node)
          ? context.factory.replaceModifiers(node, modifiers?.filter((modifier) => modifier.kind !== ts.SyntaxKind.DeclareKeyword))
          : node;
        return ts.visitEachChild(inspected, (child) => visit(child, ambient || declared), context);
      };
      return (node) => ts.visitNode(node, visit, ts.isSourceFile) ?? node;
    }] },
  });
  if (compiled.diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)) return true;
  return javascriptContainsEmbeddedPassword(compiled.outputText, options);
}

function jsonContainsEmbeddedPassword(source: string): boolean {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return true;
  }

  const walkValue = (current: unknown): boolean => {
    if (Array.isArray(current)) return current.some(walkValue);
    if (!current || typeof current !== "object") return false;
    for (const [key, nested] of Object.entries(current)) {
      if (key === PASSWORD_KEY && nested !== "") return true;
      if (walkValue(nested)) return true;
    }
    return false;
  };
  return walkValue(value);
}

function dotenvValueIsEmbedded(rawValue: string): boolean {
  const value = rawValue.trimStart();
  if (!value || value.startsWith("#")) return false;
  if (["\"", "'", "`"].includes(value[0] ?? '')) {
    const quote = value[0];
    let index = 1;
    let content = "";
    let closed = false;
    while (index < value.length) {
      if (value[index] === "\\") {
        content += value.slice(index, index + 2);
        index += 2;
        continue;
      }
      if (value[index] === quote) {
        closed = true;
        index += 1;
        break;
      }
      content += value[index];
      index += 1;
    }
    if (!closed) return true;
    const trailing = value.slice(index).trimStart();
    if (trailing && !trailing.startsWith("#")) return true;
    return content.length > 0;
  }
  return (value.split("#", 1)[0] ?? '').trimEnd().length > 0;
}

function dotenvContainsEmbeddedPassword(source: string): boolean {
  for (const line of String(source).split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue;
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=([\s\S]*)$/);
    if (match?.[1] === PASSWORD_KEY && dotenvValueIsEmbedded(match[2] ?? '')) return true;
    if (!match && /^\s*(?:export\s+)?ADMIN_PASSWORD(?:\s|$)/.test(line)) return true;
  }
  return false;
}

function extractAstroFragments(source: string) {
  const text = String(source);
  const fragments: (ParseOptions & { source: string })[] = [];
  let markupStart = 0;
  const opening = text.match(/^\uFEFF?---[ \t]*(?:\r?\n|$)/);
  if (opening) {
    const closing = /^---[ \t]*(?:\r?\n|$)/gm;
    closing.lastIndex = opening[0].length;
    const match = closing.exec(text);
    if (!match) return { fragments, malformed: true };
    fragments.push({
      allowReturnOutsideFunction: true,
      source: text.slice(opening[0].length, match.index),
    });
    markupStart = closing.lastIndex;
  }

  const markup = text.slice(markupStart);
  const scripts = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
  let scriptCount = 0;
  for (const match of markup.matchAll(scripts)) {
    scriptCount += 1;
    fragments.push({ allowReturnOutsideFunction: false, source: match[1] ?? '' });
  }
  const openingScriptCount = markup.match(/<script\b/gi)?.length ?? 0;
  return { fragments, malformed: openingScriptCount !== scriptCount };
}

function astroContainsEmbeddedPassword(source: string): boolean {
  const { fragments, malformed } = extractAstroFragments(source);
  if (malformed) return true;
  return fragments.some((fragment) => typescriptContainsEmbeddedPassword(fragment.source, 'fragment.ts', fragment));
}

export function containsEmbeddedAdminPasswordAssignment(text: unknown, path = "inline.js"): boolean {
  const source = String(text);
  switch (scanMode(path)) {
    case "dotenv": return dotenvContainsEmbeddedPassword(source);
    case "json": return jsonContainsEmbeddedPassword(source);
    case "astro": return astroContainsEmbeddedPassword(source);
    case "javascript": return javascriptContainsEmbeddedPassword(source);
    case "typescript": return typescriptContainsEmbeddedPassword(source, path);
    default: return source.includes(PASSWORD_KEY);
  }
}

export function isProductionTrackedPath(path: string): boolean {
  const normalized = String(path).replaceAll("\\", "/").replace(/^\.\//, "");
  return normalized.length > 0
    && !normalized.startsWith("tests/")
    && !normalized.startsWith("docs/")
    && !normalized.startsWith(".superpowers/")
    && normalized !== "README.md"
    && !/^task-[^/]*-report\.md$/.test(normalized);
}

export async function fileContainsBytes(path: PathLike, value: string | Uint8Array, options: { highWaterMark?: number } = {}): Promise<boolean> {
  const needle = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (needle.length === 0) return false;
  if (needle.length > 16_384) throw new Error("Secret scan value exceeds the supported bound");

  const requestedChunkSize = options.highWaterMark ?? 64 * 1024;
  if (!Number.isSafeInteger(requestedChunkSize) || requestedChunkSize < 1 || requestedChunkSize > 1024 * 1024) {
    throw new Error("Secret scan chunk size is invalid");
  }

  let overlap = Buffer.alloc(0);
  for await (const rawChunk of createReadStream(path, { highWaterMark: requestedChunkSize })) {
    const chunk: unknown = rawChunk;
    if (!Buffer.isBuffer(chunk)) throw new Error('Expected binary stream');
    const bytes = overlap.length ? Buffer.concat([overlap, chunk]) : chunk;
    if (bytes.indexOf(needle) !== -1) return true;
    const overlapLength = Math.min(needle.length - 1, bytes.length);
    overlap = overlapLength ? Buffer.from(bytes.subarray(bytes.length - overlapLength)) : Buffer.alloc(0);
  }
  return false;
}

export async function countFilesContainingBytes(paths: Iterable<string>, value: string | Uint8Array): Promise<number> {
  let count = 0;
  for (const path of new Set(paths)) {
    if (!(await lstat(path)).isFile()) continue;
    if (await fileContainsBytes(path, value)) count += 1;
  }
  return count;
}
