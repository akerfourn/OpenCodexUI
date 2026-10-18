import type { ThreadPermissionsSnapshot } from "@open-codex-ui/opencodex-protocol";
import { vi } from "vitest";
import { ChatStore } from "../src/stores/chat/ChatStore";
import { createProjectStore, createRootStore, createThread } from "./chatStore/chatStoreFixtures";

/** Creates effective source values independently of global application settings. */
export function permissionSnapshot(patch: Partial<ThreadPermissionsSnapshot> = {}): ThreadPermissionsSnapshot {
  return {
    threadId: "thread-1", sourceId: "source-1", cwd: "/tmp/project", profileId: ":read-only",
    filesystem: "read-only", networkAccess: false, approvalsReviewer: "user", approvalPolicy: "on-request",
    canChangeAccess: true, revision: "revision-1", ...patch
  };
}

/** Keeps the real chat and permission stores while mocking only their transport boundary. */
export function createPermissionsFixture() {
  const root = createRootStore();
  const project = createProjectStore();
  const chat = new ChatStore(createThread({}), project, root);
  const request = vi.mocked(root.request);
  request.mockResolvedValue(permissionSnapshot());
  return { root, project, chat, request, permissions: chat.permissions };
}
