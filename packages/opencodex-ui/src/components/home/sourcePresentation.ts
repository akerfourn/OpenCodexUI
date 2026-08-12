import type { useTranslation } from "react-i18next";

import type { OpenCodexSource } from "@open-codex-ui/opencodex-protocol";

/**
 * Maps a source kind to the localized short label used in source cards.
 *
 * @param kind Source kind.
 * @returns i18n key.
 */
export function getSourceKindLabelKey(kind: OpenCodexSource["kind"]): string {
  switch (kind) {
    case "custom":
      return "sources.kindCustom";
    case "ssh":
      return "sources.kindSsh";
    case "wsl":
      return "sources.kindWsl";
    default:
      return "sources.kindLocal";
  }
}

/**
 * Formats the detected Codex availability status.
 *
 * @param status Codex availability status.
 * @param version Detected Codex version.
 * @param translate Translation function.
 * @returns User-visible status text.
 */
export function getCodexStatusLabel(
  status: "ready" | "outdated" | "unavailable",
  version: string | null,
  translate: ReturnType<typeof useTranslation>["t"]
): string {
  if (status === "ready") {
    return translate("sources.codexDetected", {
      version: version ?? translate("sources.unknownVersion")
    });
  }

  if (status === "outdated") {
    return translate("sources.codexOutdated", {
      version: version ?? translate("sources.unknownVersion")
    });
  }

  return translate("sources.codexUnavailable");
}

/**
 * Formats update availability for a Codex source.
 *
 * @param source Source DTO.
 * @param translate Translation function.
 * @returns User-visible update status.
 */
export function getCodexUpdateLabel(
  source: OpenCodexSource,
  translate: ReturnType<typeof useTranslation>["t"]
): string {
  if (source.codexUpdate.updateAvailable) {
    return translate("sources.codexUpdateAvailable", {
      version: source.codexUpdate.latestVersion ?? translate("sources.unknownVersion")
    });
  }

  if (source.codexUpdate.message !== null && source.codexUpdate.latestVersion === null) {
    return translate("sources.codexUpdateUnknown");
  }

  return translate("sources.codexUpdateCurrent");
}
