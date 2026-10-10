import { stat } from "node:fs/promises";
import type { FolderLinkOptions } from "@open-codex-ui/opencodex-core";
import { shell } from "electron";
import spawn from "cross-spawn";
import which from "which";
import path from "node:path";

import {
  resolveOpenTarget,
  splitCommandLine,
  substituteOpenCommandPlaceholder,
  type OpenCommandContext
} from "./externalOpenTarget.js";

/**
 * Opens an external URL or a local file path from the renderer.
 *
 * @param href Link value requested by the user interface.
 * @param projectPath Current project path used to resolve relative file links.
 * @param openerCommand Source-specific command used for local path targets.
 * @returns Promise resolved once Electron has handled the request.
 */
export async function openExternalLink(
  href: string,
  projectPath: string | null,
  openerCommand: string | null,
  folders?: FolderLinkOptions
): Promise<void> {
  const target = href.trim();

  if (target.length === 0) {
    return;
  }

  const resolved = resolveOpenTarget(target, projectPath);

  if (resolved.type === "url") {
    await shell.openExternal(resolved.value);
    return;
  }

  if (folders !== undefined && await isDirectory(resolved.value)) {
    if (folders.mode === "system") {
      const error = await shell.openPath(resolved.value);
      if (error.length > 0) throw new Error(error);
    } else if (folders.command !== null) {
      await openDetachedCommand(folders.command, {
        projectPath: resolved.value, filePath: resolved.value, relativePath: ".", line: null, column: null
      });
    }
    return;
  }

  if (openerCommand === null) {
    return;
  }

  await openDetachedCommand(openerCommand, {
    projectPath,
    filePath: resolved.value,
    relativePath: projectPath === null ? resolved.value : path.relative(projectPath, resolved.value),
    line: resolved.line,
    column: resolved.column
  });
}

/**
 * Resolves the executable and reports startup failures before detaching the opener.
 *
 * @param commandLine Source-specific command line.
 * @param context Placeholder values available to the command.
 * @returns Resolves when the process starts; rejects if the launcher is unavailable.
 */
export async function openDetachedCommand(commandLine: string, context: OpenCommandContext): Promise<void> {
  const parts = splitCommandLine(commandLine).map((part) => substituteOpenCommandPlaceholder(part, context));

  if (parts.length === 0) {
    return;
  }

  const [command, ...args] = parts;

  if (command === undefined || command.length === 0) {
    return;
  }

  try {
    // Resolve first: on Windows an absent command can otherwise start cmd.exe successfully.
    const executable = await which(command);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  } catch (error) {
    throw new Error(`Unable to start file opener "${command}": ${String(error)}`, { cause: error });
  }
}

/** Inspects only host-accessible paths; nonexistent files retain their usual editor behavior. */
async function isDirectory(filePath: string): Promise<boolean> {
  try { return (await stat(filePath)).isDirectory(); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}
