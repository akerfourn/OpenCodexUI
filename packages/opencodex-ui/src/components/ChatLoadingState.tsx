import { CircularProgress, Stack, Typography } from "@mui/material";

type ChatLoadingStateProps = {
  label: string;
  fillView?: boolean;
};

export function ChatLoadingState({ label, fillView = false }: ChatLoadingStateProps) {
  return (
    <Stack
      sx={{
        gridRow: fillView ? "1 / -1" : undefined,
        height: "100%",
        minHeight: 0,
        alignItems: "center",
        justifyContent: "center",
        color: "text.secondary"
      }}
      spacing={1.5}
    >
      <CircularProgress size={28} />
      <Typography variant="body2">{label}</Typography>
    </Stack>
  );
}
