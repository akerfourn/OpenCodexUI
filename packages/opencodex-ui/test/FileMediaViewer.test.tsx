// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { FileDocument } from "../src/stores/files/FileDocument";
import { FileAudioViewerX } from "../src/components/files/FileAudioViewer";
import { FileHtmlPreviewX } from "../src/components/files/FileHtmlPreview";
import { FileDocumentViewControlsX } from "../src/components/files/FileDocumentViewControls";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const target = { sourceId: "remote", projectId: "project", workspaceId: "workspace", workspacePath: "/remote", path: "demo.html" };
const audio = { kind: "audio", dataUrl: "data:audio/wav;base64,UklGRg==", mimeType: "audio/wav",
  byteLength: 4, revision: "1", readOnly: true };
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("native audio viewer", () => {
  it("should remain read-only, retain position and stop playback when hidden", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, value: audio });
    const document = new FileDocument("audio", "sound.wav", { ...target, path: "sound.wav" }, "Workspace", { request });
    await document.reload();
    expect(document.audioSnapshot).toEqual(audio);
    expect(document.isReadOnly).toBe(true);
    expect(document.canPreviewHtml).toBe(false);
    document.audioTime = 3;
    await act(async () => root.render(<FileAudioViewerX document={document} />));
    const player = container.querySelector("audio")!;
    expect(player.controls).toBe(true);
    expect(player.autoplay).toBe(false);
    expect(player.getAttribute("src")).toBe(audio.dataUrl);
    Object.defineProperty(player, "duration", { value: 10 });
    await act(async () => player.dispatchEvent(new Event("loadedmetadata")));
    expect(player.currentTime).toBe(3);
    player.currentTime = 5;
    await act(async () => player.dispatchEvent(new Event("timeupdate")));
    expect(document.audioTime).toBe(5);
    await act(async () => root.render(null));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    expect(player.getAttribute("src")).toBeNull();
  });

  it("should retain playback bytes when a reload fails and clear them on a text replacement", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, value: audio });
    const document = new FileDocument("audio", "sound.wav", target, "Workspace", { request });
    await document.reload();
    request.mockResolvedValueOnce({ ok: false, code: "unavailable", details: "Disconnected" });
    await document.reload();
    expect(document.audioSnapshot).toEqual(audio);
    request.mockResolvedValueOnce({ ok: true, value: { content: "text", revision: "2", bom: false, eol: "lf", readOnly: false } });
    await document.reload();
    expect(document.audioSnapshot).toBeNull();
    expect(document.content).toBe("text");
  });
});

describe("source-owned HTML viewer", () => {
  it("should switch source, preview and Git views without discarding unsaved HTML", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, value: {
      content: "<audio controls src='tone.wav'></audio>", revision: "1", bom: false, eol: "lf", readOnly: false
    } });
    const document = new FileDocument("html", "demo.html", target, "Workspace", { request });
    await document.reload();
    expect(document.isHtmlPreview).toBe(true);
    document.navigateTo({ line: 2 });
    expect(document.isHtmlPreview).toBe(false);
    document.edit("<h1>Unsaved</h1>");
    document.setContentPreview(true);
    expect(document.isHtmlPreview).toBe(true);
    expect(document.isDirty).toBe(true);
    await act(async () => root.render(<FileDocumentViewControlsX document={document} />));
    expect(container.textContent).toContain("files.viewSource");
    expect(container.textContent).toContain("files.viewPreview");
    await act(async () => document.configureOpen({ origin: "git", gitDiff: { comparison: "workingTree", fileState: "modified" } }, "diff"));
    expect(document.isHtmlPreview).toBe(false);
    expect(document.content).toBe("<h1>Unsaved</h1>");
  });

  it("should capture the document source, isolate scripts and revoke the session on unmount", async () => {
    const request = vi.fn().mockResolvedValue({ id: "session", url: "http://127.0.0.1:12345/session/demo.html" });
    const document = new FileDocument("html", "demo.html", target, "Workspace", { request });
    document.content = "<audio controls src='tone.wav'></audio>";
    const port = { request };
    await act(async () => root.render(<FileHtmlPreviewX document={document} port={port} />));
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(request).toHaveBeenCalledWith({ type: "filePreview.open", target, content: document.content });
    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    await act(async () => root.render(null));
    expect(request).toHaveBeenCalledWith({ type: "filePreview.close", id: "session" });
  });

  it("should close late sessions instead of reopening a viewer that was already hidden", async () => {
    let resolve!: (session: { id: string; url: string }) => void;
    const request = vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done; }))
      .mockResolvedValue({ ok: true });
    const document = new FileDocument("html", "demo.html", target, "Workspace", { request });
    await act(async () => root.render(<FileHtmlPreviewX document={document} port={{ request }} />));
    await act(async () => vi.advanceTimersByTimeAsync(200));
    await act(async () => root.render(null));
    await act(async () => resolve({ id: "late", url: "http://127.0.0.1:12345/late/demo.html" }));
    expect(request).toHaveBeenCalledWith({ type: "filePreview.close", id: "late" });
    expect(container.querySelector("iframe")).toBeNull();
  });
});
