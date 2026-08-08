import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type EmbeddedCollaborationEventCardProps = {
  actionIcon: ReactNode;
  actionLabel: string;
  detailsLabel: string;
  statusLabel: string;
  prompt: string | null;
  isPromptUnavailable: boolean;
  isPromptLimited: boolean;
  isPromptExpanded: boolean;
  relatedThreadId: string | null;
  onTogglePrompt(): void;
  onNavigateThread(threadId: string): void;
};

/** Renders one dense collaboration activity inside the reasoning accordion. */
export function EmbeddedCollaborationEventCard({
  actionIcon,
  actionLabel,
  detailsLabel,
  statusLabel,
  prompt,
  isPromptUnavailable,
  isPromptLimited,
  isPromptExpanded,
  relatedThreadId,
  onTogglePrompt,
  onNavigateThread
}: EmbeddedCollaborationEventCardProps) {
  const { t } = useTranslation();
  const shouldShowPrompt = prompt !== null && prompt.trim().length > 0;

  function handleNavigate(): void {
    if (relatedThreadId !== null) {
      onNavigateThread(relatedThreadId);
    }
  }

  return (
    <Paper
      component="article"
      data-collaboration-display="embedded"
      variant="outlined"
      sx={{
        borderColor: "secondary.light",
        borderLeftWidth: 2,
        bgcolor: "action.hover",
        minWidth: 0,
        px: 0.75,
        py: 0.5,
        width: "100%"
      }}
    >
      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
        <Stack
          direction="row"
          spacing={0.5}
          sx={{ alignItems: "center", minHeight: 22, minWidth: 0 }}
        >
          <Box
            sx={{
              color: "secondary.main",
              display: "inline-flex",
              flex: "0 0 auto",
              "& svg": { fontSize: 16 }
            }}
          >
            {actionIcon}
          </Box>
          <Typography variant="body2" noWrap sx={{ flex: "0 0 auto", fontWeight: 600 }}>
            {actionLabel}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            title={detailsLabel}
            sx={{ flex: "1 1 auto", minWidth: 0 }}
          >
            {detailsLabel}
          </Typography>
          <Chip
            size="small"
            variant="outlined"
            label={statusLabel}
            sx={{
              flex: "0 0 auto",
              height: 20,
              "& .MuiChip-label": { fontSize: "0.6875rem", px: 0.75 }
            }}
          />
          {isPromptLimited ? (
            <Button
              size="small"
              aria-expanded={isPromptExpanded}
              onClick={onTogglePrompt}
              sx={{ flex: "0 0 auto", minWidth: 0, px: 0.5, py: 0, fontSize: "0.6875rem" }}
            >
              {isPromptExpanded
                ? t("collaboration.limitContentCompact")
                : t("collaboration.showFullContentCompact")}
            </Button>
          ) : null}
          {relatedThreadId !== null ? (
            <Button
              size="small"
              startIcon={<ChatBubbleOutlineOutlinedIcon sx={{ fontSize: 15 }} />}
              onClick={handleNavigate}
              sx={{
                flex: "0 0 auto",
                minWidth: 0,
                px: 0.5,
                py: 0,
                fontSize: "0.6875rem",
                "& .MuiButton-startIcon": { mr: 0.35 }
              }}
            >
              {t("collaboration.openSubAgentChatCompact")}
            </Button>
          ) : null}
        </Stack>
        {shouldShowPrompt || isPromptUnavailable ? (
          <Typography
            data-collaboration-prompt="true"
            variant="caption"
            color="text.secondary"
            sx={{
              fontStyle: isPromptUnavailable ? "italic" : "normal",
              lineHeight: 1.35,
              overflowWrap: "anywhere",
              whiteSpace: "pre-wrap"
            }}
          >
            {prompt}
          </Typography>
        ) : null}
      </Stack>
    </Paper>
  );
}
