import { useCallback, type ReactNode } from "react";
import type { RootStore } from "../../stores/RootStore";
import { ApplicationErrorContext } from "./applicationErrorContext";

/** Supplies one stable reporting capability to browser and rendering components. */
export function ApplicationErrorProvider({ store, children }: { store: RootStore; children: ReactNode }) {
  const reportError = useCallback((error: unknown, context?: string) => store.reportError(error, context), [store]);
  return <ApplicationErrorContext.Provider value={reportError}>{children}</ApplicationErrorContext.Provider>;
}
