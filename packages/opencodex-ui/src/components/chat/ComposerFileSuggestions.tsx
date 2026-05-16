/**
 * Renders suggestions for composer references.
 */
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import { Box, List, ListItemButton, ListItemIcon, Paper, Typography } from "@mui/material";
import { useEffect, useRef } from "react";

import type { ComposerReferenceSuggestion } from "./composerReferences";

type ComposerFileSuggestionsProps = {
  suggestions: ComposerReferenceSuggestion[];
  highlightedIndex: number;
  onSelect(suggestion: ComposerReferenceSuggestion): void;
};

/**
 * Renders a compact file suggestion popup.
 *
 * @param props Component props.
 * @returns Rendered suggestion list, or nothing when empty.
 */
export function ComposerFileSuggestions({
  suggestions,
  highlightedIndex,
  onSelect
}: ComposerFileSuggestionsProps) {
  const activeItemRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({
      block: "nearest"
    });
  }, [highlightedIndex]);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Paper className="composer-file-suggestions" elevation={6}>
      <List dense disablePadding>
        {suggestions.map((suggestion, index) => (
          <ListItemButton
            key={readSuggestionKey(suggestion)}
            ref={index === highlightedIndex ? activeItemRef : undefined}
            selected={index === highlightedIndex}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(suggestion);
            }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              {suggestion.type === "skill" ? (
                <PsychologyOutlinedIcon fontSize="small" color="secondary" />
              ) : (
                <InsertDriveFileOutlinedIcon fontSize="small" color="disabled" />
              )}
            </ListItemIcon>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                {readSuggestionTitle(suggestion)}
              </Typography>
              <Typography variant="caption" noWrap component="div" sx={{ opacity: 0.68 }}>
                {readSuggestionSubtitle(suggestion)}
              </Typography>
            </Box>
          </ListItemButton>
        ))}
      </List>
    </Paper>
  );
}

function readSuggestionKey(suggestion: ComposerReferenceSuggestion): string {
  if (suggestion.type === "skill") {
    return `skill:${suggestion.result.path}`;
  }

  return `file:${suggestion.result.root}:${suggestion.result.relativePath}`;
}

function readSuggestionTitle(suggestion: ComposerReferenceSuggestion): string {
  if (suggestion.type === "skill") {
    return `$${suggestion.result.name}`;
  }

  return suggestion.result.fileName;
}

function readSuggestionSubtitle(suggestion: ComposerReferenceSuggestion): string {
  if (suggestion.type === "skill") {
    return suggestion.result.shortDescription ?? suggestion.result.description;
  }

  return suggestion.result.relativePath;
}
