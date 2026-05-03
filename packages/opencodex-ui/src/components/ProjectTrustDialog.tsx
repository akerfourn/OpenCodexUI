/**
 * Renders the project trust dialog component for the OpenCodex UI.
 */
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Typography
} from "@mui/material";

import type { RootStore } from "../stores/RootStore";

type ProjectTrustDialogProps = {
  store: RootStore;
};

/**
 * Renders the project trust dialog component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ProjectTrustDialog({ store }: ProjectTrustDialogProps) {
  const { t } = useTranslation();
  const [isConfirmed, setIsConfirmed] = useState(false);
  const trustRequest = store.pendingProjectTrustRequest;

  useEffect(() => {
    setIsConfirmed(false);
  }, [trustRequest?.projectPath]);

  if (trustRequest === null) {
    return null;
  }

  function handleCancel(): void {
    if (trustRequest !== null) {
      store.dismissProjectTrustRequest(trustRequest.projectPath);
    }
  }

  function handleSubmit(): void {
    if (!isConfirmed || trustRequest === null) {
      return;
    }

    store.trustProject(trustRequest.projectPath);
  }

  return (
    <Dialog open maxWidth="sm" fullWidth onClose={handleCancel}>
      <DialogTitle>{t("trustProject.title")}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {t("trustProject.description")}
        </Typography>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t("trustProject.warning")}
        </Alert>
        <Box
          component="pre"
          sx={{
            m: 0,
            mb: 2,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily:
              'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
            fontSize: 13
          }}
        >
          {trustRequest.projectPath}
        </Box>
        {trustRequest.disabledFolders.length > 0 ? (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75 }}>
              {t("trustProject.foldersLabel")}
            </Typography>
            <Box
              component="pre"
              sx={{
                m: 0,
                maxHeight: 120,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily:
                  'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
                fontSize: 12
              }}
            >
              {trustRequest.disabledFolders.join("\n")}
            </Box>
          </Box>
        ) : null}
        <FormControlLabel
          control={
            <Checkbox
              checked={isConfirmed}
              onChange={(_event, checked) => {
                setIsConfirmed(checked);
              }}
            />
          }
          label={t("trustProject.confirmCheckbox")}
        />
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={handleCancel}>
          {t("trustProject.cancel")}
        </Button>
        <Button
          type="button"
          variant="contained"
          disabled={!isConfirmed}
          onClick={handleSubmit}
        >
          {t("trustProject.submit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export const ProjectTrustDialogX = observer(ProjectTrustDialog);
