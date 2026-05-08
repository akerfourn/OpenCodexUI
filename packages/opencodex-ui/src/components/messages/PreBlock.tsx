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
  const code = String(child.props.children ?? "").replace(/\n$/, "");
  const match = /language-(\w+)/.exec(codeClassName);
  const language = match?.[1] ?? "";

  return (
    <Paper
      component="section"
      elevation={0}
      sx={{
        maxWidth: "100%",
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        bgcolor: "grey.100"
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          px: 1,
          py: 0.75,
          color: "text.secondary",
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
          buttonSize={28}
          iconSize={17}
        />
      </Box>
      <Box
        component="pre"
        sx={{
          m: 0,
          maxWidth: "100%",
          overflowX: "auto",
          overflowY: "hidden",
          p: 1.5
        }}
      >
        <Box
          component="code"
          className={codeClassName}
          sx={{
            fontFamily:
              'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
            fontSize: 14,
            whiteSpace: "pre"
          }}
        >
          {code}
        </Box>
      </Box>
    </Paper>
  );
}
