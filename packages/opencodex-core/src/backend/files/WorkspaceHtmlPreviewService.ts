import { randomBytes } from "node:crypto";
import type { OpenCodexFileRequest, OpenCodexFileResult, OpenCodexFileTarget,
  OpenCodexHtmlPreviewSession, OpenCodexPreviewAsset } from "@open-codex-ui/opencodex-protocol";
import { listenPreview, previewByteResponse, type PreviewHttpRequest,
  type PreviewHttpResponse, type PreviewListener } from "./previewHttp.js";

/** A capability exposes only its captured workspace, with a bounded resource cache. */
interface HtmlSession {
  target: OpenCodexFileTarget;
  content: Buffer;
  assets: Map<string, { data: Buffer; mimeType: string }>;
  bytes: number;
}

/** Serves sandboxed HTML and relative resources through the existing source permission boundary. */
export class WorkspaceHtmlPreviewService {
  /** Random capabilities are local to this runtime and never persisted. */
  private readonly sessions = new Map<string, HtmlSession>();
  /** One lazily bound loopback listener supports the application's open HTML documents. */
  private listener: Promise<PreviewListener> | null = null;
  /** Resolved origin permits synchronous Electron navigation checks. */
  private origin: string | null = null;
  /** Prevents late source replies from reviving shutdown resources. */
  private disposed = false;
  /** Bounds concurrent source-side resource reads across all pages. */
  private activeReads = 0;
  /** Queues normal parallel browser loads instead of failing the fifth image or sound. */
  private readonly waitingReads: Array<() => void> = [];

  /** Injects filesystem operations and listener creation so security tests need no real network. */
  constructor(private readonly read: (request: OpenCodexFileRequest) => Promise<OpenCodexFileResult<unknown>>,
    private readonly listen = listenPreview, private readonly createId = () => randomBytes(32).toString("hex")) {}

  /** Captures the live HTML buffer without saving; source ownership is verified before issuing a URL. */
  async open(target: OpenCodexFileTarget, content: string): Promise<OpenCodexHtmlPreviewSession> {
    if (this.disposed || this.sessions.size >= 16) throw new Error("Too many HTML previews are open.");
    if (typeof content !== "string" || Buffer.byteLength(content) > 2 * 1024 * 1024) throw new Error("HTML preview exceeds 2 MiB.");
    const checked = await this.read({ type: "workspaceFiles.stat", target: { ...target } });
    if (!checked.ok) throw new Error(checked.details);
    if ((checked.value as { kind: string }).kind !== "file") throw new Error("HTML previews require a regular file.");
    this.listener ??= this.listen(request => this.respond(request)).catch((error: unknown) => {
      this.listener = null;
      throw error;
    });
    const listener = await this.listener;
    this.origin = listener.origin;
    if (this.disposed || this.sessions.size >= 16) throw new Error("HTML preview is unavailable.");
    const id = this.createId();
    this.sessions.set(id, { target: { ...target }, content: Buffer.from(content), assets: new Map(), bytes: 0 });
    const encodedPath = target.path.split("/").map(encodeURIComponent).join("/");
    return { id, url: `${listener.origin}/${id}/${encodedPath}` };
  }

  /** Revokes a viewer capability immediately, including any resources currently being read. */
  close(id: string): void { this.sessions.delete(id); }

  /** Renderer loss revokes every outstanding capability without waiting for UI cleanup. */
  clear(): void { this.sessions.clear(); }

  /** Checks navigations against exact live session URLs, never a generic localhost allowlist. */
  isActiveUrl(value: string): boolean {
    if (this.origin === null) return false;
    try {
      const url = new URL(value);
      return url.origin === this.origin && this.sessions.has(url.pathname.split("/")[1] ?? "");
    } catch { return false; }
  }

  /** Releases the listener and all retained bytes before the source clients are disposed. */
  async dispose(): Promise<void> {
    this.disposed = true;
    this.clear();
    const listener = await this.listener?.catch(() => null);
    if (listener !== null && listener !== undefined) await listener.close();
  }

  /** Acquires or waits for one bounded source-read slot; only excess queued work is rejected. */
  private async acquireRead(): Promise<boolean> {
    if (this.activeReads < 4) { this.activeReads += 1; return true; }
    if (this.waitingReads.length >= 32) return false;
    await new Promise<void>(resolve => { this.waitingReads.push(resolve); });
    return true;
  }

  /** Transfers a slot to the next browser resource before accepting more source work. */
  private releaseRead(): void {
    const next = this.waitingReads.shift();
    if (next === undefined) this.activeReads -= 1;
    else next();
  }

  /** Authorizes each request again, even when its bytes were already cached for media seeking. */
  async respond(request: PreviewHttpRequest): Promise<PreviewHttpResponse> {
    const denied = (status: number): PreviewHttpResponse => ({ status,
      headers: { "Cache-Control": "no-store", "Content-Length": "0" }, body: Buffer.alloc(0) });
    if (this.disposed || this.listener === null) return denied(404);
    const { origin } = await this.listener;
    if (request.host !== new URL(origin).host) return denied(421);
    if (request.method !== "GET" && request.method !== "HEAD") return denied(405);
    let path: string;
    let id: string;
    try {
      if (!request.url.startsWith("/") || request.url.startsWith("//")) return denied(400);
      const url = new URL(request.url, origin);
      const parts = url.pathname.split("/");
      id = parts[1] ?? "";
      path = decodeURIComponent(parts.slice(2).join("/"));
      if (path.length === 0 || path.startsWith("/") || path.includes("\\") || path.includes("\0") || path.includes(":")
        || path.split("/").some(part => part === "." || part === "..")) return denied(400);
    } catch { return denied(400); }
    const session = this.sessions.get(id);
    if (session === undefined) return denied(404);
    if (!await this.acquireRead()) return denied(429);
    try {
      if (this.sessions.get(id) !== session) return denied(404);
      const target = { ...session.target, path };
      const access = await this.read({ type: "workspaceFiles.stat", target });
      if (!access.ok) return denied(403);
      if ((access.value as { kind: string }).kind !== "file") return denied(404);
      let asset = session.assets.get(path);
      if (path === session.target.path) asset = { data: session.content, mimeType: "text/html; charset=utf-8" };
      if (asset === undefined) {
        const result = await this.read({ type: "workspaceFiles.previewAsset", target });
        if (!result.ok) return denied(result.code === "tooLarge" ? 413 : 403);
        const snapshot = result.value as OpenCodexPreviewAsset;
        if (typeof snapshot.dataBase64 !== "string" || snapshot.dataBase64.length > 14 * 1024 * 1024
          || !Number.isSafeInteger(snapshot.byteLength) || snapshot.byteLength < 0 || snapshot.byteLength > 10 * 1024 * 1024
          || typeof snapshot.mimeType !== "string" || !/^[a-z]+\/[a-z0-9.+-]+(?:; charset=utf-8)?$/iu.test(snapshot.mimeType)) return denied(413);
        asset = { data: Buffer.from(snapshot.dataBase64, "base64"), mimeType: snapshot.mimeType };
        if (asset.data.length !== snapshot.byteLength) return denied(413);
        while ((session.assets.size >= 64 || session.bytes + asset.data.length > 32 * 1024 * 1024) && session.assets.size > 0) {
          const oldest = session.assets.keys().next().value!;
          session.bytes -= session.assets.get(oldest)!.data.length;
          session.assets.delete(oldest);
        }
        session.assets.set(path, asset);
        session.bytes += asset.data.length;
      }
      if (this.sessions.get(id) !== session) return denied(404);
      const scope = `${origin}/${id}/`;
      const policy = `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' ${scope}; `
        + `style-src 'unsafe-inline' ${scope}; img-src data: blob: ${scope}; media-src data: blob: ${scope}; `
        + `font-src data: ${scope}; connect-src ${scope}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
      return previewByteResponse(asset.data, { "Content-Type": asset.mimeType, "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": policy,
        "Access-Control-Allow-Origin": "null", "Cross-Origin-Resource-Policy": "cross-origin" }, request.range);
    } finally { this.releaseRead(); }
  }
}
