/**
 * Renders one scrollable command detail block.
 */
import { Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import { CopyIconButton } from "../common/CopyIconButton";

type CommandDetailBlockProps = {
  label: string;
  value: string;
  emptyLabel: string;
};

/**
 * Renders one scrollable command detail block.
 *
 * @param props Component props.
 *
 * @returns Rendered command detail block.
 */
export function CommandDetailBlock({ label, value, emptyLabel }: CommandDetailBlockProps) {
  const { t } = useTranslation();
  const hasValue = value.trim().length > 0;

  return (
    <Box>
      <Box
        sx={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          mb: 0.75
        }}
      >
        <Typography variant="subtitle2">{label}</Typography>
        {hasValue ? (
          <CopyIconButton
            value={value}
            label={t("message.copy")}
            copiedLabel={t("message.copied")}
            sx={{ color: "text.secondary" }}
          />
        ) : null}
      </Box>
      <Box
        component="pre"
        sx={{
          bgcolor: "#0b1017",
          borderRadius: 1,
          color: "#d7e6ff",
          fontFamily: "monospace",
          fontSize: 13,
          lineHeight: 1.5,
          m: 0,
          maxHeight: "45vh",
          overflow: "auto",
          p: 1.25,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word"
        }}
      >
        {hasValue ? value : emptyLabel}
      </Box>
    </Box>
  );
}
