// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeSourceInstanceX } from "../src/components/home/HomeSourceInstance";
import { instanceSnapshot, instanceStore } from "./sourceInstances.fixture";

vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (key: string, options?: { methods?: string }) => {
    if (options?.methods !== undefined) return `${key}:${options.methods}`;
    return key;
  }
}) }));

let root: Root;
let container: HTMLDivElement;
let fixture: ReturnType<typeof instanceStore>;

/** Finds an instance action by accessible name, or its dialog submit by text. */
function button(action: string, dialog = false): HTMLButtonElement {
  const scope = dialog ? document.querySelector('[role="dialog"]')! : container;
  const result = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(element => {
    return element.getAttribute("aria-label") === `sourceInstances.${action}`
      || element.textContent === `sourceInstances.${action}`;
  });
  if (result === undefined) throw new Error(`Missing action: ${action}`);
  return result;
}

/** Opens a confirmation through the real source controls. */
async function open(action = "stop"): Promise<void> {
  await act(async () => { button(action).click(); });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture = instanceStore();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => { root.render(<HomeSourceInstanceX sourceId="a" sourceName="Local" instances={fixture.instances} />); });
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("source instance controls", () => {
  it("should pulse only while active without sending status or lifecycle requests during rendering", () => {
    expect(container.textContent).toContain("sourceInstances.ready");
    expect(container.querySelector('[data-active="false"]')).not.toBeNull();
    act(() => { fixture.instances.handleEvent({ type: "sourceInstances.changed", snapshot: instanceSnapshot({ isActive: true }) }); });
    expect(container.textContent).toContain("sourceInstances.active");
    expect(container.querySelector('[data-active="true"]')).not.toBeNull();
    expect(fixture.request).not.toHaveBeenCalled();
  });

  it("should require the checkbox for busy sources and send force only after acknowledgement", async () => {
    act(() => { fixture.instances.handleEvent({ type: "sourceInstances.changed", snapshot: instanceSnapshot({ isActive: true }) }); });
    await open();
    expect(button("stop", true).disabled).toBe(true);
    expect(document.body.textContent).toContain("sourceInstances.busy");
    await act(async () => { button("stop", true).click(); });
    expect(fixture.request).not.toHaveBeenCalled();
    await act(async () => { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    expect(button("stop", true).disabled).toBe(false);
    await act(async () => { button("stop", true).click(); });
    expect(fixture.request.mock.calls).toEqual([[{ type: "sourceInstances.stop", sourceId: "a", force: true }]]);
  });

  it("should submit an ordinary idle restart without force", async () => {
    await open("restart");
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("sourceInstances.idle");
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("sourceInstances.forceHelp");
    expect(document.querySelector('[role="alert"]')).toBeNull();
    await act(async () => { button("restart", true).click(); });
    expect(fixture.request.mock.calls).toEqual([[{ type: "sourceInstances.restart", sourceId: "a", force: false }]]);
  });

  it("should discard force acknowledgement when the user cancels", async () => {
    act(() => { fixture.instances.handleEvent({ type: "sourceInstances.changed", snapshot: instanceSnapshot({ isActive: true }) }); });
    await open();
    await act(async () => { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    await act(async () => { button("cancel", true).click(); });
    await open();
    expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
    expect(button("stop", true).disabled).toBe(true);
    expect(fixture.request).not.toHaveBeenCalled();
  });

  it("should require acknowledgement if work starts while the confirmation is open", async () => {
    await open();
    expect(button("stop", true).disabled).toBe(false);
    act(() => { fixture.instances.handleEvent({ type: "sourceInstances.changed", snapshot: instanceSnapshot({ isActive: true }) }); });
    expect(button("stop", true).disabled).toBe(true);
  });

  it("should show a busy rejection without retrying or automatically checking force", async () => {
    fixture.request.mockRejectedValueOnce(new Error("SOURCE_BUSY"));
    await open();
    await act(async () => { button("stop", true).click(); });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("SOURCE_BUSY");
    expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
    expect(button("stop", true).disabled).toBe(true);
    expect(fixture.request).toHaveBeenCalledOnce();
  });

  it("should clear a past busy rejection when a fresh native state confirms idle", async () => {
    fixture.request.mockRejectedValueOnce(new Error("SOURCE_BUSY"));
    await open();
    await act(async () => { button("stop", true).click(); });
    expect(button("stop", true).disabled).toBe(true);
    act(() => { fixture.instances.handleEvent({ type: "sourceInstances.changed", snapshot: instanceSnapshot() }); });
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
    expect(button("stop", true).disabled).toBe(false);
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("SOURCE_BUSY");
    expect(fixture.request).toHaveBeenCalledOnce();
  });

  it("should expose changing activity reasons while the same source stays busy", async () => {
    const activity = { requestMethods: ["command/exec"], turnCount: 0, threadCount: 0, approvalCount: 0, processCount: 0 };
    act(() => { fixture.instances.handleEvent({ type: "sourceInstances.changed",
      snapshot: instanceSnapshot({ isActive: true, activity }) }); });
    await open();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("command/exec");
    act(() => { fixture.instances.handleEvent({ type: "sourceInstances.changed",
      snapshot: instanceSnapshot({ isActive: true, activity: { ...activity, requestMethods: [], approvalCount: 1 } }) }); });
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("command/exec");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("sourceInstances.approvals");
  });

  it("should remove interruption warnings and submit without force if work finishes in the open dialog", async () => {
    act(() => { fixture.instances.handleEvent({ type: "sourceInstances.changed", snapshot: instanceSnapshot({ isActive: true }) }); });
    await open();
    await act(async () => { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    act(() => { fixture.instances.handleEvent({ type: "sourceInstances.changed", snapshot: instanceSnapshot() }); });
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    await act(async () => { button("stop", true).click(); });
    expect(fixture.request.mock.calls).toEqual([[{ type: "sourceInstances.stop", sourceId: "a", force: false }]]);
  });

  it("should expose explicit start for manually stopped sources", async () => {
    act(() => { fixture.instances.handleEvent({ type: "sourceInstances.changed",
      snapshot: instanceSnapshot({ phase: "stopped", manuallyStopped: true }) }); });
    expect(button("restart").disabled).toBe(true);
    await act(async () => { button("start").click(); });
    expect(fixture.request.mock.calls).toEqual([[{ type: "sourceInstances.start", sourceId: "a" }]]);
  });

  it("should allow cancelling a hung initialization through the force confirmation", async () => {
    act(() => { fixture.instances.handleEvent({ type: "sourceInstances.changed", snapshot: instanceSnapshot({ phase: "starting" }) }); });
    await open();
    expect(button("stop", true).disabled).toBe(true);
    await act(async () => { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    await act(async () => { button("stop", true).click(); });
    expect(fixture.request.mock.calls).toEqual([[{ type: "sourceInstances.stop", sourceId: "a", force: true }]]);
  });
});
