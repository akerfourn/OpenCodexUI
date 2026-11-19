import { describe, expect, it } from "vitest";
import { clampImageTransform, fitImageScale, zoomImageAt } from "../src/components/messages/imageViewportGeometry";

const image = { width: 1600, height: 1200 };
const viewport = { width: 800, height: 600 };

describe("image viewport geometry", () => {
  it("should fit landscape and portrait images without enlarging small images", () => {
    expect(fitImageScale(image, viewport)).toBe(0.5);
    expect(fitImageScale({ width: 200, height: 1200 }, viewport)).toBe(0.5);
    expect(fitImageScale({ width: 100, height: 100 }, viewport)).toBe(1);
  });

  it("should keep a detail under the cursor when zooming", () => {
    const transform = zoomImageAt({ scale: 0.5, x: 0, y: 0 }, 1, { x: 100, y: -50 }, image, viewport);
    expect(transform).toEqual({ scale: 1, x: -100, y: 50 });
  });

  it("should clamp dragging and center axes that fit", () => {
    expect(clampImageTransform({ scale: 1, x: 2000, y: -2000 }, image, viewport))
      .toEqual({ scale: 1, x: 400, y: -300 });
    expect(clampImageTransform({ scale: 0.5, x: 2000, y: -2000 }, image, viewport))
      .toEqual({ scale: 0.5, x: 0, y: 0 });
  });

  it("should preserve fit for huge images while bounding manual magnification", () => {
    const hugeImage = { width: 80000, height: 60000 };
    expect(zoomImageAt({ scale: 1, x: 0, y: 0 }, 0, { x: 0, y: 0 }, hugeImage, viewport).scale).toBe(0.01);
    expect(zoomImageAt({ scale: 1, x: 0, y: 0 }, 100, { x: 0, y: 0 }, image, viewport).scale).toBe(16);
  });
});
