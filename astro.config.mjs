import { defineConfig, fontProviders } from "astro/config";
import svelte from '@astrojs/svelte';

export default defineConfig({
  integrations: [svelte()],
  site: "https://tutto-rifiuto.gabrielebaglioni55.chatgpt.site",
  output: "static",
  // Preserve v6 text spacing while upgrading the compiler independently.
  compressHTML: true,
  build: {
    format: "directory",
  },
  security: {
    csp: {
      algorithm: "SHA-512",
      // Runtime palettes/geometry need style attributes, not inline scripts.
      // Style elements retain Astro's hash-based policy.
      styleDirective: { resources: [{ resource: "'unsafe-inline'", kind: "attribute" }] },
      directives: [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "img-src 'self' data: blob:",
        "media-src 'self'",
        "font-src 'self'",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
      ],
    },
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: "De Fonte Plus",
      cssVariable: "--font-de-fonte-plus",
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/de-fonte-plus.ttf"],
            weight: "800",
            style: "normal",
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "DM Mono",
      cssVariable: "--font-dm-mono",
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/dm-mono.ttf"],
            weight: "500",
            style: "normal",
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Stylish",
      cssVariable: "--font-stylish",
      options: {
        variants: [{ src: ["./src/assets/fonts/stylish-latin.woff2"], weight: "400", style: "normal" }],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Stylish Extended",
      cssVariable: "--font-stylish-extended",
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/stylish.woff2"],
            weight: "400",
            style: "normal",
            unicodeRange: ["U+3131-3163", "U+3165-318E", "U+AC00-D7A3"],
          },
        ],
      },
    },
  ],
  image: {
    service: {
      entrypoint: "astro/assets/services/sharp",
      config: {
        jpeg: { mozjpeg: true, progressive: true },
        webp: { effort: 6, alphaQuality: 80 },
        avif: { effort: 4, chromaSubsampling: "4:2:0" },
        png: { compressionLevel: 9 },
      },
    },
  },
  markdown: {
    syntaxHighlight: false,
  },
});
