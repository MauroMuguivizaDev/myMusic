import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { existsSync, readFileSync } from "node:fs";

const certificates = existsSync(".certs/local.pem") && existsSync(".certs/local-key.pem");
if (process.env.MY_MUSIC_HTTPS === "1" && !certificates) {
  throw new Error("Certificado em falta. Executa npm run setup:https.");
}
const https = process.env.MY_MUSIC_HTTP === "1" || !certificates ? undefined : {
  cert: readFileSync(".certs/local.pem"),
  key: readFileSync(".certs/local-key.pem"),
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "My Music",
        short_name: "My Music",
        description:
          "A tua música. O teu espaço. Uma biblioteca pessoal offline.",
        lang: "pt",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#000000",
        theme_color: "#000000",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    https,
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    https,
  },
});
