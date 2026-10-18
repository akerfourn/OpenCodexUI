// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeSourceBoxX } from "../src/components/home/HomeSourceBox";
import { createSourcePermissionsFixture, sourcePermissionSnapshot } from "./sourcePermissions.fixture";

vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (key: string, options?: { name?: string; names?: string }) => {
    if (options?.name !== undefined) return `${key}:${options.name}`;
    if (options?.names !== undefined) return `${key}:${options.names}`;
    return key;
  }
}) }));

let root: Root;
let container: HTMLDivElement;
let fixture: ReturnType<typeof createSourcePermissionsFixture>;
let onEdit: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;

/** Renders the same source card and its real configuration dialog. */
function render(isEditing: boolean, isDefault = false): void {
  act(() => { root.render(createElement(HomeSourceBoxX, { source: fixture.source, store: fixture.root,
    isDefault, isEditing, onEdit, onCloseEdit: onClose })); });
}

/** Finds a real accessible button or tab without depending on generated MUI classes. */
function control(label: string, role = "button"): HTMLElement {
  const element = [...document.querySelectorAll<HTMLElement>(`[role="${role}"], ${role}`)]
    .find(item => item.textContent === label || item.getAttribute("aria-label") === label);
  if (element === undefined) throw new Error(`Missing control ${label}`);
  return element;
}

/** Opens only the permissions tab; connection editing performs no native reads. */
async function openPermissions(): Promise<void> {
  await act(async () => { control("sourcePermissions.permissions", "tab").click(); });
}

/** Chooses a MUI option through the same events used in the browser. */
async function select(labelId: string, value: string): Promise<void> {
  const combobox = document.querySelector<HTMLElement>(`[role="combobox"][aria-labelledby^="${labelId}"]`)!;
  await act(async () => { combobox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); });
  await act(async () => { document.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`)!.click(); });
}

describe("source configuration and compact actions", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    fixture = createSourcePermissionsFixture();
    onEdit = vi.fn();
    onClose = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("should replace the large default action with a compact accessible star and keep Configure visible", async () => {
    render(false);
    const star = control("sources.setDefault") as HTMLButtonElement;
    expect(star.textContent).toBe("");
    expect(star.getAttribute("aria-pressed")).toBe("false");
    expect(star.querySelector('[data-testid="StarBorderOutlinedIcon"]')).not.toBeNull();

    await act(async () => { star.click(); });
    await act(async () => { control("sourcePermissions.configure").click(); });

    expect(fixture.root.appStore.settingsStore.setDefaultSourceId).toHaveBeenCalledWith("source-a");
    expect(onEdit).toHaveBeenCalledWith("source-a");
    expect(getComputedStyle(control("sourcePermissions.configure")).opacity).not.toBe("0");
    render(false, true);
    const selectedStar = control("sourcePermissions.defaultSource") as HTMLButtonElement;
    expect(selectedStar.disabled).toBe(true);
    expect(selectedStar.querySelector('[data-testid="StarRoundedIcon"]')).not.toBeNull();
    expect(document.body.textContent).toContain("sources.default");
  });

  it("should identify the source and load defaults only when their tab opens", async () => {
    render(true);
    expect(document.body.textContent).toContain("sourcePermissions.title:Local test");
    expect(control("sourcePermissions.connection", "tab").getAttribute("aria-selected")).toBe("true");
    expect(fixture.request).not.toHaveBeenCalled();

    await openPermissions();

    expect(fixture.request.mock.calls).toEqual([[{ type: "sourcePermissions.read", sourceId: "source-a" }]]);
    expect(document.body.textContent).toContain("sourcePermissions.scope");
    expect((control("sourcePermissions.apply") as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain("sourcePermissions.readOnly");
  });

  it("should apply source defaults and keep connection edits independent", async () => {
    render(true);
    await openPermissions();
    await select("source-permission-filesystem-label", "workspace-write");
    await act(async () => { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    await select("source-permission-policy-label", "untrusted");
    await select("source-permission-reviewer-label", "auto_review");
    fixture.request.mockResolvedValueOnce(sourcePermissionSnapshot({ filesystem: "workspace-write", networkAccess: true,
      approvalPolicy: "untrusted", approvalsReviewer: "auto_review", revision: "confirmed" }));

    await act(async () => { control("sourcePermissions.apply").click(); });

    expect(fixture.request.mock.calls[1]![0]).toEqual({ type: "sourcePermissions.change", sourceId: "source-a",
      revision: "version-1", patch: { filesystem: "workspace-write", networkAccess: true,
        approvalPolicy: "untrusted", approvalsReviewer: "auto_review" } });
    expect(fixture.root.sourcesStore.updateSource).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("sourcePermissions.saved");
  });

  it("should discard unapplied choices on close and reopen with a fresh native read", async () => {
    render(true);
    await openPermissions();
    await select("source-permission-reviewer-label", "auto_review");
    await act(async () => { control("sourcePermissions.cancel").click(); });
    render(false);
    render(true);
    await openPermissions();

    expect(fixture.request.mock.calls.map(([request]) => request.type)).toEqual(["sourcePermissions.read", "sourcePermissions.read"]);
    expect((control("sourcePermissions.apply") as HTMLButtonElement).disabled).toBe(true);
  });

  it("should lock custom access profiles while leaving an allowed reviewer editable", async () => {
    fixture.request.mockResolvedValue(sourcePermissionSnapshot({ profileId: "managed", filesystem: "custom", networkAccess: null,
      editable: { filesystem: false, networkAccess: false, approvalPolicy: false, approvalsReviewer: true },
      sharedSourceIds: ["source-b"] }));
    render(true);

    await openPermissions();

    expect(document.querySelector('[role="combobox"][aria-labelledby^="source-permission-filesystem-label"]')?.getAttribute("aria-disabled")).toBe("true");
    expect(document.body.textContent).toContain("sourcePermissions.protected");
    expect(document.body.textContent).toContain("sourcePermissions.sharedWith:Source source-b");
    await select("source-permission-reviewer-label", "auto_review");
    expect((control("sourcePermissions.apply") as HTMLButtonElement).disabled).toBe(false);
  });

  it("should block dismissal and tab switching until the native write is confirmed", async () => {
    render(true);
    await openPermissions();
    await select("source-permission-reviewer-label", "auto_review");
    let finish!: (value: unknown) => void;
    fixture.request.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await act(async () => { control("sourcePermissions.apply").click(); });

    expect((control("sourcePermissions.cancel") as HTMLButtonElement).disabled).toBe(true);
    expect((control("sourcePermissions.connection", "tab") as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).not.toContain("sourcePermissions.saved");
    await act(async () => { finish(sourcePermissionSnapshot({ approvalsReviewer: "auto_review" })); });
    expect((control("sourcePermissions.cancel") as HTMLButtonElement).disabled).toBe(false);
  });

  it("should retain connection editing when Codex is unavailable", () => {
    vi.mocked(fixture.root.sourcesStore.isSourceReady).mockReturnValue(false);
    render(true);

    expect((control("sourcePermissions.permissions", "tab") as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain("sourcePermissions.unavailable");
    expect(fixture.request).not.toHaveBeenCalled();
    expect((control("sources.save") as HTMLButtonElement).disabled).toBe(false);
  });
});
