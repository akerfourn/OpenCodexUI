import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import { Box, Tooltip } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { OpenCodexProject } from "@open-codex-ui/opencodex-protocol";
import { useGitTranslation } from "../../i18n/useGitTranslation";
import type { HomeProjectGitStore } from "../../stores/app/HomeProjectGitStore";

interface HomeProjectGitIndicatorProps {
  project: OpenCodexProject;
  store?: HomeProjectGitStore;
}

/** Loads only visible rows and describes local observations without implying a fresh remote fetch. */
export function HomeProjectGitIndicator({ project, store }: HomeProjectGitIndicatorProps) {
  const { t, i18n } = useTranslation();
  const { t: gitT } = useGitTranslation(store?.vocabulary);
  const anchor = useRef<HTMLSpanElement>(null);
  const available = store?.isAvailable(project) === true;
  useEffect(() => {
    if (store === undefined || !available || anchor.current === null) return;
    let release: (() => void) | undefined;
    if (typeof IntersectionObserver === "undefined") return store.watch(project);
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        if (release === undefined) release = store.watch(project);
      } else {
        release?.();
        release = undefined;
      }
    });
    observer.observe(anchor.current);
    return () => { observer.disconnect(); release?.(); };
  }, [store, project.id, project.path, project.sourceId, available]);

  const snapshot = store?.snapshotFor(project);
  const descriptions: string[] = [];
  let color = "text.secondary";
  if (snapshot?.failed === true) {
    descriptions.push(t("home.projectGitUnavailable"));
    color = "warning.main";
  } else if (snapshot?.isRepository === true) {
    if (snapshot.aheadCount > 0) {
      descriptions.push(gitT("git.pushChanges", { count: snapshot.aheadCount }));
      color = "primary.main";
    }
    if (snapshot.hasChanges) descriptions.push(t("home.projectGitUncommitted"));
  }
  let indicator = null;
  if (snapshot !== undefined && descriptions.length > 0) {
    const label = descriptions.join(". ");
    const details = [...descriptions];
    if (!snapshot.failed) {
      details.push(t("home.projectGitBranch", { branch: snapshot.branchName ?? gitT("git.noBranch") }));
      const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" })
        .format(snapshot.checkedAt);
      details.push(t("home.projectGitCheckedAt", { date }));
      if (snapshot.aheadCount > 0) details.push(t("home.projectGitLocalComparison"));
    }
    indicator = <Tooltip title={details.join("\n")} placement="left" disableInteractive
      slotProps={{ tooltip: { sx: { whiteSpace: "pre-line" } } }}>
      <Box component="span" role="img" aria-label={label} sx={{ display: "inline-flex", color }}>
        <AccountTreeOutlinedIcon sx={{ fontSize: 18 }} />
      </Box>
    </Tooltip>;
  }
  return <Box component="span" ref={anchor}
    sx={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 24px", ml: 0.5 }}>
    {indicator}
  </Box>;
}

export const HomeProjectGitIndicatorX = observer(HomeProjectGitIndicator);
