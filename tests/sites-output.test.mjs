import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

test("Sites build embeds HTML in the Worker so runtime content cannot be bypassed by static assets", () => {
  assert.equal(existsSync("dist/client/index.html"), false);
  assert.equal(existsSync("dist/client/events/index.html"), false);
  assert.equal(existsSync("dist/client/contact/index.html"), false);
  assert.equal(existsSync("dist/server/index.js"), true);
  const worker = readFileSync("dist/server/index.js", "utf8");
  assert.match(worker, /env\.ASSETS\.fetch/);
  assert.match(worker, /id="admin-login"/);
  assert.match(worker, /data-public-events/);
  assert.equal(existsSync("dist/.openai/hosting.json"), true);
});

test("explicit index.html aliases cannot bypass runtime SEO or collection publication gates", async () => {
  const worker = (await import(`../dist/server/index.js?gate=${Date.now()}`)).default;
  const env = {
    DB: { prepare() { throw new Error("D1 unavailable"); } },
    ASSETS: { async fetch() { return new Response("missing", { status: 404 }); } },
  };
  const context = { waitUntil() {} };

  assert.equal((await worker.fetch(new Request("https://site.test/eventi/musica"), env, context)).status, 503);
  assert.equal((await worker.fetch(new Request("https://site.test/eventi/musica/index.html"), env, context)).status, 404);
  assert.equal((await worker.fetch(new Request("https://site.test/work/index.html"), env, context)).status, 404);
  assert.equal((await worker.fetch(new Request("https://site.test/eventi/template/index.html"), env, context)).status, 404);
});

test("Sites build publishes browser-usable collection fallback media", () => {
  assert.equal(existsSync("dist/client/fallback/eventi/bruciaRifiuti.webp"), true);
  assert.equal(existsSync("dist/client/fallback/work/work_01.webp"), true);
  assert.equal(existsSync("dist/client/fallback/project/project_1.webp"), true);
});

test("every emitted browser module resolves its relative imports from the deployment artifact", () => {
  const directory = "dist/client/_astro";
  const scripts = readdirSync(directory).filter((name) => name.endsWith(".js"));
  assert.ok(scripts.length > 0);
  for (const name of scripts) {
    const path = join(directory, name);
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)(["'])(\.{1,2}\/[^"']+)\1/g)) {
      const dependency = resolve(dirname(path), match[2]);
      assert.equal(existsSync(dependency), true, `${path} imports missing ${match[2]}`);
    }
  }
  assert.doesNotMatch(readFileSync("dist/server/index.js", "utf8"), /<script[^>]+src="data:text\/javascript/i);
});

test("the shared layout publishes a complete social preview", () => {
  const layout = readFileSync("src/layouts/BaseLayout.astro", "utf8");
  assert.match(layout, /property="og:image"/);
  assert.match(layout, /name="twitter:card" content="summary_large_image"/);
});

test("social URLs use the deployed Sites origin", () => {
  const config = readFileSync("astro.config.mjs", "utf8");
  assert.match(config, /https:\/\/tutto-rifiuto\.clear-shrew-1686\.chatgpt\.site/);
});
