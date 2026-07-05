/**
 * Declares the normalized error payload sent through the OpenCodex protocol.
 */
/**
 * Serializable error returned by backend request handlers.
 */
export type OpenCodexErrorResponse = {
  /**
   * Human-readable error message safe to show in the UI.
   */
  message: string;

  /**
   * Optional diagnostic payload for logs and debug views.
   */
  details?: unknown;
};
