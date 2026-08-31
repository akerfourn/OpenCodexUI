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

  it("should_warn_in_french_when_project_activity_is_pending", () => {
    expect(buildAppCloseConfirmationOptions("fr", false, true)).toMatchObject({
      type: "warning",
      message: "Des activités de projet sont encore en cours ou en attente.",
      detail: "Quitter maintenant peut laisser un travail de projet inachevé.",
      buttons: ["Quitter malgré tout", "Annuler"],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    });
  });

  it("should_combine_active_turns_and_project_activity_in_english", () => {
    expect(buildAppCloseConfirmationOptions("en", true, true)).toMatchObject({
      type: "warning",
      message: "Codex turns and project activity are still running or pending.",
      detail: "Quitting now may interrupt or leave project work unfinished.",
      buttons: ["Quit anyway", "Cancel"]
    });
  });
});
