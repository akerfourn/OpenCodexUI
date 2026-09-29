/** Rendering changes presentation only, never the message sent to the model. */
export interface MessageRenderingOptions {
  markdown: boolean;
  math: boolean;
}

/** Global defaults are independent for human and assistant messages. */
export interface MessageRenderingDefaults {
  user: MessageRenderingOptions;
  assistant: MessageRenderingOptions;
}

/** Null inherits the current global default, including future changes. */
export interface MessageRenderingOverride {
  markdown: boolean | null;
  math: boolean | null;
}

/** Local thread identity stays stable when the conversation changes workspace. */
export interface MessageRenderingContext {
  sourceId: string | null;
  threadId: string;
}

/** Turn and item IDs disambiguate repeated item IDs across turns. */
export interface MessageRenderingEntry extends MessageRenderingOverride {
  turnId: string;
  itemId: string;
}

export type MessageRenderingRequest =
  | { type: "messageRendering.read"; context: MessageRenderingContext }
  | { type: "messageRendering.set"; context: MessageRenderingContext; entry: MessageRenderingEntry };

/** Returns fresh, validated defaults, including for settings written by older versions. */
export function normalizeMessageRenderingDefaults(value?: Partial<MessageRenderingDefaults>): MessageRenderingDefaults {
  return {
    user: {
      markdown: booleanOrDefault(value?.user?.markdown, true),
      math: booleanOrDefault(value?.user?.math, false)
    },
    assistant: {
      markdown: booleanOrDefault(value?.assistant?.markdown, true),
      math: booleanOrDefault(value?.assistant?.math, true)
    }
  };
}

/** Resolves overrides without losing the math preference while Markdown is disabled. */
export function resolveMessageRendering(
  defaults: MessageRenderingDefaults | undefined,
  role: "user" | "assistant",
  override?: MessageRenderingOverride
): MessageRenderingOptions {
  const base = normalizeMessageRenderingDefaults(defaults)[role];
  return { markdown: override?.markdown ?? base.markdown, math: override?.math ?? base.math };
}

/** Rejects malformed values instead of silently persisting an unintended preference. */
function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error("Invalid message rendering preference");
  return value;
}
