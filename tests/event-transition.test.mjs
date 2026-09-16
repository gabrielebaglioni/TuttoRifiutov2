import test from "node:test";
import assert from "node:assert/strict";
import gsapPackage from "gsap/dist/gsap.js";
import { runEventTransition } from "../src/scripts/event-transition.ts";
const gsap = gsapPackage.gsap;

test("events change only at full coverage and dissolve once before unlocking", () => {
  const blocks = Array.from({ length: 12 }, () => ({ opacity: 0 }));
  let changes = 0;
  let finished = 0;
  const timeline = runEventTransition(gsap, blocks, () => {
    assert.ok(blocks.every((block) => block.opacity === 1));
    changes++;
  }, () => {
    assert.ok(blocks.every((block) => block.opacity === 0));
    finished++;
  }).pause();
  timeline.progress(0.1);
  assert.equal(changes, 0);
  for (let progress = 0.2; progress < 1; progress += 0.1) timeline.progress(progress);
  timeline.progress(1);
  assert.equal(changes, 1);
  assert.equal(finished, 1);
  timeline.kill();
});
