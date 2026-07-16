/**
 * Runs the Electron development workflow with Vite, esbuild, and automatic restarts.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";
import { createServer, loadConfigFromFile } from "vite";

import { createWorkspaceResolvePlugin } from "./workspaceAliases.js";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const repoRoot = resolve(appRoot, "..", "..");

let electronProcess = null;
let restartTimer = null;
let isRestartingElectron = false;
let shutdownDevServer = null;

main().catch((error) => {
  console.error("[OpenCodexUI dev] startup failed");
  console.error(error);
  process.exitCode = 1;
});

/**
 * Starts the renderer dev server, watches the Electron bundles, and launches Electron.
 *
 * @returns Promise resolved once the dev workflow has been initialized.
 */
async function main() {
  await rebuildNativeDependenciesForElectron();

  const { server: viteServer, url: devServerUrl } = await startViteServer();
  const mainContext = await createBuildContext(
    "src/main/main.ts",
    "dist/main/main.cjs",
    devServerUrl
  );
  const preloadContext = await createBuildContext(
    "src/main/preload.ts",
    "dist/main/preload.cjs",
    devServerUrl
  );

  await mainContext.watch();
  await preloadContext.watch();

  shutdownDevServer = createShutdown(viteServer, [mainContext, preloadContext]);
  startElectron(devServerUrl);
  installShutdownHandlers();
}

/**
 * Rebuilds native dependencies against the Electron runtime when needed.
 *
 * @returns Promise resolved once the rebuild step has completed.
 */
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

/**
 * Spawns a command and waits for it to exit successfully.
 *
 * @param command Executable name to run.
 * @param args Arguments passed to the executable.
 * @returns Promise resolved when the command exits with code `0`.
 */
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

/**
 * Starts the Vite dev server used by the Electron renderer.
 *
 * @returns Promise resolved with the active Vite server and its effective URL.
 */
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
      strictPort: false,
      fs: {
        allow: [repoRoot]
      }
    }
  });

  await server.listen();
  const devServerUrl = server.resolvedUrls?.local[0];

  if (devServerUrl === undefined) {
    await server.close();
    throw new Error("Vite did not expose a local development URL.");
  }

  console.info(`[OpenCodexUI dev] renderer available at ${devServerUrl}`);
  return { server, url: devServerUrl };
}

/**
 * Creates and builds an esbuild watch context for an Electron entry point.
 *
 * @param entryPoint Source entry point relative to the Electron app root.
 * @param outfile Output bundle path relative to the Electron app root.
 * @param devServerUrl URL of the active Vite development server.
 * @returns Promise resolved with the configured esbuild context.
 */
async function createBuildContext(entryPoint, outfile, devServerUrl) {
  const context = await esbuild.context({
    absWorkingDir: appRoot,
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    external: ["electron", "better-sqlite3"],
    outfile,
    plugins: [createWorkspaceResolvePlugin(repoRoot), createRestartPlugin(devServerUrl)]
  });

  await context.rebuild();
  return context;
}

/**
 * Launches Electron and wires its exit lifecycle to the dev server shutdown flow.
 *
 * @param devServerUrl URL of the active Vite development server.
 * @returns Nothing.
 */
function startElectron(devServerUrl) {
  electronProcess = spawnElectron(devServerUrl);
  electronProcess.on("error", (error) => {
    console.error("[OpenCodexUI dev] failed to start electron");
    console.error(error);
    void shutdownDevServer?.().then(() => {
      process.exitCode = 1;
    });
  });
  electronProcess.on("exit", (code, signal) => {
    electronProcess = null;

    if (signal === "SIGTERM") {
      return;
    }

    if (code !== null) {
      console.info(`[OpenCodexUI dev] electron exited with code ${code}`);
    }

    if (signal !== null) {
      console.info(`[OpenCodexUI dev] electron exited with signal ${signal}`);
    }

    if (isRestartingElectron) {
      return;
    }

    void shutdownDevServer?.().then(() => {
      process.exit(code ?? 0);
    });
  });
}

/**
 * Spawns the Electron desktop process configured for local development.
 *
 * @param devServerUrl URL of the active Vite development server.
 * @returns Child process instance for the Electron runtime.
 */
function spawnElectron(devServerUrl) {
  return spawn(electronPath, ["dist/main/main.cjs"], {
    cwd: appRoot,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devServerUrl
    },
    stdio: "inherit"
  });
}

/**
 * Creates a shutdown routine that stops Electron, esbuild watchers, and the Vite server.
 *
 * @param viteServer Active Vite development server.
 * @param contexts esbuild contexts watching the Electron bundles.
 * @returns Async shutdown callback shared across exit handlers.
 */
function createShutdown(viteServer, contexts) {
  let isShuttingDown = false;

  return async () => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

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
}

/**
 * Registers process signal handlers that stop the development workflow cleanly.
 *
 * @returns Nothing.
 */
function installShutdownHandlers() {
  process.once("SIGINT", () => {
    void shutdownDevServer?.();
  });
  process.once("SIGTERM", () => {
    void shutdownDevServer?.();
  });
}

/**
 * Debounces Electron restarts while builds are still stabilizing.
 *
 * @param devServerUrl URL of the active Vite development server.
 * @returns Nothing.
 */
function requestElectronRestart(devServerUrl) {
  if (electronProcess === null) {
    return;
  }

  if (restartTimer !== null) {
    return;
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartElectron(devServerUrl);
  }, 150);
}

/**
 * Restarts the Electron process after a successful rebuild.
 *
 * @param devServerUrl URL of the active Vite development server.
 * @returns Nothing.
 */
function restartElectron(devServerUrl) {
  if (electronProcess === null) {
    return;
  }

  console.info("[OpenCodexUI dev] restarting electron");
  const currentProcess = electronProcess;
  electronProcess = null;
  isRestartingElectron = true;

  currentProcess.once("exit", () => {
    isRestartingElectron = false;
    startElectron(devServerUrl);
  });
  currentProcess.kill("SIGTERM");
}

/**
 * Creates an esbuild plugin that restarts Electron after successful rebuilds.
 *
 * @param devServerUrl URL of the active Vite development server.
 * @returns esbuild-compatible plugin descriptor.
 */
function createRestartPlugin(devServerUrl) {
  return {
    name: "restart-electron-on-rebuild",
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length === 0) {
          requestElectronRestart(devServerUrl);
        }
      });
    }
  };
}
