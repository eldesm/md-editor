import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

const base = process.env.VERCEL === "1" ? "/" : "/md-editor/";

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/MD.png", "icons/MD-192.png"],
      manifest: {
        name: "md-editor",
        short_name: "md-editor",
        description: "Browser-based markdown editor with live preview, snapshots, and PDF export",
        theme_color: "#01689b",
        background_color: "#ffffff",
        display: "standalone",
        start_url: ".",
        scope: base,
        icons: [
          {
            src: "icons/MD-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/MD.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/MD.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,woff2}"],
      },
    }),
  ],
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
