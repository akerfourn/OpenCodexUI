/**
 * Renders one command metadata row.
 */
import { Typography } from "@mui/material";

type CommandMetadataRowProps = {
  label: string;
  value: string | null;
};

/**
 * Renders one command metadata row.
 *
 * @param props Component props.
 *
 * @returns Rendered metadata row or nothing.
 */
export function CommandMetadataRow({ label, value }: CommandMetadataRowProps) {
  if (value === null) {
    return null;
  }

  return (
    <>
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
        {value}
      </Typography>
    </>
  );
}
