// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexGitStatus } from "@open-codex-ui/opencodex-protocol";
import { ProjectGitCommitSectionX } from "../src/components/projects/ProjectGitCommitSection";
import { createProjectGitChangesFixture, createStatus, createFile } from "./ProjectGitChangesStore.fixture";
import { createTagResult } from "./ProjectGitStatusStore.fixture";

const translate = (key: string): string => key;
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));
let root: Root;
let container: HTMLDivElement;

/** Gives tests explicit control over source response ordering without real clock delays. */
function pendingStatus() {
  let resolve!: (status: OpenCodexGitStatus) => void;
  const promise = new Promise<OpenCodexGitStatus>(finish => { resolve = finish; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Git responses under slow source load", () => {
  it("should keep generation clickable for prepared files while a background status read is pending", async () => {
    const changed = createStatus({ changedFiles: [createFile("src/file.ts")] });
    const staged = createStatus({ stagedFiles: [createFile("src/file.ts")] });
    const test = createProjectGitChangesFixture({ status: changed });
    const reading = pendingStatus();
    test.request.mockImplementation(request => {
      if (request.type === "git.stage") return Promise.resolve(staged);
      if (request.type === "git.status") return reading.promise;
      return Promise.resolve(createTagResult());
    });
    const openDialog = vi.fn();
    await act(async () => root.render(<ProjectGitCommitSectionX commitStore={test.gitStore.commitStore}
      gitLabelsKey="git.simple" generateTooltip="Generate" onOpenGenerateDialog={openDialog} />));
    const button = container.querySelector<HTMLButtonElement>('[aria-label="git.simple.generateMessage"]')!;
    await act(async () => test.gitStore.changesStore.stagePath("src/file.ts"));
    expect(button.disabled).toBe(false);
    let refresh!: Promise<void>;
    await act(async () => { refresh = test.gitStore.statusStore.refresh(); });
    expect(test.gitStore.statusStore.isLoading).toBe(true);
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(openDialog).toHaveBeenCalledOnce();
    await act(async () => { reading.resolve(staged); await refresh; });
    expect(button.disabled).toBe(false);
  });

  it("should discard a read begun before staging instead of replacing newly prepared files", async () => {
    const before = createStatus({ changedFiles: [createFile("src/file.ts")] });
    const after = createStatus({ stagedFiles: [createFile("src/file.ts")] });
    const test = createProjectGitChangesFixture({ status: before });
    const reading = pendingStatus();
    test.request.mockImplementation(request => {
      if (request.type === "git.status") return reading.promise;
      if (request.type === "git.stage") return Promise.resolve(after);
      return Promise.resolve(createTagResult());
    });
    const refresh = test.gitStore.statusStore.refresh();
    await test.gitStore.changesStore.stagePath("src/file.ts");
    reading.resolve(before);
    await refresh;
    expect(test.gitStore.changesStore.stagedFilesCount).toBe(1);
    expect(test.gitStore.statusStore.status).toEqual(after);
    expect(test.gitStore.commitStore.canGenerateCommitMessage).toBe(true);
  });

  it("should retain the newest refresh when responses arrive in reverse order", async () => {
    const test = createProjectGitChangesFixture();
    const first = pendingStatus();
    const second = pendingStatus();
    const newer = createStatus({ stagedFiles: [createFile("new.ts")] });
    test.request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      .mockResolvedValue(createTagResult());
    const previous = test.gitStore.statusStore.refresh();
    const current = test.gitStore.statusStore.refresh();
    second.resolve(newer);
    await current;
    first.resolve(createStatus());
    await previous;
    expect(test.gitStore.statusStore.status).toEqual(newer);
    expect(test.gitStore.statusStore.isLoading).toBe(false);
  });

  it("should keep generation blocked and explain index changes until staging itself finishes", async () => {
    const before = createStatus({ stagedFiles: [createFile("first.ts")] });
    const after = createStatus({ stagedFiles: [createFile("first.ts"), createFile("second.ts")] });
    const test = createProjectGitChangesFixture({ status: before });
    const staging = pendingStatus();
    test.request.mockImplementation(request => {
      if (request.type === "git.stage") return staging.promise;
      if (request.type === "git.status") return Promise.resolve(before);
      return Promise.resolve(createTagResult());
    });
    await act(async () => root.render(<ProjectGitCommitSectionX commitStore={test.gitStore.commitStore}
      gitLabelsKey="git.simple" generateTooltip="Generate" onOpenGenerateDialog={vi.fn()} />));
    const button = container.querySelector<HTMLButtonElement>('[aria-label="git.simple.generateMessage"]')!;
    let preparing!: Promise<void>;
    await act(async () => { preparing = test.gitStore.changesStore.stagePath("second.ts"); });
    await act(async () => test.gitStore.statusStore.refresh());
    expect(test.gitStore.statusStore.isLoading).toBe(true);
    expect(test.gitStore.statusStore.isRefreshing).toBe(false);
    expect(button.disabled).toBe(true);
    expect(container.querySelector('[aria-label="git.generateBlocked.indexUpdating"]')).not.toBeNull();
    await act(async () => { staging.resolve(after); await preparing; });
    expect(button.disabled).toBe(false);
    expect(test.gitStore.statusStore.isLoading).toBe(false);
  });

  it("should prevent duplicate queued staging clicks and release the index after a failed request", async () => {
    const test = createProjectGitChangesFixture({ status: createStatus({ stagedFiles: [createFile("first.ts")] }) });
    let fail!: (error: Error) => void;
    test.request.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
    const staging = test.gitStore.changesStore.stagePath("second.ts");
    await test.gitStore.changesStore.stagePath("second.ts");
    expect(test.request).toHaveBeenCalledOnce();
    expect(test.gitStore.commitStore.generationBlockReason).toBe("indexUpdating");
    fail(new Error("Git index locked"));
    await staging;
    expect(test.gitStore.changesStore.isUpdatingIndex).toBe(false);
    expect(test.gitStore.commitStore.canGenerateCommitMessage).toBe(true);
    expect(test.gitStore.errorMessage).toBe("Git index locked");
  });
});
