import { Alert, Button, List, ListItem, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { ProjectGitSyncStore } from "../../stores/project/git/ProjectGitSyncStore";

interface ProjectGitSyncConflictsProps {
  sync: ProjectGitSyncStore;
  onOpenFile(path: string): void;
}

/** Guides explicit editing and staging without pretending to resolve file contents automatically. */
export function ProjectGitSyncConflicts({ sync, onOpenFile }: ProjectGitSyncConflictsProps) {
  const { t } = useTranslation();
  const operation = sync.operation;
  if (operation === null) return null;
  let guidance = t("gitSync.resolveFiles");
  if (operation.conflicts.length === 0) guidance = t("gitSync.noUnresolvedFiles");
  if (operation.kind === "other") guidance = t("gitSync.issues.unsupportedOperation");

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">{t(`gitSync.operations.${operation.kind}`)}</Typography>
      <Typography variant="body2">{t("gitSync.localBranch", { branch: operation.branchName ?? "—" })}</Typography>
      <Alert severity="info">{guidance}</Alert>
      <List disablePadding>
        {operation.conflicts.map((path) => (
          <ListItem key={path} disableGutters sx={{ display: "block" }}>
            <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{path}</Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              <Button size="small" disabled={sync.isBusy} onClick={() => onOpenFile(path)}>{t("gitSync.openFile")}</Button>
              <Button size="small" disabled={sync.isBusy || operation.kind === "other"}
                onClick={() => { void sync.markResolved(path); }}>{t("gitSync.markResolved")}</Button>
            </Stack>
          </ListItem>
        ))}
      </List>
    </Stack>
  );
}

export const ProjectGitSyncConflictsX = observer(ProjectGitSyncConflicts);
