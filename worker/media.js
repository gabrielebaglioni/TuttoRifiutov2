import { parseCanonicalMediaKey, validMediaSources } from "../src/data/media-source.js";

export const VARIANTS = Object.freeze([
  { field: "small", width: 640 },
  { field: "medium", width: 1280 },
  { field: "large", width: 2048 },
]);
export const MAX_VARIANT_BYTES = 2_500_000;
export const MAX_VARIANT_PIXELS = 25_000_000;

const WEBP_SIGNATURE = [0x52, 0x49, 0x46, 0x46, undefined, undefined, undefined, undefined, 0x57, 0x45, 0x42, 0x50];
function little32(bytes, offset) { return (bytes[offset] + (bytes[offset + 1] * 0x100) + (bytes[offset + 2] * 0x10000) + (bytes[offset + 3] * 0x1000000)); }
function chunkName(bytes, offset) { return String.fromCharCode(...bytes.slice(offset, offset + 4)); }
function little24(bytes, offset) { return bytes[offset] + (bytes[offset + 1] * 0x100) + (bytes[offset + 2] * 0x10000); }

function validDimensions(width, height) {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0;
}

function inspectVp8(bytes, chunk) {
  if (chunk.size < 10) return null;
  const start = chunk.start;
  const frameTag = bytes[start] | (bytes[start + 1] << 8) | (bytes[start + 2] << 16);
  const version = (frameTag >>> 1) & 0x7;
  const firstPartitionSize = frameTag >>> 5;
  if ((frameTag & 1) !== 0 || version > 3 || (frameTag & 0x10) === 0 || firstPartitionSize === 0 || firstPartitionSize > chunk.size - 10) return null;
  if (bytes[start + 3] !== 0x9d || bytes[start + 4] !== 0x01 || bytes[start + 5] !== 0x2a) return null;
  const width = (bytes[start + 6] | (bytes[start + 7] << 8)) & 0x3fff;
  const height = (bytes[start + 8] | (bytes[start + 9] << 8)) & 0x3fff;
  return validDimensions(width, height) ? { width, height } : null;
}

function inspectVp8l(bytes, chunk) {
  if (chunk.size < 6 || bytes[chunk.start] !== 0x2f) return null;
  const bits = little32(bytes, chunk.start + 1);
  if ((bits >>> 29) !== 0) return null;
  const width = (bits & 0x3fff) + 1;
  const height = ((bits >>> 14) & 0x3fff) + 1;
  return validDimensions(width, height) ? { width, height } : null;
}

function inspectVp8x(bytes, chunks) {
  const header = chunks[0];
  if (header.size !== 10) return null;
  const start = header.start;
  const flags = bytes[start];
  if ((flags & ~0x3e) !== 0 || (flags & 0x02) !== 0 || bytes[start + 1] !== 0 || bytes[start + 2] !== 0 || bytes[start + 3] !== 0) return null;
  const width = little24(bytes, start + 4) + 1;
  const height = little24(bytes, start + 7) + 1;
  if (!validDimensions(width, height)) return null;

  const body = chunks.slice(1);
  if (chunks.filter((chunk) => chunk.type === "VP8X").length !== 1 || body.some((chunk) => chunk.type === "ANIM" || chunk.type === "ANMF")) return null;
  const images = body.filter((chunk) => chunk.type === "VP8 " || chunk.type === "VP8L");
  const alpha = body.filter((chunk) => chunk.type === "ALPH");
  if (images.length !== 1 || alpha.length > 1 || Boolean(flags & 0x10) !== Boolean(alpha.length)) return null;
  for (const [flag, type] of [[0x20, "ICCP"], [0x08, "EXIF"], [0x04, "XMP"]]) {
    if (Boolean(flags & flag) !== (body.filter((chunk) => chunk.type === type).length === 1)) return null;
  }
  const image = images[0];
  const imageIndex = chunks.indexOf(image);
  if (alpha.length) {
    const alphaChunk = alpha[0];
    const alphaHeader = bytes[alphaChunk.start];
    if (image.type !== "VP8 " || chunks.indexOf(alphaChunk) > imageIndex || alphaChunk.size < 2 || (alphaHeader & 0xc3) !== 0 || ((alphaHeader >>> 4) & 0x3) > 1) return null;
  }
  const dimensions = image.type === "VP8 " ? inspectVp8(bytes, image) : inspectVp8l(bytes, image);
  return dimensions && dimensions.width === width && dimensions.height === height ? dimensions : null;
}

export async function inspectWebp(file) {
  if (!file || typeof file.arrayBuffer !== "function" || !Number.isSafeInteger(file.size) || file.size < 20) return null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length !== file.size || !WEBP_SIGNATURE.every((value, index) => value === undefined || bytes[index] === value) || little32(bytes, 4) + 8 !== bytes.length) return null;
    const chunks = [];
    for (let offset = 12; offset < bytes.length;) {
      if (offset + 8 > bytes.length) return null;
      const size = little32(bytes, offset + 4);
      const end = offset + 8 + size;
      if (end > bytes.length || end + (size % 2) > bytes.length) return null;
      chunks.push({ type: chunkName(bytes, offset), start: offset + 8, size });
      offset = end + (size % 2);
    }
    if (!chunks.length) return null;
    if (chunks[0].type === "VP8X") return inspectVp8x(bytes, chunks);
    if (chunks.length !== 1) return null;
    return chunks[0].type === "VP8 " ? inspectVp8(bytes, chunks[0]) : chunks[0].type === "VP8L" ? inspectVp8l(bytes, chunks[0]) : null;
  } catch {
    return null;
  }
}

export async function validateVariant(file, maximum = MAX_VARIANT_BYTES) {
  if (!file || typeof file.arrayBuffer !== "function" || file.type !== "image/webp" || !Number.isSafeInteger(file.size) || file.size > maximum) return false;
  const dimensions = await inspectWebp(file);
  return Boolean(dimensions && dimensions.width > 0 && dimensions.height > 0 && dimensions.width * dimensions.height <= MAX_VARIANT_PIXELS);
}

export function isSafeMediaKey(key) {
  return Boolean(parseCanonicalMediaKey(key));
}

export function mediaUrl(key) {
  return `/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function keysForVariantSet(key, widths = VARIANTS.map((variant) => variant.width)) {
  const parsed = parseCanonicalMediaKey(key);
  if (!parsed) return [key];
  return [...new Set(widths.filter((width) => Number.isInteger(width) && width > 0 && width <= 99_999).map((width) => `${parsed.family}/${width}.webp`))];
}

export function mediaJson(row, expected) {
  const primary = parseCanonicalMediaKey(row?.key);
  if (!primary || !expected || !["events", "archive"].includes(expected.ownerType) || !["cover", "detail"].includes(expected.role)
    || primary.ownerType !== expected.ownerType || primary.ownerSlug !== expected.ownerSlug || row.role !== expected.role) return null;

  let widths;
  try { widths = JSON.parse(row.widths_json); } catch { return null; }
  if (!Array.isArray(widths) || !widths.length || !widths.every((width) => Number.isSafeInteger(width) && width > 0 && width <= 99_999) || new Set(widths).size !== widths.length) return null;
  widths = [...widths].sort((left, right) => left - right);

  let storedSources;
  try { storedSources = row.sources_json === undefined ? [] : JSON.parse(row.sources_json); } catch { return null; }
  if (!Array.isArray(storedSources)) return null;
  if (!storedSources.length) storedSources = keysForVariantSet(row.key, widths).map((key) => ({ key, width: parseCanonicalMediaKey(key)?.width }));

  const candidates = [];
  for (const source of storedSources) {
    const parsed = parseCanonicalMediaKey(source?.key);
    if (!parsed || !Number.isSafeInteger(source?.width) || source.width !== parsed.width || parsed.family !== primary.family) return null;
    candidates.push({ src: mediaUrl(parsed.key), width: source.width });
  }
  const sources = validMediaSources(candidates);
  if (sources.length !== widths.length || !sources.every((source, index) => source.width === widths[index]) || !sources.some((source) => source.src === mediaUrl(row.key))) return null;
  return {
    id: row.id,
    key: row.key,
    role: row.role,
    alt: row.alt,
    position: row.position,
    widths,
    src: mediaUrl(row.key),
    sources,
  };
}

export async function serveMedia(_request, env, key) {
  const requested = parseCanonicalMediaKey(key);
  if (!requested) return new Response("Not found", { status: 404 });
  if (!env.MEDIA || !env.DB) return new Response("Media storage unavailable", { status: 500 });
  let rows = [];
  try {
    const owner = requested.ownerType === "events"
      ? { mediaTable: "event_media", parentTable: "events", parentColumn: "event_id" }
      : { mediaTable: "archive_media", parentTable: "archive_items", parentColumn: "archive_item_id" };
    const parent = await env.DB.prepare(`SELECT id FROM ${owner.parentTable} WHERE slug = ? LIMIT 1`)
      .bind(requested.ownerSlug).first();
    if (parent?.id) {
      const result = await env.DB.prepare(`SELECT * FROM ${owner.mediaTable}
        WHERE ${owner.parentColumn} = ? AND state = 'active' ORDER BY position, id`)
        .bind(parent.id).all();
      rows = Array.isArray(result) ? result : Array.isArray(result?.results) ? result.results : [];
    }
  } catch {
    console.error("media delivery database read failed");
    return new Response("Media storage unavailable", { status: 500 });
  }
  try {
    const requestedUrl = mediaUrl(key);
    const present = rows.some((row) => mediaJson(row, {
      ownerType: requested.ownerType,
      ownerSlug: requested.ownerSlug,
      role: row.role,
    })?.sources.some((source) => source.src === requestedUrl));
    if (!present) return new Response("Not found", { status: 404 });
  } catch {
    console.error("media delivery manifest validation failed");
    return new Response("Media storage unavailable", { status: 500 });
  }
  try {
    const object = await env.MEDIA.get(key);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=31536000, immutable");
    return new Response(object.body, { headers });
  } catch {
    console.error("media delivery object read failed");
    return new Response("Media storage unavailable", { status: 500 });
  }
}
