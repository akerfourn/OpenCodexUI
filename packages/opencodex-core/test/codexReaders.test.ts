/**
 * Covers model capability normalization from Codex app-server responses.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";

import { readModels, readThreadPages } from "../src/backend/shared/codexReaders";

describe("Codex model readers", () => {
  it("should preserve model-specific reasoning efforts and defaults", () => {
    const models = readModels({
      data: [
        {
          id: "gpt-5.6-terra",
          displayName: "GPT-5.6 Terra",
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: "Fast" },
            { reasoningEffort: "max", description: "Maximum" },
            { reasoningEffort: "max", description: "Duplicate" }
          ],
          serviceTiers: []
        }
      ]
    });

    expect(models[0]).toMatchObject({
      id: "gpt-5.6-terra",
      defaultReasoningEffort: "medium",
      supportedReasoningEfforts: [
        { reasoningEffort: "low", description: "Fast" },
        { reasoningEffort: "max", description: "Maximum" }
      ]
    });
  });

  it("should accept future reasoning effort identifiers", () => {
    const models = readModels({
      data: [
        {
          model: "future-model",
          supportedReasoningLevels: [
            { effort: "experimental", description: "Future level" }
          ]
        }
      ]
    });

    expect(models[0]?.supportedReasoningEfforts).toEqual([
      { reasoningEffort: "experimental", description: "Future level" }
    ]);
  });
});

describe("Codex thread readers", () => {
  it("should read the same paginated catalog through both transports", async () => {
    const fixture = JSON.parse(readFileSync(new URL(
      "../../../tests/fixtures/codex-rpc/thread-catalog.json", import.meta.url
    ), "utf8"));
    const direct = vi.fn().mockResolvedValueOnce(fixture.codexPages[0]).mockResolvedValueOnce(fixture.codexPages[1]);
    const daemon = vi.fn().mockResolvedValueOnce(fixture.daemonPages[0]).mockResolvedValueOnce(fixture.daemonPages[1]);
    const filters = {
      limit: 1, sortKey: "updated_at", sortDirection: "desc",
      cwd: "C:\\Work\\Project", archived: false, sourceKinds: ["subAgent"],
      searchTerm: "Worker", ancestorThreadId: "parent"
    } as const;
    const params = { ...filters, sourceKinds: [...filters.sourceKinds] };

    const directThreads = await readThreadPages({ listThreads: direct } as unknown as CodexAppServerClient, params);
    const daemonThreads = await readThreadPages({
      usesDaemonSession: true, request: daemon
    } as unknown as CodexAppServerClient, params);

    expect(daemonThreads).toEqual(directThreads);
    expect(daemonThreads.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: "worker", title: "Worker" }, { id: "parent", title: "Fallback title" }
    ]);
    expect(daemon.mock.calls).toEqual([
      ["opencodex/threads/list", {
        pageSize: 1, sortBy: "updatedAt", sortDirection: "desc", workingDirectories: [filters.cwd],
        archived: false, sourceKinds: ["subAgent"], searchTerm: "Worker", ancestorThreadId: "parent"
      }],
      ["opencodex/threads/list", expect.objectContaining({ cursor: fixture.daemonPages[0].nextCursor })]
    ]);
  });

  it("should deduplicate threads repeated across paginated responses", async () => {
    const responses: unknown[] = [
      {
        data: [
          { id: "thread-1", name: "First" },
          { id: "thread-2", name: "Second" }
        ],
        nextCursor: "next"
      },
      {
        data: [
          { id: "thread-1", name: "First again" },
          { id: "thread-3", name: "Third" }
        ],
        nextCursor: null
      }
    ];
    const client = {
      listThreads: async () => responses.shift() ?? { data: [] }
    } as CodexAppServerClient;

    const threads = await readThreadPages(client, { limit: 100 });

    expect(threads.map((thread) => thread.id)).toEqual([
      "thread-1",
      "thread-2",
      "thread-3"
    ]);
    expect(threads[0]?.codexTitle).toBe("First");
  });
});
