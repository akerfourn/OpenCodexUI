import { describe, expect, it } from "vitest";

import { buildCommitMessageGenerationPrompt } from "../src/backend/commitMessagePrompt";

describe("buildCommitMessageGenerationPrompt", () => {
  it("should interpolate compact staged summaries", () => {
    const prompt = buildCommitMessageGenerationPrompt({
      template: [
        "Language: ##LANG##",
        "Rules: ##USER_PROMPT##",
        "Instruction: ##EXTRA_PROMPT##",
        "Stat: ##STAGED_STAT##",
        "Status: ##STAGED_STATUS##",
        "Lines: ##STAGED_NUMSTAT##"
      ].join("\n"),
      prompt: "Use Conventional Commits.",
      instruction: "Include the ticket number.",
      language: "en",
      stagedContext: {
        stat: " logo.svg | 1000 +++++",
        nameStatus: "A\tlogo.svg",
        numStat: "1000\t0\tlogo.svg"
      }
    });

    expect(prompt).toContain("Language: English");
    expect(prompt).toContain("Rules: Use Conventional Commits.");
    expect(prompt).toContain("Instruction: Include the ticket number.");
    expect(prompt).toContain("Stat: ```\nlogo.svg | 1000 +++++\n```");
    expect(prompt).toContain("Status: ```\nA\tlogo.svg\n```");
    expect(prompt).toContain("Lines: ```\n1000\t0\tlogo.svg\n```");
    expect(prompt).not.toContain("##");
  });
});
