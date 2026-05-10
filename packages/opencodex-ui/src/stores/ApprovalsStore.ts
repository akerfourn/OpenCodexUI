import { makeAutoObservable } from "mobx";

import type {
  OpenCodexApproval,
  OpenCodexApprovalDecision,
  OpenCodexEvent
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "./ChatStore";
import type { RootStore } from "./RootStore";
import type { RootChildStore } from "./RootChildStore";

export class ApprovalsStore implements RootChildStore {
  unassignedApprovals: OpenCodexApproval[] = [];

  constructor(private readonly root: RootStore) {
    makeAutoObservable<ApprovalsStore, "root">(this, { root: false });
  }

  get currentApproval(): OpenCodexApproval | null {
    const activeChatApproval = this.root.activeChatStore?.currentApproval ?? null;

    if (activeChatApproval !== null) {
      return activeChatApproval;
    }

    const anyChatApproval = this.findAnyChatApproval();

    if (anyChatApproval !== null) {
      return anyChatApproval;
    }

    return this.unassignedApprovals[0] ?? null;
  }

  handleEvent(event: OpenCodexEvent): void {
    switch (event.type) {
      case "approval.requested":
        this.addApproval(event.approval);
        return;
      case "approval.resolved":
        this.removeApproval(event.approvalId);
        return;
      default:
        return;
    }
  }

  resolveApproval(approvalId: string, decision: OpenCodexApprovalDecision): void {
    void this.root.request({ type: "approval.respond", approvalId, decision });
  }

  attachPendingApprovalsToChat(chatStore: ChatStore): void {
    const chatApprovals = this.unassignedApprovals.filter(
      (approval) => approval.threadId === chatStore.thread.id
    );

    if (chatApprovals.length === 0) {
      return;
    }

    for (const approval of chatApprovals) {
      chatStore.addApproval(approval);
    }

    this.unassignedApprovals = this.unassignedApprovals.filter(
      (approval) => approval.threadId !== chatStore.thread.id
    );
  }

  private addApproval(approval: OpenCodexApproval): void {
    const chatStore = approval.threadId === undefined
      ? null
      : this.root.projectsStore.findChatStoreByThreadId(approval.threadId);

    if (chatStore !== null) {
      chatStore.addApproval(approval);
      return;
    }

    this.upsertUnassignedApproval(approval);
  }

  private removeApproval(approvalId: string): void {
    this.unassignedApprovals = this.unassignedApprovals.filter(
      (approval) => approval.id !== approvalId
    );

    for (const projectStore of this.root.projectsStore.projectStoresById.values()) {
      for (const chatStore of projectStore.chatsById.values()) {
        chatStore.removeApproval(approvalId);
      }
    }
  }

  private upsertUnassignedApproval(approval: OpenCodexApproval): void {
    const existingIndex = this.unassignedApprovals.findIndex(
      (entry) => entry.id === approval.id
    );

    if (existingIndex === -1) {
      this.unassignedApprovals.push(approval);
      return;
    }

    this.unassignedApprovals.splice(existingIndex, 1, approval);
  }

  private findAnyChatApproval(): OpenCodexApproval | null {
    for (const projectStore of this.root.projectsStore.projectStoresById.values()) {
      for (const chatStore of projectStore.chatsById.values()) {
        const approval = chatStore.currentApproval;

        if (approval !== null) {
          return approval;
        }
      }
    }

    return null;
  }
}
