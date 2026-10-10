import type {
  OpenCodexFileReadSnapshot, OpenCodexFileResult, OpenCodexFileTarget
} from "@open-codex-ui/opencodex-protocol";
import type { FileRequestPort } from "./FileDocument";
import { resolveMarkdownFileTarget } from "./markdownLinks";

/** Reads inline images through workspace permissions, using the document's captured source. */
export function createMarkdownImageLoader(
  port: FileRequestPort, target: Readonly<OpenCodexFileTarget> | null
): (path: string) => Promise<string> {
  let context: OpenCodexFileTarget | null = null;
  if (target !== null) {
    context = {
      sourceId: target.sourceId,
      projectId: target.projectId,
      workspaceId: target.workspaceId,
      workspacePath: target.workspacePath,
      path: target.path
    };
  }
  const previews = new Map<string, Promise<string>>();

  /** Requests only the resolved workspace target, never the unrestricted chat image endpoint. */
  async function readImage(path: string): Promise<string> {
    const imageTarget = resolveMarkdownFileTarget(path, context);
    const result = await port.request<OpenCodexFileResult<OpenCodexFileReadSnapshot>>({
      type: "workspaceFiles.read", target: imageTarget, previewImages: true
    });
    if (!result.ok) throw new Error(result.details);
    if (!("kind" in result.value) || result.value.kind !== "image") {
      throw new Error("Only image files can be previewed.");
    }
    return result.value.dataUrl;
  }

  /** Shares a bounded set of previews and evicts failures so a remounted image can retry. */
  function loadImage(path: string): Promise<string> {
    const cached = previews.get(path);
    if (cached !== undefined) return cached;
    if (previews.size >= 8) {
      const oldest = previews.keys().next().value;
      if (oldest !== undefined) previews.delete(oldest);
    }
    const pending = readImage(path).catch((error: unknown) => {
      if (previews.get(path) === pending) previews.delete(path);
      throw error;
    });
    previews.set(path, pending);
    return pending;
  }

  return loadImage;
}
