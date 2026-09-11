/** Renders a compact emoji picker for the main chat composer. */
import MoodRoundedIcon from "@mui/icons-material/MoodRounded";
import {
  Box,
  ClickAwayListener,
  IconButton,
  Paper,
  Popper,
  Tab,
  Tabs,
  Tooltip,
  Typography
} from "@mui/material";
import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  COMPOSER_EMOJI_CATEGORIES,
  type ComposerEmojiCategoryId
} from "./composerEmojis";

type ComposerEmojiPickerProps = {
  onSelect(emoji: string): void;
};

type EmojiPickerCategoryId = ComposerEmojiCategoryId | "recent";

const MAX_RECENT_EMOJIS = 12;

/**
 * Renders an in-memory emoji picker without changing the goal editor or any
 * other text field.
 *
 * @param props Picker callbacks.
 * @returns The picker button and its popover.
 */
export function ComposerEmojiPicker({ onSelect }: ComposerEmojiPickerProps) {
  const { t } = useTranslation();
  const [anchorElement, setAnchorElement] = useState<HTMLButtonElement | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<EmojiPickerCategoryId>("emotions");
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const isOpen = anchorElement !== null;
  const categoryIds: EmojiPickerCategoryId[] = recentEmojis.length > 0
    ? ["recent", "emotions", "reactions"]
    : ["emotions", "reactions"];
  const visibleCategory: EmojiPickerCategoryId = categoryIds.includes(selectedCategory)
    ? selectedCategory
    : "emotions";
  const emojis = visibleCategory === "recent"
    ? recentEmojis
    : COMPOSER_EMOJI_CATEGORIES[visibleCategory];

  function handleToggle(event: MouseEvent<HTMLButtonElement>): void {
    if (isOpen) {
      setAnchorElement(null);
      return;
    }

    setSelectedCategory(recentEmojis.length > 0 ? "recent" : "emotions");
    setAnchorElement(event.currentTarget);
  }

  function handleClose(): void {
    setAnchorElement(null);
  }

  function handleCategoryChange(
    _event: React.SyntheticEvent,
    category: EmojiPickerCategoryId
  ): void {
    setSelectedCategory(category);
  }

  function handleSelect(emoji: string): void {
    setRecentEmojis((current) => (
      [emoji, ...current.filter((item) => item !== emoji)].slice(0, MAX_RECENT_EMOJIS)
    ));
    handleClose();
    onSelect(emoji);
  }

  function handlePickerKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      handleClose();
    }
  }

  return (
    <>
      <Tooltip title={t("composer.emoji.open")}>
        <span>
          <IconButton
            className="composer-icon-button"
            type="button"
            aria-label={t("composer.emoji.open")}
            aria-expanded={isOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleToggle}
          >
            <MoodRoundedIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Popper
        open={isOpen}
        anchorEl={anchorElement}
        placement="top-end"
        modifiers={[{ name: "offset", options: { offset: [0, 8] } }]}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <ClickAwayListener onClickAway={handleClose}>
          <Paper
            className="composer-emoji-picker"
            elevation={6}
            role="dialog"
            aria-label={t("composer.emoji.title")}
            onKeyDown={handlePickerKeyDown}
          >
            <Tabs
              value={visibleCategory}
              onChange={handleCategoryChange}
              variant="fullWidth"
              aria-label={t("composer.emoji.categories")}
            >
              {categoryIds.map((category) => (
                <Tab
                  key={category}
                  value={category}
                  label={t(`composer.emoji.${category}`)}
                  aria-label={t(`composer.emoji.${category}`)}
                />
              ))}
            </Tabs>
            {emojis.length === 0 ? (
              <Typography className="composer-emoji-empty" variant="body2">
                {t("composer.emoji.emptyRecent")}
              </Typography>
            ) : (
              <Box
                className="composer-emoji-grid"
                role="listbox"
                aria-label={t(`composer.emoji.${visibleCategory}`)}
              >
                {emojis.map((emoji) => (
                  <IconButton
                    key={emoji}
                    className="composer-emoji-option"
                    type="button"
                    color="inherit"
                    role="option"
                    aria-label={t("composer.emoji.insert", { emoji })}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(emoji)}
                  >
                    {emoji}
                  </IconButton>
                ))}
              </Box>
            )}
          </Paper>
        </ClickAwayListener>
      </Popper>
    </>
  );
}
