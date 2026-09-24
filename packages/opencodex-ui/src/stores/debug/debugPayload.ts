import type { DebugAction } from "@open-codex-ui/opencodex-protocol";

/** Clones nested observable values even when the action wrapper itself is already plain. */
export function debugPayload(action: DebugAction): DebugAction {
  if (action.kind === "saveConfiguration") {
    const config = action.configuration;
    return { ...action, configuration: { ...config, context: { ...config.context },
      args: config.args === undefined ? undefined : [...config.args] } };
  }
  if (action.kind === "breakpoints") return { ...action, context: { ...action.context },
    breakpoints: action.breakpoints.map(item => ({ ...item, context: { ...item.context } })) };
  if (action.kind === "watches") return { ...action, expressions: [...action.expressions] };
  if (action.kind === "source") return { ...action, source: {
    name: action.source.name, path: action.source.path, sourceReference: action.source.sourceReference
  } };
  return { ...action };
}
