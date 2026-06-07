/**
 * Renders details for one Git log commit.
 */
import { Box, Stack, Typography } from "@mui/material";
import type { OpenCodexGitCommitDetails } from "@open-codex-ui/opencodex-protocol";
import { useTranslation } from "react-i18next";

type ProjectGitLogCommitDetailsProps = {
  details: OpenCodexGitCommitDetails;
};

/**
 * Renders the full commit message and changed files.
 *
 * @param props Component props.
 *
 * @returns Rendered commit details.
 */
export function ProjectGitLogCommitDetails({ details }: ProjectGitLogCommitDetailsProps) {
  const { t } = useTranslation();
  const messageContent = details.message.length > 0
    ? details.message
    : t("git.logNoMessage");

  return (
    <Stack spacing={1.5}>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1,
          borderRadius: 1,
          bgcolor: "background.default",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          fontFamily: "monospace",
          fontSize: "0.8rem"
        }}
      >
        {messageContent}
      </Box>
      <Stack spacing={0.5}>
        <Typography variant="caption" color="text.secondary">
          {t("git.logChangedFiles", { count: details.files.length })}
        </Typography>
        {details.files.map((file) => (
          <Stack key={`${file.status}:${file.path}`} direction="row" spacing={1} sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ width: 18, color: readFileStatusColor(file.status) }}>
              {readFileStatusLabel(file.status)}
            </Typography>
            <Typography variant="caption" noWrap title={file.path}>
              {file.path}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

function readFileStatusLabel(status: OpenCodexGitCommitDetails["files"][number]["status"]): string {
  switch (status) {
    case "added":
      return "A";
    case "modified":
      return "M";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    default:
      return "?";
  }
}

function readFileStatusColor(status: OpenCodexGitCommitDetails["files"][number]["status"]): string {
  switch (status) {
    case "added":
      return "success.main";
    case "modified":
      return "warning.main";
    case "deleted":
      return "error.main";
    default:
      return "text.secondary";
  }
}
