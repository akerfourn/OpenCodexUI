import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DapConnection } from "../src/backend/debug/DapConnection.js";

/** Socket double tests framing without opening ports or relying on real time. */
function fixture() {
  const socket = Object.assign(new EventEmitter(), { write: vi.fn(), destroy: vi.fn() });
  const connection = new DapConnection(socket as unknown as Socket, 100);
  return { connection, socket };
}
/** Encodes byte lengths rather than character counts for multilingual data. */
function frame(value: object): Buffer {
  const body = JSON.stringify(value);
  return Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}
afterEach(() => vi.useRealTimers());
describe("DAP transport", () => {
  test("decodes split UTF-8 frames and matches out-of-order responses", async () => {
    const { socket, connection } = fixture();
    const first = connection.request("first");
    const second = connection.request("second");
    const response = Buffer.concat([
      frame({ seq: 2, type: "response", request_seq: 2, success: true, body: { text: "été" } }),
      frame({ seq: 3, type: "response", request_seq: 1, success: true, body: { text: "first" } })
    ]);
    socket.emit("data", response.subarray(0, 13));
    socket.emit("data", response.subarray(13, 57));
    socket.emit("data", response.subarray(57));
    await expect(second).resolves.toEqual({ text: "été" });
    await expect(first).resolves.toEqual({ text: "first" });
    connection.close();
  });
  test("rejects pending requests on timeout and ignores late responses", async () => {
    vi.useFakeTimers();
    const { socket, connection } = fixture();
    const pending = expect(connection.request("variables")).rejects.toThrow("timed out: variables");
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    socket.emit("data", frame({ seq: 2, type: "response", request_seq: 1, success: true }));
    connection.close();
    expect(vi.getTimerCount()).toBe(0);
  });
  test("returns explicit failures for unsupported reverse requests", async () => {
    const { socket, connection } = fixture();
    socket.emit("data", frame({ seq: 1, type: "request", command: "runInTerminal", arguments: {} }));
    await Promise.resolve(); await Promise.resolve();
    expect(socket.write.mock.calls[0][0]).toContain('"success":false');
    connection.close();
  });
  test("closes malformed frames and rejects all outstanding work", async () => {
    const { socket, connection } = fixture();
    const close = vi.fn(); connection.onClose = close;
    const pending = expect(connection.request("initialize")).rejects.toThrow("frame length");
    socket.emit("data", Buffer.from("Content-Length: 999999999\r\n\r\n"));
    await pending;
    connection.close();
    expect(close).toHaveBeenCalledTimes(1);
    expect(socket.destroy).toHaveBeenCalledOnce();
  });
});
