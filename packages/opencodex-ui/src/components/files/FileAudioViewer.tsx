import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { Alert, Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { FileDocument } from "../../stores/files/FileDocument";

/** Uses only Chromium's native media controls and codecs; unmounting always stops playback. */
export function FileAudioViewer({ document }: { document: FileDocument }) {
  const { t } = useTranslation();
  const player = useRef<HTMLAudioElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = player.current;
    return () => {
      if (element === null) return;
      runInAction(() => { document.audioTime = element.currentTime; });
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [document]);

  /** Restores position only after the browser knows the new media duration. */
  function handleLoaded(event: SyntheticEvent<HTMLAudioElement>): void {
    const element = event.currentTarget;
    if (Number.isFinite(element.duration)) element.currentTime = Math.min(document.audioTime, element.duration);
  }
  /** Retains progress while leaving play/pause, volume and seeking to native controls. */
  function handleTimeUpdate(event: SyntheticEvent<HTMLAudioElement>): void {
    const time = event.currentTarget.currentTime;
    runInAction(() => { document.audioTime = time; });
  }
  /** Keeps external opening available when the container or codec cannot be decoded. */
  function handleError(): void { setFailed(true); }

  const snapshot = document.audioSnapshot;
  if (snapshot === null) return null;
  const feedback = failed ? <Alert severity="warning">{t("files.audioDecodeError")}</Alert> : null;
  return <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 3 }}>
    <Typography variant="h6" sx={{ mb: 2 }}>{document.name}</Typography>
    <audio ref={player} src={snapshot.dataUrl} controls preload="metadata" aria-label={document.name}
      onLoadedMetadata={handleLoaded} onTimeUpdate={handleTimeUpdate} onError={handleError}
      style={{ width: "100%", maxWidth: 640 }} />
    {feedback}
  </Box>;
}

export const FileAudioViewerX = observer(FileAudioViewer);
