import type { ReactNode } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import CompressOutlinedIcon from "@mui/icons-material/CompressOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import FormatListBulletedOutlinedIcon from "@mui/icons-material/FormatListBulletedOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import MoreHorizOutlinedIcon from "@mui/icons-material/MoreHorizOutlined";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import TerminalOutlinedIcon from "@mui/icons-material/TerminalOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { Box, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";

type ActivityKindIconProps = {
  kind?: string;
};

/** Renders the icon and translated tooltip associated with an activity kind. */
export function ActivityKindIcon({ kind }: ActivityKindIconProps) {
  const { t } = useTranslation();

  return renderActivityKindIconWithTooltip(kind, t);
}

/**
 * Handles render activity kind icon.
 *
 * @param kind Kind.
 *
 * @returns Computed value.
 */
function renderActivityKindIcon(kind?: string): ReactNode {
  if (kind === "reasoning") {
    return <PsychologyOutlinedIcon fontSize="small" />;
  }

  if (kind === "plan") {
    return <FormatListBulletedOutlinedIcon fontSize="small" />;
  }

  if (kind === "commandExecution" || kind === "command") {
    return <TerminalOutlinedIcon fontSize="small" />;
  }

  if (kind === "mcpToolCall" || kind === "mcpTool") {
    return <ExtensionOutlinedIcon fontSize="small" />;
  }

  if (kind === "fileChange") {
    return <DescriptionOutlinedIcon fontSize="small" />;
  }

  if (kind === "webSearch") {
    return <SearchOutlinedIcon fontSize="small" />;
  }

  if (kind === "imageView") {
    return <ImageOutlinedIcon fontSize="small" />;
  }

  if (kind === "imageGeneration") {
    return <AutoAwesomeOutlinedIcon fontSize="small" />;
  }

  if (kind === "dynamicToolCall") {
    return <BuildOutlinedIcon fontSize="small" />;
  }

  if (kind === "collabAgentToolCall" || kind === "subAgentActivity") {
    return <GroupsOutlinedIcon fontSize="small" />;
  }

  if (kind === "enteredReviewMode") {
    return <VisibilityOutlinedIcon fontSize="small" />;
  }

  if (kind === "exitedReviewMode") {
    return <VisibilityOffOutlinedIcon fontSize="small" />;
  }

  if (kind === "contextCompaction") {
    return <CompressOutlinedIcon fontSize="small" />;
  }

  if (kind === "hookPrompt") {
    return <CodeOutlinedIcon fontSize="small" />;
  }

  if (kind === "modelRerouted") {
    return <SwapHorizOutlinedIcon fontSize="small" />;
  }

  return <MoreHorizOutlinedIcon fontSize="small" />;
}

/**
 * Renders an activity icon with its generic type tooltip.
 *
 * @param kind Activity kind.
 * @param translate Translation function.
 * @returns Icon wrapped in a tooltip.
 */
function renderActivityKindIconWithTooltip(
  kind: string | undefined,
  translate: ReturnType<typeof useTranslation>["t"]
): ReactNode {
  return (
    <Tooltip title={getActivityKindLabel(kind, translate)}>
      <Box component="span" sx={{ display: "inline-flex", flex: "0 0 auto" }}>
        {renderActivityKindIcon(kind)}
      </Box>
    </Tooltip>
  );
}

/**
 * Resolves the translated generic label for an activity kind.
 *
 * @param kind Activity kind.
 * @param translate Translation function.
 * @returns Generic activity label.
 */
function getActivityKindLabel(
  kind: string | undefined,
  translate: ReturnType<typeof useTranslation>["t"]
): string {
  if (kind === "reasoning") {
    return translate("message.activityType.reasoning");
  }

  if (kind === "plan") {
    return translate("message.activityType.plan");
  }

  if (kind === "commandExecution" || kind === "command") {
    return translate("message.activityType.command");
  }

  if (kind === "mcpToolCall" || kind === "mcpTool") {
    return translate("message.activityType.mcpTool");
  }

  if (kind === "fileChange") {
    return translate("message.activityType.fileChange");
  }

  if (kind === "webSearch") {
    return translate("message.activityType.webSearch");
  }

  if (kind === "imageView") {
    return translate("message.activityType.imageView");
  }

  if (kind === "imageGeneration") {
    return translate("message.activityType.imageGeneration");
  }

  if (kind === "dynamicToolCall") {
    return translate("message.activityType.dynamicTool");
  }

  if (kind === "collabAgentToolCall" || kind === "subAgentActivity") {
    return translate("message.activityType.subAgent");
  }

  if (kind === "enteredReviewMode") {
    return translate("message.activityType.reviewStart");
  }

  if (kind === "exitedReviewMode") {
    return translate("message.activityType.reviewEnd");
  }

  if (kind === "contextCompaction") {
    return translate("message.activityType.contextCompaction");
  }

  if (kind === "hookPrompt") {
    return translate("message.activityType.hook");
  }

  if (kind === "modelRerouted") {
    return translate("message.activityType.modelRerouted");
  }

  return translate("message.activityType.activity");
}
