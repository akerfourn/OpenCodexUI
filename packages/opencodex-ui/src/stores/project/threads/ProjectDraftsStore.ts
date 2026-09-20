import { makeAutoObservable, runInAction } from "mobx";
import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";
import type { ChatStore } from "../../chat/ChatStore";
import type { RootStore } from "../../RootStore";
import type { ProjectStore } from "../ProjectStore";

/** Keeps unsent conversations in memory and binds their existing composer to Codex. */
export class ProjectDraftsStore {
  /** Retains unsent conversations, including a remote identity whose first turn failed. */
  private readonly workspaceIds = new Map<string, string | undefined>();

  /** Uses the owning project for selection and source-aware routing. */
  constructor(private readonly project: ProjectStore, private readonly root: RootStore) {
    makeAutoObservable<ProjectDraftsStore, "project" | "root">(this, {
      project: false, root: false
    }, { autoBind: true });
  }

  /** Returns drafts independently of server refreshes and the archive filter. */
  get threads(): OpenCodexThread[] {
    return Array.from(this.workspaceIds.keys()).flatMap((id) => {
      const chat = this.project.chatsById.get(id);
      return chat === undefined ? [] : [chat.thread];
    });
  }

  /** Opens an empty local chat without sending any backend request. */
  create(projectPath: string, workspaceId?: string): void {
    const thread: OpenCodexThread = {
      id: `draft:${crypto.randomUUID()}`, sessionId: null, parentThreadId: null,
      codexTitle: "", customTitle: null, title: "", preview: "", model: null,
      reasoningEffort: null, projectName: this.project.project.defaultName,
      projectPath, sourceId: this.project.project.sourceId, branchName: null,
      updatedAt: new Date().toISOString(), isArchived: false, threadSource: null,
      agentNickname: null, agentRole: null, subAgentSource: null, canAcceptDirectInput: true
    };
    const chat = this.project.getOrCreateChat(thread);
    chat.isLocalDraft = true;
    this.workspaceIds.set(thread.id, workspaceId);
    if (this.project.threadListStore.isShowingArchivedThreads) {
      this.project.threadListStore.setShowingArchivedThreads(false);
    }
    this.project.upsertThread(thread);
    this.project.files.showChat();
    this.project.selectChat(thread.id);
  }

  /** Creates the remote identity once, retaining it even if the subsequent turn fails. */
  async ensureCreated(chat: ChatStore): Promise<void> {
    if (!chat.isLocalDraft) return;
    const clientDraftId = chat.thread.id;
    const workspaceId = this.workspaceIds.get(clientDraftId);
    const result = await this.root.request<{ thread: OpenCodexThread }>({
      type: "threads.create", clientDraftId, projectPath: chat.thread.projectPath,
      sourceId: chat.sourceId, ...(workspaceId === undefined ? {} : { workspaceId })
    });
    runInAction(() => { this.adopt(clientDraftId, result.thread); });
    if (chat.isLocalDraft) throw new Error("The local conversation is no longer available.");
  }

  /** Handles both early creation events and request replies without changing another selection. */
  adopt(clientDraftId: string, thread: OpenCodexThread): boolean {
    const chat = this.project.chatsById.get(clientDraftId);
    if (chat === undefined || !chat.isLocalDraft || chat.sourceId !== thread.sourceId) return false;
    const wasSelected = this.project.selectedChatId === clientDraftId;
    this.root.projectsStore.unregisterLoadedChat(chat);
    this.project.chatsById.delete(clientDraftId);
    const workspaceId = this.workspaceIds.get(clientDraftId);
    this.workspaceIds.delete(clientDraftId);
    this.project.threadListStore.removeThread(clientDraftId);
    this.workspaceIds.set(thread.id, workspaceId);
    chat.isLocalDraft = false;
    this.project.chatsById.set(thread.id, chat);
    this.project.upsertThread(thread);
    if (wasSelected) this.project.selectChat(thread.id);
    return true;
  }

  /** Changes a draft's physical context locally, before any Codex identity exists. */
  selectWorkspace(threadId: string, workspaceId: string): void {
    const chat = this.project.chatsById.get(threadId);
    const workspace = this.project.workspaces.workspaces.find((item) => item.id === workspaceId);
    if (chat?.isLocalDraft !== true || chat.composer.isSubmitting || workspace === undefined
      || workspace.removedAt !== null) return;
    this.workspaceIds.set(threadId, workspaceId);
    this.project.upsertThread({ ...chat.thread, projectPath: workspace.path });
  }

  /** Releases a discarded draft without touching Codex. */
  forget(threadId: string): void { this.workspaceIds.delete(threadId); }

  /** Drops memory-only metadata when the owning project closes. */
  clear(): void { this.workspaceIds.clear(); }
}
