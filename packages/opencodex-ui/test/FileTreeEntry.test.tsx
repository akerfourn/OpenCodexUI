import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FileTreeEntry } from "../src/components/files/FileTreeEntry";
import type { WorkspaceTreeStore } from "../src/stores/files/WorkspaceTreeStore";
import type { ProjectFilesStore } from "../src/stores/files/ProjectFilesStore";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const tree = { expanded: new Set(), context: { sourceId: "source" } } as WorkspaceTreeStore;
const files = { active: null } as ProjectFilesStore;

describe("symbolic links in the file tree", () => {
  it("should offer expansion for a resolved directory link and show its destination", () => {
    const markup = renderToStaticMarkup(<FileTreeEntry entry={{ name: "alias", kind: "directory",
      linkTarget: "actual" }} tree={tree} files={files} parentPath="" workspaceName="Main" depth={0} />);
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('aria-disabled="true"');
    expect(markup).toContain("alias → actual");
    expect(markup).toContain("LinkOutlinedIcon");
  });

  it("should identify authorized read-only external folders with a lock and access label", () => {
    const markup = renderToStaticMarkup(<FileTreeEntry entry={{ name: "outside", kind: "directory",
      linkTarget: "../data", linkAccess: { destination: "/data", access: "readOnly", external: true } }}
      tree={tree} files={files} parentPath="" workspaceName="Main" depth={0} />);
    expect(markup).toContain("LockOutlinedIcon");
    expect(markup).toContain("files.access.readOnly");
    expect(markup).not.toContain('aria-disabled="true"');
  });

  it("should disable a blocked link while explaining the reason", () => {
    const markup = renderToStaticMarkup(<FileTreeEntry entry={{ name: "outside", kind: "directory",
      linkTarget: "../outside", linkError: "accessDenied",
      linkAccess: { destination: "/outside", access: "denied", external: true } }} tree={tree} files={files}
      parentPath="" workspaceName="Main" depth={0} />);
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain("files.errors.accessDenied");
  });
});
