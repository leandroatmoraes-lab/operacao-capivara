import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Operação Capivara",
        short_name: "Capivara",
        description: "Central tática de rastreamento da equipe.",
        theme_color: "#0b0f0d",
        background_color: "#0b0f0d",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/capivara-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/capivara-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
});