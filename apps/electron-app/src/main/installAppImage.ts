import { chmod, copyFile, mkdtemp, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** Stages the verified download beside the destination, then atomically replaces it. */
export async function installAppImage(installerPath: string, currentPath: string): Promise<string> {
  let destination = currentPath;
  const currentName = basename(currentPath);
  if (basename(installerPath) !== currentName && /\d+\.\d+\.\d+/.test(currentName)) {
    destination = join(dirname(currentPath), basename(installerPath));
  }

  // Copying first also supports a download cache located on another filesystem.
  // Keep the cached download available if installation or restart needs a retry.
  const stagingDirectory = await mkdtemp(join(dirname(currentPath), ".opencodex-update-"));
  try {
    const stagedFile = join(stagingDirectory, "update.AppImage");
    await copyFile(installerPath, stagedFile);
    await chmod(stagedFile, 0o755);
    await rename(stagedFile, destination);
    if (destination !== currentPath) await rm(currentPath, { force: true });
    return destination;
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}
