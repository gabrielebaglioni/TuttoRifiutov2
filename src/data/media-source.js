export const MAX_SLUG_BYTES = 180;
export const MAX_MEDIA_KEY_BYTES = 1024;
export const MEDIA_KEY_PATTERN = /^(events|archive)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([1-9]\d{0,4})\.webp$/;
const encoder = new TextEncoder();

export function parseCanonicalMediaKey(key) {
  const match = typeof key === "string" ? key.match(MEDIA_KEY_PATTERN) : null;
  if (!match || encoder.encode(match[2]).byteLength > MAX_SLUG_BYTES || encoder.encode(key).byteLength > MAX_MEDIA_KEY_BYTES) return null;
  const [, ownerType, ownerSlug, uuid, widthText] = match;
  return { key, ownerType, ownerSlug, uuid, width: Number(widthText), family: `${ownerType}/${ownerSlug}/${uuid}` };
}

export function isCanonicalMediaKey(key) {
  return Boolean(parseCanonicalMediaKey(key));
}

export function mediaSourceWidth(source) {
  if (typeof source !== "string" || !source.startsWith("/media/")) return null;
  return parseCanonicalMediaKey(source.slice("/media/".length))?.width ?? null;
}

export function validMediaSources(sources) {
  if (!Array.isArray(sources)) return [];
  const widths = new Set();
  const valid = [];
  for (const source of sources) {
    const width = mediaSourceWidth(source?.src);
    if (!Number.isSafeInteger(source?.width) || source.width !== width || widths.has(width)) return [];
    widths.add(width); valid.push({ src: source.src, width });
  }
  return valid.sort((left, right) => left.width - right.width);
}
