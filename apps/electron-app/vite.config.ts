import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { createWorkspaceAliases } from "./scripts/workspaceAliases.js";

const appRoot = resolve(__dirname);
const repoRoot = resolve(appRoot, "..", "..");

export default defineConfig(({ command }) => {
  const isDevServer = command === "serve";

  return {
    base: isDevServer ? "/" : "./",
    root: resolve(appRoot, "src", "renderer"),
    plugins: [react()],
    resolve: {
      alias: createWorkspaceAliases(repoRoot)
    },
    server: {
      fs: {
        allow: [repoRoot]
      }
    },
    build: {
      outDir: resolve(appRoot, "dist", "renderer"),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(appRoot, "src", "renderer", "index.html"),
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name][extname]"
        }
      }
    }
  };
});
