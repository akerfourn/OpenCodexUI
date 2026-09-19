import { useEffect, useRef } from "react";
import { CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import MicRoundedIcon from "@mui/icons-material/MicRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { DictationStore } from "../../stores/app/DictationStore";

interface ComposerDictationProps {
  dictation: DictationStore;
  sourceId: string | null;
  composerId: string;
  disabled: boolean;
  onText(text: string): void;
}

/** Provides microphone actions while keeping late results scoped to their original composer. */
export function ComposerDictation({ dictation, sourceId, composerId, disabled, onText }: ComposerDictationProps) {
  const { t } = useTranslation();
  const ownsRecording = useRef(false);
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
  let icon = <MicRoundedIcon />;
  let statusContent = null;
  let cancelContent = null;
  const waiting = dictation.status === "requesting" || dictation.status === "transcribing";
  if (dictation.status === "recording") {
    title = t("dictation.stop");
    icon = <StopRoundedIcon color="error" />;
  } else if (waiting) {
    title = t(`dictation.${dictation.status}`);
    icon = <CircularProgress size={20} />;
  }
  if (dictation.busy) {
    statusContent = <Typography variant="caption" role="status">{t(`dictation.${dictation.status}`)}</Typography>;
    cancelContent = (
      <Tooltip title={t("dictation.cancel")}>
        <IconButton type="button" onClick={handleCancel} aria-label={t("dictation.cancel")}><CloseRoundedIcon /></IconButton>
      </Tooltip>
    );
  }
  return (
    <Stack direction="row" sx={{ alignItems: "center" }} spacing={0.5}>
      {statusContent}
      <Tooltip title={title}>
        <span><IconButton type="button" aria-label={title} disabled={disabled || waiting || dictation.managing} onClick={handleMicrophone}>{icon}</IconButton></span>
      </Tooltip>
      {cancelContent}
    </Stack>
  );
}

export const ComposerDictationX = observer(ComposerDictation);
