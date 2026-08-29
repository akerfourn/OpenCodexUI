import { describe, expect, it } from "vitest";

import { buildAppCloseConfirmationOptions } from "../src/main/appCloseConfirmation.js";

describe("application close confirmation", () => {
  it("should_warn_in_french_when_codex_turns_are_active", () => {
    expect(buildAppCloseConfirmationOptions("fr", true)).toMatchObject({
      type: "warning",
      title: "Quitter OpenCodexUI ?",
      message: "Un ou plusieurs tours Codex sont encore en cours.",
      detail: "Quitter maintenant interrompra le travail en cours.",
      buttons: ["Quitter malgré tout", "Annuler"],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    });
  });

  it("should_offer_a_simple_english_confirmation_when_no_turn_is_active", () => {
    expect(buildAppCloseConfirmationOptions("en", false)).toMatchObject({
      type: "question",
      title: "Quit OpenCodexUI?",
      message: "Are you sure you want to quit OpenCodexUI?",
      detail: "Codex processes will be stopped.",
      buttons: ["Quit", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    });
  });
});
