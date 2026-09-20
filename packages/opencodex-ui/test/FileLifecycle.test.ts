import { describe, expect, it, vi } from "vitest";
import type { OpenCodexProject, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { RootStore } from "../src/stores/RootStore";

/** Real lifecycle stores with an isolated filesystem transport. */
async function fixture() {
  const respondToApplicationClose = vi.fn();
  const request = vi.fn(async (request: OpenCodexRequest) => {
    if (request.type === "workspaceFiles.read")
      return {
        ok: true,
        value: {
          content: "original",
          revision: "v1",
          bom: false,
          eol: "lf",
          readOnly: false
        }
      };
    if (request.type === "workspaceFiles.save")
      return { ok: false, code: "conflict", details: "External edit" };
    return [];
  });
  const root = new RootStore({
    request: request as never,
    onEvent: () => () => undefined,
    respondToApplicationClose
  });
  const projectData: OpenCodexProject = {
    id: "project",
    sourceId: "source",
    path: "/project",
    defaultName: "Project",
    displayName: null,
    isHidden: false,
    preferences: {},
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    lastSeenAt: "2026-01-01",
    editedAt: "2026-01-01"
  };
  const project = root.projectsStore.openProjectTab(projectData, true);
  await project.files.open(
    {
      sourceId: "source",
      projectId: "project",
      workspaceId: "main",
      workspacePath: "/project",
      path: "file.txt"
    },
    "Main"
  );
  project.files.active!.edit("valuable draft");
  return { root, project, request, respondToApplicationClose };
}

describe("file lifecycle protection", () => {
  it("should keep the project open when a document save fails and close only on discard", async () => {
    const { root, project } = await fixture();
    root.navigationStore.requestCloseProject(project.project.id);
    root.navigationStore.confirmCloseProject();
    expect(root.fileCloseStore.documents).toHaveLength(1);
    await root.fileCloseStore.save();
    expect(root.navigationStore.activeProjectStore).toBe(project);
    expect(project.files.active?.content).toBe("valuable draft");
    root.fileCloseStore.discard();
    expect(root.navigationStore.activeProjectStore).toBeNull();
    expect(project.files.documents.size).toBe(0);
  });

  it("should defer native application close until document confirmation", async () => {
    const { root, respondToApplicationClose } = await fixture();
    root.respondToApplicationClose(true);
    expect(respondToApplicationClose).not.toHaveBeenCalled();
    root.fileCloseStore.cancel();
    expect(respondToApplicationClose).toHaveBeenCalledWith(false);
    root.respondToApplicationClose(true);
    root.fileCloseStore.discard();
    expect(respondToApplicationClose).toHaveBeenLastCalledWith(true);
  });

  it("should not start installing an update while modified files await confirmation", async () => {
    const { root, request } = await fixture();
    root.appUpdateStore.state = { ...root.appUpdateStore.state, isSupported: true, status: "downloaded" };
    root.appUpdateStore.install();
    expect(root.appUpdateStore.state.status).toBe("downloaded");
    expect(request.mock.calls.some(([request]) => request.type === "app.update.install")).toBe(false);
    root.fileCloseStore.cancel();
    expect(root.fileCloseStore.documents).toHaveLength(0);
  });

  it("should retain files and chat drafts when navigating between central views", async () => {
    const { root, project } = await fixture();
    const document = project.files.active!;
    project.drafts.create("/project", "main");
    const chat = project.selectedChat!;
    chat.composer.setDraft("unfinished chat message", "unfinished chat message", []);
    project.files.show(document.id);
    expect(project.files.isVisible).toBe(true);
    project.openThread(chat.thread.id);
    expect(project.files.isVisible).toBe(false);
    expect(project.selectedChat).toBe(chat);
    expect(chat.composer.draft).toBe("unfinished chat message");
    expect(document.content).toBe("valuable draft");
    expect(root.hasPendingProjectActivity).toBe(true);
  });
});
