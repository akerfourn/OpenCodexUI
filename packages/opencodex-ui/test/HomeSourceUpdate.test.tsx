// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeSourceBoxX } from "../src/components/home/HomeSourceBox";
import { createSourcePermissionsFixture } from "./sourcePermissions.fixture";

vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (key: string, options?: { error?: string }) => {
    if (options?.error !== undefined) return `${key}: ${options.error}`;
    return key;
  }
}) }));

let root: Root;
let container: HTMLDivElement;
let fixture: ReturnType<typeof createSourcePermissionsFixture>;
let update: ReturnType<typeof vi.fn>;

/** Finds the real update action on a WSL source card. */
function updateButton(): HTMLButtonElement {
  return [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find(button => button.textContent === "sources.updateCodex")!;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture = createSourcePermissionsFixture();
  fixture.source = { ...fixture.source, kind: "wsl", settings: {
    color: "blue", distro: "Ubuntu", codexCommand: "/home/test/.local/bin/codex"
  }, codexUpdate: { ...fixture.source.codexUpdate, supported: true, updateAvailable: true } };
  update = vi.fn(async (_sourceId: string) => undefined);
  Object.assign(fixture.root.sourcesStore, { updateCodexSource: update });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => { root.render(<HomeSourceBoxX source={fixture.source} store={fixture.root} isDefault={false}
    isEditing={false} onEdit={vi.fn()} onCloseEdit={vi.fn()} />); });
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("WSL source update controls", () => {
  it("should offer the existing update action for an eligible WSL source and send its explicit identity", async () => {
    expect(updateButton()).toBeDefined();
    await act(async () => { updateButton().click(); });
    expect(update).toHaveBeenCalledWith("source-a");
  });

  it("should block updates and lifecycle controls while the backend owns an update", () => {
    act(() => { fixture.root.sourceInstancesStore.handleEvent({ type: "sourceInstances.changed", snapshot: {
      sourceId: "source-a", phase: "updating", isActive: false, manuallyStopped: false, error: null
    } }); });
    expect(updateButton().disabled).toBe(true);
    expect(container.textContent).toContain("sourceInstances.updating");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="sourceInstances.stop"]')!.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="sourceInstances.restart"]')!.disabled).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it("should display native updater errors on the source without an unhandled rejection", async () => {
    update.mockRejectedValueOnce(new Error("WSL download failed"));
    await act(async () => { updateButton().click(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("WSL download failed");
    expect(updateButton().disabled).toBe(false);
  });
});
