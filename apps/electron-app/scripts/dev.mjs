import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";
import { createServer, loadConfigFromFile } from "vite";

import { createWorkspaceResolvePlugin } from "./workspaceAliases.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const repoRoot = resolve(appRoot, "..", "..");
const devServerUrl = "http://127.0.0.1:5173/";

let electronProcess = null;
let restartTimer = null;

main().catch((error) => {
  console.error("[OpenCodexUI dev] startup failed");
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await rebuildNativeDependenciesForElectron();

  const viteServer = await startViteServer();
  const mainContext = await createBuildContext("src/main/main.ts", "dist/main/main.cjs");
  const preloadContext = await createBuildContext("src/main/preload.ts", "dist/main/preload.cjs");

  await mainContext.watch();
  await preloadContext.watch();

  startElectron();
  installShutdownHandlers(viteServer, [mainContext, preloadContext]);
}

async function rebuildNativeDependenciesForElectron() {
  if (process.env.OPENCODEX_SKIP_ELECTRON_REBUILD === "1") {
    return;
  }

  console.info("[OpenCodexUI dev] rebuilding native SQLite dependency for Electron");
  await runCommand("npx", [
    "electron-rebuild",
    "-f",
    "-w",
    "better-sqlite3",
    "-v",
    "32.3.3",
    "-m",
    repoRoot
  ]);
}

async function runCommand(command, args) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: appRoot,
      env: process.env,
      stdio: "inherit"
    });

    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function startViteServer() {
  const configFile = resolve(appRoot, "vite.config.ts");
  const loadedConfig = await loadConfigFromFile(
    { command: "serve", mode: "development" },
    configFile
  );

  const server = await createServer({
    ...loadedConfig.config,
    configFile: false,
    server: {
      ...loadedConfig.config.server,
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      fs: {
        allow: [repoRoot]
      }
    }
  });

  await server.listen();
  console.info(`[OpenCodexUI dev] renderer available at ${devServerUrl}`);
  return server;
}

async function createBuildContext(entryPoint, outfile) {
  const context = await esbuild.context({
    absWorkingDir: appRoot,
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    external: ["electron", "better-sqlite3"],
    outfile,
    plugins: [createWorkspaceResolvePlugin(repoRoot), createRestartPlugin()]
  });

  await context.rebuild();
  return context;
}

function startElectron() {
  electronProcess = spawnElectron();
  electronProcess.on("exit", (code, signal) => {
    if (signal === "SIGTERM") {
      return;
    }

    if (code !== null) {
      console.info(`[OpenCodexUI dev] electron exited with code ${code}`);
    }

    if (signal !== null) {
      console.info(`[OpenCodexUI dev] electron exited with signal ${signal}`);
    }
  });
}

function spawnElectron() {
  return spawn("electron", ["dist/main/main.cjs"], {
    cwd: appRoot,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devServerUrl
    },
    stdio: "inherit"
  });
}

function installShutdownHandlers(viteServer, contexts) {
  const shutdown = async () => {
    if (restartTimer !== null) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }

    if (electronProcess !== null && !electronProcess.killed) {
      electronProcess.kill("SIGTERM");
      electronProcess = null;
    }

    await Promise.allSettled(contexts.map((context) => context.dispose()));
    await viteServer.close();
  };

  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });
}

function requestElectronRestart() {
  if (electronProcess === null) {
    return;
  }

  if (restartTimer !== null) {
    return;
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartElectron();
  }, 150);
}

function restartElectron() {
  if (electronProcess === null) {
    return;
  }

  console.info("[OpenCodexUI dev] restarting electron");
  const currentProcess = electronProcess;
  electronProcess = null;

  currentProcess.once("exit", () => {
    startElectron();
  });
  currentProcess.kill("SIGTERM");
}

function createRestartPlugin() {
  return {
    name: "restart-electron-on-rebuild",
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length === 0) {
          requestElectronRestart();
        }
      });
    }
  };
}
