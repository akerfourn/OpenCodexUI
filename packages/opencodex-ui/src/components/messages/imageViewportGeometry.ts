export interface ImageSize {
  width: number;
  height: number;
}

export interface ImageTransform {
  scale: number;
  x: number;
  y: number;
}

/** Fits an image without enlarging images that already fit at their actual size. */
export function fitImageScale(image: ImageSize, viewport: ImageSize): number {
  if (image.width <= 0 || image.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return 1;
  return Math.min(1, viewport.width / image.width, viewport.height / image.height);
}

/** Keeps the image centered on axes that fit and prevents dragging it out of view. */
export function clampImageTransform(
  transform: ImageTransform, image: ImageSize, viewport: ImageSize
): ImageTransform {
  const limitX = Math.max(0, (image.width * transform.scale - viewport.width) / 2);
  const limitY = Math.max(0, (image.height * transform.scale - viewport.height) / 2);
  let x = 0;
  let y = 0;
  if (limitX > 0) x = Math.max(-limitX, Math.min(limitX, transform.x));
  if (limitY > 0) y = Math.max(-limitY, Math.min(limitY, transform.y));
  return { scale: transform.scale, x, y };
}

/** Zooms around a viewport-relative focal point, keeping the inspected detail under the cursor. */
export function zoomImageAt(
  transform: ImageTransform, scale: number, focal: { x: number; y: number },
  image: ImageSize, viewport: ImageSize
): ImageTransform {
  const minimum = Math.min(1 / 16, fitImageScale(image, viewport));
  const nextScale = Math.max(minimum, Math.min(16, scale));
  const ratio = nextScale / transform.scale;
  return clampImageTransform({ scale: nextScale,
    x: focal.x - (focal.x - transform.x) * ratio,
    y: focal.y - (focal.y - transform.y) * ratio }, image, viewport);
}
