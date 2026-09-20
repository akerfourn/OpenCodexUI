import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CodexNotification, CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexFileSnapshot } from "@open-codex-ui/opencodex-protocol";
import { runSourceFileOperation } from "../src/backend/files/runFileOperation.js";
import { WorkspaceFilesService } from "../src/backend/files/WorkspaceFilesService.js";

/** Implements only the source process transport, using an isolated local child as its host. */
function sourceProcessClient() {
  let listener: ((notification: CodexNotification) => void) | null = null;
  let child: ChildProcessWithoutNullStreams | null = null;
  const request = vi.fn(async (method: string, params: Record<string, unknown>) => {
    if (method === "process/spawn") {
      const args = params.command as string[];
      child = spawn(process.execPath, args.slice(1), { cwd: params.cwd as string });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.setEncoding("utf8").on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("close", (exitCode) =>
        listener?.({
          method: "process/exited",
          params: {
            processHandle: params.processHandle,
            exitCode,
            stdout,
            stderr,
            stdoutCapReached: false,
            stderrCapReached: false
          }
        })
      );
    } else if (method === "process/writeStdin") {
      if (typeof params.deltaBase64 === "string")
        child!.stdin.write(Buffer.from(params.deltaBase64, "base64"));
      if (params.closeStdin) child!.stdin.end();
    } else if (method === "process/kill") child?.kill();
    return {};
  });
  const client = {
    request,
    onNotification: (callback: typeof listener) => {
      listener = callback;
      return {
        dispose: () => {
          listener = null;
        }
      };
    }
  };
  return { client: client as unknown as CodexAppServerClient, request };
}

describe("workspace source routing", () => {
  it("should transfer multilingual documents through source stdin without shell interpolation", async () => {
    const root = await mkdtemp(join(tmpdir(), "files-source-"));
    try {
      const target = {
        sourceId: "remote",
        projectId: "project",
        workspaceId: "ws",
        workspacePath: root,
        path: "quotes ' $file.txt"
      };
      await writeFile(join(root, target.path), "original");
      const { client, request } = sourceProcessClient();
      const read = await runSourceFileOperation(client, { type: "workspaceFiles.read", target });
      if (!read.ok) throw new Error(read.details);
      const original = read.value as OpenCodexFileSnapshot;
      const content = "Écriture 日本語 🎉 $(not-a-command)\n".repeat(4000);
      const saved = await runSourceFileOperation(client, {
        type: "workspaceFiles.save",
        target,
        content,
        revision: original.revision,
        bom: original.bom
      });
      expect(saved.ok).toBe(true);
      expect(await readFile(join(root, target.path), "utf8")).toBe(content);
      const spawnCall = request.mock.calls.find((call) => call[0] === "process/spawn")!;
      expect(spawnCall[1].command).toEqual(["node", "-e", expect.any(String)]);
      expect(JSON.stringify(spawnCall)).not.toContain("$(not-a-command)");
      expect(request.mock.calls.filter((call) => call[0] === "process/writeStdin").length).toBeGreaterThan(4);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("should time out a stalled source without waiting indefinitely for spawn acknowledgement", async () => {
    vi.useFakeTimers();
    const dispose = vi.fn();
    const request = vi.fn((method: string) => {
      if (method === "process/spawn") return new Promise(() => undefined);
      return Promise.resolve({});
    });
    const client = { request, onNotification: () => ({ dispose }) } as unknown as CodexAppServerClient;
    try {
      const result = runSourceFileOperation(client, { type: "workspaceFiles.read", target: {
        sourceId: "remote", projectId: "project", workspaceId: "ws", workspacePath: "/remote", path: "file"
      } });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await result).toMatchObject({ ok: false, code: "unavailable", details: expect.stringContaining("timed out") });
      expect(dispose).toHaveBeenCalledOnce();
      expect(request).toHaveBeenCalledWith("process/kill", { processHandle: expect.any(String) });
    } finally {
      vi.useRealTimers();
    }
  });

  it("should reject stale, foreign and removed contexts before touching any source", async () => {
    const workspace = {
      id: "ws",
      projectId: "project",
      sourceId: "source",
      path: "/source/worktree",
      removedAt: null
    };
    const get = vi.fn().mockResolvedValue(workspace);
    const repository = { workspaces: { get } } as unknown as OpenCodexCacheRepository;
    const sources = { resolveRequestedSource: vi.fn() };
    const clients = { ensureClient: vi.fn() };
    const service = new WorkspaceFilesService(repository, sources, clients);
    const target = {
      sourceId: "source",
      projectId: "project",
      workspaceId: "ws",
      workspacePath: workspace.path,
      path: "file"
    };
    for (const patch of [{ sourceId: "other" }, { projectId: "other" }, { workspacePath: "/other" }]) {
      expect(
        await service.execute({ type: "workspaceFiles.read", target: { ...target, ...patch } })
      ).toMatchObject({ ok: false, code: "unavailable" });
    }
    get.mockResolvedValue({ ...workspace, removedAt: "2026-01-01" });
    expect(await service.execute({ type: "workspaceFiles.list", target })).toMatchObject({ ok: false });
    expect(sources.resolveRequestedSource).not.toHaveBeenCalled();
    expect(clients.ensureClient).not.toHaveBeenCalled();
  });
});
