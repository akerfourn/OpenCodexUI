import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TOptions } from "i18next";

/** Applies the existing Git vocabulary preference, falling back to vocabulary-neutral labels. */
export function useGitTranslation(vocabulary: "simple" | "technical" = "technical") {
  const { t: translate } = useTranslation();
  const t = useCallback((key: string, options?: TOptions) => {
    const separator = key.indexOf(".");
    const namespace = key.slice(0, separator);
    const name = key.slice(separator + 1);
    return translate([`${namespace}.${vocabulary}.${name}`, key], options);
  }, [translate, vocabulary]);
  return { t };
}
