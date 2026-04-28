import { Children, isValidElement, type ReactNode } from "react";
import { Box, IconButton, Paper, Tooltip, Typography } from "@mui/material";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";

type PreBlockProps = {
  children?: ReactNode;
};

export function PreBlock({ children }: PreBlockProps) {
  const child = Children.toArray(children)[0];

  if (!isValidElement(child)) {
    return <Box component="pre">{children}</Box>;
  }

  const codeClassName = String(child.props.className ?? "");
  const code = String(child.props.children ?? "").replace(/\n$/, "");
  const match = /language-(\w+)/.exec(codeClassName);
  const language = match?.[1] ?? "";

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(code);
  }

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
        <Tooltip title="Copier le bloc de code">
          <IconButton
            size="small"
            aria-label="Copier le bloc de code"
            onClick={handleCopy}
          >
            <ContentCopyOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
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
