/**
 * Declares the normalized error payload sent through the OpenCodex protocol.
 */
export type OpenCodexErrorResponse = {
  message: string;
  details?: unknown;
};
