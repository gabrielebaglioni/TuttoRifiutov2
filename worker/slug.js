export { MAX_SLUG_BYTES } from "../src/data/media-source.js";
import { MAX_SLUG_BYTES } from "../src/data/media-source.js";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const encoder = new TextEncoder();

export function isSlug(value) {
  return typeof value === "string" && SLUG.test(value) && encoder.encode(value).byteLength <= MAX_SLUG_BYTES;
}
