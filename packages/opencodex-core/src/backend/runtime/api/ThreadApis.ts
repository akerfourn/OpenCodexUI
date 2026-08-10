import type {
  OpenCodexCollaborationEvent,
  OpenCodexCollaborationQuery,
  OpenCodexComposerReference,
  OpenCodexImageAttachment,
  OpenCodexReasoningEffort,
  OpenCodexThread,
  OpenCodexThreadEventLogPage,
  OpenCodexThreadRuntimeStatus,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import type { ThreadRuntimeHandler } from "../../ThreadRuntimeHandler.js";
import type {
  CollaborationApi as CollaborationApiContract,
  EventLogApi as EventLogApiContract,
  ThreadsApi as ThreadsApiContract
} from "./PublicRuntimeApis.js";

/** Handler methods exposed by the public thread facade. */
export type ThreadsHandler = Pick<
  ThreadRuntimeHandler,
  | "listThreads"
  | "archiveThread"
  | "deleteThread"
  | "unarchiveThread"
  | "openThread"
  | "listSubAgentThreads"
  | "readThreadReadonly"
  | "loadOlderThreadMessages"
  | "recoverThread"
  | "createThread"
  | "updateThreadComposerSettings"
  | "startTurn"
  | "steerTurn"
  | "editLastTurn"
  | "interruptTurn"
  | "readThreadRuntimeStatus"
  | "startThreadReview"
  | "compactThread"
  | "renameThread"
>;

/** Handler method used by the public collaboration facade. */
export type CollaborationHandler = Pick<ThreadRuntimeHandler, "listCollaborationEvents">;

/** Handler method used by the public thread event-log facade. */
export type EventLogHandler = Pick<ThreadRuntimeHandler, "readThreadEventLog">;

/** Public thread and turn operations with service-prefixed names removed. */
export class ThreadsApi implements ThreadsApiContract {
  /** Thread handler used to execute each operation. */
  private readonly handler: ThreadsHandler;

  /**
   * Creates a thread facade.
   *
   * @param handler Handler that owns thread and turn operations.
   */
  constructor(handler: ThreadsHandler) {
    this.handler = handler;
  }

  /** Lists threads in the requested scope. */
  async list(
    scope: "currentProject" | "all",
    projectPath: string | null,
    sourceId: string | null,
    searchTerm?: string,
    isArchived = false
  ): Promise<OpenCodexThread[]> {
    return await this.handler.listThreads(scope, projectPath, sourceId, searchTerm, isArchived);
  }

  /** Archives a thread. */
  async archive(threadId: string): Promise<{ ok: true }> {
    return await this.handler.archiveThread(threadId);
  }

  /** Permanently deletes a thread. */
  async delete(threadId: string): Promise<{ ok: true }> {
    return await this.handler.deleteThread(threadId);
  }

  /** Restores an archived thread. */
  async restore(threadId: string): Promise<{ ok: true }> {
    return await this.handler.unarchiveThread(threadId);
  }

  /** Opens a thread and loads its current turns. */
  async open(
    threadId: string,
    sourceId: string | null = null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.handler.openThread(threadId, sourceId);
  }

  /** Lists sub-agent threads spawned by a parent thread. */
  async listSubAgents(
    parentThreadId: string,
    sourceId: string | null
  ): Promise<OpenCodexThread[]> {
    return await this.handler.listSubAgentThreads(parentThreadId, sourceId);
  }

  /** Reads a thread without changing selection state. */
  async readReadonly(
    threadId: string,
    sourceId: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.handler.readThreadReadonly(threadId, sourceId);
  }

  /** Loads older messages for a thread. */
  async loadOlderMessages(
    threadId: string
  ): Promise<{ turns: OpenCodexTurn[]; hasMoreOlderMessages: boolean }> {
    return await this.handler.loadOlderThreadMessages(threadId);
  }

  /** Recovers a thread after a recoverable process error. */
  async recover(threadId: string): Promise<{ ok: true }> {
    return await this.handler.recoverThread(threadId);
  }

  /** Creates a thread in a project. */
  async create(
    projectPath: string | null,
    sourceId: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.handler.createThread(projectPath, sourceId);
  }

  /** Persists composer settings for a thread. */
  async updateComposerSettings(
    threadId: string,
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null
  ): Promise<void> {
    await this.handler.updateThreadComposerSettings(threadId, model, reasoningEffort);
  }

  /** Starts a user turn. */
  async startTurn(
    threadId: string | null,
    projectPath: string | null,
    sourceId: string | null,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[],
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    serviceTier: string | null
  ): Promise<{ threadId: string; turnId: string }> {
    return await this.handler.startTurn(
      threadId,
      projectPath,
      sourceId,
      text,
      attachments,
      references,
      model,
      reasoningEffort,
      serviceTier
    );
  }

  /** Steers a running turn. */
  async steerTurn(
    threadId: string,
    turnId: string,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[]
  ): Promise<{ threadId: string; turnId: string }> {
    return await this.handler.steerTurn(threadId, turnId, text, attachments, references);
  }

  /** Rolls back the last turn and starts edited input. */
  async editLastTurn(
    threadId: string,
    projectPath: string | null,
    sourceId: string | null,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[],
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    serviceTier: string | null
  ): Promise<{ threadId: string }> {
    return await this.handler.editLastTurn(
      threadId,
      projectPath,
      sourceId,
      text,
      attachments,
      references,
      model,
      reasoningEffort,
      serviceTier
    );
  }

  /** Interrupts a running turn. */
  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this.handler.interruptTurn(threadId, turnId);
  }

  /** Reads the runtime status for a thread. */
  async readRuntimeStatus(threadId: string): Promise<OpenCodexThreadRuntimeStatus> {
    return await this.handler.readThreadRuntimeStatus(threadId);
  }

  /** Starts an inline review for a thread. */
  async startReview(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    return await this.handler.startThreadReview(threadId, projectPath);
  }

  /** Starts context compaction for a thread. */
  async compact(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    return await this.handler.compactThread(threadId, projectPath);
  }

  /** Renames a thread. */
  async rename(threadId: string, name: string): Promise<void> {
    await this.handler.renameThread(threadId, name);
  }
}

/** Public collaboration-event queries. */
export class CollaborationApi implements CollaborationApiContract {
  /** Thread handler used to query collaboration events. */
  private readonly handler: CollaborationHandler;

  /**
   * Creates a collaboration facade.
   *
   * @param handler Handler that owns collaboration-event queries.
   */
  constructor(handler: CollaborationHandler) {
    this.handler = handler;
  }

  /** Lists normalized collaboration events. */
  async list(query: OpenCodexCollaborationQuery): Promise<OpenCodexCollaborationEvent[]> {
    return await this.handler.listCollaborationEvents(query);
  }
}

/** Public bounded thread event-log queries. */
export class EventLogApi implements EventLogApiContract {
  /** Thread handler used to read the event journal. */
  private readonly handler: EventLogHandler;

  /**
   * Creates an event-log facade.
   *
   * @param handler Handler that owns the event journal boundary.
   */
  constructor(handler: EventLogHandler) {
    this.handler = handler;
  }

  /** Reads the bounded event trace for one thread. */
  read(threadId: string, sourceId: string | null, limit: number): OpenCodexThreadEventLogPage {
    return this.handler.readThreadEventLog(threadId, sourceId, limit);
  }
}
