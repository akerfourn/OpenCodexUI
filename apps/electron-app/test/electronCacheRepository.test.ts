import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createOpenCodexSqliteCacheRepository,
  type OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCacheRepository,
  migrateLegacyCacheDirectory
} from "../src/main/electronCacheRepository.js";

describe("Electron cache initialization", () => {
  let userDataPath: string;
  let legacyDirectory: string;
  let cacheDirectory: string;
  let legacyDatabasePath: string;
  let targetDatabasePath: string;
  let repository: OpenCodexCacheRepository | null;

  beforeEach(() => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "opencodexui-cache-"));
    legacyDirectory = path.join(userDataPath, "cache");
    cacheDirectory = path.join(userDataPath, "opencodex-cache");
    legacyDatabasePath = path.join(legacyDirectory, "opencodex-cache.sqlite");
    targetDatabasePath = path.join(cacheDirectory, "opencodex-cache.sqlite");
    repository = null;
  });

  afterEach(async () => {
    await repository?.close();
    vi.restoreAllMocks();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it("should move the database and WAL/SHM contents while preserving unrelated Chromium files", () => {
    fs.mkdirSync(legacyDirectory);
    fs.writeFileSync(legacyDatabasePath, "database contents");
    fs.writeFileSync(`${legacyDatabasePath}-wal`, "pending writes");
    fs.writeFileSync(`${legacyDatabasePath}-shm`, "shared memory");
    const chromiumCachePath = path.join(legacyDirectory, "chromium-entry");
    fs.writeFileSync(chromiumCachePath, "Chromium contents");

    migrateLegacyCacheDirectory(userDataPath, cacheDirectory);

    expect(fs.readFileSync(targetDatabasePath, "utf8")).toBe("database contents");
    expect(fs.readFileSync(`${targetDatabasePath}-wal`, "utf8")).toBe("pending writes");
    expect(fs.readFileSync(`${targetDatabasePath}-shm`, "utf8")).toBe("shared memory");
    expect(fs.existsSync(legacyDatabasePath)).toBe(false);
    expect(fs.existsSync(`${legacyDatabasePath}-wal`)).toBe(false);
    expect(fs.existsSync(`${legacyDatabasePath}-shm`)).toBe(false);
    expect(fs.readFileSync(chromiumCachePath, "utf8")).toBe("Chromium contents");
  });

  it("should leave both databases and their sidecars untouched when the target database exists", () => {
    fs.mkdirSync(legacyDirectory);
    fs.mkdirSync(cacheDirectory);
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.writeFileSync(`${legacyDatabasePath}${suffix}`, `legacy${suffix}`);
      fs.writeFileSync(`${targetDatabasePath}${suffix}`, `target${suffix}`);
    }

    migrateLegacyCacheDirectory(userDataPath, cacheDirectory);

    for (const suffix of ["", "-wal", "-shm"]) {
      expect(fs.readFileSync(`${legacyDatabasePath}${suffix}`, "utf8")).toBe(`legacy${suffix}`);
      expect(fs.readFileSync(`${targetDatabasePath}${suffix}`, "utf8")).toBe(`target${suffix}`);
    }
  });

  it("should ignore orphan sidecars when no legacy database exists", () => {
    fs.mkdirSync(legacyDirectory);
    fs.writeFileSync(`${legacyDatabasePath}-wal`, "orphan writes");

    migrateLegacyCacheDirectory(userDataPath, cacheDirectory);

    expect(fs.existsSync(cacheDirectory)).toBe(false);
    expect(fs.readFileSync(`${legacyDatabasePath}-wal`, "utf8")).toBe("orphan writes");
  });

  it("should tolerate missing sidecars and repeated migrations", () => {
    fs.mkdirSync(legacyDirectory);
    fs.writeFileSync(legacyDatabasePath, "database contents");

    migrateLegacyCacheDirectory(userDataPath, cacheDirectory);
    migrateLegacyCacheDirectory(userDataPath, cacheDirectory);

    expect(fs.readFileSync(targetDatabasePath, "utf8")).toBe("database contents");
    expect(fs.existsSync(`${targetDatabasePath}-wal`)).toBe(false);
    expect(fs.existsSync(`${targetDatabasePath}-shm`)).toBe(false);
  });

  it("should preserve existing target sidecars without overwriting them", () => {
    fs.mkdirSync(legacyDirectory);
    fs.mkdirSync(cacheDirectory);
    fs.writeFileSync(legacyDatabasePath, "database contents");
    for (const suffix of ["-wal", "-shm"]) {
      fs.writeFileSync(`${legacyDatabasePath}${suffix}`, `legacy${suffix}`);
      fs.writeFileSync(`${targetDatabasePath}${suffix}`, `target${suffix}`);
    }

    migrateLegacyCacheDirectory(userDataPath, cacheDirectory);

    expect(fs.readFileSync(targetDatabasePath, "utf8")).toBe("database contents");
    for (const suffix of ["-wal", "-shm"]) {
      expect(fs.readFileSync(`${legacyDatabasePath}${suffix}`, "utf8")).toBe(`legacy${suffix}`);
      expect(fs.readFileSync(`${targetDatabasePath}${suffix}`, "utf8")).toBe(`target${suffix}`);
    }
  });

  it("should initialize a usable SQLite cache on first launch", async () => {
    repository = createCacheRepository(userDataPath);

    expect(repository).not.toBeNull();
    expect(fs.existsSync(targetDatabasePath)).toBe(true);
    expect(await repository?.listLogs({ limit: 10 })).toEqual({ logs: [], hasMore: false });
  });

  it("should reopen existing SQLite data after moving the legacy database", async () => {
    repository = createOpenCodexSqliteCacheRepository({ directory: legacyDirectory });
    const savedLog = await repository.createLog({ type: "info", message: "Preserved cache entry" });
    await repository.close();
    repository = null;

    repository = createCacheRepository(userDataPath);

    expect(repository).not.toBeNull();
    expect(await repository?.listLogs({ limit: 10 })).toEqual({ logs: [savedLog], hasMore: false });
    expect(fs.existsSync(legacyDatabasePath)).toBe(false);
    expect(fs.existsSync(targetDatabasePath)).toBe(true);
  });

  it("should log migration failure and disable the optional cache without deleting legacy data", () => {
    fs.mkdirSync(legacyDirectory);
    fs.writeFileSync(legacyDatabasePath, "preserved legacy contents");
    fs.writeFileSync(cacheDirectory, "blocking file");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    repository = createCacheRepository(userDataPath);

    expect(repository).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("[OpenCodexUI] SQLite cache unavailable:"));
    expect(fs.readFileSync(legacyDatabasePath, "utf8")).toBe("preserved legacy contents");
    expect(fs.readFileSync(cacheDirectory, "utf8")).toBe("blocking file");
  });

  it("should log SQLite initialization failure and disable the optional cache", () => {
    fs.mkdirSync(cacheDirectory);
    fs.mkdirSync(targetDatabasePath);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    repository = createCacheRepository(userDataPath);

    expect(repository).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("[OpenCodexUI] SQLite cache unavailable:"));
    expect(fs.statSync(targetDatabasePath).isDirectory()).toBe(true);
  });
});
