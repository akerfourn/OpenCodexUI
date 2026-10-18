import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { vi } from "vitest";
import { CodexAppServerClient, type ProcessLike } from "@open-codex-ui/codex-rpc";
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { OpenCodexClientPool } from "../src/backend/runtime/OpenCodexClientPool";

/** A source-owned JSON-RPC child with no host PID and explicit exit confirmation. */
export class SourceProcess extends EventEmitter implements ProcessLike {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid = undefined;
  killed = false;
  /** Initialization can be held to exercise cancellation of a stuck startup. */
  initialization: number | null = null;

  /** Auto-replies only to initialization; other requests stay pending until the test responds. */
  constructor(autoInitialize: boolean) {
    super();
    this.stdin.on("data", (line: Buffer) => {
      const request = JSON.parse(String(line));
      if (request.method !== "initialize") return;
      this.initialization = request.id;
      if (autoInitialize) this.ready();
    });
    this.stdin.once("finish", () => { this.emit("close", 0, null); });
  }

  /** Completes the native handshake. */
  ready(): void { this.stdout.write(JSON.stringify({ id: this.initialization, result: {} }) + "\n"); }
  /** Sends native lifecycle metadata through the real SDK parser. */
  notification(method: string, params: unknown): void { this.stdout.write(JSON.stringify({ method, params }) + "\n"); }
  /** Simulates a confirmed termination. */
  kill(): boolean {
    this.killed = true;
    this.emit("close", 0, null);
    return true;
  }
}

/** Source metadata without filesystem or executable probing. */
export function instanceSource(id = "a"): CachedSource {
  return { id, name: id, kind: "local", settings: { color: "blue", commandMode: "auto", command: null,
    openFileCommand: null, openFolderCommand: null }, createdAt: "fixed", updatedAt: "fixed",
    lastDetectedCodexVersion: null, lastDetectedCodexAt: null, lastDetectionError: null };
}

/** Uses the actual SDK and pool with deterministic fake process I/O. */
export function instancePool(autoInitialize = true) {
  const children: SourceProcess[] = [];
  const clients: CodexAppServerClient[] = [];
  const emit = vi.fn();
  const closed = vi.fn();
  const pool = new OpenCodexClientPool({
    settings: { getSettings: () => ({ defaultSourceId: "a", codexCommand: "codex", experimentalApi: true } as OpenCodexSettings) },
    appVersion: "test",
    resolveSource: async id => instanceSource(id ?? "a"),
    events: { emit },
    handleNotification: vi.fn(), handleServerRequest: vi.fn(), handleError: vi.fn(),
    handleClose: closed, handleStderr: vi.fn(),
    createClient: options => {
      const child = new SourceProcess(autoInitialize);
      const client = new CodexAppServerClient({ ...options, processFactory: () => child, requestTimeoutMs: 1_000 });
      children.push(child);
      clients.push(client);
      return client;
    }
  });
  return { pool, children, clients, emit, closed };
}
