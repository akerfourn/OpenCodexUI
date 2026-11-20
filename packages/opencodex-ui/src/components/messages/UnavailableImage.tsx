import { Box, Tooltip } from "@mui/material";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import { useTranslation } from "react-i18next";
import { MarkdownLink } from "./MarkdownLink";

interface UnavailableImageProps {
  label: string;
  href?: string;
  onOpenLink?(href: string): void;
  requireModifiedClick?: boolean;
}

/** Retains a readable source link and explains expired image artifacts without an error notification. */
export function UnavailableImage({ label, href, onOpenLink, requireModifiedClick = false }: UnavailableImageProps) {
  const { t } = useTranslation();
  const explanation = t("message.imageUnavailableHelp");
  let content = <>{label}</>;
  if (href !== undefined && onOpenLink !== undefined) {
    content = <MarkdownLink href={href} onOpenLink={onOpenLink} requireModifiedClick={requireModifiedClick}
      title={explanation}>{label}</MarkdownLink>;
  }
  return <Tooltip title={explanation} describeChild disableInteractive>
    <Box component="span" data-image-unavailable sx={{ display: "inline-flex", alignItems: "baseline", gap: 0.5,
      color: "error.main", maxWidth: "100%", overflowWrap: "anywhere", "& a": { color: "inherit" } }}>
      <ErrorOutlineOutlinedIcon aria-label={t("message.imageUnavailable")}
        sx={{ fontSize: 16, flexShrink: 0, alignSelf: "center" }} />
      {content}
    </Box>
  </Tooltip>;
}
