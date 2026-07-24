import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField
} from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexSourceColor } from "@open-codex-ui/opencodex-protocol";

import { SOURCE_COLOR_OPTIONS, getSourceBadgeSx, getSourceColorOption } from "./sourceColor";

type HomeProjectGroupDialogProps = {
  open: boolean;
  mode: "create" | "rename";
  initialName?: string;
  initialColor?: OpenCodexSourceColor;
  onCancel(): void;
  onConfirm(name: string, color: OpenCodexSourceColor): void;
};

/** Renders the create/rename dialog for a project group. */
export function HomeProjectGroupDialog({
  open,
  mode,
  initialName = "",
  initialColor = "blue",
  onCancel,
  onConfirm
}: HomeProjectGroupDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<OpenCodexSourceColor>(initialColor);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setColor(initialColor);
    }
  }, [initialColor, initialName, open]);

  function handleSubmit(): void {
    const normalizedName = name.trim();
    if (normalizedName.length === 0) {
      return;
    }

    onConfirm(normalizedName, color);
  }

  const title = mode === "create" ? t("home.createProjectGroup") : t("home.editProjectGroup");
  const selectedColor = getSourceColorOption(color);

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label={t("home.projectGroupName")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSubmit();
            }
          }}
          sx={{ mt: 1 }}
        />
        <TextField
          select
          fullWidth
          label={t("home.projectGroupColor")}
          value={color}
          onChange={(event) => setColor(event.target.value as OpenCodexSourceColor)}
          slotProps={{
            select: {
              renderValue: () => (
                <GroupColorValue color={selectedColor.value} label={t(selectedColor.labelKey)} />
              )
            }
          }}
          sx={{ mt: 2 }}
        >
          {SOURCE_COLOR_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              <GroupColorValue color={option.value} label={t(option.labelKey)} />
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t("home.deleteProjectCancel")}</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={name.trim().length === 0}>
          {t("home.saveChanges")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Renders a color swatch and its accessible label. */
function GroupColorValue({ color, label }: { color: OpenCodexSourceColor; label: string }) {
  return (
    <Box sx={{ alignItems: "center", display: "flex", gap: 1 }}>
      <Box
        component="span"
        aria-hidden="true"
        sx={[getSourceBadgeSx(color), { borderRadius: 999, height: 12, width: 12 }]}
      />
      {label}
    </Box>
  );
}
