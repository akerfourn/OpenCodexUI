import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import { runLocalFileOperation } from "../src/backend/files/runFileOperation";
import { WorkspaceFilesService } from "../src/backend/files/WorkspaceFilesService";

const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
let root: string;

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "opencodex-chat-images-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("conversation image reads", () => {
  it("should preview generated files outside the project without allowing arbitrary text reads", async () => {
    const projectPath = join(root, "project");
    await mkdir(projectPath);
    const path = join(root, "generated.png");
    await writeFile(path, png);
    const request = { type: "images.read" as const, sourceId: "local", projectPath, path };
    expect(await runLocalFileOperation(request)).toMatchObject({ ok: true, value: {
      kind: "image", dataUrl: `data:image/png;base64,${png.toString("base64")}`, readOnly: true
    } });
    await writeFile(path, "private text");
    const rejected = await runLocalFileOperation(request);
    expect(rejected).toMatchObject({ ok: false, code: "unsupported" });
    expect(JSON.stringify(rejected)).not.toContain("private text");
  });

  it("should reject oversized images and relative paths without a project context", async () => {
    const path = join(root, "oversized.png");
    const bytes = Buffer.alloc(10 * 1024 * 1024 + 1);
    png.copy(bytes);
    await writeFile(path, bytes);
    expect(await runLocalFileOperation({ type: "images.read", sourceId: "local", projectPath: root, path }))
      .toMatchObject({ ok: false, code: "tooLarge", details: expect.stringContaining("10 MiB") });
    expect(await runLocalFileOperation({ type: "images.read", sourceId: "local", projectPath: null, path: "image.png" }))
      .toMatchObject({ ok: false, code: "invalidPath" });
  });

  it("should resolve the requested source explicitly and reject a missing source before reading", async () => {
    const path = join(root, "image.png");
    await writeFile(path, png);
    const resolveRequestedSource = vi.fn().mockResolvedValue({ id: "local", kind: "local" } as CachedSource);
    const ensureClient = vi.fn();
    const service = new WorkspaceFilesService(null, { resolveRequestedSource }, { ensureClient });
    expect(await service.readImage({ type: "images.read", sourceId: "local", projectPath: root, path }))
      .toMatchObject({ ok: true, value: { kind: "image" } });
    expect(resolveRequestedSource).toHaveBeenCalledWith("local");
    expect(ensureClient).not.toHaveBeenCalled();
    resolveRequestedSource.mockClear();
    expect(await service.readImage({ type: "images.read", sourceId: "", projectPath: root, path }))
      .toMatchObject({ ok: false, details: expect.stringContaining("explicit image source") });
    expect(resolveRequestedSource).not.toHaveBeenCalled();
  });
});
