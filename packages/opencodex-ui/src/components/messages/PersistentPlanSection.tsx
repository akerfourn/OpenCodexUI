import { observer } from "mobx-react-lite";
import { Box } from "@mui/material";

import type {
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

import { ActivityKindIcon } from "./ActivityKindIcon";
import { PlanActivityRowX } from "./PlanActivityRow";
import {
  readLatestStructuredPlan,
  shouldShowPersistentPlan
} from "./assistantTurnPlan";

type PersistentPlanSectionProps = {
  preludeItems: OpenCodexTurnItem[];
  isRunning: boolean;
};

/** Keeps the active plan visible independently from the reasoning timeline. */
export function PersistentPlanSection({
  preludeItems,
  isRunning
}: PersistentPlanSectionProps) {
  const plan = readLatestStructuredPlan(preludeItems);

  if (plan === null || !shouldShowPersistentPlan(isRunning, plan)) {
    return null;
  }

  return (
    <Box
      component="section"
      sx={{
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        mt: 1,
        p: 1.25,
        minWidth: 0,
        width: "100%",
        maxWidth: "100%"
      }}
    >
      <PlanActivityRowX
        plan={plan}
        icon={<ActivityKindIcon kind="plan" />}
      />
    </Box>
  );
}

export const PersistentPlanSectionX = observer(PersistentPlanSection);
