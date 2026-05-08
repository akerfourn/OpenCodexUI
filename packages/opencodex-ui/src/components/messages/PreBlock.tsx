/**
 * Renders the pre block component for the OpenCodex UI.
 */
import { Children, isValidElement, type ReactNode } from "react";
import { Box, Paper, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import { CopyIconButton } from "../common/CopyIconButton";

type PreBlockProps = {
  children?: ReactNode;
};

/**
 * Renders the pre block component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function PreBlock({ children }: PreBlockProps) {
  const { t } = useTranslation();
  const child = Children.toArray(children)[0];

  if (!isValidElement(child)) {
    return <Box component="pre">{children}</Box>;
  }

  const codeClassName = String(child.props.className ?? "");
  const code = extractText(child.props.children).replace(/^\n/, "").replace(/\n$/, "");
  const match = /language-(\w+)/.exec(codeClassName);
  const language = match?.[1] ?? "";

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
          className={codeClassName}
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
          {child.props.children}
        </Box>
      </Box>
    </Paper>
  );
}

function extractText(value: ReactNode): string {
  if (value === null || value === undefined || typeof value === "boolean") {
    return "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(extractText).join("");
  }

  if (isValidElement(value)) {
    return extractText(value.props.children);
  }

  return "";
}
