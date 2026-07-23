import { describe, expect, it } from "vitest";

import {
  buildSourceSettings,
  createSourceDraft,
  validateSourceDraft
} from "../src/components/home/sourceConfiguration";

describe("source configuration", () => {
  it("should keep local sources automatic until a detected command is selected", () => {
    const draft = createSourceDraft("local");

    expect(buildSourceSettings(draft)).toMatchObject({
      commandMode: "auto",
      command: null
    });
  });

  it("should build a custom source from a selected detected command", () => {
    const draft = {
      ...createSourceDraft("custom"),
      command: " /opt/codex "
    };

    expect(validateSourceDraft(draft)).toBeNull();
    expect(buildSourceSettings(draft)).toMatchObject({
      commandMode: "custom",
      command: "/opt/codex"
    });
  });

  it("should validate the SSH host and port before creation", () => {
    const draft = {
      ...createSourceDraft("ssh"),
      host: "server.example.com",
      port: "2222"
    };

    expect(validateSourceDraft(draft)).toBeNull();
    expect(validateSourceDraft({ ...draft, port: "70000" })).toBe(
      "sources.validation.portInvalid"
    );
  });
});
