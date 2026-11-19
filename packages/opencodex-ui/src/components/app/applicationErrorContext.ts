import { createContext, useContext } from "react";

/** Local browser failures can be reported without a component depending on application stores. */
export type ApplicationErrorHandler = (error: unknown, context?: string) => void;
export const ApplicationErrorContext = createContext<ApplicationErrorHandler | null>(null);

/** Allows isolated component previews without starting an application transport. */
function ignorePreviewError(): void {}

/** Reads the journal boundary; callers report at failure time rather than replaying errors on mount. */
export function useApplicationErrorReporter(): ApplicationErrorHandler {
  return useContext(ApplicationErrorContext) ?? ignorePreviewError;
}
