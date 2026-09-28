import { DEBUG_ADVANCED_RULES } from "@open-codex-ui/opencodex-protocol";

/** Defines offline completion and diagnostics for the JSON-owned portion of a debug profile. */
export function debugAdvancedSchema(descriptions: Record<string, string>) {
  const properties: Record<string, object> = {};
  for (const [field, rule] of Object.entries(DEBUG_ADVANCED_RULES)) {
    if (rule.scope !== "common") continue;
    let shape: object;
    if (rule.kind === "boolean") shape = { type: "boolean" };
    else if (rule.kind === "patterns") shape = { type: "array", items: { type: "string", minLength: 1 }, maxItems: 1000 };
    else shape = { type: "object", additionalProperties: { type: "string" }, maxProperties: 1000 };
    properties[field] = { ...shape, description: descriptions[field] };
  }
  return { type: "object", additionalProperties: false, properties };
}
