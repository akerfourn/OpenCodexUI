import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import IndeterminateCheckBoxIcon from "@mui/icons-material/IndeterminateCheckBox";
import { useTranslation } from "react-i18next";

import type { OpenCodexPlanSnapshot } from "@open-codex-ui/opencodex-protocol";

type PlanActivityRowProps = {
  plan: OpenCodexPlanSnapshot;
  icon: ReactNode;
};

/** Renders a non-interactive, compact checklist for a structured Codex plan. */
export function PlanActivityRow({ plan, icon }: PlanActivityRowProps) {
  const { t } = useTranslation();

  return (
    <Box
      component="section"
      aria-label={t("message.activityType.plan")}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 0.35,
        minWidth: 0,
        width: "100%"
      }}
    >
      <Box sx={{ alignItems: "center", display: "flex", gap: 1, minWidth: 0 }}>
        {icon}
        <Typography variant="body2" sx={{ fontStyle: "italic" }}>
          {t("message.activityType.plan")}
        </Typography>
      </Box>
      {plan.explanation !== null ? (
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", fontStyle: "italic", pl: 3 }}
        >
          {plan.explanation}
        </Typography>
      ) : null}
      <Box
        component="ul"
        aria-label={t("message.planSteps")}
        sx={{ listStyle: "none", m: 0, p: 0, pl: 3 }}
      >
        {plan.steps.map((step, index) => {
          const isCompleted = step.status === "completed";
          const isInProgress = step.status === "inProgress";
          const MarkerIcon = isCompleted
            ? CheckBoxIcon
            : isInProgress ? IndeterminateCheckBoxIcon : CheckBoxOutlineBlankIcon;

          return (
            <Box
              component="li"
              key={`${index}-${step.step}`}
              aria-label={`${t(`message.planStatus.${step.status}`)} — ${step.step}`}
              sx={{
                alignItems: "baseline",
                color: isCompleted ? "text.secondary" : "text.primary",
                display: "flex",
                gap: 0.75,
                lineHeight: 1.35,
                textDecoration: isCompleted ? "line-through" : "none"
              }}
            >
              <MarkerIcon
                aria-hidden="true"
                sx={{
                  color: isCompleted
                    ? "success.main"
                    : isInProgress ? "primary.main" : "text.disabled",
                  fontSize: "1rem",
                  flex: "0 0 auto"
                }}
              />
              <Typography component="span" variant="body2" sx={{ minWidth: 0 }}>
                {step.step}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
