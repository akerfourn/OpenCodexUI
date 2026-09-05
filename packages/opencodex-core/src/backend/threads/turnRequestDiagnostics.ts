import type { v2 } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexComposerReference, OpenCodexImageAttachment,
  OpenCodexThreadEventLogValue, OpenCodexTurnDiagnosticRequestInput
} from "@open-codex-ui/opencodex-protocol";
import { buildTurnDiagnosticInput } from "./turnInput.js";

/**
 * Builds content-free metadata for a turn request.
 *
 * @param text Trimmed user text.
 * @param attachments Image attachments selected by the user.
 * @param references Composer references selected by the user.
 * @param extra Additional scalar metadata for a new turn.
 * @returns Safe request metadata.
 */
export function createTurnRequestDetails(
  text: string,
  attachments: OpenCodexImageAttachment[],
  references: OpenCodexComposerReference[],
  extra: Record<string, OpenCodexThreadEventLogValue> = {}
): Record<string, OpenCodexThreadEventLogValue> {
  return {
    inputTextLength: text.length,
    attachmentCount: attachments.length,
    referenceCount: references.length,
    ...extra
  };
}

/** Builds the developer-only request record for one turn RPC call. */
export function createTurnDiagnosticRequest(
  threadId: string,
  turnId: string | null,
  text: string,
  input: v2.UserInput[],
  model: string | null,
  reasoningEffort: OpenCodexTurnDiagnosticRequestInput["reasoningEffort"],
  serviceTier: OpenCodexTurnDiagnosticRequestInput["serviceTier"],
  resumedExistingThread: boolean,
  requestType: OpenCodexTurnDiagnosticRequestInput["requestType"] = "turn.start"
): OpenCodexTurnDiagnosticRequestInput {
  return {
    requestType,
    rpcMethod: requestType === "turn.start" ? "turn/start" : "turn/steer",
    threadId,
    turnId,
    text,
    input: buildTurnDiagnosticInput(input),
    model,
    reasoningEffort,
    serviceTier,
    resumedExistingThread
  };
}
