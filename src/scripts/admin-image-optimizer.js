const TARGETS = Object.freeze([640, 1280, 2048]);

export function targetWidths(sourceWidth) {
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0) return [];
  return [...new Set([...TARGETS.filter((width) => width < sourceWidth), Math.round(sourceWidth)])]
    .sort((left, right) => left - right)
    .slice(0, 3);
}

export function variantFieldsFor(widths) {
  if (!Array.isArray(widths) || widths.length < 1 || widths.length > 3) {
    throw new Error("Varianti immagine non valide");
  }
  return ["small", "medium", "large"].slice(0, widths.length);
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Impossibile ottimizzare l’immagine"));
      }, "image/webp", 0.82);
    } catch {
      reject(new Error("Impossibile ottimizzare l’immagine"));
    }
  });
}

export async function optimizeImage(file) {
  if (!file || !/^image\/(jpeg|png|webp|avif)$/.test(file.type)) {
    throw new Error("Formato non supportato");
  }
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    throw new Error("Ottimizzazione immagine non disponibile");
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (!Number.isFinite(bitmap.width) || !Number.isFinite(bitmap.height) || bitmap.width <= 0 || bitmap.height <= 0) {
      throw new Error("Dimensioni immagine non valide");
    }
    const variants = [];
    for (const width of targetWidths(bitmap.width)) {
      const canvas = document.createElement("canvas");
      const height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("Impossibile ottimizzare l’immagine");
      context.drawImage(bitmap, 0, 0, width, height);
      variants.push({ width, blob: await canvasBlob(canvas) });
    }
    return variants;
  } finally {
    if (bitmap && typeof bitmap.close === "function") bitmap.close();
  }
}
