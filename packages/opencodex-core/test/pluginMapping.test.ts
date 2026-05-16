import { describe, expect, it } from "vitest";

import { mapPluginListResponse } from "../src/backend/pluginMapping";

describe("plugin mapping", () => {
  it("should normalize experimental plugin list responses", () => {
    const result = mapPluginListResponse({
      featuredPluginIds: ["github-id"],
      marketplaceLoadErrors: [],
      marketplaces: [
        {
          name: "official",
          path: null,
          interface: { displayName: "Official" },
          plugins: [
            {
              id: "github-id",
              name: "github",
              shareContext: null,
              source: { type: "remote" },
              installed: true,
              enabled: true,
              installPolicy: "AVAILABLE",
              authPolicy: "ON_USE",
              availability: "AVAILABLE",
              keywords: ["issues"],
              interface: {
                displayName: "GitHub",
                shortDescription: "Triage issues",
                longDescription: null,
                developerName: "OpenAI",
                category: "Developer tools",
                capabilities: ["issues"],
                websiteUrl: null,
                privacyPolicyUrl: null,
                termsOfServiceUrl: null,
                defaultPrompt: null,
                brandColor: null,
                composerIcon: null,
                composerIconUrl: null,
                logo: null,
                logoUrl: "https://example.test/logo.png",
                screenshots: [],
                screenshotUrls: []
              }
            }
          ]
        }
      ]
    }, "source-1");

    expect(result).toMatchObject({
      sourceId: "source-1",
      categories: ["Developer tools"],
      featuredPluginIds: ["github-id"],
      marketplaces: [
        {
          name: "official",
          displayName: "Official",
          path: null,
          plugins: [
            {
              id: "github-id",
              name: "github",
              displayName: "GitHub",
              category: "Developer tools",
              installed: true,
              enabled: true,
              installPolicy: "available",
              availability: "available",
              authPolicy: "ON_USE",
              sourceType: "remote",
              isFeatured: true
            }
          ]
        }
      ]
    });
  });
});
