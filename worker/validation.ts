import { SITE_CONTENT } from "./content-defaults.ts";
import { THEME_KEY, validatePalette } from '../src/data/theme.ts';

export const MAX_CONTENT_STRING_LENGTH = 20_000;

function hasOwn(object: object, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isLinkKey(key: string) {
  return /(?:^|[._])(?:href|url|link)(?:$|[._])/.test(key);
}

function isNestedLink(key: string, path: readonly number[]) {
  return key === "global.menu.items" && path.length === 2 && path[1] === 1;
}

export function isEditableContentKey(key: unknown, defaults: Readonly<Record<string, unknown>> = SITE_CONTENT): key is string {
  return typeof key === "string" && hasOwn(defaults, key);
}

export function isAllowedLink(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\")) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "mailto:" && url.pathname.length > 0);
  } catch {
    return false;
  }
}

function matchesSchema(key: string, fallback: unknown, value: unknown, depth = 0, path: readonly number[] = []): boolean {
  if (typeof fallback === "string") {
    const linkValue = (depth === 0 && isLinkKey(key)) || isNestedLink(key, path);
    return typeof value === "string"
      && value.length <= MAX_CONTENT_STRING_LENGTH
      && (!linkValue || isAllowedLink(value));
  }
  if (!Array.isArray(fallback) || !Array.isArray(value)) return false;

  // Top-level arrays are editorial lists, so their item count may change.
  if (depth === 0) {
    if (fallback.length === 0) return value.length === 0;
    return value.every((item, index) => matchesSchema(key, fallback[0], item, depth + 1, [...path, index]));
  }

  // Nested arrays are tuples: preserve their arity and recursively validate each slot.
  return value.length === fallback.length
    && value.every((item, index) => matchesSchema(key, fallback[index], item, depth + 1, [...path, index]));
}

export function validateContentValue(key: unknown, value: unknown, defaults: Readonly<Record<string, unknown>> = SITE_CONTENT): boolean {
  if (!isEditableContentKey(key, defaults)) return false;
  if (key === THEME_KEY) return validatePalette(value);
  return matchesSchema(key, defaults[key], value);
}
