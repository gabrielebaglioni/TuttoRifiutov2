import { build } from "esbuild";
import { readdir, readFile, unlink } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const clientRoot = resolve("dist/client");

async function htmlFiles(directory = clientRoot): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(path);
  }
  return files;
}

function pagePaths(path: string) {
  const name = relative(clientRoot, path).split(sep).join("/");
  if (name === "index.html") return ["/", "/index"];
  if (name.endsWith("/index.html")) {
    const route = `/${name.slice(0, -"/index.html".length)}`;
    return [route, `${route}/`];
  }
  return [`/${name}`];
}

const files = await htmlFiles();
const pages: Record<string, string> = {};
for (const path of files) {
  const html = await readFile(path, "utf8");
  for (const route of pagePaths(path)) pages[route] = html;
}

await build({
  entryPoints: ["worker/index.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: false,
  define: {
    __STATIC_HTML_PAGES__: JSON.stringify(pages),
  },
});

await Promise.all(files.map((path) => unlink(path)));
