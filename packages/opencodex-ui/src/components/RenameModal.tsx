import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import type { ChangeEvent, FormEvent } from "react";

type RenameModalProps = {
  value: string;
  title: string;
  onCancel(): void;
  onChange(value: string): void;
  onSubmit(): void;
};

export function RenameModal({ value, title, onCancel, onChange, onSubmit }: RenameModalProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onCancel}>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>Renommer le chat</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {title}
          </Typography>
          <TextField value={value} autoFocus fullWidth onChange={handleChange} />
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant="contained" type="submit">
            Renommer
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
