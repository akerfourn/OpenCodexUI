import { Box } from "@mui/material";
import { useTranslation } from "react-i18next";

/** Displays literal metadata without interpreting YAML tags, aliases or embedded HTML. */
export function MarkdownFrontmatter({ yaml }: { yaml: string }) {
  const { t } = useTranslation();
  return <Box component="details" open sx={{
    mb: 2, border: "1px solid", borderColor: "divider", borderRadius: 1,
    bgcolor: "action.hover", overflow: "hidden"
  }}>
    <Box component="summary" sx={{ px: 1.5, py: 1, cursor: "pointer", fontWeight: 600, fontSize: "0.875em" }}>
      {t("files.frontmatter")}
    </Box>
    <Box component="pre" sx={{ m: 0, px: 1.5, pb: 1.5, overflowX: "auto", fontSize: "0.875em", lineHeight: 1.5 }}>
      <code>{yaml}</code>
    </Box>
  </Box>;
}
