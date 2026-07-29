/**
 * Displays a terminal error reported for a Codex turn.
 */
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import { Alert, Box, Typography } from "@mui/material";

type TurnErrorRowProps = {
  message: string;
};

/**
 * Renders a compact, high-contrast turn error.
 *
 * @param props Error row properties.
 * @returns Rendered error row.
 */
export function TurnErrorRow({ message }: TurnErrorRowProps) {
  return (
    <Box
      component="article"
      sx={{
        flex: "0 0 auto",
        minWidth: 0,
        px: 0.5,
        width: "100%",
        "@media (min-width: 1280px)": {
          maxWidth: "80%"
        }
      }}
    >
      <Alert
        severity="error"
        variant="outlined"
        icon={<ErrorOutlineOutlinedIcon fontSize="small" />}
        sx={{
          alignItems: "center",
          px: 1,
          py: 0.5,
          "& .MuiAlert-message": {
            minWidth: 0,
            overflowWrap: "anywhere",
            py: 0
          }
        }}
      >
        <Typography variant="body2">{message}</Typography>
      </Alert>
    </Box>
  );
}
