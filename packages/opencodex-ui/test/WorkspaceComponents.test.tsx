import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import { WorkspaceListActions } from "../src/components/projects/WorkspaceListActions";
import { WorkspaceThreadGroup } from "../src/components/projects/WorkspaceThreadGroup";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const workspace: OpenCodexProjectWorkspace = { id: "B", projectId: "project", sourceId: "source",
  name: "Interface", path: "/repo/technical-checkout", isPrimary: false, managed: true, removedAt: null };
const project = { isReadOnlyFromCache: false, threadListStore: { isCreatingThread: false },
  workspaces: { workspaces: [workspace], pending: [], skipped: [], error: null,
    isBusy: false, load: vi.fn() } } as unknown as ProjectStore;

describe("workspace sidebar controls", () => {
  it("should expose workspace creation without an immediate conversation switch or import button", () => {
    const html = renderToStaticMarkup(<WorkspaceListActions project={project} />);
    expect(html).toContain("workspaces.create");
    expect(html).toContain("workspaces.manage");
    expect(html).not.toContain("workspaces.switch");
    expect(html).not.toContain("workspaces.discover");
  });

  it("should display the workspace name with local chat creation, keeping its path in properties", () => {
    const html = renderToStaticMarkup(<WorkspaceThreadGroup project={project} root={{} as RootStore}
      group={{ id: "B", workspace, path: workspace.path, threads: [] }} onOpenSubAgentDialog={vi.fn()} />);
    expect(html).toContain("Interface");
    expect(html).toContain("workspaces.newConversationIn");
    expect(html).toContain("workspaces.empty");
    expect(html).not.toContain(workspace.path);
  });
});
