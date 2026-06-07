/**
 * Renders one expandable Git log commit row.
 */
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  CircularProgress,
  Stack,
  Typography
} from "@mui/material";
import type { OpenCodexGitLogCommit } from "@open-codex-ui/opencodex-protocol";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { ProjectGitStore } from "../../stores/ProjectGitStore";
import { ProjectGitLogCommitDetails } from "./ProjectGitLogCommitDetails";

type ProjectGitLogCommitItemProps = {
  commit: OpenCodexGitLogCommit;
  gitStore: ProjectGitStore;
};

/**
 * Renders a compact Git commit summary with lazy loaded details.
 *
 * @param props Component props.
 *
 * @returns Rendered commit item.
 */
export function ProjectGitLogCommitItem({ commit, gitStore }: ProjectGitLogCommitItemProps) {
  const { t } = useTranslation();
  const details = gitStore.getCommitDetails(commit.hash);
  const isLoadingDetails = gitStore.loadingCommitDetailsHash === commit.hash;
  const authoredAt = formatCommitDate(commit.authoredAt);
  const refsContent = commit.refs.length > 0
    ? (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
          {commit.refs.map((ref) => (
            <Chip key={ref} label={ref} size="small" variant="outlined" />
          ))}
        </Stack>
      )
    : null;
  const detailsContent = details !== null
    ? <ProjectGitLogCommitDetails details={details} />
    : (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {isLoadingDetails ? <CircularProgress size={16} /> : null}
          <Typography variant="body2" color="text.secondary">
            {isLoadingDetails ? t("git.logLoadingDetails") : t("git.logDetailsUnavailable")}
          </Typography>
        </Stack>
      );

  function handleChange(_: unknown, isExpanded: boolean): void {
    if (isExpanded) {
      void gitStore.loadCommitDetails(commit.hash);
    }
  }

  return (
    <Accordion disableGutters variant="outlined" onChange={handleChange}>
      <AccordionSummary expandIcon={<ExpandMoreOutlinedIcon />}>
        <Box sx={{ minWidth: 0, width: "100%" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
            <Typography variant="body2" sx={{ fontFamily: "monospace", flex: "0 0 auto" }}>
              {commit.shortHash}
            </Typography>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
              {commit.subject}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" noWrap>
            {commit.authorName} · {authoredAt}
          </Typography>
          {refsContent}
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {detailsContent}
      </AccordionDetails>
    </Accordion>
  );
}

export const ProjectGitLogCommitItemX = observer(ProjectGitLogCommitItem);

function formatCommitDate(value: string | null): string {
  if (value === null) {
    return "";
  }

  return new Date(value).toLocaleString();
}
