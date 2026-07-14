/**
 * Renders a Git section header with batch actions.
 */
import { Button, Stack, Typography } from "@mui/material";

type GitSectionHeaderProps = {
  count: number;
  primaryActionDisabled: boolean;
  primaryActionLabel: string;
  secondaryActionDisabled: boolean;
  secondaryActionLabel: string;
  tertiaryActionDisabled?: boolean;
  tertiaryActionLabel?: string;
  title: string;
  onPrimaryAction(): void;
  onSecondaryAction(): void;
  onTertiaryAction?(): void;
};

/**
 * Renders one Git file section header.
 *
 * @param props Component props.
 *
 * @returns Rendered section header.
 */
export function GitSectionHeader({
  count,
  primaryActionDisabled,
  primaryActionLabel,
  secondaryActionDisabled,
  secondaryActionLabel,
  tertiaryActionDisabled = false,
  tertiaryActionLabel,
  title,
  onPrimaryAction,
  onSecondaryAction,
  onTertiaryAction
}: GitSectionHeaderProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Typography variant="subtitle2" sx={{ flex: "1 1 auto" }}>
        {title} ({count})
      </Typography>
      <Button size="small" disabled={primaryActionDisabled} onClick={onPrimaryAction}>
        {primaryActionLabel}
      </Button>
      <Button size="small" disabled={secondaryActionDisabled} onClick={onSecondaryAction}>
        {secondaryActionLabel}
      </Button>
      {tertiaryActionLabel !== undefined && onTertiaryAction !== undefined ? (
        <Button size="small" disabled={tertiaryActionDisabled} onClick={onTertiaryAction}>
          {tertiaryActionLabel}
        </Button>
      ) : null}
    </Stack>
  );
}
