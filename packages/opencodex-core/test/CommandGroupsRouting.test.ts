import { describe, expect, it, vi } from "vitest";
import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { OpenCodexRequestRouter } from "../src/OpenCodexRequestRouter";
import type { OpenCodexBackendRuntime } from "../src/OpenCodexBackendRuntime";
import { requestRoutingRuntime } from "./requestRoutingFixture";

const cases: Array<{ request: OpenCodexRequest; method: string; args: unknown[] }> = [
  { request: { type: "projectCommands.groups.list", projectId: "project" }, method: "list", args: ["project"] },
  { request: { type: "projectCommands.groups.create", projectId: "project", name: "Build" }, method: "create", args: ["project", "Build"] },
  { request: { type: "projectCommands.groups.rename", projectId: "project", name: "Build", newName: "Release" }, method: "rename", args: ["project", "Build", "Release"] },
  { request: { type: "projectCommands.groups.delete", projectId: "project", name: "Build" }, method: "delete", args: ["project", "Build"] },
  { request: { type: "projectCommands.groups.assign", projectId: "project", commandId: "command", name: null }, method: "assign", args: ["project", "command", null] }
];

describe("source-independent command group routing", () => {
  it.each(cases)("should dispatch $method with explicit project identities", async ({ request, method, args }) => {
    const effect = vi.fn(async () => ["Build"]);
    const runtime = { commandGroups: { [method]: effect } } as unknown as OpenCodexBackendRuntime;
    const router = new OpenCodexRequestRouter(requestRoutingRuntime(runtime));
    await expect(router.handleRequest(request)).resolves.toEqual(["Build"]);
    expect(effect).toHaveBeenCalledWith(...args);
  });

  it("should leave errors to the group controls without attempting chat recovery", async () => {
    const handleRequestError = vi.fn();
    const runtime = { commandGroups: { create: vi.fn(async () => { throw new Error("Duplicate group"); }) }, handleRequestError } as unknown as OpenCodexBackendRuntime;
    const router = new OpenCodexRequestRouter(requestRoutingRuntime(runtime));
    await expect(router.handleRequest({ type: "projectCommands.groups.create", projectId: "project", name: "Build" })).rejects.toThrow("Duplicate group");
    expect(handleRequestError).not.toHaveBeenCalled();
  });
});
