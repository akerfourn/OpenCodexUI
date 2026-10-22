import path from "node:path";
import type { v2 } from "@open-codex-ui/codex-rpc";
import type { OpenCodexWorkspaceRemoval } from "@open-codex-ui/opencodex-protocol";
import type { ClientPort } from "../runtime/runtimePorts.js";

/** Conservative source-side inactivity and literal-directory checks before removal. */
export class WorkspaceRemovalRuntime {
  /** Requires the owning source, never Electron's host filesystem. */
  constructor(private readonly clients: Pick<ClientPort, "ensureClient">) {}

  /** Rejects incomplete inventories, active agents, loaded target sessions and live terminals. */
  async requireIdle(removal: Pick<OpenCodexWorkspaceRemoval, "sourceId" | "workspacePath" | "projectPath">): Promise<void> {
    const client = await this.clients.ensureClient(removal.sourceId);
    const loaded = await client.request<v2.ThreadLoadedListResponse>("thread/loaded/list", { limit: 100 });
    if (!Array.isArray(loaded.data) || loaded.nextCursor !== null) {
      throw new Error("Cannot verify inactivity: the loaded conversation inventory is incomplete.");
    }
    const targets: string[] = [];
    for (const id of loaded.data) {
      const { thread } = await client.readThread(id, false);
      if (thread.id !== id || thread.status.type !== "idle") {
        throw new Error("Finish active conversations and sub-agents on this source before workspace maintenance.");
      }
      if (isInsideWorkspace(thread.cwd, removal.workspacePath)) {
        targets.push(id);
      }
      const terminals = await client.request<v2.ThreadBackgroundTerminalsListResponse>(
        "thread/backgroundTerminals/list", { threadId: id, limit: 100 });
      if (!Array.isArray(terminals.data) || terminals.nextCursor !== null
        || terminals.data.some(terminal => isInsideWorkspace(terminal.cwd, removal.workspacePath))) {
        throw new Error("Stop background terminals before workspace maintenance; their inventory must be complete.");
      }
    }
    for (const id of targets) {
      const response = await client.unsubscribeThread(id);
      if (!["unsubscribed", "notLoaded", "notSubscribed"].includes(response.status)) {
        throw new Error("Codex returned an unsupported conversation unsubscribe response.");
      }
    }
    if (targets.length > 0) {
      const remaining = await client.request<v2.ThreadLoadedListResponse>("thread/loaded/list", { limit: 100 });
      if (!Array.isArray(remaining.data) || remaining.nextCursor !== null
        || targets.some(id => remaining.data.includes(id))) {
        throw new Error("Another client still holds a workspace conversation. Close it before workspace maintenance.");
      }
      for (const id of remaining.data) {
        const { thread } = await client.readThread(id, false);
        if (thread.id !== id || thread.status.type !== "idle" || isInsideWorkspace(thread.cwd, removal.workspacePath)) {
          throw new Error("Source activity changed while unloading workspace conversations. Retry after closing them.");
        }
      }
    }
  }

  /** Refuses symbolic-link ancestors and non-directory paths in either checkout. */
  async requireDirectories(removal: Pick<OpenCodexWorkspaceRemoval, "sourceId" | "workspacePath" | "projectPath">): Promise<void> {
    const client = await this.clients.ensureClient(removal.sourceId);
    for (const value of [removal.projectPath, removal.workspacePath]) {
      const syntax = value.startsWith("/") ? path.posix : path.win32;
      let current = value;
      while (true) {
        const metadata = await client.getMetadata(current);
        if (metadata.isDirectory !== true || metadata.isSymlink !== false) {
          throw new Error("Workspace maintenance requires literal directories without symbolic-link ancestors.");
        }
        const parent = syntax.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
  }

  /** Distinguishes a proven absent directory from access errors or a replaced path. */
  async isMissing(removal: Pick<OpenCodexWorkspaceRemoval, "sourceId" | "workspacePath" | "projectPath">): Promise<boolean> {
    const client = await this.clients.ensureClient(removal.sourceId);
    try {
      await client.getMetadata(removal.workspacePath);
      return false;
    } catch (error) {
      if (error instanceof Error) {
        if (/no such file|\b(file|path)\b.*\bnot found\b|cannot find the (?:file|path) specified|\bENOENT\b|\(os error 2\)/iu
          .test(error.message)) return true;
        if (!removal.workspacePath.startsWith("/") && /\(os error 3\)/u.test(error.message)) return true;
      }
      throw error;
    }
  }
}

/** Compares source-native directories without applying the host platform's path rules. */
export function isInsideWorkspace(candidate: string, workspacePath: string): boolean {
  const syntax = workspacePath.startsWith("/") ? path.posix : path.win32;
  const relative = syntax.relative(workspacePath, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${syntax.sep}`) && !syntax.isAbsolute(relative));
}
