import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from 'linkedom';
import { optimizeImage, targetWidths, variantFieldsFor } from "../src/scripts/admin-image-optimizer.ts";

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
  let closed = 0; const draws: unknown[][] = [];
  globalThis.createImageBitmap = async () => ({ width: 1000, height: 500, close: () => { closed += 1; } });
  const {document} = parseHTML('<html></html>');
  const createElement = document.createElement.bind(document);
  Object.defineProperty(document, 'createElement', {value: (tag: string) => {
    const canvas = createElement(tag);
    Object.defineProperty(canvas, 'getContext', {value: () => ({drawImage: (...args: unknown[]) => draws.push(args)})});
    Object.defineProperty(canvas, 'toBlob', {value: (done: BlobCallback) => done(new Blob(['ok'], {type:'image/webp'}))});
    return canvas;
  }});
  globalThis.document = document;
  try {
    const variants = await optimizeImage(new Blob([], { type: "image/png" }));
    assert.deepEqual(variants.map(({ width }) => width), [640, 1000]); assert.equal(closed, 1); assert.equal(draws.length, 2);
  } finally { globalThis.createImageBitmap = originalBitmap; globalThis.document = originalDocument; }
});

test("optimizer closes bitmap when canvas conversion fails", async () => {
  const originalBitmap = globalThis.createImageBitmap; const originalDocument = globalThis.document;
  let closed = 0;
  globalThis.createImageBitmap = async () => ({ width: 500, height: 500, close: () => { closed += 1; } });
  const {document} = parseHTML('<html></html>');
  const createElement = document.createElement.bind(document);
  Object.defineProperty(document, 'createElement', {value: (tag: string) => {
    const canvas=createElement(tag); Object.defineProperty(canvas, 'getContext', {value: () => null}); return canvas;
  }});
  globalThis.document = document;
  try { await assert.rejects(optimizeImage(new Blob([], { type: "image/webp" }))); assert.equal(closed, 1); } finally { globalThis.createImageBitmap = originalBitmap; globalThis.document = originalDocument; }
});
