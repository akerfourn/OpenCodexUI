import { describe, expect, it } from "vitest";
import { mapTurnsToMessages, mapTurnsToOpenCodexTurns } from "../src/mapping/turnMapping";
import { createActivityFromNotification } from "../src/mapping/activityNotificationMapping";
import { readActivityImages } from "../src/mapping/activityImages";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const dataUrl = `data:image/png;base64,${png}`;

describe("activity image outputs", () => {
  it("should preserve generated image bytes in persisted and live turn projections", () => {
    const item = { type: "imageGeneration", id: "image", status: "completed", result: png,
      savedPath: "C:/Users/user/.codex/generated_images/proposals.png" };
    const turns = [{ id: "turn", items: [item] }];
    const expected = [{ kind: "image", source: "dataUrl", value: dataUrl, name: "proposals.png" }];
    expect(mapTurnsToOpenCodexTurns("thread", turns)[0].items[0].attachments).toMatchObject(expected);
    expect(mapTurnsToMessages("thread", turns)[0].attachments).toMatchObject(expected);
    expect(createActivityFromNotification({ method: "item/completed",
      params: { threadId: "thread", turnId: "turn", item } })?.attachments).toMatchObject(expected);
  });

  it("should preserve saved and viewed image paths without converting them to host paths", () => {
    for (const path of ["C:/generated/image.png", "/home/user/.codex/generated_images/image.png"]) {
      expect(readActivityImages({ type: "imageGeneration", id: "image", result: "", savedPath: path }))
        .toMatchObject([{ source: "localPath", value: path }]);
      expect(readActivityImages({ type: "imageView", id: "view", path }))
        .toMatchObject([{ source: "localPath", value: path }]);
    }
  });

  it("should extract dynamic-tool and MCP images while ignoring ordinary tool text", () => {
    expect(readActivityImages({ type: "dynamicToolCall", id: "dynamic", contentItems: [
      { type: "inputText", text: "Not an image" }, { type: "inputImage", imageUrl: dataUrl }
    ] })).toMatchObject([{ value: dataUrl }]);
    expect(readActivityImages({ type: "mcpToolCall", id: "mcp", result: { content: [
      { type: "text", text: "Not an image" }, { type: "image", mimeType: "image/png", data: png }
    ] } })).toMatchObject([{ value: dataUrl }]);
    expect(readActivityImages({ type: "mcpToolCall", result: { content: [
      { type: "text", text: '{"image_url":"/private/secret.png"}' }
    ] } })).toEqual([]);
  });

  it("should preserve raw image generation and image content notifications", () => {
    expect(createActivityFromNotification({ method: "rawResponseItem/completed", params: {
      threadId: "thread", turnId: "turn", item: {
        type: "image_generation_call", id: "raw-image", result: png, status: "completed"
      }
    } })?.attachments).toMatchObject([{ value: dataUrl }]);
    expect(readActivityImages({ type: "function_call_output", call_id: "call", output: [
      { type: "input_image", image_url: dataUrl }, { type: "input_image", image_url: dataUrl }
    ] })).toMatchObject([{ value: dataUrl }]);
  });
});
