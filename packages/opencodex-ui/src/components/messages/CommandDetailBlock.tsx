/**
 * Renders one scrollable command detail block.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import { CopyIconButton } from "../common/CopyIconButton";
import {
  createBoundedTextPreview,
  DEFAULT_TEXT_PREVIEW_MAX_CHARACTERS,
  DEFAULT_TEXT_PREVIEW_MAX_LINES,
  type BoundedTextPreviewStrategy
} from "./boundedTextPreview";

type CommandDetailBlockProps = {
  label: string;
  value: string;
  emptyLabel: string;
  previewStrategy?: BoundedTextPreviewStrategy;
};

const previewGrowthFactor = 2;

/**
 * Renders one scrollable command detail block.
 *
 * @param props Component props.
 *
 * @returns Rendered command detail block.
 */
export function CommandDetailBlock({
  label,
  value,
  emptyLabel,
  previewStrategy = "head-tail"
}: CommandDetailBlockProps) {
  const { t } = useTranslation();
  const [previewMultiplier, setPreviewMultiplier] = useState(1);
  const [isShowingAll, setIsShowingAll] = useState(false);
  const hasValue = value.length > 0;
  const preview = useMemo(() => createBoundedTextPreview(value, {
    strategy: previewStrategy,
    maxLines: DEFAULT_TEXT_PREVIEW_MAX_LINES * previewMultiplier,
    maxCharacters: DEFAULT_TEXT_PREVIEW_MAX_CHARACTERS * previewMultiplier
  }), [previewMultiplier, previewStrategy, value]);

  useEffect(() => {
    setPreviewMultiplier(1);
    setIsShowingAll(false);
  }, [previewStrategy, value]);

  function handleShowMore(): void {
    setPreviewMultiplier((currentMultiplier) => currentMultiplier * previewGrowthFactor);
  }

  function handleShowAll(): void {
    setIsShowingAll(true);
  }

  function handleLimitContent(): void {
    setPreviewMultiplier(1);
    setIsShowingAll(false);
  }

  let displayedValue: ReactNode = emptyLabel;

  if (hasValue && (isShowingAll || !preview.isLimited)) {
    displayedValue = value;
  } else if (hasValue) {
    const omissionLabel = t("message.contentOmitted", {
      count: preview.omittedCharacterCount,
      formattedCount: preview.omittedCharacterCount.toLocaleString()
    });
    const leadingSeparator = preview.leadingText.length > 0 ? "\n" : "";
    const trailingSeparator = preview.trailingText.length > 0 ? "\n" : "";

    displayedValue = [
      preview.leadingText,
      leadingSeparator,
      `… ${omissionLabel} …`,
      trailingSeparator,
      preview.trailingText
    ].join("");
  }

  const canLimitContent = isShowingAll || previewMultiplier > 1;
  let displayActions: ReactNode = null;

  if (hasValue && preview.isLimited && !isShowingAll) {
    displayActions = (
      <Stack direction="row" spacing={1}>
        <Button size="small" onClick={handleShowMore}>
          {t("message.showMoreContent")}
        </Button>
        <Button size="small" onClick={handleShowAll}>
          {t("message.showAllContent")}
        </Button>
      </Stack>
    );
  } else if (hasValue && canLimitContent) {
    displayActions = (
      <Button size="small" onClick={handleLimitContent}>
        {t("message.limitContent")}
      </Button>
    );
  }

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
        {displayedValue}
      </Box>
      {displayActions}
    </Box>
  );
}
