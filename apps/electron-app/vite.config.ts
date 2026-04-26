import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  root: resolve(__dirname, "src", "renderer"),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "dist", "renderer"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "src", "renderer", "index.html"),
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
