import { mkdtemp, writeFile, readFile, rm, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { OpenCodexFileTarget, OpenCodexAudioSnapshot } from "@open-codex-ui/opencodex-protocol";
import { runLocalFileOperation } from "../src/backend/files/runFileOperation.js";

let root: string;
let target: OpenCodexFileTarget;
const wave = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt "), Buffer.alloc(32)]);
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "files-audio-"));
  target = { sourceId: "source", projectId: "project", workspaceId: "workspace", workspacePath: root, path: "sound.wav" };
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("source-owned audio and HTML assets", () => {
  it("should read exact audio bytes and refuse text saves", async () => {
    await writeFile(join(root, target.path), wave);
    const result = await runLocalFileOperation({ type: "workspaceFiles.read", target, previewAudio: true });
    expect(result).toMatchObject({ ok: true, value: { kind: "audio", mimeType: "audio/wav", readOnly: true,
      dataUrl: `data:audio/wav;base64,${wave.toString("base64")}` } });
    if (!result.ok) throw new Error(result.details);
    const snapshot = result.value as OpenCodexAudioSnapshot;
    expect(await runLocalFileOperation({ type: "workspaceFiles.save", target, content: "overwrite",
      revision: snapshot.revision, bom: false })).toMatchObject({ ok: false, code: "binary" });
    expect(await readFile(join(root, target.path))).toEqual(wave);
    expect(await runLocalFileOperation({ type: "workspaceFiles.check", target, revision: snapshot.revision,
      previewAudio: true })).toEqual({ ok: true, value: true });
    await writeFile(join(root, target.path), Buffer.concat([wave, Buffer.from("changed")]));
    expect(await runLocalFileOperation({ type: "workspaceFiles.check", target, revision: snapshot.revision,
      previewAudio: true })).toEqual({ ok: true, value: false });
  });

  it("should return typed local scripts, styles and sounds without reading arbitrary file formats", async () => {
    await writeFile(join(root, "sound.wav"), wave);
    await writeFile(join(root, "style.css"), "body { color: red; }");
    await writeFile(join(root, "page.js"), "new Audio('./sound.wav');");
    await writeFile(join(root, ".env"), "SECRET=test");
    for (const [path, mimeType] of [["sound.wav", "audio/wav"], ["style.css", "text/css; charset=utf-8"],
      ["page.js", "text/javascript; charset=utf-8"]]) {
      expect(await runLocalFileOperation({ type: "workspaceFiles.previewAsset", target: { ...target, path: path! } }))
        .toMatchObject({ ok: true, value: { mimeType } });
    }
    expect(await runLocalFileOperation({ type: "workspaceFiles.previewAsset", target: { ...target, path: ".env" } }))
      .toMatchObject({ ok: false, code: "unsupported" });
  });

  it("should enforce the media size bound before returning a large binary payload", async () => {
    await writeFile(join(root, target.path), Buffer.concat([wave, Buffer.alloc(10 * 1024 * 1024)]));
    expect(await runLocalFileOperation({ type: "workspaceFiles.read", target, previewAudio: true }))
      .toMatchObject({ ok: false, code: "tooLarge" });
    expect(await runLocalFileOperation({ type: "workspaceFiles.previewAsset", target }))
      .toMatchObject({ ok: false, code: "tooLarge" });
  });

  it("should apply workspace containment and symlink grants before serving sounds", async () => {
    await writeFile(join(root, "sound.wav"), wave);
    await mkdir(join(root, "workspace"));
    await symlink(join(root, "sound.wav"), join(root, "workspace", "sound.wav"));
    const inside = { ...target, workspacePath: join(root, "workspace") };
    expect(await runLocalFileOperation({ type: "workspaceFiles.previewAsset", target: inside }))
      .toMatchObject({ ok: false, code: "accessDenied" });
    expect(await runLocalFileOperation({ type: "workspaceFiles.previewAsset", target: { ...inside, path: "../sound.wav" } }))
      .toMatchObject({ ok: false, code: "invalidPath" });
  });
});
