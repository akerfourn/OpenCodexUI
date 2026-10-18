import { describe, expect, it, vi } from "vitest";
import type { OpenCodexEvent, OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { ApprovalService } from "../src/backend/support/ApprovalService";

describe("source instance approval cleanup", () => {
  it("should clear only the stopped source prompts even when native IDs are identical", () => {
    const events: OpenCodexEvent[] = [];
    const respond = vi.fn();
    const service = new ApprovalService({
      settings: { getSettings: () => ({ language: "en" } as OpenCodexSettings) },
      events: { emit: event => events.push(event) },
      clients: { getClient: () => ({ respond }) as never }
    });
    const request = { id: 1, method: "item/commandExecution/requestApproval", params: {} };
    service.handleServerRequest(request, "a");
    service.handleServerRequest(request, "b");
    const approvals = events.filter(event => event.type === "approval.requested").map(event => event.approval);
    expect(approvals[0]!.id).not.toBe(approvals[1]!.id);

    service.clearSource("a");
    service.clearSource("a");
    expect(events.filter(event => event.type === "approval.resolved")).toEqual([
      { type: "approval.resolved", approvalId: approvals[0]!.id }
    ]);
    expect(respond).not.toHaveBeenCalled();
    service.resolveApproval(approvals[1]!.id, "accept");
    expect(respond).toHaveBeenCalledWith(1, { decision: "accept" });
    service.resolveApproval(approvals[0]!.id, "accept");
    expect(respond).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({ type: "error" });
  });
});
