import { copyFile, cp, mkdir, readdir, rename } from "node:fs/promises";

const outputDirectory = new URL("../dist/", import.meta.url);
const clientDirectory = new URL("../dist/client/", import.meta.url);

await mkdir(clientDirectory, { recursive: true });

for (const entry of await readdir(outputDirectory, { withFileTypes: true })) {
  if (["client", "server", ".openai"].includes(entry.name)) continue;
  await rename(
    new URL(entry.name, outputDirectory),
    new URL(entry.name, clientDirectory),
  );
}

await cp(
  new URL("../src/assets/optimized/", import.meta.url),
  new URL("fallback/", clientDirectory),
  { recursive: true },
);

await import("./build-worker.mts");

const metadataDirectory = new URL("../dist/.openai/", import.meta.url);
await mkdir(metadataDirectory, { recursive: true });
await copyFile(
  new URL("../.openai/hosting.json", import.meta.url),
  new URL("hosting.json", metadataDirectory),
);

await cp(
  new URL("../drizzle/", import.meta.url),
  new URL("drizzle/", metadataDirectory),
  { recursive: true },
);
