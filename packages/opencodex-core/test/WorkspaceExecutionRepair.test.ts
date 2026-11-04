import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createOpenCodexSqliteCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { WorkspaceExecutionService } from "../src/backend/workspaces/WorkspaceExecutionService";

describe("repair after a missed completion notification", () => {
  it.each(["idle", "notLoaded"])(
    "should keep a durable running guard until Codex verifies inactivity (%s)", async idleStatus => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-repair-"));
      let cache = createOpenCodexSqliteCacheRepository({ directory });
      try {
        await cache.upsertThreadIndex([{
          id: "blocked", sessionId: null, parentThreadId: null, sourceId: "source",
          projectPath: "/repo", projectName: "repo", title: "Thread", codexTitle: "Thread",
          customTitle: null, preview: "", model: null, reasoningEffort: null,
          branchName: null, updatedAt: null, isArchived: false, threadSource: null,
          agentNickname: null, agentRole: null, subAgentSource: null, canAcceptDirectInput: true
        }]);
        const workspace = (await cache.workspaces.getForThread("blocked"))!;
        const reservation = await cache.workspaces.reserve(workspace.id, "blocked");
        await cache.workspaces.submitting(reservation.id);
        await cache.workspaces.acknowledge(reservation.id, "old-turn");
        await cache.close();
        cache = createOpenCodexSqliteCacheRepository({ directory });

        const client = {
          readThread: vi.fn().mockResolvedValue({ thread: { status: { type: "active" } } }),
          startTurn: vi.fn(), interruptTurn: vi.fn()
        };
        const clients = { ensureClient: vi.fn(async () => client as unknown as CodexAppServerClient) };
        const service = new WorkspaceExecutionService(cache.workspaces, clients);
        await expect(cache.workspaces.reserve(workspace.id, "blocked")).rejects.toThrow("unresolved workspace execution");

        await expect(service.reconcile("blocked")).rejects.toThrow("Thread is active");
        expect(await cache.workspaces.getReservationForThread("blocked")).toMatchObject({
          id: reservation.id, state: "running", turnId: "old-turn"
        });
        client.readThread.mockResolvedValue({ thread: { status: { type: idleStatus } } });
        await service.reconcile("blocked");

        expect(await cache.workspaces.getReservationForThread("blocked")).toBeNull();
        expect(clients.ensureClient).toHaveBeenCalledWith("source");
        expect(client.startTurn).not.toHaveBeenCalled();
        expect(client.interruptTurn).not.toHaveBeenCalled();
        const retry = await cache.workspaces.reserve(workspace.id, "blocked");
        expect(retry.threadId).toBe("blocked");
      } finally {
        await cache.close();
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  );
});
