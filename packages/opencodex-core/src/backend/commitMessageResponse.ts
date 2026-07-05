export type CommitMessageJson = {
  message: string;
};

export const commitMessageOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message"],
  properties: {
    message: {
      type: "string",
      minLength: 1
    }
  }
};

/**
 * Parses and validates the JSON object returned by commit generation.
 *
 * @param text Raw final answer returned by Codex.
 * @returns Validated commit message payload.
 * @throws When the answer is not valid JSON or has no non-empty message.
 */
export function parseCommitMessageResponse(text: string): CommitMessageJson {
  const trimmed = stripJsonFence(text.trim());
  const parsed = JSON.parse(trimmed) as Partial<CommitMessageJson>;

  if (typeof parsed.message !== "string" || parsed.message.trim().length === 0) {
    throw new Error("Commit message generation returned an invalid response.");
  }

  return {
    message: parsed.message.trim()
  };
}

/**
 * Removes an optional JSON Markdown fence around a model response.
 *
 * @param value Trimmed response text.
 * @returns Bare JSON string.
 */
function stripJsonFence(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}
