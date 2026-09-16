import type Lenis from 'lenis';

declare global {
  interface Window {
    toggleMenu?: () => void;
    lenis?: Lenis;
  }
}

export {};
