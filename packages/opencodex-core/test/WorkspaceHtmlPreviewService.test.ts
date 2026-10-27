import { describe, expect, it, vi } from "vitest";
import type { OpenCodexFileRequest, OpenCodexFileResult } from "@open-codex-ui/opencodex-protocol";
import { WorkspaceHtmlPreviewService } from "../src/backend/files/WorkspaceHtmlPreviewService.js";
import { previewByteResponse, type PreviewHttpRequest } from "../src/backend/files/previewHttp.js";

const target = { sourceId: "remote", projectId: "project", workspaceId: "workspace", workspacePath: "/remote/project", path: "pages/demo.html" };
const origin = "http://127.0.0.1:12345";

/** Uses real session authorization and range handling, isolating only listener and source I/O. */
async function fixture() {
  const bytes = Buffer.from("source-owned-audio");
  const read = vi.fn(async (request: OpenCodexFileRequest): Promise<OpenCodexFileResult<unknown>> => {
    if (request.type === "workspaceFiles.stat") return { ok: true, value: { kind: "file" } };
    return { ok: true, value: { mimeType: "audio/wav", byteLength: bytes.length, dataBase64: bytes.toString("base64") } };
  });
  const close = vi.fn(async () => undefined);
  const listen = vi.fn(async () => ({ origin, close }));
  const service = new WorkspaceHtmlPreviewService(read, listen, () => "capability");
  const session = await service.open(target, "<audio controls src='../sounds/tone.wav'></audio><script>new Audio('../sounds/tone.wav')</script>");
  /** Sends a normal same-capability subresource request. */
  function request(path: string, overrides: Partial<PreviewHttpRequest> = {}): Promise<Awaited<ReturnType<typeof service.respond>>> {
    return service.respond({ url: `/capability/${path}`, host: "127.0.0.1:12345", method: "GET", ...overrides });
  }
  return { service, read, listen, session, close, request, bytes };
}

describe("HTML preview sessions", () => {
  it("should preserve live HTML, scripts and relative sound references without saving", async () => {
    const { request, read, session } = await fixture();
    expect(session.url).toBe(`${origin}/capability/pages/demo.html`);
    const result = await request("pages/demo.html");
    expect(result.status).toBe(200);
    expect(result.body.toString()).toContain("new Audio('../sounds/tone.wav')");
    expect(result.headers["Content-Security-Policy"]).toContain("sandbox allow-scripts");
    expect(result.headers["Content-Security-Policy"]).not.toContain("allow-same-origin");
    expect(result.headers["Content-Security-Policy"]).toContain(`media-src data: blob: ${origin}/capability/`);
    expect(read.mock.calls.every(([call]) => call.type === "workspaceFiles.stat")).toBe(true);
  });

  it("should serve native media byte ranges through the captured source and recheck cached access", async () => {
    const { request, read, bytes } = await fixture();
    const first = await request("sounds/tone.wav", { range: "bytes=2-6" });
    expect(first.status).toBe(206);
    expect(first.body).toEqual(bytes.subarray(2, 7));
    expect(first.headers["Content-Range"]).toBe(`bytes 2-6/${bytes.length}`);
    expect(first.headers["Access-Control-Allow-Origin"]).toBe("null");
    expect(read).toHaveBeenCalledWith({ type: "workspaceFiles.previewAsset", target: { ...target, path: "sounds/tone.wav" } });
    read.mockResolvedValueOnce({ ok: false, code: "accessDenied", details: "Revoked" });
    expect((await request("sounds/tone.wav")).status).toBe(403);
  });

  it("should reject unknown capabilities, DNS rebinding, writes and escaped paths before source access", async () => {
    const { request, read } = await fixture();
    read.mockClear();
    expect((await request("demo.html", { host: "attacker.test:12345" })).status).toBe(421);
    expect((await request("demo.html", { method: "POST" })).status).toBe(405);
    expect((await request("demo.html", { url: "/other/pages/demo.html" })).status).toBe(404);
    expect((await request("%2e%2e%2foutside.wav")).status).toBe(400);
    expect((await request("%2fetc%2fpasswd")).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
  });

  it("should revoke URLs and cached bytes when the viewer closes or the runtime is disposed", async () => {
    const { service, request, session, close } = await fixture();
    expect(service.isActiveUrl(session.url)).toBe(true);
    service.close(session.id);
    expect(service.isActiveUrl(session.url)).toBe(false);
    expect((await request("sounds/tone.wav")).status).toBe(404);
    expect(service.isActiveUrl("https://example.test/capability/demo.html")).toBe(false);
    await service.dispose();
    expect(close).toHaveBeenCalledOnce();
  });

  it("should refuse stale workspace ownership before starting a listener", async () => {
    const read = vi.fn(async (): Promise<OpenCodexFileResult<unknown>> => ({ ok: false, code: "unavailable", details: "Workspace moved" }));
    const listen = vi.fn();
    const service = new WorkspaceHtmlPreviewService(read, listen);
    await expect(service.open(target, "page")).rejects.toThrow("Workspace moved");
    expect(listen).not.toHaveBeenCalled();
  });

  it("should queue parallel page resources while bounding active source reads", async () => {
    const { read, request } = await fixture();
    const releases: Array<() => void> = [];
    read.mockImplementation(async (input: OpenCodexFileRequest): Promise<OpenCodexFileResult<unknown>> => {
      if (input.type === "workspaceFiles.stat") {
        await new Promise<void>(resolve => { releases.push(resolve); });
        return { ok: true, value: { kind: "file" } };
      }
      return { ok: true, value: { mimeType: "audio/wav", byteLength: 1, dataBase64: "YQ==" } };
    });
    read.mockClear();
    const pending = Array.from({ length: 6 }, (_, index) => request(`sounds/tone${index}.wav`));
    await vi.waitFor(() => expect(releases).toHaveLength(4));
    for (const release of releases.splice(0)) release();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    for (const release of releases) release();
    expect((await Promise.all(pending)).every(response => response.status === 200)).toBe(true);
  });
});

describe("native media byte ranges", () => {
  it("should support suffixes and open ends while rejecting unsatisfiable or multipart ranges", () => {
    const bytes = Buffer.from("0123456789");
    expect(previewByteResponse(bytes, {}, "bytes=-3").body.toString()).toBe("789");
    expect(previewByteResponse(bytes, {}, "bytes=5-").body.toString()).toBe("56789");
    expect(previewByteResponse(bytes, {}, "bytes=50-").status).toBe(416);
    expect(previewByteResponse(bytes, {}, "bytes=1-2,4-6").status).toBe(416);
  });
});
