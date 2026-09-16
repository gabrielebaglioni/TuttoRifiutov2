export { MAX_SLUG_BYTES } from "../src/data/media-source.ts";
import { MAX_SLUG_BYTES } from "../src/data/media-source.ts";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const encoder = new TextEncoder();

export function isSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG.test(value) && encoder.encode(value).byteLength <= MAX_SLUG_BYTES;
}
