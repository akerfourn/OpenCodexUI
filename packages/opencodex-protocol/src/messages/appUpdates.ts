/**
 * Describes the update state exposed by the native application host.
 *
 * The renderer receives a plain snapshot rather than an electron-updater
 * object so this contract remains safe to transport over Electron IPC.
 */
export type OpenCodexAppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "error";

/** Progress information for an application update download. */
export interface OpenCodexAppUpdateProgress {
  /** Download completion percentage in the range 0..100. */
  percent: number;
  /** Number of bytes received so far. */
  transferred: number;
  /** Total number of bytes, or zero when unknown. */
  total: number;
  /** Current download speed in bytes per second. */
  bytesPerSecond: number;
}

/** Serializable application update snapshot shared with the renderer. */
export interface OpenCodexAppUpdateState {
  /** Current desktop application version. */
  currentVersion: string;
  /** Whether this packaged build can use the native updater. */
  isSupported: boolean;
  /** Current updater lifecycle status. */
  status: OpenCodexAppUpdateStatus;
  /** Version offered by the update provider, when one is available. */
  availableVersion: string | null;
  /** Release title returned by the provider, when available. */
  releaseName: string | null;
  /** Release publication date returned by the provider, when available. */
  releaseDate: string | null;
  /** Download progress, or `null` when no download is active. */
  progress: OpenCodexAppUpdateProgress | null;
  /** Human-readable error from the last update operation, when any. */
  errorMessage: string | null;
  /** Time of the last completed check, or `null` before the first check. */
  checkedAt: string | null;
}
