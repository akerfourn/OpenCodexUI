import fs from "node:fs";
import path from "node:path";

import {
  createOpenCodexSqliteCacheRepository,
  type OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";

/**
 * Opens the optional cache in Electron's user data directory after legacy migration.
 * Returns null and logs the failure if migration or SQLite initialization fails.
 */
export function createCacheRepository(userDataPath: string): OpenCodexCacheRepository | null {
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
 * Moves the legacy database and its WAL/SHM files out of Chromium's cache directory.
 * Leaves the legacy files untouched when the target database already exists.
 */
export function migrateLegacyCacheDirectory(userDataPath: string, cacheDirectory: string): void {
  const databaseFileName = "opencodex-cache.sqlite";
  const legacyDirectory = path.join(userDataPath, "cache");
  const legacyDatabasePath = path.join(legacyDirectory, databaseFileName);
  const targetDatabasePath = path.join(cacheDirectory, databaseFileName);

  if (!fs.existsSync(legacyDatabasePath) || fs.existsSync(targetDatabasePath)) {
    return;
  }

  fs.mkdirSync(cacheDirectory, { recursive: true });
  moveLegacyCacheFile(legacyDatabasePath, targetDatabasePath);
  moveLegacyCacheFile(`${legacyDatabasePath}-wal`, `${targetDatabasePath}-wal`);
  moveLegacyCacheFile(`${legacyDatabasePath}-shm`, `${targetDatabasePath}-shm`);
}

/** Moves an existing legacy file without overwriting an existing target file. */
function moveLegacyCacheFile(sourcePath: string, targetPath: string): void {
  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) {
    return;
  }

  fs.renameSync(sourcePath, targetPath);
}
