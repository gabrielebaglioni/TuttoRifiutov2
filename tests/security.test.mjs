import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import test from "node:test";

import * as securityScan from "../scripts/security-scan.mjs";

const { containsEmbeddedAdminPasswordAssignment } = securityScan;

function detect(source, path = "inline.js") {
  return containsEmbeddedAdminPasswordAssignment(source, path);
}

const TEXT_EXTENSIONS = new Set([
  "", ".astro", ".cjs", ".css", ".env", ".html", ".js", ".json",
  ".map", ".md", ".mjs", ".sql", ".svg", ".toml", ".ts", ".tsx",
  ".txt", ".xml", ".yaml", ".yml",
]);

test("AST detector catches static and composed JavaScript password assignments", () => {
  const embeddedAssignments = [
    "const ADMIN_PASSWORD=\"embedded-value\";",
    "let ADMIN_PASSWORD = `embedded-value`;",
    "var ADMIN_PASSWORD = 'embedded-value';",
    "ADMIN_PASSWORD=\"embedded-value\";",
    "env.ADMIN_PASSWORD = \"embedded-value\";",
    "process.env.ADMIN_PASSWORD='embedded-value';",
    "env[\"ADMIN_PASSWORD\"]=\"embedded-value\";",
    "process.env['ADMIN_PASSWORD'] = `embedded-value`;",
    "process[\"env\"][\"ADMIN_PASSWORD\"] = \"embedded-value\";",
    "env[`ADMIN_PASSWORD`] ||= 73;",
    "({ ADMIN_PASSWORD: \"embedded-value\" })",
    "({[\"ADMIN_PASSWORD\"]:'embedded-value'})",
    "({[`ADMIN_PASSWORD`]: 'embedded-value'})",
    "const\nADMIN_PASSWORD\n=\n\"embedded-value\";",
    "const /* a comment that\nspans lines */ ADMIN_PASSWORD = \"embedded-value\";",
    "env /* target */ . ADMIN_PASSWORD ??= process.env.ADMIN_PASSWORD || \"embedded-value\";",
    "({ ADMIN_PASSWORD /* key */ :\n ['embedded', 'value'].join('-') })",
    "const ADMIN_PASSWORD = `${process.env.ADMIN_PASSWORD}-embedded`;",
    "const ADMIN_PASSWORD = `${process.env.ADMIN_PASSWORD || 'embedded-value'}`;",
    "const ADMIN_PASSWORD = \"\\x65mbedded-value\";",
    "var ADMIN_PASSWORD=(41 + 1);",
    "const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || \"fallback\";",
    "const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || \"\";",
    "settings.ADMIN_PASSWORD = \"embedded-value\";",
    "deployment.credentials[\"ADMIN_PASSWORD\"] = \"embedded-value\";",
    "this[`ADMIN_PASSWORD`] = \"embedded-value\";",
    "deployment.credentials[`ADMIN_${\"PASSWORD\"}`] = \"embedded-value\";",
    "const ADMIN_PASSWORD = settings?.ADMIN_PASSWORD;",
    "class Configuration { ADMIN_PASSWORD = \"embedded-value\"; }",
  ];

  for (const [index, source] of embeddedAssignments.entries()) {
    assert.equal(detect(source), true, `embedded JavaScript case ${index}`);
  }
});

test("AST detector inspects every assignment operator on arbitrary password members", () => {
  const embeddedAssignments = [
    "settings.ADMIN_PASSWORD += \"embedded-value\";",
    "settings.ADMIN_PASSWORD -= 1;",
    "settings.ADMIN_PASSWORD *= 2;",
    "settings.ADMIN_PASSWORD /= 2;",
    "settings.ADMIN_PASSWORD %= 2;",
    "settings.ADMIN_PASSWORD **= 2;",
    "settings.ADMIN_PASSWORD <<= 1;",
    "settings.ADMIN_PASSWORD >>= 1;",
    "settings.ADMIN_PASSWORD >>>= 1;",
    "settings.ADMIN_PASSWORD &= 1;",
    "settings.ADMIN_PASSWORD ^= 1;",
    "settings.ADMIN_PASSWORD |= 1;",
    "settings.ADMIN_PASSWORD &&= \"embedded-value\";",
    "settings.ADMIN_PASSWORD ||= \"embedded-value\";",
    "settings.ADMIN_PASSWORD ??= \"embedded-value\";",
  ];

  for (const [index, source] of embeddedAssignments.entries()) {
    assert.equal(detect(source), true, `assignment operator case ${index}`);
  }
});

test("AST detector follows sensitive destructuring aliases and defaults", () => {
  const embeddedPatterns = [
    "const { ADMIN_PASSWORD: password = \"embedded-value\" } = env;",
    "const { ADMIN_PASSWORD = \"embedded-value\" } = env;",
    "({ ADMIN_PASSWORD: password = \"embedded-value\" } = env);",
    "const { credentials: { [`ADMIN_PASSWORD`]: password = \"embedded-value\" } } = deployment;",
    "const [ADMIN_PASSWORD = \"embedded-value\"] = values;",
    "function authenticate(...[ADMIN_PASSWORD = \"embedded-value\"]) {}",
    "function authenticate(ADMIN_PASSWORD = \"embedded-value\") {}",
    "function authenticate({ ADMIN_PASSWORD: password = \"embedded-value\" }) {}",
    "try {} catch ({ ADMIN_PASSWORD: password = \"embedded-value\" }) {}",
  ];
  const safePatterns = [
    "const { ADMIN_PASSWORD: password } = env;",
    "const { ADMIN_PASSWORD: password = \"\" } = env;",
    "const { ADMIN_PASSWORD: password = process.env.ADMIN_PASSWORD } = env;",
    "({ ADMIN_PASSWORD: password = process[\"env\"][\"ADMIN_PASSWORD\"] } = env);",
    "const [ADMIN_PASSWORD = env.ADMIN_PASSWORD] = values;",
    "function authenticate(ADMIN_PASSWORD = process.env.ADMIN_PASSWORD) {}",
    "try {} catch ({ ADMIN_PASSWORD: password = env.ADMIN_PASSWORD }) {}",
  ];

  for (const [index, source] of embeddedPatterns.entries()) {
    assert.equal(detect(source), true, `embedded destructuring case ${index}`);
  }
  for (const [index, source] of safePatterns.entries()) {
    assert.equal(detect(source), false, `safe destructuring case ${index}`);
  }
});

test("AST detector applies an outer default to every sensitive target nested in its pattern", () => {
  const embeddedPatterns = [
    "function f([ADMIN_PASSWORD] = [\"embedded-value\"]) {}",
    "function f({ nested: { ADMIN_PASSWORD: alias } } = { nested: { ADMIN_PASSWORD: \"embedded-value\" } }) {}",
    "function f({ nested: [ADMIN_PASSWORD] } = { nested: [\"embedded-value\"] }) {}",
    "function f([...[ADMIN_PASSWORD]] = [\"embedded-value\"]) {}",
  ];
  const safePatterns = [
    "function f([ADMIN_PASSWORD] = \"\") {}",
    "function f([ADMIN_PASSWORD] = process.env.ADMIN_PASSWORD) {}",
    "function f({ nested: { ADMIN_PASSWORD: alias } } = env.ADMIN_PASSWORD) {}",
  ];

  for (const [index, source] of embeddedPatterns.entries()) {
    assert.equal(detect(source), true, `embedded outer default case ${index}`);
  }
  for (const [index, source] of safePatterns.entries()) {
    assert.equal(detect(source), false, `safe outer default case ${index}`);
  }
});

test("AST detector handles private password fields without treating private methods as assignments", () => {
  const embeddedPrivateFields = [
    "class Vault { #ADMIN_PASSWORD = \"embedded-value\"; }",
    "class Vault { #ADMIN_PASSWORD; update() { this.#ADMIN_PASSWORD += \"embedded-value\"; } }",
    "class Vault { #ADMIN_PASSWORD; update(source) { ({ value: this.#ADMIN_PASSWORD = \"embedded-value\" } = source); } }",
  ];
  const safePrivateFields = [
    "class Vault { #ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; }",
    "class Vault { #ADMIN_PASSWORD; update() { this.#ADMIN_PASSWORD = env.ADMIN_PASSWORD; } }",
    "class Vault { #ADMIN_PASSWORD() { return \"not-an-assignment\"; } }",
  ];

  for (const [index, source] of embeddedPrivateFields.entries()) {
    assert.equal(detect(source), true, `embedded private field case ${index}`);
  }
  for (const [index, source] of safePrivateFields.entries()) {
    assert.equal(detect(source), false, `safe private field case ${index}`);
  }
});

test("AST detector allows only empty literals and direct runtime JavaScript reads", () => {
  const safeSources = [
    "const ADMIN_PASSWORD = ``;",
    "env.ADMIN_PASSWORD = \"\";",
    "({ ADMIN_PASSWORD: '' })",
    "ADMIN_PASSWORD === \"comparison\"",
    "ADMIN_PASSWORD == \"comparison\"",
    "const value = env.ADMIN_PASSWORD;",
    "const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;",
    "env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;",
    "({ ADMIN_PASSWORD: env.ADMIN_PASSWORD })",
    "const\nADMIN_PASSWORD\n=\nprocess /* runtime */ . env . ADMIN_PASSWORD;",
    "env[\"ADMIN_PASSWORD\"] ??= process.env.ADMIN_PASSWORD;",
    "({ ADMIN_PASSWORD:\n env[\"ADMIN_PASSWORD\"] })",
    "const ADMIN_PASSWORD = `${process.env.ADMIN_PASSWORD}`;",
    "const ADMIN_PASSWORD = `${env['ADMIN_PASSWORD']}`;",
    "const ADMIN_PASSWORD = process[\"env\"][\"ADMIN_PASSWORD\"];",
    "const ADMIN_PASSWORD = env[`ADMIN_PASSWORD`];",
    "settings.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;",
    "class Configuration { [\"ADMIN_PASSWORD\"] = process.env.ADMIN_PASSWORD; }",
    "// ADMIN_PASSWORD = \"comment-only\";",
    "/* ADMIN_PASSWORD ||= 'comment-only'; */ const value = 1;",
    "ADMIN_PASSWORD => \"arrow-body\"",
    "if (/ADMIN_PASSWORD=\"not-an-assignment\"/.test(value)) value += 1;",
    "throw /ADMIN_PASSWORD=\"still-not-an-assignment\"/;",
  ];

  for (const [index, source] of safeSources.entries()) {
    assert.equal(detect(source), false, `safe JavaScript case ${index}`);
  }
});

test("path-aware detector parses dotenv comments and unquoted values only as dotenv", () => {
  const embeddedDotenv = [
    "ADMIN_PASSWORD=embedded-value",
    "ADMIN_PASSWORD=embedded value with spaces # deployment note",
    "export ADMIN_PASSWORD = 'embedded-value # retained in quotes'",
  ];
  const safeDotenv = [
    "# ADMIN_PASSWORD=comment-only",
    "ADMIN_PASSWORD= # placeholder comment",
    "ADMIN_PASSWORD=\"\" # placeholder",
    "export ADMIN_PASSWORD = ''",
  ];

  for (const [index, source] of embeddedDotenv.entries()) {
    assert.equal(detect(source, ".env.example"), true, `embedded dotenv case ${index}`);
  }
  for (const [index, source] of safeDotenv.entries()) {
    assert.equal(detect(source, ".env.production"), false, `safe dotenv case ${index}`);
  }
});

test("path-aware detector recursively parses JSON and fails closed for malformed production fragments", () => {
  assert.equal(detect('{"nested":{"ADMIN_PASSWORD":"embedded-value"}}', "public/config.json"), true);
  assert.equal(detect('{"ADMIN_PASSWORD":""}', "public/config.json"), false);
  assert.equal(detect('{"ADMIN_PASSWORD":', "public/config.json"), true);
  assert.equal(detect("const ADMIN_PASSWORD =", "worker/config.js"), true);
});

test("path-aware detector parses Astro frontmatter and scripts as AST fragments", () => {
  assert.equal(detect("---\nconst ADMIN_PASSWORD = 'embedded-value';\n---\n<div />", "src/page.astro"), true);
  assert.equal(detect("<script>env[`ADMIN_PASSWORD`] = 'embedded-value';</script>", "src/page.astro"), true);
  assert.equal(detect("---\nconst ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;\n---\n<div />", "src/page.astro"), false);
  assert.equal(detect("---\nconst ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;\nif (!ADMIN_PASSWORD) return Astro.redirect('/');\n---\n<div />", "src/page.astro"), false);
  assert.equal(detect("---\nconst ADMIN_PASSWORD =\n---\n<div />", "src/page.astro"), true);
  assert.equal(detect("return;", "worker/config.js"), true);
  assert.equal(detect("return;", "worker/config.cjs"), true);
  assert.equal(detect("<script>return;</script>", "src/page.astro"), true);
});

test("production scan excludes test and documentation fixtures but includes shipped sources", () => {
  assert.equal(typeof securityScan.isProductionTrackedPath, "function");
  if (typeof securityScan.isProductionTrackedPath !== "function") return;

  assert.equal(securityScan.isProductionTrackedPath("tests/auth.test.mjs"), false);
  assert.equal(securityScan.isProductionTrackedPath("docs/plan.md"), false);
  assert.equal(securityScan.isProductionTrackedPath("README.md"), false);
  assert.equal(securityScan.isProductionTrackedPath("task-6-report.md"), false);
  assert.equal(securityScan.isProductionTrackedPath("worker/auth.js"), true);
  assert.equal(securityScan.isProductionTrackedPath("scripts/build-worker.mjs"), true);
  assert.equal(securityScan.isProductionTrackedPath(".env.example"), true);
  assert.equal(securityScan.isProductionTrackedPath("src/content/policy.md"), true);
  assert.equal(securityScan.isProductionTrackedPath("public/copy/notice.md"), true);
});

test("exact-byte detector streams arbitrary binary files across chunk boundaries", async (t) => {
  assert.equal(typeof securityScan.fileContainsBytes, "function");
  if (typeof securityScan.fileContainsBytes !== "function") return;

  const directory = await mkdtemp(join(tmpdir(), "tr-security-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "artifact.unknown-binary");
  const marker = randomBytes(41);
  await writeFile(path, Buffer.concat([Buffer.alloc(15, 0xa5), marker, Buffer.alloc(17, 0x5a)]));

  assert.equal(await securityScan.fileContainsBytes(path, marker, { highWaterMark: 16 }), true);
  assert.equal(await securityScan.fileContainsBytes(path, randomBytes(41), { highWaterMark: 16 }), false);
});

test("exact-byte file counting includes regular files and never dereferences non-regular paths", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "tr-security-paths-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const marker = randomBytes(37);
  const matchingFile = join(directory, "matching.data");
  const cleanFile = join(directory, "clean.data");
  const nestedDirectory = join(directory, "nested");
  const linkedFile = join(directory, "linked.data");
  await writeFile(matchingFile, Buffer.concat([randomBytes(19), marker]));
  await writeFile(cleanFile, randomBytes(91));
  await mkdir(nestedDirectory);
  await symlink(matchingFile, linkedFile);

  assert.equal(
    await securityScan.countFilesContainingBytes(
      [matchingFile, cleanFile, linkedFile, nestedDirectory],
      marker,
    ),
    1,
  );
  assert.equal(await securityScan.countFilesContainingBytes([linkedFile, nestedDirectory], marker), 0);
});

function walkFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function trackedTextFiles() {
  const output = execFileSync("git", ["ls-files", "-z"]);
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter(securityScan.isProductionTrackedPath)
    .filter((path) => path === ".env.example" || TEXT_EXTENSIONS.has(extname(path).toLowerCase()));
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function distTextFiles() {
  return walkFiles("dist").filter((path) =>
    TEXT_EXTENSIONS.has(extname(path).toLowerCase()),
  );
}

test("production source and text-like build output contain no embedded admin password", async () => {
  const files = [...trackedTextFiles(), ...distTextFiles()];
  const suppliedSecret = process.env.SECURITY_SCAN_ADMIN_SECRET || "";
  let assignmentLeakCount = 0;

  for (const path of files) {
    const text = readFileSync(path, "utf8");
    if (containsEmbeddedAdminPasswordAssignment(text, path)) assignmentLeakCount += 1;
  }

  const suppliedSecretLeakCount = suppliedSecret
    ? await securityScan.countFilesContainingBytes(
      [...trackedFiles(), ...walkFiles("dist")],
      Buffer.from(suppliedSecret),
    )
    : 0;

  assert.equal(
    assignmentLeakCount,
    0,
    `embedded ADMIN_PASSWORD assignments found: ${assignmentLeakCount}`,
  );
  assert.equal(
    suppliedSecretLeakCount,
    0,
    `supplied admin secret occurrences found: ${suppliedSecretLeakCount}`,
  );
});

test("deployment metadata contains bindings only and runtime variables stay empty", () => {
  const exampleLines = readFileSync(".env.example", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
  assert.deepEqual(exampleLines, [
    "ADMIN_PASSWORD=",
    "ADMIN_USERNAME=",
    "SESSION_SECRET=",
  ]);

  const hosting = JSON.parse(readFileSync(".openai/hosting.json", "utf8"));
  assert.deepEqual(Object.keys(hosting).sort(), ["d1", "project_id", "r2"]);
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "MEDIA");
});

test("deployment output does not publish source maps", () => {
  const sourceMapCount = walkFiles("dist").filter((path) =>
    path.endsWith(".map"),
  ).length;
  assert.equal(sourceMapCount, 0, `published source maps found: ${sourceMapCount}`);
});
