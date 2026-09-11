/** Renders file and emoji autocomplete popups for a composer. */
import Popper from "@mui/material/Popper";

import { ComposerEmojiSuggestions } from "./ComposerEmojiSuggestions";
import { ComposerFileSuggestions } from "./ComposerFileSuggestions";
import type { ComposerReferenceSuggestion } from "./composerReferences";

type ComposerSuggestionPopupsProps = {
  anchorElement: HTMLDivElement | null;
  disabled: boolean;
  renderInPortal: boolean;
  fileSuggestions: ComposerReferenceSuggestion[];
  fileHighlightedIndex: number;
  emojiEnabled: boolean;
  emojiActive: boolean;
  emojiHighlightedIndex: number;
  emojiSuggestions: readonly string[];
  emojiEmptyMessage: string;
  onFileSelect(suggestion: ComposerReferenceSuggestion | undefined): void;
  onEmojiSelect(emoji: string): void;
};

/**
 * Renders the two independent autocomplete surfaces used by the composer.
 *
 * @param props Popup state and selection callbacks.
 * @returns File and emoji popups.
 */
export function ComposerSuggestionPopups({
  anchorElement,
  disabled,
  renderInPortal,
  fileSuggestions,
  fileHighlightedIndex,
  emojiEnabled,
  emojiActive,
  emojiHighlightedIndex,
  emojiSuggestions,
  emojiEmptyMessage,
  onFileSelect,
  onEmojiSelect
}: ComposerSuggestionPopupsProps) {
  const hasFileSuggestions = !disabled && fileSuggestions.length > 0;
  const hasEmojiSuggestions = emojiEnabled && !disabled && emojiActive;
  const fileContent = disabled ? null : (
    <ComposerFileSuggestions
      suggestions={fileSuggestions}
      highlightedIndex={fileHighlightedIndex}
      isPortaled={renderInPortal}
      onSelect={onFileSelect}
    />
  );
  const emojiContent = disabled || !emojiEnabled ? null : (
    <ComposerEmojiSuggestions
      emojis={emojiSuggestions}
      emptyMessage={emojiEmptyMessage}
      highlightedIndex={emojiHighlightedIndex}
      isPortaled={renderInPortal}
      onSelect={onEmojiSelect}
    />
  );

  const fileView = renderInPortal ? (
    <Popper
      open={hasFileSuggestions && anchorElement !== null}
      anchorEl={anchorElement}
      placement="top-start"
      modifiers={[{ name: "offset", options: { offset: [0, 8] } }]}
      sx={{
        width: anchorElement?.getBoundingClientRect().width,
        zIndex: (theme) => theme.zIndex.modal + 1
      }}
    >
      {fileContent}
    </Popper>
  ) : fileContent;
  const emojiView = renderInPortal ? (
    <Popper
      open={hasEmojiSuggestions && anchorElement !== null}
      anchorEl={anchorElement}
      placement="top-end"
      modifiers={[{ name: "offset", options: { offset: [0, 8] } }]}
      sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
    >
      {emojiContent}
    </Popper>
  ) : (hasEmojiSuggestions ? emojiContent : null);

  return (
    <>
      {fileView}
      {emojiView}
    </>
  );
}
