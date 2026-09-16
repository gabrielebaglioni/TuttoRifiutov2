// Both renderers use the same square alpha mask and solid-core zoom target.
export const ZOOM_ORIGIN = { x: 424, y: 400 };
export const MASK_BOX = { x: 0, y: 0, width: 800, height: 800 };

export function maskZoomMultiplier(width: number, height: number, stageSize = Math.min(width, height) * 0.8): number {
  // A 112-unit radius around the target is inside the opaque core of splatter.webp.
  // Fit the farthest viewport corner inside it without allocating a larger canvas.
  const unitsPerPixel = 800 / Math.max(1, stageSize);
  const dx = width * unitsPerPixel / 2 + Math.abs(400 - ZOOM_ORIGIN.x);
  const dy = height * unitsPerPixel / 2 + Math.abs(400 - ZOOM_ORIGIN.y);
  return Math.max(8, Math.hypot(dx, dy) / 112 * 1.04) - 1;
}
