import { SITE_CONTENT } from "./content-defaults.js";
import { THEME_KEY, validatePalette } from '../src/data/theme.js';

export const MAX_CONTENT_STRING_LENGTH = 20_000;

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isLinkKey(key) {
  return /(?:^|[._])(?:href|url|link)(?:$|[._])/.test(key);
}

function isNestedLink(key, path) {
  return key === "global.menu.items" && path.length === 2 && path[1] === 1;
}

export function isEditableContentKey(key, defaults = SITE_CONTENT) {
  return typeof key === "string" && hasOwn(defaults, key);
}

export function isAllowedLink(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\")) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "mailto:" && url.pathname.length > 0);
  } catch {
    return false;
  }
}

function matchesSchema(key, fallback, value, depth = 0, path = []) {
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

export function validateContentValue(key, value, defaults = SITE_CONTENT) {
  if (!isEditableContentKey(key, defaults)) return false;
  if (key === THEME_KEY) return validatePalette(value);
  return matchesSchema(key, defaults[key], value);
}
