import { mapThreadMessages } from "../src/mapping/turnMapping";
import { describe, expect, it, vi } from "vitest";
import type { OpenCodexFileAttachment } from "@open-codex-ui/opencodex-protocol";
import { prepareFileAttachments, fileAttachmentInput, readFileAttachmentInput } from "../src/backend/threads/fileAttachments";
import { buildTurnInput } from "../src/backend/threads/turnInput";

/** Builds a small file selected on the UI host. */
function attachment(name = "notes.txt"): OpenCodexFileAttachment {
  return { id: "file-1", kind: "file", source: "dataUrl", name,
    value: "data:application/octet-stream;base64,aGVsbG8=" };
}

/** Supplies deterministic source-native filesystem RPCs. */
function client(home = "/remote/.codex") {
  return {
    getCodexHome: vi.fn(async () => home),
    createDirectory: vi.fn(async () => ({})),
    writeFile: vi.fn(async () => ({})),
    getMetadata: vi.fn(async () => ({ isDirectory: false, isFile: true, isSymlink: false, createdAtMs: 0, modifiedAtMs: 0 }))
  };
}

describe("file attachments", () => {
  it.each(["/remote/.codex", "C:\\Users\\User\\.codex"])("should transfer bytes using the source path dialect: %s", async (home) => {
    const rpc = client(home);
    const [prepared] = await prepareFileAttachments(rpc, "remote", [attachment("../notes.txt")]);
    expect(rpc.writeFile).toHaveBeenCalledWith(prepared!.value, "aGVsbG8=");
    expect(prepared!.value.startsWith(home)).toBe(true);
    expect(prepared!.value).not.toContain("../");
    expect(prepared).toMatchObject({ source: "localPath", sourceId: "remote", name: "../notes.txt" });
    const input = buildTurnInput("Read this", [prepared!]);
    expect(JSON.stringify(input)).not.toContain("aGVsbG8=");
    expect(input[1]).toMatchObject({ type: "text", text: expect.stringContaining(prepared!.value.replaceAll("\\", "\\\\")) });
  });

  it("should retain name and source when restoring a file from Codex history", () => {
    const file: OpenCodexFileAttachment = { ...attachment(), source: "localPath", sourceId: "source", value: "/source/notes.txt" };
    expect(readFileAttachmentInput(fileAttachmentInput(file), "restored")).toEqual({ ...file, id: "restored" });
    expect(readFileAttachmentInput("ordinary user text", "item")).toBeNull();
    const messages = mapThreadMessages({ id: "thread", turns: [{ id: "turn", items: [{
      id: "message", type: "userMessage", content: buildTurnInput("Read the file", [file])
    }] }] });
    expect(messages[0]?.content).toBe("Read the file");
    expect(messages[0]?.attachments).toEqual([expect.objectContaining({
      kind: "file", value: "/source/notes.txt", sourceId: "source", name: "notes.txt"
    })]);
  });

  it("should reject invalid payloads and foreign-source references before writing", async () => {
    const rpc = client();
    await expect(prepareFileAttachments(rpc, "remote", [{ ...attachment(), value: "not base64" }])).rejects.toThrow("Invalid file attachment");
    await expect(prepareFileAttachments(rpc, "remote", [{ ...attachment(), source: "localPath", sourceId: "host", value: "/host/a.txt" }])).rejects.toThrow("another Codex source");
    expect(rpc.writeFile).not.toHaveBeenCalled();
    expect(rpc.getMetadata).not.toHaveBeenCalled();
  });

  it("should refuse raw bytes at the model boundary and leave images unchanged", async () => {
    expect(() => buildTurnInput("", [attachment()])).toThrow("transferred");
    const image = { id: "image", kind: "image" as const, source: "dataUrl" as const, value: "data:image/png;base64,AA==" };
    const rpc = client();
    expect(await prepareFileAttachments(rpc, "source", [image])).toEqual([image]);
    expect(rpc.getCodexHome).not.toHaveBeenCalled();
  });
});
