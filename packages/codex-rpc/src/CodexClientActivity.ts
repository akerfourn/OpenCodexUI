import { isRecord } from "./events";
import type { CodexClientActivitySnapshot, CodexNotification, JsonRpcId } from "./types";

/** These metadata reads can be cancelled without interrupting user work. Unknown methods stay protected. */
const PASSIVE_REQUESTS = new Set([
  "account/read", "account/rateLimits/read", "app/list", "config/read", "configRequirements/read",
  "mcpServerStatus/list", "model/list", "plugin/list", "skills/list",
  "thread/list", "thread/loaded/list", "thread/read"
]);

/** Content-free request identity used to settle overlapping requests and order native status changes. */
interface ActivityRequest {
  readonly method: string;
  readonly interruptsWork: boolean;
  readonly threadSequence: number;
}

/** Tracks interruptible work, approvals, agent turns and processes without treating metadata polling as work. */
export class CodexClientActivity {
  /** Pending request identities; passive reads remain tracked only to reject stale response metadata. */
  private readonly requests = new Set<ActivityRequest>();
  /** Server requests awaiting an answer. */
  private readonly approvals = new Set<JsonRpcId>();
  /** Turn identities remain active after turn/start returns. */
  private readonly turns = new Map<string, string>();
  /** Completion notifications observed while RPC responses may still be in flight. */
  private readonly completedTurns = new Set<string>();
  /** Live thread statuses also detect work resumed from another connection. */
  private readonly threads = new Set<string>();
  /** Native lifecycle events take precedence over responses to earlier requests. */
  private readonly threadSequences = new Map<string, number>();
  /** Monotonic lifecycle generation, independent of wall-clock time. */
  private threadSequence = 0;
  /** Spawned processes remain active until process/exited. */
  private readonly processes = new Set<string>();
  /** Last boolean sent to the observer avoids per-token event traffic. */
  private reported = false;
  /** Deduplicates content-free reason changes without suppressing changes inside a busy period. */
  private reportedDetails: string | null = null;

  /** Receives only activity transitions, never request bodies or streamed text. */
  constructor(
    private readonly onChange?: (active: boolean) => void,
    private readonly onDetailsChange?: (activity: CodexClientActivitySnapshot) => void
  ) {}

  /** Explains activity using method names and counts; no prompts, commands, paths or response bodies. */
  get snapshot(): CodexClientActivitySnapshot {
    const requestMethods = [...this.requests]
      .filter(request => request.interruptsWork)
      .map(request => request.method)
      .sort();
    return { requestMethods, turnCount: this.turns.size, threadCount: this.threads.size,
      approvalCount: this.approvals.size, processCount: this.processes.size };
  }

  /** Whether stopping the connection could interrupt work. */
  get active(): boolean {
    const hasWorkRequest = [...this.requests].some(request => request.interruptsWork);
    return hasWorkRequest || this.approvals.size > 0 || this.turns.size > 0
      || this.threads.size > 0 || this.processes.size > 0;
  }

  /** Records requests before writing them, including process starts that reply immediately. */
  begin(method: string, params: unknown): ActivityRequest {
    const request = { method, interruptsWork: !PASSIVE_REQUESTS.has(method), threadSequence: this.threadSequence };
    this.requests.add(request);
    if (method === "process/spawn" && isRecord(params) && typeof params.processHandle === "string") {
      this.processes.add(params.processHandle);
    }
    this.report();
    return request;
  }

  /** Records resumed live state before releasing the request's activity guard. */
  finish(request: ActivityRequest, result: unknown, params?: unknown): void {
    if (isRecord(result) && isRecord(result.thread)) {
      const id = result.thread.id;
      if (typeof id === "string" && !this.hasNewerThreadEvent(id, request)) {
        this.trackThread(id, result.thread.status);
      }
    }
    if (isRecord(result) && isRecord(result.turn) && typeof result.turn.id === "string"
      && result.turn.status === "inProgress" && !this.completedTurns.has(result.turn.id)) {
      let threadId = "";
      if (isRecord(params) && typeof params.threadId === "string") threadId = params.threadId;
      if (typeof result.reviewThreadId === "string") threadId = result.reviewThreadId;
      const wasMadeIdle = this.hasNewerThreadEvent(threadId, request)
        && !this.threads.has(threadId) && !this.hasTurn(threadId);
      if (!wasMadeIdle) this.turns.set(result.turn.id, threadId);
    }
    this.requests.delete(request);
    if (this.requests.size === 0) {
      this.completedTurns.clear();
      this.threadSequences.clear();
    }
    this.report();
  }

  /** A rejected spawn is safe to forget only when Codex explicitly refused it. */
  refusedSpawn(method: string, params: unknown): void {
    if (method === "process/spawn" && isRecord(params) && typeof params.processHandle === "string") {
      this.processes.delete(params.processHandle);
    }
  }

  /** Tracks approval prompts even when no turn notification accompanied them. */
  requestApproval(id: JsonRpcId): void {
    this.approvals.add(id);
    this.report();
  }

  /** Releases approval activity after a response or native resolution notification. */
  resolveApproval(id: JsonRpcId): void {
    this.approvals.delete(id);
    this.report();
  }

  /** Reads only lifecycle metadata; streamed content never drives the pulse. */
  notification(notification: CodexNotification): void {
    if (!isRecord(notification.params)) {
      return;
    }
    const params = notification.params;
    const threadId = typeof params.threadId === "string" ? params.threadId : "";
    if (notification.method === "turn/started" && isRecord(params.turn) && typeof params.turn.id === "string") {
      this.recordThreadEvent(threadId);
      this.turns.set(params.turn.id, threadId);
    } else if (notification.method === "turn/completed" && isRecord(params.turn) && typeof params.turn.id === "string") {
      this.recordThreadEvent(threadId);
      this.turns.delete(params.turn.id);
      if (!this.hasTurn(threadId)) this.threads.delete(threadId);
      if (this.requests.size > 0) this.completedTurns.add(params.turn.id);
    } else if (notification.method === "thread/status/changed") {
      this.recordThreadEvent(threadId);
      this.trackThread(threadId, params.status);
    } else if (notification.method === "thread/closed") {
      this.recordThreadEvent(threadId);
      this.clearThread(threadId);
    } else if (notification.method === "process/exited" && typeof params.processHandle === "string") {
      this.processes.delete(params.processHandle);
    } else if (notification.method === "serverRequest/resolved"
      && (typeof params.requestId === "string" || typeof params.requestId === "number")) {
      this.approvals.delete(params.requestId);
    } else {
      return;
    }
    this.report();
  }

  /** Releases metadata when the process has actually closed. */
  clear(): void {
    this.turns.clear();
    this.completedTurns.clear();
    this.threads.clear();
    this.threadSequences.clear();
    this.approvals.clear();
    this.processes.clear();
    this.report();
  }

  /** Treats a native active status as busy until an idle/not-loaded status arrives. */
  private trackThread(id: unknown, status: unknown): void {
    if (typeof id !== "string" || !isRecord(status)) {
      return;
    }
    if (status.type === "active") {
      this.threads.add(id);
    } else {
      this.threads.delete(id);
      if (status.type === "idle") this.clearThread(id);
    }
  }

  /** Releases stale activity when native completion, idle or close confirms that a thread stopped working. */
  private clearThread(threadId: string): void {
    this.threads.delete(threadId);
    for (const [turnId, owner] of this.turns) {
      if (owner !== threadId) continue;
      this.turns.delete(turnId);
      if (this.requests.size > 0) this.completedTurns.add(turnId);
    }
  }

  /** Keeps other known turns protected if a completion belongs to an earlier turn on the same thread. */
  private hasTurn(threadId: string): boolean {
    return [...this.turns.values()].some(owner => owner === threadId);
  }

  /** Records only generations needed by currently pending responses. */
  private recordThreadEvent(threadId: string): void {
    this.threadSequence += 1;
    if (this.requests.size > 0) this.threadSequences.set(threadId, this.threadSequence);
  }

  /** A native event after request submission is more current than that request's response snapshot. */
  private hasNewerThreadEvent(threadId: string, request: ActivityRequest): boolean {
    return (this.threadSequences.get(threadId) ?? 0) > request.threadSequence;
  }

  /** Publishes boolean transitions and changing reasons, never streamed content. */
  private report(): void {
    if (this.active !== this.reported) {
      this.reported = this.active;
      this.onChange?.(this.reported);
    }
    if (this.onDetailsChange === undefined) return;
    const snapshot = this.snapshot;
    const serialized = JSON.stringify(snapshot);
    if (serialized === this.reportedDetails) return;
    this.reportedDetails = serialized;
    this.onDetailsChange(snapshot);
  }
}
