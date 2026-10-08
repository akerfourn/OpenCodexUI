import type { OpenCodexFileResult, OpenCodexImageSnapshot } from "@open-codex-ui/opencodex-protocol";
import type { FileRequestPort } from "./FileDocument";

/** Creates a bounded preview cache tied to an immutable conversation source and directory. */
export function createChatImageLoader(
  port: FileRequestPort, sourceId: string | null, projectPath: string | null
): (path: string) => Promise<string> {
  const previews = new Map<string, Promise<string>>();

  /** Reads image-only bytes through a plain DTO, never a host filesystem URL. */
  async function readImage(path: string): Promise<string> {
    if (sourceId === null) throw new Error("This conversation has no image source.");
    const result = await port.request<OpenCodexFileResult<OpenCodexImageSnapshot>>({
      type: "images.read", sourceId, projectPath, path
    });
    if (!result.ok) throw new Error(result.details);
    return result.value.dataUrl;
  }

  /** Coalesces repeated previews and permits retry after an unavailable source. */
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
