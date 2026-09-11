/** Renders inline emoji suggestions for the chat composer. */
import { Box, IconButton, Paper, Typography } from "@mui/material";

type ComposerEmojiSuggestionsProps = {
  emojis: readonly string[];
  emptyMessage: string;
  highlightedIndex: number;
  isPortaled?: boolean;
  onSelect(emoji: string): void;
};

/**
 * Renders a compact emoji grid anchored to an inline `::` trigger.
 *
 * @param props Suggestions and selection callback.
 * @returns Emoji suggestions or a no-match message.
 */
export function ComposerEmojiSuggestions({
  emojis,
  emptyMessage,
  highlightedIndex,
  isPortaled = false,
  onSelect
}: ComposerEmojiSuggestionsProps) {
  const className = isPortaled
    ? "composer-emoji-inline-suggestions composer-emoji-inline-suggestions-portaled"
    : "composer-emoji-inline-suggestions";

  return (
    <Paper className={className} elevation={6} role="listbox">
      {emojis.length === 0 ? (
        <Typography className="composer-emoji-empty" variant="body2">
          {emptyMessage}
        </Typography>
      ) : (
        <Box className="composer-emoji-grid">
          {emojis.map((emoji, index) => (
            <IconButton
              key={emoji}
              className={index === highlightedIndex
                ? "composer-emoji-option is-highlighted"
                : "composer-emoji-option"}
              type="button"
              color="inherit"
              role="option"
              aria-label={emoji}
              aria-selected={index === highlightedIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(emoji)}
            >
              {emoji}
            </IconButton>
          ))}
        </Box>
      )}
    </Paper>
  );
}
