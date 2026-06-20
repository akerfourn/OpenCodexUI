/**
 * Hosts the Electron-side bridge between renderer IPC requests and the backend.
 */
import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createOpenCodexSqliteCacheRepository } from "@open-codex-ui/opencodex-cache";
import { OpenCodexBackendRuntime, OpenCodexRequestRouter } from "@open-codex-ui/opencodex-core";
import type {
  OpenCodexEvent,
  OpenCodexImageAttachment,
  OpenCodexRequest,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import { DiscordPresenceService } from "./discordPresenceService.js";

type ElectronBridgeServerOptions = {
  settings: OpenCodexSettings;
  projectPath: string | null;
  appVersion: string;
  userDataPath: string;
  saveSettings(settings: OpenCodexSettings): Promise<void>;
};

/**
 * Wires Electron IPC to the backend and forwards backend events to the renderer window.
 */
export class ElectronBridgeServer {
  private readonly runtime: OpenCodexBackendRuntime;
  private readonly requestRouter: OpenCodexRequestRouter;
  private readonly discordPresenceService: DiscordPresenceService;
  private readonly logger: (message: string) => void;
  private window: BrowserWindow | null = null;
  private isDisposed = false;

  /**
   * Creates the bridge server with the current settings and cache repository.
   *
   * @param options Settings, project context, and persistence callbacks used by the backend.
   */
  constructor(options: ElectronBridgeServerOptions) {
    const cacheRepository = createCacheRepository(options.userDataPath);
    const logger = (message: string) => console.log(`[OpenCodexUI] ${message}`);
    this.logger = logger;

    this.runtime = new OpenCodexBackendRuntime({
      settings: options.settings,
      projectPath: options.projectPath,
      appVersion: options.appVersion,
      cacheRepository,
      userDataPath: options.userDataPath,
      defaultCommitPromptPath: resolveDefaultCommitPromptPath(),
      generationCommitPromptPath: resolveGenerationCommitPromptPath(),
      saveSettings: options.saveSettings,
      openExternalLink: async (href, projectPath, openerCommand) => {
        await openExternalLink(href, projectPath, openerCommand);
      },
      pickProjectDirectory: async (mode) => {
        return this.pickProjectDirectory(mode);
      },
      pickImageFiles: async () => {
        return this.pickImageFiles();
      },
      pickExecutableFile: async () => {
        return this.pickExecutableFile();
      },
      ensureProjectDirectory: async (projectPath, createIfMissing) => {
        return ensureProjectDirectory(projectPath, createIfMissing);
      },
      logger,
      emit: (event) => this.emit(event)
    });
    this.requestRouter = new OpenCodexRequestRouter(this.runtime);
    this.discordPresenceService = new DiscordPresenceService(
      options.settings.discordRichPresenceEnabled,
      logger
    );
  }

  /**
   * Registers the browser window that should receive backend events.
   *
   * @param window Renderer window connected to the OpenCodexUI session.
   */
  attachWindow(window: BrowserWindow): void {
    this.window = window;
  }

  /**
   * Registers the IPC handler used by the renderer to send backend requests.
   *
   * @returns Nothing.
   */
  register(): void {
    ipcMain.handle("opencodex:request", async (_event, request: OpenCodexRequest) => {
      if (request.type === "app.openDevTools") {
        return this.openDeveloperTools();
      }

      if (request.type === "discord.reconnect") {
        await this.discordPresenceService.reconnect();
        return { ok: true };
      }

      const response = await this.requestRouter.handleRequest(request);

      if (request.type === "settings.update" && response !== undefined) {
        const settings = response as OpenCodexSettings;
        this.discordPresenceService.setEnabled(settings.discordRichPresenceEnabled);
        this.closeDeveloperToolsWhenDisabled(settings);
      }

      return response;
    });
  }

  /**
   * Releases the IPC handler and disposes the backend resources.
   *
   * @returns Promise resolved once cleanup is complete.
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    ipcMain.removeHandler("opencodex:request");
    this.window = null;
    const results = await Promise.allSettled([
      this.discordPresenceService.dispose(),
      this.runtime.dispose()
    ]);

    results.forEach((result) => {
      if (result.status === "rejected") {
        this.logger(`cleanup task failed during shutdown: ${String(result.reason)}`);
      }
    });
  }

  /**
   * Forwards a backend event to the attached renderer window when available.
   *
   * @param event Backend event to send to the renderer process.
   * @returns Nothing.
   */
  private emit(event: OpenCodexEvent): void {
    if (this.isDisposed) {
      return;
    }

    this.discordPresenceService.handleEvent(event);
    const window = this.window;

    if (window === null || window.isDestroyed() || window.webContents.isDestroyed()) {
      return;
    }

    window.webContents.send("opencodex:event", event);
  }

  /**
   * Opens renderer DevTools when developer mode is explicitly enabled.
   *
   * @returns Confirmation payload.
   */
  private openDeveloperTools(): { ok: true } {
    if (!this.runtime.getSettings().developerMode) {
      throw new Error("Developer mode is disabled.");
    }

    this.window?.webContents.openDevTools({ mode: "detach" });
    return { ok: true };
  }

  /**
   * Closes renderer DevTools when developer mode has been disabled.
   *
   * @param settings Effective settings after an update.
   * @returns Nothing.
   */
  private closeDeveloperToolsWhenDisabled(settings: OpenCodexSettings): void {
    if (settings.developerMode) {
      return;
    }

    this.window?.webContents.closeDevTools();
  }

  /**
   * Opens a native directory picker for project selection.
   *
   * @param mode Picker mode requested by the renderer.
   * @returns Selected directory path, or `null` when cancelled.
   */
  private async pickProjectDirectory(mode: "open" | "create"): Promise<string | null> {
    const properties: Array<"openDirectory" | "createDirectory"> = ["openDirectory"];

    if (mode === "create") {
      properties.push("createDirectory");
    }

    const options = {
      properties,
      title: mode === "create" ? "Create or select project folder" : "Open project folder"
    };
    const result = this.window === null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(this.window, options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0] ?? null;
  }

  /**
   * Opens a native image picker.
   *
   * @returns Selected image file paths.
   */
  private async pickImageFiles(): Promise<OpenCodexImageAttachment[]> {
    const options = {
      properties: ["openFile", "multiSelections"] as Array<"openFile" | "multiSelections">,
      title: "Attach images",
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"]
        }
      ]
    };
    const result = this.window === null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(this.window, options);

    if (result.canceled) {
      return [];
    }

    return Promise.all(result.filePaths.map(createImageAttachmentFromPath));
  }

  /**
   * Opens a native executable picker.
   *
   * @returns Selected executable path.
   */
  private async pickExecutableFile(): Promise<string | null> {
    const options = {
      properties: ["openFile"] as Array<"openFile">,
      title: "Select Codex executable"
    };
    const result = this.window === null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(this.window, options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0] ?? null;
  }
}

function resolveDefaultCommitPromptPath(): string {
  return resolvePackagedMarkdownPath("prompt-commit.default.md");
}

function resolveGenerationCommitPromptPath(): string {
  return resolvePackagedMarkdownPath("prompt-commit.generation.md");
}

function resolvePackagedMarkdownPath(fileName: string): string {
  const packagedResourcesPath = process.resourcesPath === undefined
    ? null
    : path.join(process.resourcesPath, fileName);

  const candidates = [
    packagedResourcesPath,
    path.resolve(process.cwd(), "..", "..", fileName),
    path.resolve(process.cwd(), fileName)
  ].filter((candidate): candidate is string => candidate !== null);

  return candidates.find((candidate) => fsSync.existsSync(candidate))
    ?? path.resolve(process.cwd(), "..", "..", fileName);
}

async function createImageAttachmentFromPath(
  filePath: string,
  index: number
): Promise<OpenCodexImageAttachment> {
  return {
    id: `attachment-${Date.now()}-${index}`,
    kind: "image",
    source: "localPath",
    value: filePath,
    name: path.basename(filePath),
    previewUrl: await readImagePreviewDataUrl(filePath)
  };
}

async function readImagePreviewDataUrl(filePath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath);
    const mimeType = readImageMimeType(filePath);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function readImageMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".gif") {
    return "image/gif";
  }

  return "image/png";
}

/**
 * Creates the optional SQLite cache repository used by the Electron bridge.
 *
 * @param userDataPath Electron user data directory.
 * @returns Cache repository instance, or `null` when SQLite initialization fails.
 */
function createCacheRepository(userDataPath: string) {
  try {
    const cacheDirectory = path.join(userDataPath, "opencodex-cache");
    migrateLegacyCacheDirectory(userDataPath, cacheDirectory);

    return createOpenCodexSqliteCacheRepository({
      directory: cacheDirectory
    });
  } catch (error) {
    console.log(`[OpenCodexUI] SQLite cache unavailable: ${String(error)}`);
    return null;
  }
}

/**
 * Moves the SQLite cache out of the legacy Chromium cache directory when needed.
 *
 * @param userDataPath Electron user data directory.
 * @param cacheDirectory New application cache directory.
 * @returns Nothing.
 */
function migrateLegacyCacheDirectory(userDataPath: string, cacheDirectory: string): void {
  const databaseFileName = "opencodex-cache.sqlite";
  const legacyDirectory = path.join(userDataPath, "cache");
  const legacyDatabasePath = path.join(legacyDirectory, databaseFileName);
  const targetDatabasePath = path.join(cacheDirectory, databaseFileName);

  if (!fsSync.existsSync(legacyDatabasePath) || fsSync.existsSync(targetDatabasePath)) {
    return;
  }

  fsSync.mkdirSync(cacheDirectory, { recursive: true });
  moveLegacyCacheFile(legacyDatabasePath, targetDatabasePath);
  moveLegacyCacheFile(`${legacyDatabasePath}-wal`, `${targetDatabasePath}-wal`);
  moveLegacyCacheFile(`${legacyDatabasePath}-shm`, `${targetDatabasePath}-shm`);
}

/**
 * Moves one legacy cache file when it exists.
 *
 * @param sourcePath Source file path.
 * @param targetPath Target file path.
 * @returns Nothing.
 */
function moveLegacyCacheFile(sourcePath: string, targetPath: string): void {
  if (!fsSync.existsSync(sourcePath) || fsSync.existsSync(targetPath)) {
    return;
  }

  fsSync.renameSync(sourcePath, targetPath);
}

/**
 * Ensures a project path exists and points to a directory.
 *
 * @param projectPath User-provided project path.
 * @param createIfMissing Whether missing folders should be created.
 * @returns Absolute project directory path.
 */
async function ensureProjectDirectory(projectPath: string, createIfMissing: boolean): Promise<string> {
  const trimmedPath = projectPath.trim();

  if (trimmedPath.length === 0) {
    throw new Error("Project path is required.");
  }

  const resolvedPath = path.resolve(trimmedPath);

  try {
    const stats = await fs.stat(resolvedPath);

    if (!stats.isDirectory()) {
      throw new Error(`Project path is not a directory: ${resolvedPath}`);
    }

    return resolvedPath;
  } catch (error) {
    if (isMissingPathError(error) && createIfMissing) {
      await fs.mkdir(resolvedPath, { recursive: true });
      return resolvedPath;
    }

    throw error;
  }
}

/**
 * Checks whether a filesystem error reports a missing path.
 *
 * @param error Error value to inspect.
 * @returns `true` when the path is missing.
 */
function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Opens an external URL or a local file path from the renderer.
 *
 * @param href Link value requested by the user interface.
 * @param projectPath Current project path used to resolve relative file links.
 * @param openerCommand Source-specific command used for local path targets.
 * @returns Promise resolved once Electron has handled the request.
 */
async function openExternalLink(
  href: string,
  projectPath: string | null,
  openerCommand: string | null
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

  if (openerCommand === null) {
    return;
  }

  openDetachedCommand(openerCommand, {
    projectPath,
    filePath: resolved.value,
    relativePath: projectPath === null ? resolved.value : path.relative(projectPath, resolved.value),
    line: resolved.line,
    column: resolved.column
  });
}

/**
 * Resolves a link into either a URL target or a filesystem path target.
 *
 * @param href Link value emitted by the UI.
 * @param projectPath Current project path used as the base for relative paths.
 * @returns Normalized target description that can be opened by Electron.
 */
function resolveOpenTarget(
  href: string,
  projectPath: string | null
): { type: "url"; value: string } | {
  type: "path";
  value: string;
  line: string | null;
  column: string | null;
} {
  try {
    const url = new URL(href);

    if (url.protocol === "file:") {
      const location = readLocation(fileURLToPath(url));
      return {
        type: "path",
        value: location.path,
        line: location.line,
        column: location.column
      };
    }

    return { type: "url", value: href };
  } catch {
    const location = readLocation(href);
    const cleanedPath = location.path;

    if (path.isAbsolute(cleanedPath)) {
      return { type: "path", value: cleanedPath, line: location.line, column: location.column };
    }

    if (projectPath !== null) {
      return {
        type: "path",
        value: path.resolve(projectPath, cleanedPath),
        line: location.line,
        column: location.column
      };
    }

    return {
      type: "path",
      value: path.resolve(process.cwd(), cleanedPath),
      line: location.line,
      column: location.column
    };
  }
}

type OpenCommandContext = {
  projectPath: string | null;
  filePath: string;
  relativePath: string;
  line: string | null;
  column: string | null;
};

/**
 * Starts an opener command independently from the OpenCodexUI process.
 *
 * @param commandLine Source-specific command line.
 * @param context Placeholder values available to the command.
 */
function openDetachedCommand(commandLine: string, context: OpenCommandContext): void {
  const parts = splitCommandLine(commandLine).map((part) => substituteOpenCommandPlaceholder(part, context));

  if (parts.length === 0) {
    return;
  }

  const [command, ...args] = parts;

  if (command === undefined || command.length === 0) {
    return;
  }

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });

  child.unref();
}

/**
 * Replaces source opener placeholders inside one command argument.
 *
 * @param value Command argument.
 * @param context Placeholder values.
 * @returns Argument with placeholders replaced.
 */
function substituteOpenCommandPlaceholder(value: string, context: OpenCommandContext): string {
  return value
    .replaceAll("%D", context.projectPath ?? "")
    .replaceAll("%F", context.filePath)
    .replaceAll("%R", context.relativePath)
    .replaceAll("%L", context.line ?? "")
    .replaceAll("%C", context.column ?? "");
}

/**
 * Splits a simple command line into executable and arguments.
 *
 * @param value Command line to split.
 * @returns Command-line parts with quoted segments preserved.
 */
function splitCommandLine(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "\"" | "'" | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if ((character === "\"" || character === "'") && quote === null) {
      quote = character;
      continue;
    }

    if (character === quote) {
      quote = null;
      continue;
    }

    if (character === " " && quote === null) {
      if (current.length > 0) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

/**
 * Removes editor location suffixes from a path-like value.
 *
 * @param value File path or URL-derived path that may include line or column hints.
 * @returns Clean filesystem path without location metadata.
 */
function readLocation(value: string): { path: string; line: string | null; column: string | null } {
  const lineHashMatch = /#L(\d+)(?:-L\d+)?$/i.exec(value);

  if (lineHashMatch !== null) {
    return {
      path: value.slice(0, lineHashMatch.index),
      line: lineHashMatch[1] ?? null,
      column: null
    };
  }

  const suffixMatch = /:(\d+)(?::(\d+))?$/.exec(value);

  if (suffixMatch !== null) {
    return {
      path: value.slice(0, suffixMatch.index),
      line: suffixMatch[1] ?? null,
      column: suffixMatch[2] ?? null
    };
  }

  return { path: value, line: null, column: null };
}
