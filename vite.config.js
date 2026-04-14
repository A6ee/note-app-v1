import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
      manifest: {
        name: "MemorAIze✨",
        short_name: "MemorAIze",
        description: "您的 AI 課堂筆記助手",
        theme_color: "#ffffff",
        icons: [
          {
            src: "Logo-MemorAIze_192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "Logo-MemorAIze_512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
});
