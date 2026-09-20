import { useEffect, useRef } from "react";
import { Box, CircularProgress, IconButton, Stack, Tooltip } from "@mui/material";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { DICTATION_MAX_SECONDS } from "@open-codex-ui/opencodex-protocol";
import type { DictationStore } from "../../stores/app/DictationStore";
import { formatDictationDuration, useDictationProgress } from "./useDictationProgress";

interface ComposerDictationProps {
  dictation: DictationStore;
  sourceId: string | null;
  composerId: string;
  disabled: boolean;
  onText(text: string): void;
}

/** Provides compact microphone feedback while scoping late results to their original composer. */
export function ComposerDictation({ dictation, sourceId, composerId, disabled, onText }: ComposerDictationProps) {
  const { t } = useTranslation();
  const ownsRecording = useRef(false);
  const recording = dictation.status === "recording";
  const waiting = dictation.status === "requesting" || dictation.status === "transcribing";
  let startedAt: number | null = null;
  if (recording) startedAt = dictation.recordingStartedAt;
  const elapsedSeconds = useDictationProgress(startedAt);

  useEffect(() => () => {
    if (ownsRecording.current) dictation.cancel();
    ownsRecording.current = false;
  }, [dictation, composerId]);

  /** Starts capture or hands the completed recording to the selected backend. */
  function handleMicrophone(): void {
    if (dictation.status === "recording") {
      void dictation.finish();
    } else {
      ownsRecording.current = true;
      void dictation.start(sourceId, onText);
    }
  }
  /** Discards this recording and invalidates its pending transcript. */
  function handleCancel(): void { dictation.cancel(); ownsRecording.current = false; }

  if (!dictation.settings.enabled) return null;
  let title = t("dictation.start");
  let color = "inherit";
  let disabledColor = "action.disabled";
  let animation = "none";
  let progressContent = null;
  let cancelContent = null;
  if (recording) {
    title = t("dictation.recordingProgress", {
      elapsed: formatDictationDuration(elapsedSeconds),
      limit: formatDictationDuration(DICTATION_MAX_SECONDS),
    });
    color = "error.main";
    animation = "dictation-mic-pulse 1.6s ease-in-out infinite";
  } else if (waiting) {
    title = t(`dictation.${dictation.status}`);
    color = "primary.main";
    disabledColor = color;
    if (dictation.status === "transcribing") animation = "dictation-mic-pulse 0.8s ease-in-out infinite";
  }
  if (dictation.busy) {
    let variant: "determinate" | "indeterminate" = "indeterminate";
    if (recording) variant = "determinate";
    progressContent = (
      <CircularProgress
        variant={variant} value={elapsedSeconds / DICTATION_MAX_SECONDS * 100}
        size={40} thickness={2.5} color="inherit" aria-label={title}
        sx={{ position: "absolute", inset: 0, pointerEvents: "none", color }}
      />
    );
    cancelContent = (
      <Tooltip title={t("dictation.cancel")}>
        <IconButton type="button" onClick={handleCancel} aria-label={t("dictation.cancel")}><CloseRoundedIcon /></IconButton>
      </Tooltip>
    );
  }
  return (
    <Stack direction="row" sx={{ alignItems: "center" }} spacing={0.5}>
      <Tooltip title={title}>
        <Box component="span" sx={{ position: "relative", display: "inline-flex", width: 40, height: 40 }}>
          <IconButton
            type="button" aria-label={title} aria-busy={waiting}
            disabled={disabled || waiting || dictation.managing} onClick={handleMicrophone}
            sx={{ width: 40, height: 40, color, "&.Mui-disabled": { color: disabledColor } }}
          >
            <MicRoundedIcon sx={{
              animation,
              "@keyframes dictation-mic-pulse": { "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.4 } },
              "@media (prefers-reduced-motion: reduce)": { animation: "none" },
            }} />
          </IconButton>
          {progressContent}
        </Box>
      </Tooltip>
      {cancelContent}
    </Stack>
  );
}

export const ComposerDictationX = observer(ComposerDictation);
