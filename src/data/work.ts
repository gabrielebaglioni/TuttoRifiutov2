import type { ImageMetadata } from "astro";
import work01 from "../assets/optimized/work/work_01.webp";
import work02 from "../assets/optimized/work/work_02.webp";
import work03 from "../assets/optimized/work/work_03.webp";
import work04 from "../assets/optimized/work/work_04.webp";
import work05 from "../assets/optimized/work/work_05.webp";
import { project } from "./project.ts";

export interface WorkItem {
  slug: string;
  title: string;
  code: string;
  href: string;
  image: ImageMetadata;
}

export interface ArchiveCollectionDefault {
  slug: string;
  title: string;
  code: string;
  href: string;
  description: string;
  details: string[][];
  outro: string;
  seo: { title: string; description: string };
  position: number;
  coverMedia: { type: "image"; src: ImageMetadata; alt: string };
  detailMedia: Array<{ type: "image"; src: ImageMetadata; alt: string }>;
}

export const workItems: WorkItem[] = [
  { slug: "parole", title: "Parole", code: "TR—01", href: "/project", image: work01 },
  { slug: "suoni", title: "Suoni", code: "TR—02", href: "/project", image: work02 },
  { slug: "immagini", title: "Immagini", code: "TR—03", href: "/project", image: work03 },
  { slug: "pellicole", title: "Pellicole", code: "TR—04", href: "/project", image: work04 },
  { slug: "fantasie", title: "Fantasie", code: "TR—05", href: "/project", image: work05 },
];

export const archiveCollectionDefaults: ArchiveCollectionDefault[] = workItems.map((item, position) => {
  const isParole = item.code === "TR—01";
  return JSON.parse(JSON.stringify({
    slug: item.title.toLowerCase(),
    title: item.title,
    code: item.code,
    href: item.href,
    description: isParole ? project.intro : "",
    details: isParole ? project.info.flat() : [],
    outro: isParole ? project.outro : "",
    seo: isParole ? project.seo : { title: `${item.title} — Tutto Rifiuto`, description: "" },
    position,
    coverMedia: { type: "image", src: item.image, alt: item.title },
    detailMedia: isParole ? project.images.map((src) => ({ type: "image", src, alt: project.title })) : [],
  }));
});
