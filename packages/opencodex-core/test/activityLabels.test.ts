import { describe, expect, it } from "vitest";
import { createActivityFromNotification } from "../src/mapping/activityNotificationMapping";
import { createApprovalRequest } from "../src/mapping/approvals";
import { mapTurnsToOpenCodexTurns } from "../src/mapping/turnMapping";

describe("French activity labels", () => {
  it("should preserve accents in live and restored image generation and review activities", () => {
    const items = [
      { id: "image", type: "imageGeneration", status: "completed" },
      { id: "review", type: "enteredReviewMode" }
    ];
    const restored = mapTurnsToOpenCodexTurns("thread", [{ id: "turn", items }]);
    const live = items.map((item) => createActivityFromNotification({
      method: "item/completed",
      params: { threadId: "thread", turnId: "turn", item }
    })?.content);

    expect(restored[0].items.map((item) => item.content))
      .toEqual(["Génération image", "Entrée en mode revue"]);
    expect(live).toEqual(["Génération image", "Entrée en mode revue"]);
  });

  it("should preserve accents in additional permission request titles", () => {
    const approval = createApprovalRequest({
      id: "permissions",
      method: "item/permissions/requestApproval",
      params: { threadId: "thread" }
    }, "fr");

    expect(approval.title).toBe("Permissions supplémentaires demandées");
  });
});
