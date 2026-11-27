import { describe, expect, it } from "vitest";
import { JsonRpcError } from "@open-codex-ui/codex-rpc";
import { isMissingWorkspacePathError } from "../src/backend/workspaces/workspaceSourcePath";

describe("source-owned missing path errors", () => {
  it.each([
    { message: "Le fichier spécifié est introuvable. (os error 2)", path: "C:\\Repo\\.codex", missing: true },
    { message: "Le chemin d’accès spécifié est introuvable. (os error 3)", path: "C:\\Repo\\.codex", missing: true },
    { message: "The system cannot find the file specified.", path: "C:\\Repo\\.codex", missing: true },
    { message: "No such file or directory", path: "/repo/.codex", missing: true },
    { message: "ENOENT", path: "/repo/.codex", missing: true },
    { message: "Accès refusé. (os error 5)", path: "C:\\Repo\\.codex", missing: false },
    { message: "Method not found", path: "C:\\Repo\\.codex", missing: false },
    { message: "Source disconnected", path: "C:\\Repo\\.codex", missing: false },
    { message: "Device failure (os error 3)", path: "/repo/.codex", missing: false }
  ])("should classify $message for $path as missing=$missing", ({ message, path, missing }) => {
    const error = new JsonRpcError(message, -32603, null, { method: "fs/getMetadata", path });
    expect(isMissingWorkspacePathError(error, path)).toBe(missing);
  });
});
