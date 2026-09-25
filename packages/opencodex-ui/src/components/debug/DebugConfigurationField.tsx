import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import { Box, IconButton, TextField, Tooltip, type TextFieldProps } from "@mui/material";
import { useTranslation } from "react-i18next";

type DebugConfigurationFieldProps = TextFieldProps & { label: string; help: string };

/** Keeps field help outside the input and reachable by pointer or keyboard focus. */
export function DebugConfigurationField({ label, help, ...props }: DebugConfigurationFieldProps) {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5 }}>
      <TextField {...props} label={label} fullWidth />
      <Tooltip title={help} placement="left" arrow describeChild>
        <IconButton
          size="small"
          aria-label={t("debug.helpLabel", { field: label })}
          sx={{ mt: 1.25, flexShrink: 0 }}
        >
          <HelpOutlineOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
