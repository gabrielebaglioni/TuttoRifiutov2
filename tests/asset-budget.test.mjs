import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import test from "node:test";
import config from "../astro.config.mjs";

const MAX_BYTES = 4 * 1024 * 1024;

test("tracked raster placeholders stay below the source upload budget", () => {
  const files = execFileSync("git", ["ls-files", "src/assets", "public"], {
    encoding: "utf8",
  }).trim().split("\n").filter((path) => /\.(png|jpe?g|webp)$/i.test(path));
  const oversized = files.filter((path) => statSync(path).size > MAX_BYTES);
  assert.deepEqual(oversized, []);
});

test("the primary body font stays below 64 KB so first-scroll layout does not wait on a megabyte font", () => {
  const family = config.fonts.find((font) => font.cssVariable === "--font-stylish");
  const file = family.options.variants[0].src[0];
  assert.ok(statSync(file).size < 64 * 1024);
});
