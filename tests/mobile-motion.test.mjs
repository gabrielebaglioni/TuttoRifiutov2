import test from "node:test";
import assert from "node:assert/strict";
import { canvasSize, meaningfulResize, pieFrame, clientMotion } from "../src/scripts/motion-policy.js";

test("mobile address-bar height changes do not reset the animation but rotation does", () => {
  assert.equal(meaningfulResize({ width: 390, height: 844 }, { width: 390, height: 730 }, true), false);
  assert.equal(meaningfulResize({ width: 390, height: 844 }, { width: 844, height: 390 }, true), true);
  assert.equal(meaningfulResize({ width: 1200, height: 800 }, { width: 1200, height: 700 }, false), true);
});
test("canvas resolution stays bounded on high-DPR phones and tablets", () => {
  for (const [width, height, dpr] of [[390,844,3],[1024,1366,3],[430,932,4]]) {
    const size = canvasSize(width, height, dpr);
    assert.ok(size.width * size.height <= 1_100_000);
    assert.ok(size.width <= 1024 && size.height <= 1024);
  }
});
test("pie always fills before zooming, supports backward scroll, and clamps overscroll", () => {
  assert.deepEqual(pieFrame(0,7), { fill:0, scale:1 });
  assert.deepEqual(pieFrame(0.5,7), { fill:1, scale:1 });
  assert.deepEqual(pieFrame(1.2,7), { fill:1, scale:8 });
  assert.deepEqual(pieFrame(-0.2,7), { fill:0, scale:1 });
});
test("sightings are visible before mid-screen and finish by 65 percent of the viewport", () => {
  assert.ok(clientMotion(0.8).opacity > 0);
  assert.deepEqual(clientMotion(0.65), { opacity:1, offset:0 });
  assert.deepEqual(clientMotion(1), { opacity:0, offset:14 });
});
