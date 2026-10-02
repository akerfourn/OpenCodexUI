import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { CachedSource, OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import { changeBrowserPermission, parseBrowserPermissions } from "../src/backend/browser/browserPermissionsFormat.js";
import { readBrowserPermissionsFile, writeBrowserPermissionsFile } from "../src/backend/browser/browserPermissionsFiles.js";
import { BrowserPermissionsService } from "../src/backend/browser/BrowserPermissionsService.js";

const directories: string[] = [];
const context = { sourceId: "source", threadId: "chat-1" };

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

/** Keeps all file operations in isolated fixtures and app-server calls fully mocked. */
async function fixture(kind: CachedSource["kind"] = "local", hasLocalAccess = false) {
  const home = await mkdtemp(path.join(os.tmpdir(), "browser-permissions-"));
  directories.push(home);
  const browser = path.join(home, "browser");
  await mkdir(path.join(browser, "sessions"), { recursive: true });
  const source = { id: "source", kind, settings: { hasLocalAccess } } as CachedSource;
  const resolveRequestedSource = vi.fn(async () => source);
  const request = vi.fn(async () => ({ layers: [
    { name: { type: "system", file: path.join(home, "system.toml") } },
    { name: { type: "user", file: path.join(home, "custom.config.toml"), profile: "custom" } },
    { name: { type: "user", file: path.join(home, "config.toml"), profile: null } }
  ] }));
  const ensureClient = vi.fn(async () => ({ request }) as unknown as CodexAppServerClient);
  const restartClient = vi.fn(async () => undefined);
  const getThread = vi.fn(async () => ({ thread: { sourceId: "source" } }));
  const cache = { getThread } as unknown as Pick<OpenCodexCacheRepository, "getThread">;
  const hasActiveTurns = vi.fn(() => false);
  const service = new BrowserPermissionsService(cache, { resolveRequestedSource },
    { ensureClient, restartClient }, hasActiveTurns);
  return { service, browser, request, ensureClient, restartClient, getThread, hasActiveTurns };
}

describe("browser permissions compatibility", () => {
  it("should preserve unknown settings and numeric types when resetting one decision", () => {
    const content = `full_cdp_access_enabled = true\nfuture_integer = 9007199254740993\nfuture_float = 1.0\n
[origins]\ndenied = ["https://pro.easyeda.com", "https://other.example"]\nfuture_flag = true\n
[uploads]\nallowed = ["https://upload.example"]\n`;
    const updated = parseBrowserPermissions(changeBrowserPermission(content, {
      resource: "origins", pattern: "https://pro.easyeda.com", decision: "reset"
    }));
    expect(updated).toEqual({ full_cdp_access_enabled: true, future_integer: 9007199254740993n,
      future_float: 1, origins: { denied: ["https://other.example"], future_flag: true },
      uploads: { allowed: ["https://upload.example"] } });
  });

  it("should remove the opposite decision without changing other permission tables", () => {
    const result = parseBrowserPermissions(changeBrowserPermission(
      '[origins]\ndenied = ["https://site.example"]\n[downloads]\ndenied = ["https://site.example"]\n',
      { resource: "origins", pattern: "https://site.example", decision: "allowed" }
    ));
    expect(result).toEqual({ origins: { denied: [], allowed: ["https://site.example"] },
      downloads: { denied: ["https://site.example"] } });
  });

  it("should reject malformed or incompatible known tables instead of overwriting them", () => {
    for (const content of ['[origins]\ndenied = 12', '[origins]\nallowed = [1]', '[origins', 'origins = true']) {
      expect(() => changeBrowserPermission(content, {
        resource: "origins", pattern: "https://site.example", decision: "reset"
      })).toThrow("BROWSER_FORMAT");
    }
  });
});

describe("source and chat browser permissions", () => {
  it("should read chat and global decisions from the source-reported Codex home", async () => {
    const { service, browser, request } = await fixture("custom", true);
    await writeFile(path.join(browser, "config.toml"), '[origins]\nallowed = ["https://global.example"]\n');
    await writeFile(path.join(browser, "sessions/chat-1.toml"), '[origins]\ndenied = ["https://pro.easyeda.com"]\n');
    const snapshot = await service.execute({ type: "browserPermissions.read", context });
    expect(snapshot).toMatchObject({ context, file: { path: path.join(browser, "sessions/chat-1.toml"),
      entries: [{ resource: "origins", pattern: "https://pro.easyeda.com", decision: "denied" }] },
      global: { entries: [{ resource: "origins", pattern: "https://global.example", decision: "allowed" }] } });
    expect(request).toHaveBeenCalledWith("config/read", { includeLayers: true });
  });

  it("should reset the chat denial without replacing its global settings and keep original bytes", async () => {
    const { service, browser } = await fixture();
    const chatPath = path.join(browser, "sessions/chat-1.toml");
    const original = '# Original comment\n[origins]\ndenied = ["https://pro.easyeda.com"]\n';
    const global = '[origins]\nallowed = ["https://global.example"]\n';
    await writeFile(chatPath, original);
    await writeFile(path.join(browser, "config.toml"), global);
    const snapshot = await service.execute({ type: "browserPermissions.read", context });
    const saved = await service.execute({ type: "browserPermissions.change", context,
      revision: snapshot!.file.revision,
      change: { resource: "origins", pattern: "https://pro.easyeda.com", decision: "reset" } });
    expect(saved!.file.entries).toEqual([]);
    expect(await readFile(`${chatPath}.opencodexui.bak`, "utf8")).toBe(original);
    expect(await readFile(path.join(browser, "config.toml"), "utf8")).toBe(global);
  });

  it("should refuse stale edits when the plugin changed the file", async () => {
    const { service, browser } = await fixture();
    const globalContext = { sourceId: "source", threadId: null };
    const snapshot = await service.execute({ type: "browserPermissions.read", context: globalContext });
    const external = '[origins]\ndenied = ["https://changed.example"]\n';
    await writeFile(path.join(browser, "config.toml"), external);
    await expect(service.execute({ type: "browserPermissions.change", context: globalContext,
      revision: snapshot!.file.revision,
      change: { resource: "origins", pattern: "https://new.example", decision: "allowed" } })).rejects.toThrow("BROWSER_CONFLICT");
    expect(await readFile(path.join(browser, "config.toml"), "utf8")).toBe(external);
  });

  it("should create a missing scoped file without requiring any existing decisions", async () => {
    const { service } = await fixture();
    const snapshot = await service.execute({ type: "browserPermissions.read", context });
    const saved = await service.execute({ type: "browserPermissions.change", context,
      revision: snapshot!.file.revision,
      change: { resource: "downloads", pattern: "https://download.example", decision: "denied" } });
    expect(saved!.file.entries).toEqual([{ resource: "downloads", pattern: "https://download.example", decision: "denied" }]);
  });

  it("should refuse a chat edit when inherited settings became incompatible", async () => {
    const { service, browser } = await fixture();
    const chatPath = path.join(browser, "sessions/chat-1.toml");
    const original = '[origins]\ndenied = ["https://site.example"]\n';
    await writeFile(chatPath, original);
    const snapshot = await service.execute({ type: "browserPermissions.read", context });
    await writeFile(path.join(browser, "config.toml"), '[origins]\nallowed = true');
    await expect(service.execute({ type: "browserPermissions.change", context, revision: snapshot!.file.revision,
      change: { resource: "origins", pattern: "https://site.example", decision: "reset" } })).rejects.toThrow("BROWSER_FORMAT");
    expect(await readFile(chatPath, "utf8")).toBe(original);
  });

  it("should refuse an unverified configuration path instead of guessing the host home", async () => {
    const { service, request } = await fixture();
    request.mockResolvedValueOnce({ layers: [{ name: { type: "user", file: "relative/config.toml", profile: null } }] });
    await expect(service.execute({ type: "browserPermissions.read", context })).rejects.toThrow("BROWSER_UNSUPPORTED");
  });

  it("should reject inaccessible source types before launching their app-server", async () => {
    for (const kind of ["ssh", "wsl", "custom"] as const) {
      const { service, ensureClient } = await fixture(kind);
      await expect(service.execute({ type: "browserPermissions.read", context })).rejects.toThrow("BROWSER_UNSUPPORTED");
      expect(ensureClient).not.toHaveBeenCalled();
    }
  });

  it("should reject traversal and chats whose source changed", async () => {
    const { service, getThread, ensureClient } = await fixture();
    await expect(service.execute({ type: "browserPermissions.read", context: { ...context, threadId: "../config" } }))
      .rejects.toThrow("BROWSER_INVALID");
    getThread.mockResolvedValueOnce({ thread: { sourceId: "other-source" } });
    await expect(service.execute({ type: "browserPermissions.read", context })).rejects.toThrow("source changed");
    expect(ensureClient).not.toHaveBeenCalled();
  });

  it("should reload only an idle explicitly requested source", async () => {
    const { service, restartClient, hasActiveTurns } = await fixture();
    hasActiveTurns.mockReturnValueOnce(true);
    await expect(service.execute({ type: "browserPermissions.reload", sourceId: "source" })).rejects.toThrow("BROWSER_BUSY");
    expect(restartClient).not.toHaveBeenCalled();
    await service.execute({ type: "browserPermissions.reload", sourceId: "source" });
    expect(restartClient).toHaveBeenCalledWith("source");
  });

  it("should refuse changed revisions at the final file boundary", async () => {
    const { browser } = await fixture();
    const file = path.join(browser, "config.toml");
    const original = await readBrowserPermissionsFile(file);
    await writeFile(file, '[origins]\ndenied = ["https://external.example"]');
    await expect(writeBrowserPermissionsFile(original, "[origins]\nallowed = []\n")).rejects.toThrow("BROWSER_CONFLICT");
  });

  it("should reject symbolic permissions files without modifying their targets", async () => {
    const { browser } = await fixture();
    const target = path.join(browser, "original.toml");
    await writeFile(target, '[origins]\ndenied = ["https://site.example"]');
    await symlink(target, path.join(browser, "config.toml"), "file");
    await expect(readBrowserPermissionsFile(path.join(browser, "config.toml"))).rejects.toThrow("BROWSER_FORMAT");
    expect(await readFile(target, "utf8")).toContain("https://site.example");
  });

  it("should replace a symbolic backup without following it to another file", async () => {
    const { browser } = await fixture();
    const file = path.join(browser, "config.toml");
    const target = path.join(browser, "unrelated.txt");
    const content = '[origins]\ndenied = ["https://site.example"]\n';
    await writeFile(file, content);
    await writeFile(target, "Unrelated content");
    await symlink(target, `${file}.opencodexui.bak`, "file");
    await writeBrowserPermissionsFile(await readBrowserPermissionsFile(file), "[origins]\ndenied = []\n");
    expect(await readFile(target, "utf8")).toBe("Unrelated content");
    expect(await readFile(`${file}.opencodexui.bak`, "utf8")).toBe(content);
  });
});
