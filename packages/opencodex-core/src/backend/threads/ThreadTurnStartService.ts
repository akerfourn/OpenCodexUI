import type { WorkspaceExecutionReservation } from "@open-codex-ui/opencodex-cache";
import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexComposerReference, OpenCodexImageAttachment, OpenCodexMessage,
  OpenCodexReasoningEffort, OpenCodexTurnExecutionMetadata
} from "@open-codex-ui/opencodex-protocol";
import { readObject, readString } from "../../mapping.js";
import { toError } from "../shared/errors.js";
import type { ThreadTurnActionsServiceOptions } from "./ThreadTurnActionsService.js";
import { buildTurnInput, createId } from "./turnInput.js";
import { createTurnDiagnosticRequest, createTurnRequestDetails } from "./turnRequestDiagnostics.js";
import { resumeThreadForTurn, shouldResumeThreadBeforeTurn } from "./threadTurnPreparation.js";

/** Dependencies for starting turns; rollback and live item mutation stay with the action service. */
type ThreadTurnStartServiceOptions = Pick<ThreadTurnActionsServiceOptions,
  "workspaceExecution" | "backendOptions" | "threadTurnCache" | "threadCacheService" |
  "settings" | "events" | "clients" | "projects" | "threadCreationService" | "sourceResolver">;

/** Owns implicit thread creation, guarded submission and start diagnostics. */
export class ThreadTurnStartService {
  /** Shares runtime collaborators without introducing independent execution state. */
  constructor(private readonly options: ThreadTurnStartServiceOptions) {}

  /**
   * Starts a user turn, creating a thread first when needed.
   *
   * @param threadId Thread identifier, or `null` to create a thread.
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   * @param text User text.
   * @param attachments Image attachments.
   * @param references Composer references.
   * @param model Optional model override.
   * @param reasoningEffort Optional reasoning effort override.
   * @param serviceTier Optional service tier override.
   * @param shouldResumeExistingThread Whether an existing thread should resume first.
   *
   * @returns Thread and turn identifiers.
   */
  async startTurn(
    threadId: string | null,
    projectPath: string | null,
    sourceId: string | null,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[],
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    serviceTier: string | null,
    shouldResumeExistingThread = true,
    workspaceId: string | null = null
  ): Promise<{ threadId: string; turnId: string }> {
    const trimmedText = text.trim();
    const input = buildTurnInput(trimmedText, attachments, references);

    if (input.length === 0) {
      return { threadId: threadId ?? "", turnId: "" };
    }

    if (this.options.workspaceExecution !== undefined) {
      return await this.options.workspaceExecution.run(
        { threadId, projectPath, sourceId, workspaceId },
        async (reservation) => await this.startReservedTurn(
          threadId, reservation.cwd, reservation.sourceId, text, attachments,
          references, model, reasoningEffort, serviceTier, shouldResumeExistingThread, reservation
        )
      );
    }
    if (workspaceId !== null) {
      throw new Error("Workspace executions require a cache repository.");
    }
    return await this.startReservedTurn(threadId, projectPath, sourceId, text,
      attachments, references, model, reasoningEffort, serviceTier, shouldResumeExistingThread);
  }

  /** Starts a turn inside the caller's reserved context, or the legacy cacheless path. */
  private async startReservedTurn(
    threadId: string | null,
    projectPath: string | null,
    sourceId: string | null,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[],
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    serviceTier: string | null,
    shouldResumeExistingThread: boolean,
    reservation?: WorkspaceExecutionReservation
  ): Promise<{ threadId: string; turnId: string }> {
    const trimmedText = text.trim();
    const input = buildTurnInput(trimmedText, attachments, references);
    const targetSourceId = threadId === null || reservation !== undefined
      ? sourceId
      : await this.options.sourceResolver.resolveThreadSourceId(threadId, sourceId);

    if (targetSourceId === null) {
      throw new Error("Cannot start a turn for a project without a Codex source.");
    }

    const resolvedSource = await this.options.projects.resolveSource(targetSourceId);
    const client = await this.options.clients.ensureClient(resolvedSource.id);
    const targetThreadId = threadId ?? (
      await this.createThreadAndReturnId(client, projectPath, resolvedSource.id)
    );
    if (reservation !== undefined) {
      await this.options.workspaceExecution!.bind(reservation, targetThreadId);
    }
    let resumedExistingThread = false;

    if (
      threadId !== null &&
      shouldResumeExistingThread &&
      shouldResumeThreadBeforeTurn(this.options.threadTurnCache, targetThreadId)
    ) {
      await resumeThreadForTurn(client, targetThreadId, projectPath, this.options.backendOptions.projectPath, model);
      resumedExistingThread = true;
    }

    const message: OpenCodexMessage = {
      id: createId("user"),
      threadId: targetThreadId,
      role: "user",
      content: trimmedText,
      status: "completed",
      createdAt: new Date().toISOString(),
      attachments
    };

    const requestedReasoningEffort = reasoningEffort ??
      this.options.settings.getSettings().defaultReasoningEffort;
    const diagnosticId = this.options.events.recordTurnDiagnosticRequest?.(
      resolvedSource.id,
      targetThreadId,
      createTurnDiagnosticRequest(
        targetThreadId,
        null,
        trimmedText,
        input,
        model,
        requestedReasoningEffort,
        serviceTier,
        resumedExistingThread
      )
    ) ?? null;

    this.options.events.emit({
      type: "message.started",
      sourceId: resolvedSource.id,
      threadId: targetThreadId,
      message
    });

    this.options.events.recordClientRequest(
      resolvedSource.id,
      targetThreadId,
      "turn.start",
      null,
      createTurnRequestDetails(trimmedText, attachments, references, {
        model: model ?? null,
        reasoningEffort: requestedReasoningEffort,
        serviceTier: serviceTier ?? null
      })
    );

    let turnResponse: unknown;

    try {
      if (reservation !== undefined) {
        await this.options.workspaceExecution!.submitting(reservation);
      }
      turnResponse = await client.startTurn({
        threadId: targetThreadId,
        // A loaded thread may skip resume; apply explicit paths at the turn boundary.
        cwd: normalizeProjectPath(projectPath) ?? undefined,
        input,
        model,
        serviceTier,
        effort: requestedReasoningEffort
      });
    } catch (error) {
      if (diagnosticId !== null) {
        this.options.events.recordTurnDiagnosticResponse?.(
          diagnosticId,
          null,
          toError(error).message
        );
      }

      throw error;
    }
    const turn = readObject(readObject(turnResponse).turn);
    const turnId = readString(turn.id);
    if (reservation !== undefined) {
      await this.options.workspaceExecution!.acknowledge(reservation, turnId);
    }

    if (diagnosticId !== null) {
      this.options.events.recordTurnDiagnosticResponse?.(
        diagnosticId,
        turnId.length > 0 ? turnId : null,
        turnId.length > 0 ? null : "Codex returned no turn id."
      );
    }

    if (turnId.length > 0) {
      const currentThread = this.options.threadTurnCache.get(targetThreadId)?.thread;
      const execution: OpenCodexTurnExecutionMetadata = {
        requestedModel: model,
        effectiveModel: model ?? currentThread?.model ?? null,
        requestedReasoningEffort,
        effectiveReasoningEffort: requestedReasoningEffort,
        serviceTier: serviceTier ?? null
      };

      await this.options.threadCacheService.writeTurnExecutionMetadata(
        resolvedSource.id,
        targetThreadId,
        turnId,
        execution
      );
      this.options.events.emit({
        type: "turn.started",
        sourceId: resolvedSource.id,
        threadId: targetThreadId,
        turnId
      });
    }

    return { threadId: targetThreadId, turnId };
  }

  /**
   * Creates a thread and returns its identifier.
   *
   * @param client Codex client.
   * @param projectPath Project path.
   * @param sourceId Source identifier.
   *
   * @returns Created thread identifier.
   */
  private async createThreadAndReturnId(
    client: CodexAppServerClient,
    projectPath: string | null,
    sourceId: string
  ): Promise<string> {
    const thread = await this.options.threadCreationService.create(
      client,
      projectPath,
      sourceId
    );

    this.options.threadTurnCache.getOrCreate(thread);
    await this.options.threadCacheService.writeIndex([thread]);
    this.options.events.emit({ type: "thread.created", thread, turns: [] });
    return thread.id;
  }

}
