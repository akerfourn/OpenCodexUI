/**
 * Connects optional renderer diagnostics without coupling UI components to
 * Electron.
 */
import type {
  OpenCodexMarkdownRenderPerformanceMetric
} from "@open-codex-ui/opencodex-protocol";

/** Recorder implemented by a host that supports renderer diagnostics. */
export interface RendererPerformanceRecorder {
  isMarkdownRenderPerformanceRecordingEnabled(): boolean;
  recordMarkdownRender(metric: OpenCodexMarkdownRenderPerformanceMetric): void;
}

let activeRecorder: RendererPerformanceRecorder | null = null;

/**
 * Installs the renderer diagnostics recorder for the current UI runtime.
 *
 * @param recorder Host recorder, or `null` to disconnect it.
 * @returns Nothing.
 */
export function setRendererPerformanceRecorder(
  recorder: RendererPerformanceRecorder | null
): void {
  activeRecorder = recorder;
}

/**
 * Records one content-free Markdown render timing when a host is attached.
 *
 * @param metric Markdown render metadata without message content.
 * @returns Nothing.
 */
export function recordMarkdownRenderPerformance(
  metric: OpenCodexMarkdownRenderPerformanceMetric
): void {
  activeRecorder?.recordMarkdownRender(metric);
}

/**
 * Returns whether advanced Markdown timing is currently enabled by the host.
 *
 * @returns Whether Markdown rendering should capture a start timestamp.
 */
export function isMarkdownRenderPerformanceRecordingEnabled(): boolean {
  return activeRecorder?.isMarkdownRenderPerformanceRecordingEnabled() ?? false;
}
