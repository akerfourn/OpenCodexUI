/**
 * Defines the Vite configuration used to build the Electron renderer bundle.
 */
import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { createWorkspaceAliases } from "./scripts/workspaceAliases.js";

const appRoot = resolve(__dirname);
const repoRoot = resolve(appRoot, "..", "..");

/**
 * Builds the Vite configuration for either dev-server or production renderer builds.
 *
 * @param configEnv Vite command context describing the current mode.
 * @returns Vite configuration object for the renderer application.
 */
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
