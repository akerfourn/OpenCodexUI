import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectCloneService } from "../src/backend/projects/ProjectCloneService";
import { createGitSyncFixture } from "./gitSyncFixture";

type Fixture = Awaited<ReturnType<typeof createGitSyncFixture>>;
const fixtures: Fixture[] = [];
afterEach(async () => { for (const fixture of fixtures.splice(0)) await fixture.dispose(); });

/** Executes the real Git argv from the source process contract inside an offline fixture. */
async function fixture() {
  const test = await createGitSyncFixture();
  fixtures.push(test);
  const source = { id: "local", kind: "local" } as CachedSource;
  const listeners = new Set<(notification: { method: string; params: v2.ProcessExitedNotification }) => void>();
  const client = {
    onNotification(listener: (notification: { method: string; params: v2.ProcessExitedNotification }) => void) {
      listeners.add(listener);
      return { dispose() { listeners.delete(listener); } };
    },
    request: vi.fn(async (_method: string, params: v2.ProcessSpawnParams) => {
      let exitCode = 0;
      let stdout = "";
      let stderr = "";
      try { stdout = await test.git(params.cwd, params.command.slice(1)); }
      catch (error) {
        const failure = error as { code: number; stderr: string };
        exitCode = failure.code;
        stderr = failure.stderr;
      }
      for (const listener of listeners) listener({ method: "process/exited", params: {
        processHandle: params.processHandle, exitCode, stdout, stderr, stdoutCapReached: false, stderrCapReached: false
      } });
      return {};
    })
  } as unknown as CodexAppServerClient;
  const ensureClient = vi.fn(async () => client);
  const ensureProjectDirectory = vi.fn(async (directory: string) => directory);
  const service = new ProjectCloneService({ clients: { ensureClient }, host: { ensureProjectDirectory } });
  return { ...test, service, source, client, ensureClient, ensureProjectDirectory };
}

describe("source-owned Git project cloning", { timeout: 20_000 }, () => {
  it("should clone an offline repository into a path with spaces without interpolating a shell command", async () => {
    const test = await fixture();
    const destination = path.join(test.root, "new project");

    await expect(test.service.clone(test.local, destination, test.source)).resolves.toBe(destination);

    expect(await readFile(path.join(destination, "shared.txt"), "utf8")).toBe("baseline\n");
    expect(path.normalize(await test.git(destination, ["remote", "get-url", "origin"]))).toBe(test.local);
    expect(test.ensureClient).toHaveBeenCalledWith(test.source.id);
    expect(test.client.request).toHaveBeenCalledWith("process/spawn", expect.objectContaining({
      command: ["git", "-c", "credential.interactive=false", "clone", "--", test.local, destination], cwd: test.root,
      env: { GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" }
    }));
  });

  it("should preserve an existing nonempty destination instead of overwriting its files", async () => {
    const test = await fixture();
    const destination = path.join(test.root, "existing");
    await mkdir(destination);
    await writeFile(path.join(destination, "draft.txt"), "keep this draft\n");

    await expect(test.service.clone(test.local, destination, test.source)).rejects.toThrow("not an empty directory");

    expect(await readFile(path.join(destination, "draft.txt"), "utf8")).toBe("keep this draft\n");
  });

  it("should validate a POSIX parent through the remote source without touching the Windows host", async () => {
    const test = await fixture();
    const source = { ...test.source, id: "remote", kind: "wsl" } as CachedSource;
    test.client.getMetadata = vi.fn(async () => ({ isDirectory: true })) as CodexAppServerClient["getMetadata"];
    vi.mocked(test.client.request).mockImplementationOnce(async () => { throw new Error("Source process refused"); });

    await expect(test.service.clone("git@example.test:repo.git", "/home/user/new", source)).rejects.toThrow("Source process refused");

    expect(test.client.getMetadata).toHaveBeenCalledWith("/home/user");
    expect(test.ensureProjectDirectory).not.toHaveBeenCalled();
    expect(test.ensureClient).toHaveBeenCalledWith("remote");
    expect(test.client.request).toHaveBeenCalledWith("process/spawn", expect.objectContaining({ cwd: "/home/user" }));
  });

  it.each(["relative/project", "C:relative", "\\rooted", "/", "C:\\"])("should reject ambiguous or root destinations before starting Git: %s", async destination => {
    const test = await fixture();
    await expect(test.service.clone(test.local, destination, test.source)).rejects.toThrow(/destination|folder/u);
    expect(test.ensureClient).not.toHaveBeenCalled();
  });
});
