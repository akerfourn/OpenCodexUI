import { connect, type Socket } from "node:net";

export interface DapEvent { event: string; body?: Record<string, unknown> }
interface DapMessage extends DapEvent {
  seq: number;
  type: string;
  request_seq?: number;
  command?: string;
  success?: boolean;
  message?: string;
  arguments?: Record<string, unknown>;
}
interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

/** Bounded Content-Length DAP transport, independent of adapter and session policy. */
export class DapConnection {
  /** Incomplete frame bytes retained across socket packets. */
  private buffer = Buffer.alloc(0);
  /** Monotonic request/response sequence within this connection. */
  private sequence = 0;
  /** Makes shutdown idempotent and prevents late writes. */
  private closed = false;
  /** Requests awaiting a reply, each with its own timeout. */
  private readonly pending = new Map<number, PendingRequest>();
  /** Events never carry UI state into the transport. */
  onEvent: (event: DapEvent) => void = () => undefined;
  /** Reverse requests are explicitly accepted or rejected by the adapter integration. */
  onRequest: (command: string, args: Record<string, unknown>) => Promise<unknown> = async () => {
    throw new Error("Unsupported debugger reverse request.");
  };
  /** Called once on unexpected socket closure or malformed frames. */
  onClose: (error: Error) => void = () => undefined;

  /** Takes ownership of an already connected socket. */
  constructor(private readonly socket: Socket, private readonly timeout = 15_000) {
    socket.on("data", chunk => this.receive(chunk));
    socket.on("error", error => this.finish(error));
    socket.on("close", () => this.finish(new Error("Debugger connection closed.")));
  }

  /** Connects only to the private loopback adapter server. */
  static async connect(port: number): Promise<DapConnection> {
    const socket = connect({ host: "127.0.0.1", port });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => socket.destroy(new Error("Debugger connection timed out.")), 5_000);
      socket.once("error", reject);
      socket.once("connect", () => { clearTimeout(timer); socket.removeListener("error", reject); resolve(); });
      socket.once("close", () => clearTimeout(timer));
    });
    return new DapConnection(socket);
  }

  /** Matches out-of-order replies by sequence and bounds every request lifetime. */
  request<T = Record<string, unknown>>(command: string, args: object = {}, timeoutMs = this.timeout): Promise<T> {
    if (this.closed) return Promise.reject(new Error("Debugger connection is closed."));
    const seq = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`Debugger request timed out: ${command}`));
      }, timeoutMs);
      this.pending.set(seq, { resolve: value => resolve(value as T), reject, timer });
      this.send({ seq, type: "request", command, arguments: args });
    });
  }

  /** Rejects all outstanding work when the owning session ends. */
  close(): void { this.finish(new Error("Debugger connection closed.")); }

  /** Parses byte lengths, allowing split headers and multiple messages per packet. */
  private receive(chunk: Buffer): void {
    try {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      while (this.buffer.length > 0) {
        const boundary = this.buffer.indexOf("\r\n\r\n");
        if (boundary === -1) {
          if (this.buffer.length > 8192) throw new Error("Debugger header too large.");
          return;
        }
        if (boundary > 8192) throw new Error("Debugger header too large.");
        const match = /^Content-Length: (\d+)\r?$/im.exec(this.buffer.subarray(0, boundary).toString());
        const length = Number(match?.[1]);
        if (!Number.isSafeInteger(length) || length < 1 || length > 8 * 1024 * 1024) {
          throw new Error("Invalid debugger frame length.");
        }
        const end = boundary + 4 + length;
        if (this.buffer.length < end) return;
        const message = JSON.parse(this.buffer.subarray(boundary + 4, end).toString()) as DapMessage;
        this.buffer = this.buffer.subarray(end);
        this.dispatch(message);
      }
    } catch (error) { this.finish(error instanceof Error ? error : new Error(String(error))); }
  }

  /** Delivers events and resolves reverse requests without blocking incoming traffic. */
  private dispatch(message: DapMessage): void {
    if (message.type === "response") {
      const pending = this.pending.get(message.request_seq!);
      if (pending === undefined) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.request_seq!);
      if (message.success) pending.resolve(message.body ?? {});
      else pending.reject(new Error(message.message ?? "Debugger request failed."));
    } else if (message.type === "event") {
      this.onEvent(message);
    } else if (message.type === "request") {
      void this.respond(message);
    }
  }

  /** Converts reverse-request errors to DAP failures rather than unhandled promises. */
  private async respond(message: DapMessage): Promise<void> {
    try {
      const body = await this.onRequest(message.command!, message.arguments ?? {});
      this.send({ seq: ++this.sequence, type: "response", request_seq: message.seq,
        command: message.command, success: true, body: body ?? {} });
    } catch (error) {
      this.send({ seq: ++this.sequence, type: "response", request_seq: message.seq,
        command: message.command, success: false, message: String(error) });
    }
  }

  /** Writes one UTF-8 frame; closed sessions discard late reverse responses. */
  private send(message: object): void {
    if (this.closed) return;
    const body = JSON.stringify(message);
    this.socket.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }

  /** Releases pending timers and notifies the owner exactly once. */
  private finish(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.socket.destroy();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.onClose(error);
  }
}
