import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  output: "static",
  build: {
    format: "directory",
  },
  security: {
    csp: {
      algorithm: "SHA-512",
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
        variants: [
          {
            src: ["./src/assets/fonts/stylish.ttf"],
            weight: "400",
            style: "normal",
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
  experimental: {
    queuedRendering: {
      enabled: true,
    },
  },
});
