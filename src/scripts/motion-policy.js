const clamp = (value) => Math.min(1, Math.max(0, value));
export function meaningfulResize(previous, next, touch) {
  return previous.width !== next.width || (!touch && previous.height !== next.height);
}
export function canvasSize(width, height, dpr = 1) {
  const ratio = Math.min(dpr || 1, 1.5, 1024 / Math.max(1, width, height));
  return { width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio)) };
}
export function pieFrame(progress, multiplier) {
  const value = clamp(progress);
  return { fill: clamp(value * 2), scale: 1 + clamp((value - 0.5) * 2) * multiplier };
}
export function clientMotion(viewportTop) {
  const progress = clamp((0.95 - viewportTop) / 0.3 + 1e-9);
  return { opacity: progress, offset: 14 * (1 - progress) };
}
