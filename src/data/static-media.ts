import type { ImageMetadata } from "astro";

/** Astro wraps imported image metadata in a Proxy. Copy enumerable fields before cloning. */
export function plainImage(source: ImageMetadata): ImageMetadata;
export function plainImage(source: string | ImageMetadata): string | ImageMetadata;
export function plainImage(source: string | ImageMetadata): string | ImageMetadata {
  return typeof source === "string" ? source : { ...source };
}
