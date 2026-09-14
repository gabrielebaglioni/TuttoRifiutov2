import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

function walkFiles(root, base = root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path, base));
    else if (entry.isFile()) files.push(relative(base, path));
  }
  return files.sort();
}

test("deployment artifact contains the worker-embedded admin and current hosting metadata", () => {
  for (const path of [
    "dist/server/index.js",
    "dist/.openai/hosting.json",
  ]) {
    assert.equal(existsSync(path), true, `missing deployment artifact: ${path}`);
  }
  assert.equal(existsSync("dist/client/admin/index.html"), false);
  assert.match(readFileSync("dist/server/index.js", "utf8"), /id="admin-login"/);

  assert.deepEqual(
    JSON.parse(readFileSync("dist/.openai/hosting.json", "utf8")),
    JSON.parse(readFileSync(".openai/hosting.json", "utf8")),
  );
});

test("deployment artifact contains the complete current migration chain and metadata", () => {
  const sourceFiles = walkFiles("drizzle");
  const artifactRoot = "dist/.openai/drizzle";

  assert.ok(sourceFiles.some((path) => path.endsWith(".sql")));
  assert.ok(sourceFiles.includes("meta/_journal.json"));
  assert.equal(existsSync(artifactRoot), true, "missing packaged migration directory");
  assert.deepEqual(walkFiles(artifactRoot), sourceFiles);

  for (const path of sourceFiles) {
    assert.deepEqual(
      readFileSync(join(artifactRoot, path)),
      readFileSync(join("drizzle", path)),
      `migration artifact differs: ${path}`,
    );
  }
});
