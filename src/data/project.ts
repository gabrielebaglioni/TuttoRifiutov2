import type { ImageMetadata } from "astro";
import { plainImage } from "./static-media.ts";
import hero from "../assets/optimized/project/project_1.webp";
import project01 from "../assets/optimized/project/project_1.webp";
import project04 from "../assets/optimized/project/project_4.webp";
import project05 from "../assets/optimized/project/project_5.webp";
import { SITE_CONTENT } from "./site-content.ts";

export interface ProjectRecord {
  seo: { title: string; description: string };
  hero: ImageMetadata;
  title: string;
  summary: string;
  code: string;
  meta: string[];
  intro: string;
  info: string[][][];
  images: ImageMetadata[];
  outro: string;
  outroInfo: string[][][];
}

export const project: ProjectRecord = {
  seo: { title: SITE_CONTENT["seo.project.title"], description: SITE_CONTENT["seo.project.description"] },
  hero,
  title: SITE_CONTENT["project.title"], summary: SITE_CONTENT["project.summary"], code: SITE_CONTENT["project.code"], meta: SITE_CONTENT["project.meta"], intro: SITE_CONTENT["project.intro"], info: SITE_CONTENT["project.info"],
  images: [project01, project04, project05],
  outro: SITE_CONTENT["project.outro"], outroInfo: SITE_CONTENT["project.outroInfo"],
};

export const projectCollectionDefault: ProjectRecord = structuredClone({
  ...project, hero: plainImage(project.hero), images: project.images.map((image) => plainImage(image)),
});
