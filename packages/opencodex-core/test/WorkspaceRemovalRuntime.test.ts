import { describe, expect, it, vi } from "vitest";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexWorkspaceRemoval } from "@open-codex-ui/opencodex-protocol";
import { isInsideWorkspace, WorkspaceRemovalRuntime } from "../src/backend/workspaces/WorkspaceRemovalRuntime";
import { WorkspaceActivityGate } from "../src/backend/workspaces/WorkspaceActivityGate";

const removal: OpenCodexWorkspaceRemoval = { id: "operation", projectId: "project", workspaceId: "workspace",
  sourceId: "source", primaryWorkspaceId: "primary", projectPath: "/repo", workspacePath: "/checkout",
  repositoryPath: "/repo/.git", state: "preparing", gitExitCode: null };

/** Supplies RPC effects while retaining real runtime validation and source path comparison. */
function fixture() {
  const client = {
    request: vi.fn(async (_method: string, _params: unknown) => ({ data: [], nextCursor: null })),
    readThread: vi.fn(async () => ({ thread: { id: "thread", cwd: "/checkout", status: { type: "idle" } } })),
    unsubscribeThread: vi.fn(async () => ({ status: "unsubscribed" })),
    getMetadata: vi.fn(async () => ({ isDirectory: true, isSymlink: false }))
  };
  const runtime = new WorkspaceRemovalRuntime({
    ensureClient: async sourceId => {
      expect(sourceId).toBe("source");
      return client as unknown as CodexAppServerClient;
    }
  });
  return { runtime, client };
}

describe("workspace removal runtime guards", () => {
  it("should unload idle target conversations and verify their absence without changing history", async () => {
    const { runtime, client } = fixture();
    client.request.mockImplementation(async method => {
      if (method === "thread/loaded/list" && client.unsubscribeThread.mock.calls.length === 0) {
        return { data: ["thread"], nextCursor: null } as never;
      }
      return { data: [], nextCursor: null };
    });
    await runtime.requireIdle(removal);
    expect(client.unsubscribeThread).toHaveBeenCalledWith("thread");
    expect(client.request).toHaveBeenCalledWith("thread/backgroundTerminals/list", { threadId: "thread", limit: 100 });
  });

  it("should refuse when another client keeps an idle target conversation loaded", async () => {
    const { runtime, client } = fixture();
    client.request.mockImplementation(async method => ({ data: method === "thread/loaded/list" ? ["thread"] : [],
      nextCursor: null }) as never);
    await expect(runtime.requireIdle(removal)).rejects.toThrow("Another client still holds");
  });

  it("should refuse active agents before unsubscribing or touching their processes", async () => {
    const { runtime, client } = fixture();
    client.request.mockResolvedValue({ data: ["thread"], nextCursor: null } as never);
    client.readThread.mockResolvedValue({ thread: { id: "thread", cwd: "/checkout", status: { type: "active" } } });
    await expect(runtime.requireIdle(removal)).rejects.toThrow("active conversations");
    expect(client.unsubscribeThread).not.toHaveBeenCalled();
  });

  it("should retain the source-wide guard for an active conversation in another project", async () => {
    const { runtime, client } = fixture();
    client.request.mockResolvedValue({ data: ["thread"], nextCursor: null } as never);
    client.readThread.mockResolvedValue({ thread: { id: "thread", cwd: "/another-project", status: { type: "active" } } });

    await expect(runtime.requireIdle(removal)).rejects.toThrow(
      "Finish active conversations and sub-agents on this source before workspace maintenance."
    );

    expect(client.unsubscribeThread).not.toHaveBeenCalled();
  });

  it("should allow an idle conversation in another project without unloading it", async () => {
    const { runtime, client } = fixture();
    client.request.mockImplementation(async method => ({
      data: method === "thread/loaded/list" ? ["thread"] : [], nextCursor: null
    }) as never);
    client.readThread.mockResolvedValue({ thread: { id: "thread", cwd: "/another-project", status: { type: "idle" } } });

    await expect(runtime.requireIdle(removal)).resolves.toBeUndefined();

    expect(client.unsubscribeThread).not.toHaveBeenCalled();
    expect(client.request).toHaveBeenCalledWith("thread/backgroundTerminals/list", { threadId: "thread", limit: 100 });
  });

  it("should recheck source-wide activity after unloading the target's idle conversations", async () => {
    const { runtime, client } = fixture();
    client.request.mockImplementation(async method => {
      let data: string[] = [];
      if (method === "thread/loaded/list") {
        data = ["other"];
        if (client.unsubscribeThread.mock.calls.length === 0) data = ["thread", "other"];
      }
      return { data, nextCursor: null } as never;
    });
    client.readThread.mockImplementation(async id => {
      let cwd = "/checkout";
      let type = "idle";
      if (id === "other") {
        cwd = "/another-project";
        if (client.unsubscribeThread.mock.calls.length > 0) type = "active";
      }
      return { thread: { id, cwd, status: { type } } };
    });

    await expect(runtime.requireIdle(removal)).rejects.toThrow("Source activity changed");

    expect(client.unsubscribeThread).toHaveBeenCalledOnce();
    expect(client.unsubscribeThread).toHaveBeenCalledWith("thread");
  });

  it("should refuse incomplete loaded-thread inventories before inferring any workspace isolation", async () => {
    const { runtime, client } = fixture();
    client.request.mockResolvedValue({ data: [], nextCursor: "more" } as never);

    await expect(runtime.requireIdle(removal)).rejects.toThrow("loaded conversation inventory is incomplete");

    expect(client.readThread).not.toHaveBeenCalled();
    expect(client.unsubscribeThread).not.toHaveBeenCalled();
  });

  it("should refuse live terminals even when their owning conversation is idle in another checkout", async () => {
    const { runtime, client } = fixture();
    client.readThread.mockResolvedValue({ thread: { id: "thread", cwd: "/repo", status: { type: "idle" } } });
    client.request.mockImplementation(async method => ({ data: method === "thread/loaded/list" ? ["thread"]
      : [{ cwd: "/checkout/nested" }], nextCursor: null }) as never);
    await expect(runtime.requireIdle(removal)).rejects.toThrow("background terminals");
    expect(client.unsubscribeThread).not.toHaveBeenCalled();
  });

  it("should refuse incomplete terminal inventories rather than guessing inactivity", async () => {
    const { runtime, client } = fixture();
    client.request.mockImplementation(async method => ({ data: method === "thread/loaded/list" ? ["thread"] : [],
      nextCursor: method === "thread/loaded/list" ? null : "more" }) as never);
    await expect(runtime.requireIdle(removal)).rejects.toThrow("inventory must be complete");
  });

  it("should refuse symbolic-link ancestors and distinguish missing paths from access errors", async () => {
    const { runtime, client } = fixture();
    client.getMetadata.mockResolvedValue({ isDirectory: true, isSymlink: true });
    await expect(runtime.requireDirectories(removal)).rejects.toThrow("symbolic-link ancestors");
    client.getMetadata.mockRejectedValueOnce(new Error("Permission denied"));
    await expect(runtime.isMissing(removal)).rejects.toThrow("Permission denied");
    client.getMetadata.mockRejectedValueOnce(new Error("No such file or directory"));
    await expect(runtime.isMissing(removal)).resolves.toBe(true);
  });

  it("should compare native Windows paths independently of the Linux host", () => {
    expect(isInsideWorkspace("c:\\Repo\\Topic\\nested", "C:\\repo\\topic")).toBe(true);
    expect(isInsideWorkspace("C:\\repo\\topic-other", "C:\\repo\\topic")).toBe(false);
    expect(isInsideWorkspace("/checkout-other", "/checkout")).toBe(false);
  });

  it.each(["The system cannot find the file specified. (os error 2)",
    "Le chemin d’accès spécifié est introuvable. (os error 3)"])(
    "should recognize native Windows missing-path errors during recovery: %s", async message => {
      const { runtime, client } = fixture();
      client.getMetadata.mockRejectedValue(new Error(message));
      await expect(runtime.isMissing({ ...removal, workspacePath: "C:\\checkout" })).resolves.toBe(true);
    });

  it("should block new source requests throughout an exclusive lifecycle operation", async () => {
    const gate = new WorkspaceActivityGate();
    await gate.exclusive("source", async () => {
      await expect(gate.run("source", async () => undefined)).rejects.toThrow("lifecycle operation is running");
      await expect(gate.run("other-source", async () => "independent")).resolves.toBe("independent");
    });
    await expect(gate.run("source", async () => "released")).resolves.toBe("released");
  });
});
