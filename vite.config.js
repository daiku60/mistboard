import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "public",
    emptyOutDir: true,
    chunkSizeWarningLimit: 550,
    rolldownOptions: {
      output: {
        manualChunks: (id) =>
          id.includes("/node_modules/pixi.js/") ||
          id.includes("/node_modules/@pixi/")
            ? "pixi"
            : undefined,
      },
    },
  },
});
