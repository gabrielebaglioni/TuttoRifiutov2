import { canvasSize, pieFrame } from "./motion-policy.js";

// The two masks are rasterized once. Zoom never allocates an enlarged surface:
// only the viewport-sized canvas is repainted, with at most two drawImage calls.
export function createPieCanvas(container, { imageUrl, origin, box, color, onError }) {
  const canvas = document.createElement("canvas");
  canvas.className = "pie-mobile-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return null;
  container.appendChild(canvas);
  let layers;
  let progress = 0;
  let multiplier = 7;
  let queued = 0;
  let disposed = false;
  let width = 1;
  let height = 1;
  const paint = () => {
    queued = 0;
    if (!layers || disposed) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const frame = pieFrame(progress, multiplier);
    const size = Math.min(width, height) * 0.8;
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    ctx.translate((width - size) / 2, (height - size) / 2);
    ctx.scale(size / 800, size / 800);
    ctx.translate(origin.x, origin.y);
    ctx.scale(frame.scale, frame.scale);
    ctx.translate(-origin.x, -origin.y);
    ctx.drawImage(layers.dots, 0, 0);
    ctx.save();
    if (frame.fill < 1) {
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.arc(origin.x, origin.y, 604, -Math.PI / 2, -Math.PI / 2 + frame.fill * Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    }
    if (frame.fill > 0) ctx.drawImage(layers.fill, 0, 0);
    ctx.restore();
  };
  const schedule = () => { if (!queued && !disposed) queued = requestAnimationFrame(paint); };
  const resize = () => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    const size = canvasSize(width, height, window.devicePixelRatio);
    canvas.width = size.width;
    canvas.height = size.height;
    schedule();
  };
  const image = new Image();
  image.onload = () => {
    if (disposed) return;
    try {
      const mask = document.createElement("canvas");
      mask.width = mask.height = 800;
      const maskContext = mask.getContext("2d");
      if (!maskContext) throw new Error("Canvas unavailable");
      const fit = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
      const w = image.naturalWidth * fit, h = image.naturalHeight * fit;
      maskContext.drawImage(image, box.x + (box.width - w) / 2, box.y + (box.height - h) / 2, w, h);
      const makeLayer = (dots) => {
        const layer = document.createElement("canvas");
        layer.width = layer.height = 800;
        const context = layer.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.fillStyle = color;
        if (dots) {
          context.beginPath();
          let seed = 42;
          const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
          for (let i = 0; i < 3500; i++) {
            const angle = random() * Math.PI * 2;
            const distance = Math.sqrt(random()) * 600;
            const x = origin.x + Math.cos(angle) * distance, y = origin.y + Math.sin(angle) * distance;
            context.moveTo(x + 1, y);
            context.arc(x, y, 1, 0, Math.PI * 2);
          }
          context.fill();
        } else context.fillRect(0, 0, 800, 800);
        context.globalCompositeOperation = "destination-in";
        context.drawImage(mask, 0, 0);
        return layer;
      };
      layers = { dots: makeLayer(true), fill: makeLayer(false) };
      schedule();
    } catch { fail(); }
  };
  const fail = () => { if (!disposed) { destroy(); onError(); } };
  image.onerror = fail;
  image.src = imageUrl;
  resize();
  function destroy() {
    disposed = true;
    cancelAnimationFrame(queued);
    canvas.remove();
    layers = null;
    image.onload = image.onerror = null;
  }
  return {
    resize, destroy,
    setColor(next) {
      if (!/^#[0-9a-f]{6}$/i.test(next) || next === color || disposed) return;
      color = next;
      if (layers) for (const layer of Object.values(layers)) {
        const context = layer.getContext('2d');
        context.globalCompositeOperation = 'source-in';
        context.fillStyle = color;
        context.fillRect(0, 0, layer.width, layer.height);
        context.globalCompositeOperation = 'source-over';
      }
      schedule();
    },
    draw(nextProgress, nextMultiplier) { progress = nextProgress; multiplier = nextMultiplier; schedule(); },
  };
}
