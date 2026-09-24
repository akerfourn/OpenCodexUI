import path from "node:path";
import type { DebugConfiguration } from "@open-codex-ui/opencodex-protocol";

/** Adapter catalogue is explicit; future adapters can supply their own parameter resolver. */
export const DEBUG_ADAPTERS = [{ id: "javascript", name: "JavaScript / TypeScript", version: "1.140.0" }] as const;

/** Rejects invalid or ambiguous launch settings before starting any process. */
export function validateDebugConfiguration(config: DebugConfiguration): void {
  if (config.adapter !== "javascript" || !["node", "chrome"].includes(config.target) ||
    !["launch", "attach"].includes(config.request) || !config.id || !config.name.trim()) {
    throw new Error("Invalid debugger configuration.");
  }
  if (config.request === "attach" && (!Number.isInteger(config.port) || config.port! < 1 || config.port! > 65535)) {
    throw new Error("Specify a local Inspector / remote debugging port between 1 and 65535.");
  }
  if (config.target === "node" && config.request === "launch" && !config.program?.trim()) {
    throw new Error("Specify the Node.js program to launch.");
  }
  if (config.target === "chrome") {
    if (config.request === "attach" && !config.urlFilter?.trim()) {
      throw new Error("Specify a URL filter identifying the browser target.");
    }
    if (config.request === "launch") {
      const url = new URL(config.url ?? "");
      if (!["http:", "https:", "file:"].includes(url.protocol)) throw new Error("Unsupported browser URL.");
    }
  }
  if (config.args && (!Array.isArray(config.args) || !config.args.every(arg => typeof arg === "string"))) {
    throw new Error("Program arguments must be an array of strings.");
  }
}

/** Resolves only local paths after the service has validated the workspace source. */
export function javascriptLaunchArguments(config: DebugConfiguration, profilePath: string, mappedBreakpoints = false): Record<string, unknown> {
  validateDebugConfiguration(config);
  const cwd = path.resolve(config.context.workspacePath, config.cwd || ".");
  const common = {
    type: config.target === "node" ? "pwa-node" : "pwa-chrome",
    request: config.request, name: config.name, cwd,
    sourceMaps: true, pauseForSourceMap: true, timeout: 15_000,
    rootPath: config.context.workspacePath, __workspaceFolder: config.context.workspacePath,
    // This client exposes a single debuggee, including its required DAP target channel.
    autoAttachChildProcesses: false,
    // Standalone Node sessions need an entry pause while source maps are installed.
    runtimeSourcemapPausePatterns: mappedBreakpoints
      ? [path.join(config.context.workspacePath, "**/*.{js,cjs,mjs}").replaceAll("\\", "/")] : [],
    attachExistingChildren: false,
    resolveSourceMapLocations: ["**", "!**/node_modules/**"],
    outFiles: [path.join(config.context.workspacePath, "**/*.{js,cjs,mjs}").replaceAll("\\", "/"), "!**/node_modules/**"]
  };
  if (config.target === "node") {
    if (config.request === "attach") return { ...common, address: "127.0.0.1", port: config.port, restart: false };
    return { ...common, program: path.resolve(cwd, config.program!), args: config.args ?? [],
      runtimeExecutable: config.runtime || "node", console: "internalConsole", outputCapture: "std",
      env: { ELECTRON_RUN_AS_NODE: null }, stopOnEntry: false };
  }
  const browser = { ...common, webRoot: path.resolve(config.context.workspacePath, config.webRoot || ".") };
  if (config.request === "attach") {
    return { ...browser, address: "127.0.0.1", port: config.port, urlFilter: config.urlFilter,
      targetSelection: "automatic", restart: false };
  }
  return { ...browser, url: config.url, runtimeExecutable: config.runtime || undefined,
    userDataDir: profilePath, includeDefaultArgs: true, runtimeArgs: config.args ?? [] };
}
