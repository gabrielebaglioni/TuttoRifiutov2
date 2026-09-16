import type Lenis from 'lenis';
import type { ContentChanges } from '../scripts/content-hydration.ts';

declare global {
  interface DocumentEventMap {
    'tutto-rifiuto:content': CustomEvent<ContentChanges>;
  }
  interface Window {
    toggleMenu?: () => void;
    lenis?: Lenis;
  }
}

export {};
