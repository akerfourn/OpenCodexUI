// @vitest-environment jsdom
import { observable, runInAction } from "mobx";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectTagListItemX, type ProjectTagListItemProps } from "../src/components/projects/ProjectTagListItem";
import { createTag } from "./ProjectGitTagStore.fixture";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let container: HTMLDivElement;
let root: Root;
let props: ProjectTagListItemProps;

/** Commits row state through the real observed component and Material UI controls. */
function renderRow(patch: Partial<ProjectTagListItemProps> = {}): void {
  props = { ...props, ...patch };
  act(() => { root.render(createElement(ProjectTagListItemX, props)); });
}

/** Finds the publication control independently of its visual icon. */
function pushButton(): HTMLButtonElement | null {
  return container.querySelector('button[aria-label="git.pushTag"]');
}

describe("tag synchronization action", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    props = {
      tag: createTag("v1", "local-only"), remoteName: "origin", isOperationBusy: false,
      canPush: true, isPushing: false, isSelected: false,
      onSelect: vi.fn(), onPush: vi.fn(), onOpenMenu: vi.fn()
    };
    renderRow();
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("should publish a local tag through one orange upload icon without selecting its row", () => {
    const button = pushButton()!;

    expect(container.querySelectorAll('[data-testid="CloudUploadOutlinedIcon"]')).toHaveLength(1);
    expect(button.classList.contains("MuiIconButton-colorWarning")).toBe(true);
    expect(button.disabled).toBe(false);
    act(() => { button.click(); });

    expect(props.onPush).toHaveBeenCalledTimes(1);
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onOpenMenu).not.toHaveBeenCalled();
  });

  it("should retain the upload control while publication is unavailable during another operation", () => {
    renderRow({ canPush: false, isOperationBusy: true });

    expect(pushButton()?.disabled).toBe(true);
    expect(container.querySelectorAll('[data-testid="CloudUploadOutlinedIcon"]')).toHaveLength(1);
    act(() => { pushButton()!.click(); });
    expect(props.onPush).not.toHaveBeenCalled();
  });

  it("should replace the upload icon with a disabled progress indicator during its own push", () => {
    renderRow({ canPush: false, isOperationBusy: true, isPushing: true });

    expect(pushButton()?.disabled).toBe(true);
    expect(pushButton()?.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="CloudUploadOutlinedIcon"]')).toBeNull();
  });

  it("should show a synchronized status without offering another normal push", () => {
    renderRow({ tag: createTag("v1", "synced"), canPush: false });

    expect(pushButton()).toBeNull();
    expect(container.querySelectorAll('[data-testid="CloudDoneOutlinedIcon"]')).toHaveLength(1);
    expect(container.querySelector('button[aria-label="git.tagActions"]')).not.toBeNull();
  });

  it("should preserve a divergence warning and its action menu without a second upload icon", () => {
    renderRow({ tag: createTag("v1", "diverged") });

    expect(pushButton()?.classList.contains("MuiIconButton-colorError")).toBe(true);
    expect(pushButton()?.querySelector('[data-testid="ErrorOutlineOutlinedIcon"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="CloudUploadOutlinedIcon"]')).toBeNull();
    const menu = container.querySelector<HTMLButtonElement>('button[aria-label="git.tagActions"]')!;
    act(() => { menu.click(); });
    expect(props.onOpenMenu).toHaveBeenCalledTimes(1);
    expect(props.onPush).not.toHaveBeenCalled();
  });

  it.each(["local-only", "unknown"] as const)("should retain the %s indicator without publication when no remote exists", (status) => {
    renderRow({ tag: createTag("v1", status), remoteName: null, canPush: false });

    expect(pushButton()).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="git.tagActions"]')?.disabled).toBe(true);
    expect(container.querySelectorAll('[data-testid="CloudUploadOutlinedIcon"], [data-testid="CloudOffOutlinedIcon"]'))
      .toHaveLength(1);
  });

  it("should react to synchronization updates on an observable tag without replacing its props", () => {
    const tag = observable(createTag("v1", "local-only"));
    renderRow({ tag });

    act(() => { runInAction(() => { tag.syncStatus = "synced"; }); });

    expect(pushButton()).toBeNull();
    expect(container.querySelector('[data-testid="CloudDoneOutlinedIcon"]')).not.toBeNull();
  });
});
