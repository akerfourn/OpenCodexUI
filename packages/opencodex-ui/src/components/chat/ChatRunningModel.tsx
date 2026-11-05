import { Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { ChatStore } from "../../stores/chat/ChatStore";

interface ChatRunningModelProps {
  chatStore: ChatStore;
}

/** Identifies the running turn's saved model independently of the next-message selector. */
export function ChatRunningModel({ chatStore }: ChatRunningModelProps) {
  const { t } = useTranslation();
  const { runtime, timeline } = chatStore;
  if (!runtime.hasRunningTurnIndicator) return null;

  const turnId = runtime.activeTurnId ?? runtime.pendingTurnId;
  const execution = timeline.turns.find((turn) => turn.id === turnId)?.execution;
  let label = t("composer.runningModelUnknown");
  if (execution?.requestedModel != null && execution.effectiveModel !== null
    && execution.effectiveModel !== execution.requestedModel) {
    label = t("composer.runningModelChanged", {
      model: execution.effectiveModel, requestedModel: execution.requestedModel
    });
  } else if (execution?.requestedModel != null) {
    label = t("composer.runningModelRequested", { model: execution.requestedModel });
  } else if (execution?.effectiveModel != null) {
    label = t("composer.runningModelRecorded", { model: execution.effectiveModel });
  }

  return (
    <Tooltip title={t("composer.runningModelDescription")} placement="top-start">
      <Typography component="div" variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
        {label}
      </Typography>
    </Tooltip>
  );
}

export const ChatRunningModelX = observer(ChatRunningModel);
