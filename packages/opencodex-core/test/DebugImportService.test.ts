import { describe, expect, it, vi } from "vitest";
import type { DebugImportPreview } from "@open-codex-ui/opencodex-protocol";
import { DebugService } from "../src/backend/debug/DebugService";

const context = { sourceId: "local", projectId: "project", workspaceId: "main", workspacePath: "/project" };

/** Keeps workspace validation, reads and persistence independently observable. */
function fixture() {
  const repository = {
    read: vi.fn(async () => ({ configurations: [], breakpoints: [], watches: [] })),
    importLegacy: vi.fn(), saveConfiguration: vi.fn(), deleteConfiguration: vi.fn(),
    replaceBreakpoints: vi.fn(), replaceWatches: vi.fn()
  };
  const validate = vi.fn(async () => undefined);
  const files = { execute: vi.fn(async () => ({ ok: true as const, value: {
    content: '{"configurations":[{"name":"Node","type":"node","request":"launch","program":"main.js"}]}'
  } })) };
  const service = new DebugService(repository, validate, vi.fn(), undefined, undefined, files);
  return { service, repository, validate, files };
}

describe("debug import service", () => {
  it("should preview through the source-aware file service without persisting or starting a session", async () => {
    const { service, repository, validate, files } = fixture();
    const result = await service.execute({ kind: "previewImport", context }) as DebugImportPreview;
    expect(validate).toHaveBeenCalledWith(context);
    expect(files.execute).toHaveBeenCalledWith({
      type: "workspaceFiles.read", target: { ...context, path: ".vscode/launch.json" }
    });
    expect(result.entries[0]?.configuration?.name).toBe("Node");
    expect(repository.saveConfiguration).not.toHaveBeenCalled();
    expect(service.snapshot().session).toBeNull();
  });

  it("should reject stale or remote workspace contexts before reading any file", async () => {
    const { service, validate, files } = fixture();
    validate.mockRejectedValue(new Error("Local sources only"));
    await expect(service.execute({ kind: "previewImport", context })).rejects.toThrow("Local sources only");
    expect(files.execute).not.toHaveBeenCalled();
  });

  it("should expose file permission and parsing failures without creating profiles", async () => {
    const { service, repository, files } = fixture();
    files.execute.mockResolvedValueOnce({ ok: true, value: { content: "{" } });
    await expect(service.execute({ kind: "previewImport", context })).rejects.toThrow(SyntaxError);
    files.execute.mockRejectedValueOnce(new Error("Access denied"));
    await expect(service.execute({ kind: "previewImport", context })).rejects.toThrow("Access denied");
    expect(repository.saveConfiguration).not.toHaveBeenCalled();
  });
});
