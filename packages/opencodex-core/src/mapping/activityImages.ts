import type { OpenCodexImageAttachment } from "@open-codex-ui/opencodex-protocol";
import { readObject, readString } from "./primitives.js";

/** Extracts explicitly typed image outputs without interpreting ordinary tool text as images. */
export function readActivityImages(item: Record<string, unknown>): OpenCodexImageAttachment[] {
  const images: OpenCodexImageAttachment[] = [];
  const type = readString(item.type);
  const id = readString(item.id) || readString(item.call_id) || "image";
  if (type === "imageGeneration" || type === "image_generation_call") {
    const result = readString(item.result);
    const savedPath = readString(item.savedPath);
    if (result.length > 0) {
      let url = result;
      if (/^[A-Za-z0-9+/]+={0,2}$/.test(result)) {
        url = `data:image/png;base64,${result}`;
      }
      images.push(createImageAttachment(id, url, savedPath));
    } else if (savedPath.length > 0) {
      images.push(createImageAttachment(id, savedPath));
    }
    return images;
  }
  if (type === "imageView") {
    const path = readString(item.path);
    if (path.length > 0) images.push(createImageAttachment(id, path));
    return images;
  }

  const result = readObject(item.result);
  const output = readObject(item.output);
  const collections = [item.contentItems, result.content, output.content, item.output];
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    for (const entry of collection) {
      const value = readImageContent(readObject(entry));
      if (value === null || images.some(image => image.value === value)) continue;
      images.push(createImageAttachment(`${id}:${images.length}`, value));
    }
  }
  return images;
}

/** Reads native dynamic-tool, MCP and raw Responses image content blocks. */
function readImageContent(content: Record<string, unknown>): string | null {
  const type = readString(content.type);
  if (type === "inputImage") return readString(content.imageUrl) || null;
  if (type === "input_image") return readString(content.image_url) || null;
  if (type !== "image") return null;
  const data = readString(content.data);
  const mimeType = readString(content.mimeType);
  if (data.length > 0 && /^image\/[a-z0-9.+-]+$/i.test(mimeType)) {
    return `data:${mimeType};base64,${data}`;
  }
  return readString(content.url) || null;
}

/** Keeps local paths source-owned and embedded image bytes browser-displayable. */
function createImageAttachment(id: string, value: string, namePath = value): OpenCodexImageAttachment {
  const source = /^(?:data:image\/|https?:\/\/)/i.test(value) ? "dataUrl" : "localPath";
  let name: string | undefined;
  if (namePath.length > 0 && !/^data:/i.test(namePath)) {
    name = namePath.split(/[\\/]/).at(-1);
  }
  return { id: `${id}:image`, kind: "image", source, value, name };
}
