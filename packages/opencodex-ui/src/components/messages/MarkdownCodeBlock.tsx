/**
 * Displays a literal code block with the shared language header and copy action.
 */
import type { ReactNode } from "react";
import { Box, Paper, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import { CopyIconButton } from "../common/CopyIconButton";

interface MarkdownCodeBlockProps {
  code: string;
  language: string;
  className?: string;
  children?: ReactNode;
}

/**
 * Preserves highlighted children while copying the unformatted source.
 *
 * @param props Component props.
 *
 * @returns Highlighted code with a language label and copy button.
 */
export function MarkdownCodeBlock({ code, language, className, children }: MarkdownCodeBlockProps) {
  const { t } = useTranslation();

  return (
    <Paper
      component="section"
      elevation={0}
      sx={{
        maxWidth: "100%",
        overflow: "hidden",
        border: "1px solid rgba(148, 163, 184, 0.22)",
        borderRadius: 1.5,
        bgcolor: "#0b1017",
        color: "#d6e3f0"
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          minHeight: 28,
          px: 1.25,
          py: 0.25,
          color: "rgba(214, 227, 240, 0.7)",
          fontSize: 12
        }}
      >
        <Typography variant="caption" component="span">
          {language}
        </Typography>
        <CopyIconButton
          value={code}
          label={t("chat.copyCodeBlock")}
          copiedLabel={t("message.copied")}
          buttonSize={24}
          iconSize={15}
          sx={{
            color: "rgba(214, 227, 240, 0.72)",
            "&:hover": {
              bgcolor: "rgba(148, 163, 184, 0.14)",
              color: "#ffffff"
            }
          }}
        />
      </Box>
      <Box
        component="pre"
        sx={{
          m: 0,
          maxWidth: "100%",
          overflowX: "auto",
          overflowY: "hidden",
          px: 1.25,
          pt: 0,
          pb: 1.25
        }}
      >
        <Box
          component="code"
          className={className}
          sx={{
            fontFamily:
              'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
            fontSize: 14,
            lineHeight: 1.55,
            display: "block",
            p: "0 !important",
            bgcolor: "transparent !important",
            whiteSpace: "pre"
          }}
        >
          {children ?? code}
        </Box>
      </Box>
    </Paper>
  );
}

