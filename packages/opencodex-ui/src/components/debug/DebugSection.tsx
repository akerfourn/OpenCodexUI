import { Accordion, AccordionDetails, AccordionSummary, Chip, Typography } from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import type { ReactNode } from "react";

/** Compact inspection sections leave the remaining height available to the console. */
export function DebugSection({ title, count, defaultExpanded = false, children }: {
  title: string; count?: number; defaultExpanded?: boolean; children: ReactNode;
}) {
  const badge = count === undefined ? null : <Chip label={count} size="small" sx={{ height: 20, ml: 1 }} />;
  return <Accordion defaultExpanded={defaultExpanded} disableGutters elevation={0}
    sx={{ bgcolor: "transparent", flexShrink: 0, "&:before": { display: "none" }, borderBottom: 1, borderColor: "divider" }}>
    <AccordionSummary expandIcon={<ExpandMore fontSize="small" />} sx={{ px: 0, minHeight: 36, "& .MuiAccordionSummary-content": { my: 0.75, alignItems: "center" } }}>
      <Typography variant="subtitle2">{title}</Typography>{badge}
    </AccordionSummary>
    <AccordionDetails sx={{ px: 0, pt: 0, maxHeight: 320, overflow: "auto" }}>{children}</AccordionDetails>
  </Accordion>;
}
