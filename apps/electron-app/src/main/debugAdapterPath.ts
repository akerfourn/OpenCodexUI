import { existsSync } from "node:fs";
import path from "node:path";

/** Supports both packaged resources and the development script's direct main.cjs entrypoint. */
export function resolveDebugAdapterPath(
  packaged: boolean, resourcesPath: string, appPath: string, workingDirectory: string,
  exists: (candidate: string) => boolean = existsSync
): string {
  if (packaged) return path.join(resourcesPath, "debug-adapter/js-debug/src/dapDebugServer.js");
  const relative = "build/debug-adapter/1.140.0/js-debug/src/dapDebugServer.js";
  const candidates = [path.resolve(appPath, relative), path.resolve(workingDirectory, relative),
    path.resolve(appPath, "../..", relative)];
  return candidates.find(exists) ?? candidates[0]!;
}
