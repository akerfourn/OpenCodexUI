import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import { Accordion, AccordionDetails, AccordionSummary, MenuItem, TextField, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import type { ProjectGitSyncStore } from "../../stores/project/git/ProjectGitSyncStore";
import type { OpenCodexGitRemote } from "@open-codex-ui/opencodex-protocol";
import { useGitTranslation } from "../../i18n/useGitTranslation";

interface ProjectGitBranchRemoteProps { sync: ProjectGitSyncStore; remotes: readonly OpenCodexGitRemote[]; disabled: boolean }

/** Keeps a branch-specific publishing destination behind an explicit advanced section. */
export function ProjectGitBranchRemote({ sync, remotes, disabled }: ProjectGitBranchRemoteProps) {
  const { t } = useGitTranslation(sync.vocabulary);
  const selected = sync.configuration?.branchRemote ?? "";
  /** Removing an override restores the repository favorite. */
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    let branchRemote: string | null = event.target.value;
    if (branchRemote.length === 0) branchRemote = null;
    void sync.configure({ branchRemote });
  }
  let missingRemote = null;
  if (selected.length > 0 && !remotes.some(remote => remote.name === selected)) {
    missingRemote = <MenuItem value={selected} disabled>{selected}</MenuItem>;
  }
  if (sync.localBranch === null) return null;
  return (
    <Accordion disableGutters elevation={0}>
      <AccordionSummary expandIcon={<ExpandMoreOutlinedIcon />}><Typography>{t("gitSync.branchOptions")}</Typography></AccordionSummary>
      <AccordionDetails>
        <TextField select fullWidth disabled={disabled} label={t("gitSync.branchRemote", { branch: sync.localBranch })}
          value={selected} onChange={handleChange}
          helperText={t("gitSync.branchRemoteHelp")}>
          <MenuItem value="">{t("gitSync.useFavorite")}</MenuItem>
          {missingRemote}
          {remotes.map(remote => <MenuItem key={remote.name} value={remote.name}>{remote.name}</MenuItem>)}
        </TextField>
      </AccordionDetails>
    </Accordion>
  );
}

export const ProjectGitBranchRemoteX = observer(ProjectGitBranchRemote);
