import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

import { createWorkspaceAliases } from "./scripts/workspaceAliases.js";

const repoRoot = resolve(__dirname, "..", "..");

export default defineConfig({
  resolve: {
    alias: createWorkspaceAliases(repoRoot)
  },
  test: {
    environment: "node"
  }
});
