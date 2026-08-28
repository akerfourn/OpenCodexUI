import { describe, expect, it } from "vitest";

import {
  clampComposerHeight,
  COMPOSER_MIN_HEIGHT_PX,
  isComposerEditorAtBottom,
  readComposerMaxHeight
} from "../src/components/chat/composerResize";

describe("composer resize helpers", () => {
  it("should_resolve_the_maximum_height_from_half_the_viewport", () => {
    expect(readComposerMaxHeight(900)).toBe(450);
    expect(readComposerMaxHeight(180)).toBe(COMPOSER_MIN_HEIGHT_PX);
  });

  it("should_clamp_requested_heights_to_the_composer_bounds", () => {
    expect(clampComposerHeight(80, 450)).toBe(COMPOSER_MIN_HEIGHT_PX);
    expect(clampComposerHeight(320.4, 450)).toBe(320);
    expect(clampComposerHeight(700, 450)).toBe(450);
    expect(clampComposerHeight(320, 80)).toBe(COMPOSER_MIN_HEIGHT_PX);
  });

  it("should_detect_when_the_editor_is_close_to_the_bottom", () => {
    expect(isComposerEditorAtBottom({
      scrollHeight: 500,
      scrollTop: 376,
      clientHeight: 120
    })).toBe(true);
    expect(isComposerEditorAtBottom({
      scrollHeight: 500,
      scrollTop: 375,
      clientHeight: 120
    })).toBe(false);
  });
});
