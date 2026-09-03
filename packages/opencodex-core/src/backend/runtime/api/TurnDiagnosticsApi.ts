import type { OpenCodexTurnDiagnostic } from "@open-codex-ui/opencodex-protocol";

import type { RuntimeEventPort } from "../runtimePorts.js";
import type { TurnDiagnosticsApi as TurnDiagnosticsApiContract } from "./PublicRuntimeApis.js";

/** Handler used by the public turn-diagnostics facade. */
export type TurnDiagnosticsHandler = Pick<
  Required<Pick<RuntimeEventPort, "readTurnDiagnostic">>,
  "readTurnDiagnostic"
>;

/** Public process-local diagnostic queries for individual turns. */
export class TurnDiagnosticsApi implements TurnDiagnosticsApiContract {
  /** Runtime event boundary that owns the diagnostic ring buffer. */
  constructor(private readonly handler: TurnDiagnosticsHandler) {}

  /** Reads the retained diagnostic for one source-aware turn. */
  read(
    threadId: string,
    sourceId: string | null,
    turnId: string
  ): OpenCodexTurnDiagnostic | null {
    return this.handler.readTurnDiagnostic(threadId, sourceId, turnId);
  }
}
