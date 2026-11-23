import type { OpenCodexDiscussion, OpenCodexProject, OpenCodexSource, OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

/** Source fixtures use the same availability checks as ordinary project drafts. */
export function discussionSource(id: string): OpenCodexSource {
  return {
    id, kind: "local", name: id, associatedProjectCount: 0,
    settings: { color: "blue", commandMode: "auto", command: null, openFolderCommand: null, openFileCommand: null },
    codex: { status: "ready", version: "0.148.0", checkedAt: "2026-11-23T10:00:00.000Z", message: null },
    codexUpdate: { supported: true, updateAvailable: false, latestVersion: null, checkedAt: null, message: null },
    resolvedCommand: "codex", commandCandidates: [], createdAt: "2026-11-23T10:00:00.000Z", updatedAt: "2026-11-23T10:00:00.000Z"
  };
}

/** Builds persisted discussion metadata without involving the native app-server. */
export function discussion(id: string, sourceId: string | null): OpenCodexDiscussion {
  const now = "2026-11-23T10:00:00.000Z";
  const environment: OpenCodexProject = { id, kind: "discussion", path: `/${id}`, sourceId,
    defaultName: id, displayName: null, isHidden: false, preferences: {},
    createdAt: now, updatedAt: now, lastSeenAt: now, editedAt: now };
  const thread: OpenCodexThread = {
    id: `thread-${id}`, discussionEnvironmentId: id, sessionId: null, parentThreadId: null, sourceId,
    codexTitle: id, customTitle: null, title: id, preview: "", model: "server-default", reasoningEffort: "medium",
    projectPath: environment.path, projectName: null, branchName: null, updatedAt: now, isArchived: false,
    threadSource: "appServer", agentNickname: null, agentRole: null, subAgentSource: null, canAcceptDirectInput: true
  };
  return { environment, threads: [thread] };
}
