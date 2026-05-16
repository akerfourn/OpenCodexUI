/**
 * Handles Lexical key commands while file suggestions are open.
 */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COMMAND_PRIORITY_CRITICAL,
  KEY_ENTER_COMMAND
} from "lexical";
import { useEffect } from "react";

import type { ComposerReferenceSuggestion } from "./composerReferences";

type ComposerFileSuggestionKeyPluginProps = {
  hasActiveTrigger: boolean;
  highlightedIndex: number;
  suggestions: ComposerReferenceSuggestion[];
  onSelect(suggestion: ComposerReferenceSuggestion): void;
};

/**
 * Captures Enter before Lexical turns it into a line break.
 *
 * @param props Component props.
 * @returns Nothing.
 */
export function ComposerFileSuggestionKeyPlugin({
  hasActiveTrigger,
  highlightedIndex,
  suggestions,
  onSelect
}: ComposerFileSuggestionKeyPluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => editor.registerCommand(
    KEY_ENTER_COMMAND,
    (event) => {
      if (!hasActiveTrigger || suggestions.length === 0) {
        return false;
      }

      const suggestion = suggestions[highlightedIndex] ?? suggestions[0];

      if (suggestion === undefined) {
        return false;
      }

      event?.preventDefault();
      event?.stopPropagation();
      onSelect(suggestion);
      return true;
    },
    COMMAND_PRIORITY_CRITICAL
  ), [editor, hasActiveTrigger, highlightedIndex, onSelect, suggestions]);

  return null;
}
