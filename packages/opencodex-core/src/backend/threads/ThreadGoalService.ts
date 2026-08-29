/** Executes source-aware operations on native Codex thread goals. */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexThreadGoal,
  OpenCodexThreadGoalPatch
} from "@open-codex-ui/opencodex-protocol";

import { mapThreadGoal } from "./threadGoalMapping.js";
import type { ThreadSourceResolver } from "./ThreadSourceResolver.js";
import type { ClientPort, RuntimeEventPort } from "../runtime/runtimePorts.js";

type ThreadGoalClient = Pick<
  CodexAppServerClient,
  "getThreadGoal" | "setThreadGoal" | "clearThreadGoal"
>;

/** Structural RPC parameters kept local to avoid leaking generated bindings. */
type ThreadGoalSetParams = OpenCodexThreadGoalPatch & { threadId: string };

/** Dependencies required to access a native goal for one source-owned thread. */
export type ThreadGoalServiceOptions = {
  /** Resolves the Codex source associated with a thread. */
  sourceResolver: Pick<ThreadSourceResolver, "resolveThreadSourceId">;
  /** Provides source-scoped app-server clients. */
  clients: Pick<ClientPort, "ensureClient">;
  /** Records safe request metadata without duplicating native notifications. */
  events: Pick<RuntimeEventPort, "recordClientRequest">;
};

/** Coordinates the native app-server goal lifecycle for a thread. */
export class ThreadGoalService {
  /** Creates a source-aware native goal service. */
  constructor(private readonly options: ThreadGoalServiceOptions) {}

  /**
   * Reads the current native goal for a thread.
   *
   * @param threadId Thread identifier.
   * @param sourceIdOverride Source supplied by the current UI route.
   * @returns Native goal, or `null` when no goal exists.
   */
  async read(
    threadId: string,
    sourceIdOverride: string | null = null
  ): Promise<OpenCodexThreadGoal | null> {
    const { sourceId, client } = await this.resolveClient(threadId, sourceIdOverride);

    this.options.events.recordClientRequest(
      sourceId,
      threadId,
      "thread.goal.get",
      null
    );

    const response = await client.getThreadGoal(threadId);
    return mapThreadGoal(response.goal, threadId);
  }

  /**
   * Creates or updates a native goal.
   *
   * @param threadId Thread identifier.
   * @param sourceIdOverride Source supplied by the current UI route.
   * @param patch Goal fields to send to Codex.
   * @returns Resulting native goal.
   */
  async set(
    threadId: string,
    sourceIdOverride: string | null,
    patch: OpenCodexThreadGoalPatch
  ): Promise<OpenCodexThreadGoal> {
    const { sourceId, client } = await this.resolveClient(threadId, sourceIdOverride);
    const params = createSetParams(threadId, patch);

    this.options.events.recordClientRequest(
      sourceId,
      threadId,
      "thread.goal.set",
      null,
      createSetRequestDetails(patch)
    );

    const response = await client.setThreadGoal(params);
    const goal = mapThreadGoal(response.goal, threadId);

    if (goal === null) {
      throw new Error("Codex returned an invalid native goal.");
    }

    // The RPC response lets the caller update its state immediately. Codex
    // separately emits `thread/goal/updated`, which the notification
    // coordinator forwards as the single cross-process UI event.
    return goal;
  }

  /**
   * Clears a native goal.
   *
   * @param threadId Thread identifier.
   * @param sourceIdOverride Source supplied by the current UI route.
   * @returns Whether a goal was cleared.
   */
  async clear(
    threadId: string,
    sourceIdOverride: string | null = null
  ): Promise<{ cleared: boolean }> {
    const { sourceId, client } = await this.resolveClient(threadId, sourceIdOverride);

    this.options.events.recordClientRequest(
      sourceId,
      threadId,
      "thread.goal.clear",
      null
    );

    const result = await client.clearThreadGoal(threadId);

    // The native `thread/goal/cleared` notification is the event source for
    // other consumers; this response only confirms the direct request.
    return { cleared: result.cleared };
  }

  /** Resolves the source and client required by one goal operation. */
  private async resolveClient(
    threadId: string,
    sourceIdOverride: string | null
  ): Promise<{ sourceId: string; client: ThreadGoalClient }> {
    const sourceId = await this.options.sourceResolver.resolveThreadSourceId(
      threadId,
      sourceIdOverride
    );

    if (sourceId === null) {
      throw new Error("Cannot manage a native goal without a Codex source.");
    }

    return {
      sourceId,
      client: await this.options.clients.ensureClient(sourceId)
    };
  }
}

/** Builds the generated RPC parameters without sending undefined fields. */
function createSetParams(
  threadId: string,
  patch: OpenCodexThreadGoalPatch
): ThreadGoalSetParams {
  const params: ThreadGoalSetParams = { threadId };

  if (patch.objective !== undefined) {
    params.objective = patch.objective;
  }

  if (patch.status !== undefined) {
    params.status = patch.status;
  }

  if (patch.tokenBudget !== undefined) {
    params.tokenBudget = patch.tokenBudget;
  }

  return params;
}

/** Creates metadata for the event log without retaining the objective text. */
function createSetRequestDetails(
  patch: OpenCodexThreadGoalPatch
): Record<string, string | number | boolean | null> {
  return {
    hasObjective: patch.objective !== undefined && patch.objective !== null,
    objectiveLength: typeof patch.objective === "string" ? patch.objective.length : 0,
    status: patch.status ?? null,
    hasTokenBudget: patch.tokenBudget !== undefined,
    tokenBudget: patch.tokenBudget ?? null
  };
}
