import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearMarkdownRenderCache,
  getCachedMarkdownRender,
  getMarkdownRenderCacheEntryCount
} from "../src/components/messages/markdownRenderCache";

afterEach(() => {
  clearMarkdownRenderCache();
});

describe("Markdown render cache", () => {
  it("should reuse a completed render result for the same variant and source", () => {
    const create = vi.fn(() => ({ rendered: true }));

    const first = getCachedMarkdownRender("standard\u0000same source", 11, create);
    const second = getCachedMarkdownRender("standard\u0000same source", 11, create);

    expect(second).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("should keep the cache bounded when many messages are remounted", () => {
    for (let index = 0; index < 40; index += 1) {
      getCachedMarkdownRender(`standard\u0000message-${index}`, 1, () => index);
    }

    expect(getMarkdownRenderCacheEntryCount()).toBeLessThanOrEqual(32);
    expect(getMarkdownRenderCacheEntryCount()).toBeGreaterThan(0);
  });

  it("should clear all retained render results", () => {
    getCachedMarkdownRender("standard\u0000message", 7, () => "rendered");

    clearMarkdownRenderCache();

    expect(getMarkdownRenderCacheEntryCount()).toBe(0);
  });
});
