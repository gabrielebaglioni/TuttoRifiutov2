import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import test from "node:test";

const MAX_BYTES = 4 * 1024 * 1024;

test("tracked raster placeholders stay below the source upload budget", () => {
  const files = execFileSync("git", ["ls-files", "src/assets", "public"], {
    encoding: "utf8",
  }).trim().split("\n").filter((path) => /\.(png|jpe?g|webp)$/i.test(path));
  const oversized = files.filter((path) => statSync(path).size > MAX_BYTES);
  assert.deepEqual(oversized, []);
});
