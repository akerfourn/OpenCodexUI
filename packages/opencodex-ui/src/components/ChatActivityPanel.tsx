import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Typography
} from "@mui/material";

import type { RootStore } from "../stores/RootStore";

type ChatActivityPanelProps = {
  store: RootStore;
};

export const ChatActivityPanel = observer(function ChatActivityPanel({
  store
}: ChatActivityPanelProps) {
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
        expandIcon={
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        }
      >
        <Typography variant="subtitle2">Activité en cours</Typography>
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
});
