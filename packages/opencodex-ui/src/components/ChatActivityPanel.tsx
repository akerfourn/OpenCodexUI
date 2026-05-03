import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Typography
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import type { RootStore } from "../stores/RootStore";

type ChatActivityPanelProps = {
  store: RootStore;
};

export function ChatActivityPanel({
  store
}: ChatActivityPanelProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(store.isWorking);

  useEffect(() => {
    setIsExpanded(store.isWorking);
  }, [store.isWorking]);

  if (!store.settings.showActivityPanel) {
    return null;
  }

  if (store.activity.length === 0) {
    return null;
  }

  return (
    <Accordion
      expanded={isExpanded}
      elevation={0}
      disableGutters
      square
      onChange={(_event, expanded) => {
        setIsExpanded(expanded);
      }}
      sx={{
        width: "100%",
        maxWidth: 820,
        minWidth: 0,
        justifySelf: "center",
        borderTop: "1px solid",
        borderColor: "divider",
        color: "text.secondary",
        "&:before": {
          display: "none"
        }
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon fontSize="small" />}
      >
        <Typography variant="subtitle2">{t("chat.activityInProgress")}</Typography>
      </AccordionSummary>
      <AccordionDetails
        sx={{
          "& ul": {
            maxHeight: 140,
            m: "8px 0 0",
            overflow: "auto",
            pl: 2.25
          }
        }}
      >
        <ul>
          {store.activity.slice(-20).map((activity, index) => (
            <li key={`${index}-${activity}`}>{activity}</li>
          ))}
        </ul>
      </AccordionDetails>
      </Accordion>
  );
}

export const ChatActivityPanelX = observer(ChatActivityPanel);
