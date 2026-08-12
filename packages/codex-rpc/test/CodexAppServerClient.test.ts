/**
 * Covers the JSON-RPC parsing helpers and the Codex app-server client lifecycle.
 */
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { CodexAppServerClient } from "../src/CodexAppServerClient";
import { parseJsonRpcLine } from "../src/events";
import { JsonRpcError } from "../src/types";
import type { ProcessLike } from "../src/types";

/**
 * Simulates a child process compatible with the Codex transport abstraction used in tests.
 */
class FakeProcess extends EventEmitter implements ProcessLike {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid = 1234;
  killed = false;

  /**
   * Simulates terminating the child process and emits a close event.
   *
   * @returns `true` to mirror the child-process kill contract.
   */
  kill(): boolean {
    this.killed = true;
    this.emit("close", 0, null);
    return true;
  }
}

describe("parseJsonRpcLine", () => {
  it("should parse a valid Codex app-server line", () => {
    expect(parseJsonRpcLine('{"id":1,"result":{"ok":true}}')).toEqual({
      id: 1,
      result: { ok: true }
    });
  });

  it("should still accept a JSON-RPC 2.0 line", () => {
    expect(parseJsonRpcLine('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}')).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { ok: true }
    });
  });

  it("should reject an invalid JSON line", () => {
    expect(() => parseJsonRpcLine("{invalid")).toThrow();
  });
});

describe("CodexAppServerClient", () => {
  it("should start concurrently with one process and one initialization handshake", async () => {
    const fakeProcess = new FakeProcess();
    const processFactory = vi.fn(() => fakeProcess);
    const client = new CodexAppServerClient({
      processFactory,
      requestTimeoutMs: 100
    });
    let initializationCount = 0;

    respondToRequests(fakeProcess, (request) => {
      if (request.method === "initialize") {
        initializationCount += 1;
        fakeProcess.stdout.write(`{"id":${request.id},"result":{}}\n`);
      }
    });

    await Promise.all([client.start(), client.start()]);

    expect(processFactory).toHaveBeenCalledOnce();
    expect(initializationCount).toBe(1);
  });

  it("should correlate requests with responses by id", async () => {
    const fakeProcess = new FakeProcess();
    const client = createClient(fakeProcess);

    respondToRequests(fakeProcess, (request) => {
      fakeProcess.stdout.write(
        `${JSON.stringify({
          id: request.id,
          result: request.method === "initialize" ? {} : { method: request.method }
        })}\n`
      );
    });

    await client.start();
    await expect(client.request("demo/method")).resolves.toEqual({ method: "demo/method" });
  });

  it("should send configured client info during initialization", async () => {
    const fakeProcess = new FakeProcess();
    const client = new CodexAppServerClient({
      processFactory: () => fakeProcess,
      requestTimeoutMs: 100,
      clientInfo: {
        name: "OpenCodexUI",
        version: "1.3.0"
      }
    });
    const requests: Record<string, unknown>[] = [];

    respondToRequests(fakeProcess, (request) => {
      requests.push(request);

      if (request.id !== undefined) {
        fakeProcess.stdout.write(`{"id":${request.id},"result":{}}\n`);
      }
    });

    await client.start();

    expect(requests[0]).toEqual(expect.objectContaining({
      method: "initialize",
      params: expect.objectContaining({
        clientInfo: {
          name: "OpenCodexUI",
          version: "1.3.0"
        },
        capabilities: {
          experimentalApi: true,
          requestAttestation: false
        }
      })
    }));
  });

  it("should dispatch server notifications", async () => {
    const fakeProcess = new FakeProcess();
    const client = createClient(fakeProcess);
    const notificationSpy = vi.fn();

    respondToInitialize(fakeProcess);
    client.onNotification(notificationSpy);

    await client.start();
    fakeProcess.stdout.write('{"method":"thread/started","params":{"threadId":"t1"}}\n');

    expect(notificationSpy).toHaveBeenCalledWith({
      method: "thread/started",
      params: { threadId: "t1" }
    });
  });

  it("should dispatch server requests with their id and method", async () => {
    const fakeProcess = new FakeProcess();
    const client = createClient(fakeProcess);
    const serverRequestSpy = vi.fn();

    respondToInitialize(fakeProcess);
    client.onServerRequest(serverRequestSpy);

    await client.start();
    fakeProcess.stdout.write(
      '{"jsonrpc":"2.0","id":"server-1","method":"approval/request",' +
      '"params":{"command":"npm test"}}\n'
    );

    expect(serverRequestSpy).toHaveBeenCalledWith({
      id: "server-1",
      method: "approval/request",
      params: { command: "npm test" }
    });
  });

  it("should preserve JSON-RPC error details in JsonRpcError", async () => {
    const fakeProcess = new FakeProcess();
    const client = createClient(fakeProcess);

    respondToRequests(fakeProcess, (request) => {
      if (request.method === "initialize") {
        fakeProcess.stdout.write(`{"id":${request.id},"result":{}}\n`);
        return;
      }

      fakeProcess.stdout.write(`${JSON.stringify({
        id: request.id,
        error: {
          code: -32042,
          message: "Permission denied",
          data: { reason: "policy" }
        }
      })}\n`);
    });

    await client.start();
    const requestPromise = client.request("protected/method");

    await expect(requestPromise).rejects.toBeInstanceOf(JsonRpcError);
    await expect(requestPromise).rejects.toMatchObject({
      message: "Permission denied",
      code: -32042,
      data: { reason: "policy" }
    });
  });

  it("should trim stderr before sending it to the logger and callback", async () => {
    const fakeProcess = new FakeProcess();
    const logger = vi.fn();
    const stderr = vi.fn();
    const client = new CodexAppServerClient({
      processFactory: () => fakeProcess,
      requestTimeoutMs: 100,
      logger,
      stderr
    });

    respondToInitialize(fakeProcess);

    await client.start();
    fakeProcess.stderr.write("  warning from app-server  \n");

    expect(logger).toHaveBeenCalledWith("[codex stderr] warning from app-server");
    expect(stderr).toHaveBeenCalledWith("warning from app-server");
  });

  it("should emit errors for invalid JSONL messages", async () => {
    const fakeProcess = new FakeProcess();
    const client = createClient(fakeProcess);
    const errorSpy = vi.fn();

    respondToInitialize(fakeProcess);
    client.onError(errorSpy);

    await client.start();
    fakeProcess.stdout.write("{invalid\n");

    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it("should kill the process when stopped", async () => {
    const fakeProcess = new FakeProcess();
    const client = createClient(fakeProcess);

    respondToInitialize(fakeProcess);

    await client.start();
    await client.stop();

    expect(fakeProcess.killed).toBe(true);
  });

  it("should not emit a close event when intentionally stopped", async () => {
    const fakeProcess = new FakeProcess();
    const client = createClient(fakeProcess);
    const closeSpy = vi.fn();

    respondToInitialize(fakeProcess);
    client.onClose(closeSpy);

    await client.start();
    await client.stop();

    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("should emit external close details and reject pending requests", async () => {
    const fakeProcess = new FakeProcess();
    const client = createClient(fakeProcess);
    const closeSpy = vi.fn();

    respondToInitialize(fakeProcess);
    client.onClose(closeSpy);

    await client.start();
    const pendingRequest = client.request("never/responds");
    fakeProcess.emit("close", 17, "SIGTERM");

    await expect(pendingRequest).rejects.toThrow("Codex app-server process exited.");
    expect(closeSpy).toHaveBeenCalledWith({ code: 17, signal: "SIGTERM" });
  });

  it("should send exact JSONL for notifications and server responses", async () => {
    const fakeProcess = new FakeProcess();
    const client = createClient(fakeProcess);
    let outgoing = "";

    respondToInitialize(fakeProcess);

    await client.start();
    fakeProcess.stdin.on("data", (chunk) => {
      outgoing += String(chunk);
    });

    client.notify("demo/notify", { value: 1 });
    client.respond("request-1", { ok: true });
    client.rejectServerRequest("request-2", "not allowed");

    expect(outgoing).toBe(
      '{"jsonrpc":"2.0","method":"demo/notify","params":{"value":1}}\n' +
      '{"jsonrpc":"2.0","id":"request-1","result":{"ok":true}}\n' +
      '{"jsonrpc":"2.0","id":"request-2","error":{"code":-32000,"message":"not allowed"}}\n'
    );
  });

  it("should reject a request when the response times out", async () => {
    const fakeProcess = new FakeProcess();
    const client = createClient(fakeProcess, 10);

    respondToRequests(fakeProcess, (request) => {
      if (request.method === "initialize") {
        fakeProcess.stdout.write(`{"id":${request.id},"result":{}}\n`);
      }
    });

    await client.start();
    await expect(client.request("never/responds")).rejects.toThrow(
      "Timed out waiting for response to never/responds."
    );
  });

  it("should request full turn items through the generated endpoint", async () => {
    const fakeProcess = new FakeProcess();
    const client = createClient(fakeProcess);

    respondToRequests(fakeProcess, (request) => {
      fakeProcess.stdout.write(
        `${JSON.stringify({
          id: request.id,
          result: request.method === "initialize"
            ? {}
            : { method: request.method, params: request.params }
        })}\n`
      );
    });

    await client.start();

    await expect(client.listThreadTurnItems({
      threadId: "thread-1",
      turnId: "turn-1",
      sortDirection: "asc"
    })).resolves.toEqual({
      method: "thread/items/list",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        sortDirection: "asc"
      }
    });
  });
});

/**
 * Creates a client wired to the provided fake process.
 *
 * @param fakeProcess Fake transport process used by the tests.
 * @param requestTimeoutMs Request timeout configured for the client.
 * @returns Client instance ready to be started by the test.
 */
function createClient(fakeProcess: FakeProcess, requestTimeoutMs = 100): CodexAppServerClient {
  return new CodexAppServerClient({
    processFactory: () => fakeProcess,
    requestTimeoutMs
  });
}

/**
 * Responds only to the initialization request expected during client startup.
 *
 * @param fakeProcess Fake process whose stdout is used to answer requests.
 * @returns Nothing.
 */
function respondToInitialize(fakeProcess: FakeProcess): void {
  respondToRequests(fakeProcess, (request) => {
    if (request.method === "initialize") {
      fakeProcess.stdout.write(`{"id":${request.id},"result":{}}\n`);
    }
  });
}

/**
 * Hooks the fake process stdin so each emitted request can be inspected and answered.
 *
 * @param fakeProcess Fake process whose stdin carries outgoing requests.
 * @param callback Callback invoked with each parsed request object.
 * @returns Nothing.
 */
function respondToRequests(
  fakeProcess: FakeProcess,
  callback: (request: Record<string, unknown>) => void
): void {
  let buffer = "";

  fakeProcess.stdin.on("data", (chunk) => {
    buffer += String(chunk);
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }

      callback(JSON.parse(line) as Record<string, unknown>);
    }
  });
}
