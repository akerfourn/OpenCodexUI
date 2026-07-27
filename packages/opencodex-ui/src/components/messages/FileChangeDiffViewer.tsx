/**
 * Renders structured file changes as a compact visual unified diff.
 */
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { FileChangeDiffData, FileChangeDiffEntry } from "./fileChangeDiff";

type FileChangeDiffViewerProps = {
  data: FileChangeDiffData;
};

type DiffLineKind = "added" | "removed" | "hunk" | "metadata" | "context";

/**
 * Renders parsed file changes with line-level diff highlighting.
 *
 * @param props Parsed file-change data.
 * @returns Visual diff content.
 */
export function FileChangeDiffViewer({ data }: FileChangeDiffViewerProps) {
  return (
    <Stack spacing={1.5}>
      {data.changes.map((change, index) => (
        <FileChangeDiffSection
          key={`${change.path ?? "change"}-${index}`}
          change={change}
        />
      ))}
    </Stack>
  );
}

/**
 * Renders one file section inside the diff viewer.
 *
 * @param props File change entry.
 * @returns File diff section.
 */
function FileChangeDiffSection({ change }: { change: FileChangeDiffEntry }) {
  const { t } = useTranslation();
  const pathLabel = change.path ?? t("message.fileChangePathUnavailable");

  return (
    <Paper
      elevation={0}
      variant="outlined"
      sx={{
        minWidth: 0,
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          alignItems: "center",
          bgcolor: "action.hover",
          display: "flex",
          gap: 1,
          justifyContent: "space-between",
          minWidth: 0,
          px: 1.25,
          py: 0.75
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontFamily: "monospace",
            fontWeight: 600,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
          title={change.path ?? undefined}
        >
          {pathLabel}
        </Typography>
        <Chip
          size="small"
          label={getFileChangeKindLabel(change.kind, t)}
          sx={{ flex: "0 0 auto" }}
        />
      </Box>
      <Box
        component="pre"
        sx={{
          bgcolor: "#0b1017",
          color: "#d7e6ff",
          fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
          fontSize: 13,
          lineHeight: 1.5,
          m: 0,
          maxHeight: "50vh",
          overflow: "auto",
          p: 0,
          whiteSpace: "pre"
        }}
      >
        {renderDiffLines(change.diff)}
      </Box>
    </Paper>
  );
}

/**
 * Renders one diff as styled lines.
 *
 * @param diff Unified diff text.
 * @returns Styled diff lines.
 */
function renderDiffLines(diff: string) {
  const lines = diff.split(/\r?\n/);
  const visibleLines = lines.at(-1) === "" ? lines.slice(0, -1) : lines;

  return visibleLines.map((line, index) => {
    const kind = classifyDiffLine(line);

    return (
      <Box
        key={`${index}-${line}`}
        component="span"
        sx={{
          bgcolor: getDiffLineBackground(kind),
          color: getDiffLineColor(kind),
          display: "block",
          minHeight: "1.5em",
          px: 1.25,
          whiteSpace: "pre"
        }}
      >
        {line.length > 0 ? line : " "}
      </Box>
    );
  });
}

/**
 * Classifies one unified diff line.
 *
 * @param line Diff line.
 * @returns Visual line kind.
 */
function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith("@@")) {
    return "hunk";
  }

  if (
    line.startsWith("diff --git ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("index ") ||
    line.startsWith("new file") ||
    line.startsWith("deleted file") ||
    line.startsWith("rename ") ||
    line.startsWith("\\ No newline")
  ) {
    return "metadata";
  }

  if (line.startsWith("+")) {
    return "added";
  }

  if (line.startsWith("-")) {
    return "removed";
  }

  return "context";
}

/**
 * Resolves the translated label for a file-change kind.
 *
 * @param kind File-change kind.
 * @param translate Translation function.
 * @returns Translated kind label.
 */
function getFileChangeKindLabel(
  kind: string,
  translate: ReturnType<typeof useTranslation>["t"]
): string {
  if (kind === "add") {
    return translate("message.fileChangeKindAdd");
  }

  if (kind === "delete") {
    return translate("message.fileChangeKindDelete");
  }

  if (kind === "update") {
    return translate("message.fileChangeKindUpdate");
  }

  return kind;
}

/**
 * Returns the background color for one diff line.
 *
 * @param kind Diff line kind.
 * @returns Theme-aware background color expression.
 */
function getDiffLineBackground(kind: DiffLineKind): string {
  if (kind === "added") {
    return "rgba(46, 160, 67, 0.22)";
  }

  if (kind === "removed") {
    return "rgba(248, 81, 73, 0.22)";
  }

  if (kind === "hunk") {
    return "rgba(56, 139, 253, 0.2)";
  }

  if (kind === "metadata") {
    return "rgba(148, 163, 184, 0.12)";
  }

  return "transparent";
}

/**
 * Returns the text color for one diff line.
 *
 * @param kind Diff line kind.
 * @returns Diff line text color.
 */
function getDiffLineColor(kind: DiffLineKind): string {
  if (kind === "added") {
    return "#b7f0c0";
  }

  if (kind === "removed") {
    return "#ffb4ad";
  }

  if (kind === "hunk") {
    return "#a8d1ff";
  }

  return "#d7e6ff";
}
