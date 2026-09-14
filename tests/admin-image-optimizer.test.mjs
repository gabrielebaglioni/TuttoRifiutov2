import assert from "node:assert/strict";
import test from "node:test";
import { optimizeImage, targetWidths, variantFieldsFor } from "../src/scripts/admin-image-optimizer.js";

test("image variants never upscale and use the responsive targets", () => {
  assert.deepEqual(targetWidths(3000), [640, 1280, 2048]);
  assert.deepEqual(targetWidths(1000), [640, 1000]);
  assert.deepEqual(targetWidths(500), [500]);
});

test("variant fields truthfully represent one, two, or three generated sizes", () => {
  assert.deepEqual(variantFieldsFor([500]), ["small"]);
  assert.deepEqual(variantFieldsFor([640, 1000]), ["small", "medium"]);
  assert.deepEqual(variantFieldsFor([640, 1280, 2048]), ["small", "medium", "large"]);
});

test("optimizer creates no-upscale variants and closes its bitmap", async () => {
  const originalBitmap = globalThis.createImageBitmap; const originalDocument = globalThis.document;
  let closed = 0; const draws = [];
  globalThis.createImageBitmap = async () => ({ width: 1000, height: 500, close: () => { closed += 1; } });
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage: (...args) => draws.push(args) }), toBlob: (done) => done(new Blob(["ok"], { type: "image/webp" })) }) };
  try {
    const variants = await optimizeImage({ type: "image/png" });
    assert.deepEqual(variants.map(({ width }) => width), [640, 1000]); assert.equal(closed, 1); assert.equal(draws.length, 2);
  } finally { globalThis.createImageBitmap = originalBitmap; globalThis.document = originalDocument; }
});

test("optimizer closes bitmap when canvas conversion fails", async () => {
  const originalBitmap = globalThis.createImageBitmap; const originalDocument = globalThis.document;
  let closed = 0;
  globalThis.createImageBitmap = async () => ({ width: 500, height: 500, close: () => { closed += 1; } });
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  try { await assert.rejects(optimizeImage({ type: "image/webp" })); assert.equal(closed, 1); } finally { globalThis.createImageBitmap = originalBitmap; globalThis.document = originalDocument; }
});
