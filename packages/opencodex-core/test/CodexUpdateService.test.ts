import { realpathSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { customUpdateSource, standalonePath, updateFixture, updateSource } from "./codexUpdate.fixture";

vi.mock("node:fs", async () => ({ ...await vi.importActual<typeof import("node:fs")>("node:fs"),
  realpathSync: vi.fn((value: string) => value), existsSync: vi.fn(() => false) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-18T00:00:00.000Z"));
  vi.mocked(realpathSync).mockImplementation(value => String(value));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ tag_name: "rust-v0.163.0" }) })));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("standalone source updates", () => {
  it("should detect WSL symlinks in Linux without starting an app-server or executing an update", async () => {
    const { service, source, run } = updateFixture();
    await expect(service.getSourceUpdateStatus(source, "windows-codex.exe")).resolves.toMatchObject({
      supported: true, updateAvailable: true
    });
    expect(run).toHaveBeenCalledOnce();
    const [command, timeout] = run.mock.calls[0]!;
    expect(command).toMatchObject({ command: "wsl.exe", shell: false });
    expect(command.args.slice(0, 5)).toEqual(["--distribution", "Ubuntu", "--exec", "sh", "-c"]);
    expect(command.args.at(-1)).toBe("/home/test/.local/bin/codex");
    expect(timeout).toBe(5_000);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should revalidate the install before updating exactly the configured WSL executable", async () => {
    const { service, source, run, refreshSources } = updateFixture();
    await service.getSourceUpdateStatus(source, "windows-codex.exe");
    await service.updateSource(source, "windows-codex.exe");
    expect(run.mock.calls.map(([command]) => command.args.includes("opencodex-update-probe"))).toEqual([true, true, false]);
    expect(run.mock.calls[2]).toEqual([{ command: "wsl.exe", shell: false,
      args: ["--distribution", "Ubuntu", "--exec", "/home/test/.local/bin/codex", "update"] }, 600_000]);
    expect(refreshSources).toHaveBeenCalledOnce();
  });

  it("should preserve explicit distro, user and literal quoted Linux path in custom WSL sources", async () => {
    const nativePath = "/home/O'Brien/codex tools/codex";
    const source = customUpdateSource(`wsl.exe -d "Ubuntu Dev" -u adrien -- "${nativePath}"`);
    const { service, run } = updateFixture(source);
    run.mockResolvedValueOnce({ exitCode: 0, stdout: `${nativePath}\0${standalonePath}\0Ubuntu Dev\0`, stderr: "" });
    await service.updateSource(source, "windows-codex.exe");
    expect(run.mock.calls[0]![0].args.at(-1)).toBe(nativePath);
    expect(run.mock.calls[0]![0].args[7]).not.toContain(nativePath);
    expect(run.mock.calls[1]![0]).toEqual({ command: "wsl.exe", shell: false,
      args: ["-d", "Ubuntu Dev", "-u", "adrien", "--exec", nativePath, "update"] });
  });

  it("should pin a default-distribution source to the distribution reported by its Linux probe", async () => {
    const source = updateSource();
    source.settings.distro = null;
    const { service, run } = updateFixture(source);
    await service.updateSource(source, "codex");
    expect(run.mock.calls[0]![0].args[0]).toBe("--exec");
    expect(run.mock.calls[1]![0].args.slice(0, 2)).toEqual(["--distribution", "Ubuntu"]);
  });

  it.each([
    "/usr/lib/node_modules/@openai/codex/bin/codex.js",
    "/mnt/c/Users/test/.codex/packages/standalone/current/bin/codex.exe"
  ])("should refuse non-Linux-standalone target %s", async canonical => {
    const { service, source, run } = updateFixture();
    run.mockResolvedValue({ exitCode: 0, stdout: `/home/test/.local/bin/codex\0${canonical}\0Ubuntu\0`, stderr: "" });
    await expect(service.getSourceUpdateStatus(source, "codex")).resolves.toMatchObject({ supported: false });
    await expect(service.updateSource(source, "codex")).rejects.toThrow("standalone local or WSL");
    expect(run.mock.calls.every(([command]) => command.args.includes("opencodex-update-probe"))).toBe(true);
  });

  it("should reject arbitrary WSL options even when their arguments mention a standalone path", async () => {
    const source = customUpdateSource(`wsl.exe --list ${standalonePath}`);
    const { service, run } = updateFixture(source);
    await expect(service.updateSource(source, "codex")).rejects.toThrow("standalone local or WSL");
    expect(run).not.toHaveBeenCalled();
  });

  it("should reject a typed distribution value that could be interpreted as a WSL option", async () => {
    const source = updateSource();
    source.settings.distro = "--shutdown";
    const { service, run } = updateFixture(source);
    await expect(service.updateSource(source, "codex")).rejects.toThrow("standalone local or WSL");
    expect(run).not.toHaveBeenCalled();
  });

  it("should leave shell-wrapped custom commands unsupported", async () => {
    const source = customUpdateSource('wsl.exe -d Ubuntu -- bash -lc "codex"');
    const { service, run } = updateFixture(source);
    run.mockResolvedValue({ exitCode: 0, stdout: "/bin/bash\0/usr/bin/bash\0Ubuntu\0", stderr: "" });
    await expect(service.getSourceUpdateStatus(source, "codex")).resolves.toMatchObject({ supported: false });
  });

  it("should surface a probe failure without breaking the source list or running an updater", async () => {
    const { service, source, run, logger } = updateFixture();
    run.mockRejectedValue(new Error("Distribution is unavailable"));
    await expect(service.getSourceUpdateStatus(source, "codex")).resolves.toMatchObject({
      supported: false, message: "Distribution is unavailable"
    });
    expect(logger).toHaveBeenCalled();
    await expect(service.updateSource(source, "codex")).rejects.toThrow("Distribution is unavailable");
  });

  it("should reject malformed probe output instead of guessing a target", async () => {
    const { service, source, run } = updateFixture();
    run.mockResolvedValue({ exitCode: 0, stdout: "unexpected login output", stderr: "" });
    await expect(service.updateSource(source, "codex")).rejects.toThrow("Invalid WSL installation detection");
    expect(run).toHaveBeenCalledOnce();
  });

  it("should report update failures without claiming a refreshed version", async () => {
    const { service, source, run, refreshSources } = updateFixture();
    const runner = run.getMockImplementation()!;
    run.mockImplementation(async (...args) => {
      if (args[0].args.includes("update")) return { exitCode: 1, stdout: "", stderr: "Permission denied" };
      return await runner(...args);
    });
    await expect(service.updateSource(source, "codex")).rejects.toThrow("Permission denied");
    expect(refreshSources).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should detect an executable pinned to an old release after a successful updater exit", async () => {
    const { service, source, refreshSources } = updateFixture();
    refreshSources.mockResolvedValue([source]);
    await expect(service.updateSource(source, "codex")).rejects.toThrow("still reports the old version");
  });

  it("should preserve host-local standalone updates and respect the configured fallback", async () => {
    const wsl = updateSource();
    const source = { ...wsl, kind: "local" as const, resolvedCommand: standalonePath,
      settings: { color: "blue" as const, commandMode: "auto" as const, command: null,
        openFolderCommand: null, openFileCommand: null } };
    const { service, run } = updateFixture(source);
    await expect(service.getSourceUpdateStatus(source, standalonePath)).resolves.toMatchObject({ supported: true });
    await service.updateSource(source, standalonePath);
    expect(run.mock.calls).toEqual([[{ command: standalonePath, args: ["update"], shell: false }, 600_000]]);
  });

  it("should recognize host-local symlinks using only the host realpath boundary", async () => {
    const source = customUpdateSource("/local/bin/codex");
    vi.mocked(realpathSync).mockReturnValue(standalonePath);
    const { service } = updateFixture(source);
    await expect(service.getSourceUpdateStatus(source, "codex")).resolves.toMatchObject({ supported: true });
  });
});
