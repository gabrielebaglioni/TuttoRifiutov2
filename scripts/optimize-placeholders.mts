import { mkdir } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import sharp from "sharp";

sharp.cache({ memory: 64, files: 0, items: 0 });
sharp.concurrency(1);

const inputs = [
  "src/assets/eventi/attachinoMorto.png",
  "src/assets/eventi/bruciaRifiuti.png",
  "src/assets/eventi/giornataTR.jpg",
  "src/assets/eventi/letture.png",
  "src/assets/eventi/nucleare.png",
  "src/assets/eventi/pianetaSonoro.png",
  "src/assets/eventi/saltaRifiuti.png",
  "src/assets/eventi/storiaDiUnFallimento.png",
  "src/assets/work/work_01.jpg",
  "src/assets/work/work_02.jpg",
  "src/assets/work/work_03.jpg",
  "src/assets/work/work_04.jpg",
  "src/assets/work/work_05.jpg",
  "src/assets/work/qia.png",
  "src/assets/project/project_1.jpg",
  "src/assets/project/project_2.jpg",
  "src/assets/project/project_3.jpg",
  "src/assets/project/project_4.jpg",
  "src/assets/project/project_5.jpg",
  "src/assets/lab/hero-visual.png",
  "src/assets/lab/hero-visual2.png",
  "src/assets/lab/hero-visual3.png",
  "src/assets/lab/hero-visual4.png",
  "src/assets/lab/image.png",
];

for (const input of inputs) {
  const group = basename(dirname(input));
  const name = basename(input, extname(input));
  const output = join("src/assets/optimized", group, `${name}.webp`);
  await mkdir(dirname(output), { recursive: true });
  await sharp(input).rotate().resize({
    width: 2400,
    height: 2400,
    fit: "inside",
    withoutEnlargement: true,
  }).webp({ quality: 88, effort: 6, smartSubsample: true }).toFile(output);
}

await sharp("public/og.png")
  .webp({ quality: 86, effort: 6, smartSubsample: true })
  .toFile("public/og.webp");

await mkdir("public/lab", { recursive: true });
await sharp("src/assets/optimized/lab/hero-visual3.webp")
  .toFile("public/lab/hero-visual3.webp");
