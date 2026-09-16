export const MAX_SLUG_BYTES = 180;
export const MAX_MEDIA_KEY_BYTES = 1024;
export const MEDIA_KEY_PATTERN = /^(events|archive)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([1-9]\d{0,4})\.webp$/;
const encoder = new TextEncoder();

export type MediaOwnerType = "events" | "archive";
export interface CanonicalMediaKey {
  key: string;
  ownerType: MediaOwnerType;
  ownerSlug: string;
  uuid: string;
  width: number;
  family: string;
}
export interface MediaSource {
  src: string;
  width: number;
}

export function parseCanonicalMediaKey(key: unknown): CanonicalMediaKey | null {
  if (typeof key !== "string") return null;
  const match = key.match(MEDIA_KEY_PATTERN);
  const ownerType = match?.[1];
  const ownerSlug = match?.[2];
  const uuid = match?.[3];
  const widthText = match?.[4];
  if ((ownerType !== "events" && ownerType !== "archive") || !ownerSlug || !uuid || !widthText
    || encoder.encode(ownerSlug).byteLength > MAX_SLUG_BYTES || encoder.encode(key).byteLength > MAX_MEDIA_KEY_BYTES) return null;
  return { key, ownerType, ownerSlug, uuid, width: Number(widthText), family: `${ownerType}/${ownerSlug}/${uuid}` };
}

export function isCanonicalMediaKey(key: unknown): key is string {
  return Boolean(parseCanonicalMediaKey(key));
}

export function mediaSourceWidth(source: unknown): number | null {
  if (typeof source !== "string" || !source.startsWith("/media/")) return null;
  return parseCanonicalMediaKey(source.slice("/media/".length))?.width ?? null;
}

export function validMediaSources(sources: unknown): MediaSource[] {
  if (!Array.isArray(sources)) return [];
  const widths = new Set<number>();
  const valid: MediaSource[] = [];
  for (const source of sources) {
    if (typeof source !== "object" || source === null) return [];
    const src = Reflect.get(source, "src");
    const sourceWidth = Reflect.get(source, "width");
    const width = mediaSourceWidth(src);
    if (typeof src !== "string" || typeof sourceWidth !== "number" || width === null
      || !Number.isSafeInteger(sourceWidth) || sourceWidth !== width || widths.has(width)) return [];
    widths.add(width); valid.push({ src, width });
  }
  return valid.sort((left, right) => left.width - right.width);
}
