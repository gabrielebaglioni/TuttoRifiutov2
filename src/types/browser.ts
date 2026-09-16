import type Lenis from 'lenis';
import type { ContentChanges } from '../scripts/content-hydration.ts';
import type { ProjectStartDetail } from '../scripts/project.ts';

declare global {
  interface WindowEventMap {
    'tutto-rifiuto:project-start': CustomEvent<ProjectStartDetail>;
  }
  interface DocumentEventMap {
    'tutto-rifiuto:content': CustomEvent<ContentChanges>;
  }
  interface Window {
    toggleMenu?: () => void;
    lenis?: Lenis;
  }
}

export {};
