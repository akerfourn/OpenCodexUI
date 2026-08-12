import { describe, expect, it, vi } from "vitest";
import type { useTranslation } from "react-i18next";

import type { OpenCodexSource } from "@open-codex-ui/opencodex-protocol";

import {
  getCodexStatusLabel,
  getCodexUpdateLabel,
  getSourceKindLabelKey
} from "../src/components/home/sourcePresentation";

type Translate = ReturnType<typeof useTranslation>["t"];

describe("source presentation", () => {
  it.each([
    ["local", "sources.kindLocal"],
    ["wsl", "sources.kindWsl"],
    ["ssh", "sources.kindSsh"],
    ["custom", "sources.kindCustom"]
  ] as const)("should map the %s source kind", (kind, expectedKey) => {
    expect(getSourceKindLabelKey(kind)).toBe(expectedKey);
  });

  it("should describe a ready Codex version", () => {
    const translate = createTranslate();

    const label = getCodexStatusLabel("ready", "1.2.3", translate);

    expect(label).toBe("sources.codexDetected");
    expect(translate).toHaveBeenCalledWith("sources.codexDetected", { version: "1.2.3" });
  });

  it("should use the unknown-version label for an outdated Codex", () => {
    const translate = createTranslate();

    const label = getCodexStatusLabel("outdated", null, translate);

    expect(label).toBe("sources.codexOutdated");
    expect(translate).toHaveBeenCalledWith("sources.unknownVersion");
    expect(translate).toHaveBeenCalledWith("sources.codexOutdated", {
      version: "sources.unknownVersion"
    });
  });

  it("should describe an unavailable Codex", () => {
    const translate = createTranslate();

    expect(getCodexStatusLabel("unavailable", null, translate)).toBe(
      "sources.codexUnavailable"
    );
  });

  it("should describe an available Codex update", () => {
    const translate = createTranslate();
    const source = createSource({
      updateAvailable: true,
      latestVersion: "2.0.0",
      message: null
    });

    const label = getCodexUpdateLabel(source, translate);

    expect(label).toBe("sources.codexUpdateAvailable");
    expect(translate).toHaveBeenCalledWith("sources.codexUpdateAvailable", {
      version: "2.0.0"
    });
  });

  it("should describe an update check with no known latest version", () => {
    const translate = createTranslate();
    const source = createSource({
      updateAvailable: false,
      latestVersion: null,
      message: "Registry unavailable"
    });

    expect(getCodexUpdateLabel(source, translate)).toBe("sources.codexUpdateUnknown");
  });

  it("should describe a current Codex installation", () => {
    const translate = createTranslate();
    const source = createSource({
      updateAvailable: false,
      latestVersion: "1.2.3",
      message: null
    });

    expect(getCodexUpdateLabel(source, translate)).toBe("sources.codexUpdateCurrent");
  });
});

/** Creates a translation spy that returns the requested key. */
function createTranslate(): Translate {
  return vi.fn((key: string) => key) as unknown as Translate;
}

/** Creates the source fields consumed by the update-label helper. */
function createSource(
  codexUpdate: Pick<OpenCodexSource["codexUpdate"], "updateAvailable" | "latestVersion" | "message">
): OpenCodexSource {
  return {
    codexUpdate
  } as OpenCodexSource;
}
