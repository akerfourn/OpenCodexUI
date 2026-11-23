import type { OpenCodexProject } from "./messages/projects.js";
import type { OpenCodexThread } from "./messages/threads.js";

/** A personal chat uses the shared execution/file context, outside the user's project catalogue. */
export interface OpenCodexDiscussion {
  /** Internal environment, owned by this discussion, with a fixed source and working directory. */
  environment: OpenCodexProject;
  /** Main conversations in this environment; sub-agents stay in their parent's timeline. */
  threads: OpenCodexThread[];
  /** A persisted identity-allocation attempt that can be retried or abandoned explicitly. */
  pendingCreation?: { clientDraftId: string };
}
