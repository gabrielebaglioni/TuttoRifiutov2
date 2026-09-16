import assert from 'node:assert/strict';
import { parse } from 'acorn';
import { readBrowserScript } from './read-browser-script.mts';
import type {} from '../src/types/browser.ts';
import type { CollectionsReadiness } from '../src/scripts/collections-readiness.ts';
import type { ProjectStartDetail } from '../src/scripts/project.ts';
import type { ContentChanges } from '../src/scripts/content-hydration.ts';

declare global {
  interface Window { __tuttoRifiutoCollectionsReady?: CollectionsReadiness; __tuttoRifiutoProjectStart?: Promise<boolean>; }
  interface WindowEventMap { 'tutto-rifiuto:project-start': CustomEvent<ProjectStartDetail>; }
  interface HTMLElementEventMap { 'tutto-rifiuto:content': CustomEvent<ContentChanges>; }
}

export function must<T>(value: T): NonNullable<T> {
  assert.ok(value !== null && value !== undefined, 'required fixture value exists');
  return value;
}
export function rect(x = 0, y = 0, width = 100, height = 100): DOMRect {
  return { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height, toJSON() { return { x, y, width, height }; } };
}
export function deferred<T>() {
  let complete: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>(resolve => { complete = resolve; });
  return { promise, resolve(value: T) { must(complete)(value); } };
}
export function script(file: string): string {
  const source = readBrowserScript(new URL('../src/scripts/' + file, import.meta.url));
  return parse(source, { ecmaVersion: 'latest', sourceType: 'module' }).body.filter(node => node.type !== 'ImportDeclaration').map(node => source.slice(node.type === 'ExportNamedDeclaration' && node.declaration ? node.declaration.start : node.start, node.end)).join('\n');
}
export function functions(file: string, names: readonly string[]): string {
  const source = readBrowserScript(new URL('../src/scripts/' + file, import.meta.url));
  return parse(source, { ecmaVersion: 'latest', sourceType: 'module' }).body.filter(node => node.type === 'FunctionDeclaration' && node.id && names.includes(node.id.name)).map(node => source.slice(node.start, node.end)).join('\n');
}
export function installGlobal(name: string, value: unknown): void { Object.defineProperty(globalThis, name, { value, writable: true, configurable: true }); }
export function restoreGlobal(name: string, value: unknown): void { if (value === undefined) Reflect.deleteProperty(globalThis, name); else installGlobal(name, value); }

export interface TweenValues {
  duration?: number; repeat?: number; delay?: number; scaleY?: number; clipPath?: string; clearProps?: string;
  onComplete?: () => void; onStart?: () => void; onUpdate?: () => void;
  [property: string]: unknown;
}
export function isStyleRule(rule: CSSRule): rule is CSSStyleRule { return rule.type === 1; }
export function isMediaRule(rule: CSSRule): rule is CSSMediaRule { return rule.type === 4; }
export function styleRules(rules: CSSRuleList, allowMedia: (rule: CSSMediaRule) => boolean = () => true): CSSStyleRule[] {
  return [...rules].flatMap(rule => isStyleRule(rule) ? [rule] : isMediaRule(rule) && allowMedia(rule) ? styleRules(rule.cssRules, allowMedia) : []);
}
