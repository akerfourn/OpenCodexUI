import { useEffect, useRef, useState, type PointerEvent, type RefObject, type SyntheticEvent } from "react";
import { clampImageTransform, fitImageScale, zoomImageAt, type ImageSize, type ImageTransform } from "./imageViewportGeometry";

interface ViewportState {
  image: ImageSize;
  viewport: ImageSize;
  transform: ImageTransform;
  isFit: boolean;
}

interface DragOrigin {
  pointerId: number;
  clientX: number;
  clientY: number;
  transform: ImageTransform;
}

interface ImageViewport {
  ref: RefObject<HTMLDivElement>;
  transform: ImageTransform;
  image: ImageSize;
  isReady: boolean;
  isDragging: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onLoad(event: SyntheticEvent<HTMLImageElement>): void;
  onPointerDown(event: PointerEvent<HTMLDivElement>): void;
  onPointerMove(event: PointerEvent<HTMLDivElement>): void;
  onPointerEnd(event: PointerEvent<HTMLDivElement>): void;
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  actualSize(): void;
  toggleZoom(): void;
}

/** Resizes a viewport while preserving deliberate zoom and recentering fitted images. */
function resizeViewport(state: ViewportState, viewport: ImageSize): ViewportState {
  let transform = clampImageTransform(state.transform, state.image, viewport);
  if (state.isFit) transform = { scale: fitImageScale(state.image, viewport), x: 0, y: 0 };
  return { ...state, viewport, transform };
}

/** Owns bounded zoom, pointer capture and non-passive wheel input for one displayed image. */
export function useImageViewport(): ImageViewport {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<DragOrigin | null>(null);
  const [isDragging, setDragging] = useState(false);
  const [state, setState] = useState<ViewportState>({ image: { width: 0, height: 0 },
    viewport: { width: 0, height: 0 }, transform: { scale: 1, x: 0, y: 0 }, isFit: true });

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    /** Measures the usable canvas rather than the dialog or toolbar. */
    function measure(): void {
      if (element === null) return;
      setState(current => resizeViewport(current, { width: element.clientWidth, height: element.clientHeight }));
    }
    /** Prevents page scrolling and anchors wheel zoom at the mouse position. */
    function handleWheel(event: WheelEvent): void {
      event.preventDefault();
      if (element === null) return;
      const bounds = element.getBoundingClientRect();
      let delta = event.deltaY;
      if (event.deltaMode === 1) delta *= 16;
      if (event.deltaMode === 2) delta *= bounds.height;
      const factor = Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.01);
      setState(current => {
        if (current.image.width === 0) return current;
        const transform = zoomImageAt(current.transform, current.transform.scale * factor,
          { x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2 },
          current.image, current.viewport);
        return { ...current, isFit: false, transform };
      });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", handleWheel);
    };
  }, []);

  /** Initializes intrinsic dimensions after decoding, resetting this image to fit. */
  function onLoad(event: SyntheticEvent<HTMLImageElement>): void {
    const image = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight };
    setState(current => ({ ...current, image, isFit: true,
      transform: { scale: fitImageScale(image, current.viewport), x: 0, y: 0 } }));
  }

  /** Captures a primary pointer so dragging continues beyond the visible image. */
  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || !event.isPrimary || state.image.width === 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      transform: state.transform };
    setDragging(true);
  }

  /** Applies pointer movement relative to the original image position without accumulating drift. */
  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const origin = drag.current;
    if (origin === null || origin.pointerId !== event.pointerId) return;
    setState(current => ({ ...current, isFit: false,
      transform: clampImageTransform({ scale: origin.transform.scale,
        x: origin.transform.x + event.clientX - origin.clientX,
        y: origin.transform.y + event.clientY - origin.clientY }, current.image, current.viewport) }));
  }

  /** Releases both mouse and touch drags, including cancellation and lost capture. */
  function onPointerEnd(event: PointerEvent<HTMLDivElement>): void {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  /** Zooms toolbar actions around the canvas center. */
  function zoomBy(factor: number): void {
    setState(current => ({ ...current, isFit: false,
      transform: zoomImageAt(current.transform, current.transform.scale * factor,
        { x: 0, y: 0 }, current.image, current.viewport) }));
  }

  /** Restores the complete image inside the current viewport. */
  function fit(): void {
    setState(current => ({ ...current, isFit: true,
      transform: { scale: fitImageScale(current.image, current.viewport), x: 0, y: 0 } }));
  }

  /** Displays one image pixel per viewport pixel. */
  function actualSize(): void {
    setState(current => ({ ...current, isFit: false,
      transform: clampImageTransform({ ...current.transform, scale: 1 }, current.image, current.viewport) }));
  }

  /** Toggles a useful detail zoom and fit on double-click. */
  function toggleZoom(): void {
    if (!state.isFit) {
      fit();
      return;
    }
    const scale = Math.max(1, state.transform.scale * 2);
    zoomBy(scale / state.transform.scale);
  }

  const minimumScale = Math.min(1 / 16, fitImageScale(state.image, state.viewport));
  return { ref, transform: state.transform, image: state.image, isReady: state.image.width > 0, isDragging,
    canZoomIn: state.transform.scale < 16, canZoomOut: state.transform.scale > minimumScale,
    onLoad, onPointerDown, onPointerMove, onPointerEnd, fit, actualSize, toggleZoom,
    zoomIn: () => zoomBy(1.25), zoomOut: () => zoomBy(1 / 1.25) };
}
