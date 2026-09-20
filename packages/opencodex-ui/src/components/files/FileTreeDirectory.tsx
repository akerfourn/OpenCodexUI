import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, CircularProgress, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { WorkspaceTreeStore } from "../../stores/files/WorkspaceTreeStore";
import type { ProjectFilesStore } from "../../stores/files/ProjectFilesStore";
import { FileTreeEntryX } from "./FileTreeEntry";
import { FileErrorX } from "./FileError";

/** Displays direct children only; descendants mount exclusively for expanded folders. */
export function FileTreeDirectory({
  tree,
  files,
  path,
  workspaceName,
  depth = 0
}: {
  tree: WorkspaceTreeStore;
  files: ProjectFilesStore;
  path: string;
  workspaceName: string;
  depth?: number;
}) {
  const { t } = useTranslation();
  const [limit, setLimit] = useState(200);
  const state = tree.directories.get(path);
  useEffect(() => {
    if (state === undefined) void tree.load(path);
  }, [tree, path, state]);
  /** Retries this directory without reloading other branches. */
  function retry(): void {
    void tree.load(path);
  }
  /** Renders another bounded batch of already loaded entries. */
  function showMore(): void {
    setLimit((value) => value + 200);
  }
  if (state === undefined || state.loading) return <CircularProgress size={18} sx={{ m: 1 }} />;
  if (state.error !== null)
    return (
      <>
        <FileErrorX error={state.error} />
        <Button onClick={retry}>{t("files.retry")}</Button>
      </>
    );
  if (state.entries.length === 0)
    return (
      <Typography sx={{ pl: depth * 2 + 1 }} variant="caption" color="text.secondary">
        {t("files.emptyFolder")}
      </Typography>
    );
  const entries = state.entries
    .slice(0, limit)
    .map((entry) => (
      <FileTreeEntryX
        key={entry.name}
        entry={entry}
        tree={tree}
        files={files}
        parentPath={path}
        workspaceName={workspaceName}
        depth={depth}
      />
    ));
  const more =
    state.entries.length > limit ? <Button onClick={showMore}>{t("files.showMore")}</Button> : null;
  return (
    <div role="group">
      {entries}
      {more}
    </div>
  );
}
export const FileTreeDirectoryX = observer(FileTreeDirectory);
