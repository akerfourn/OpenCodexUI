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

function stripJsonFence(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}
