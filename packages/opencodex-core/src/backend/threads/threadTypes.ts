/**
 * Internal backend thread extensions.
 */
import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

export type OpenCodexThreadWithProjectState = OpenCodexThread & {
  projectHidden?: boolean;
};

