import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

import { ActivityKindIcon } from "../src/components/messages/ActivityKindIcon";

describe("ActivityKindIcon", () => {
  it.each([
    ["command", "TerminalOutlinedIcon", "message.activityType.command"],
    ["commandExecution", "TerminalOutlinedIcon", "message.activityType.command"],
    ["collabAgentToolCall", "GroupsOutlinedIcon", "message.activityType.subAgent"],
    ["subAgentActivity", "GroupsOutlinedIcon", "message.activityType.subAgent"],
    ["modelRerouted", "SwapHorizOutlinedIcon", "message.activityType.modelRerouted"],
    ["unknown", "MoreHorizOutlinedIcon", "message.activityType.activity"]
  ])("should render %s with its generic activity tooltip", (kind, icon, label) => {
    const markup = renderToStaticMarkup(<ActivityKindIcon kind={kind} />);

    expect(markup).toContain(`data-testid="${icon}"`);
    expect(markup).toContain(label);
  });
});
