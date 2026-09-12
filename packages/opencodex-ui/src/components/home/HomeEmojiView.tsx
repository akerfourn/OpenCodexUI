/** Renders the global emoji catalogue and its user alias customizations. */
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import {
  getComposerEmojis,
  normalizeComposerEmojiSearchText
} from "../chat/composerEmojis";
import { searchComposerEmojis } from "../chat/composerEmojiSearch";

type HomeEmojiViewProps = {
  store: RootStore;
};

/** Renders the built-in emoji catalogue with persistent local overrides. */
export function HomeEmojiView({ store }: HomeEmojiViewProps) {
  const { t } = useTranslation();
  const emojiStore = store.emojiCatalogStore;
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState("");
  const emojis = getComposerEmojis();
  const visibleEmojis = searchComposerEmojis(searchTerm, emojiStore.overrides);
  const selected = selectedEmoji !== null && emojis.includes(selectedEmoji)
    ? selectedEmoji
    : visibleEmojis[0] ?? emojis[0] ?? null;

  useEffect(() => {
    void emojiStore.load();
  }, [emojiStore]);

  useEffect(() => {
    if (selectedEmoji !== selected) {
      setSelectedEmoji(selected);
    }
  }, [selected, selectedEmoji]);

  function handleAliasKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void handleAddAlias();
  }

  async function handleAddAlias(): Promise<void> {
    if (selected === null || aliasInput.trim().length === 0 || emojiStore.isSaving) {
      return;
    }

    await emojiStore.addAlias(selected, aliasInput);
    setAliasInput("");
  }

  function handleRemoveAlias(alias: string): void {
    if (selected !== null) {
      void emojiStore.removeAlias(selected, alias);
    }
  }

  function handleRestoreAlias(alias: string): void {
    if (selected !== null) {
      void emojiStore.addAlias(selected, alias);
    }
  }

  function handleResetEmoji(): void {
    if (selected !== null) {
      void emojiStore.resetEmoji(selected);
    }
  }

  const selectedDefaultAliases = selected === null
    ? []
    : emojiStore.getDefaultAliases(selected);
  const removedDefaultAliases = selected === null
    ? []
    : emojiStore.getRemovedDefaultAliases(selected);
  const activeDefaultAliases = selectedDefaultAliases.filter((alias) => (
    !removedDefaultAliases.some((removedAlias) => (
      normalizeComposerEmojiSearchText(removedAlias) === normalizeComposerEmojiSearchText(alias)
    ))
  ));
  const addedAliases = selected === null ? [] : emojiStore.getAddedAliases(selected);
  const hasCustomization = selected !== null && emojiStore.overrides.overrides[selected] !== undefined;
  const canEdit = selected !== null && !emojiStore.isSaving;
  const noResults = visibleEmojis.length === 0;
  const details = selected === null ? (
    <Typography color="text.secondary">{t("emojiCatalog.selectPrompt")}</Typography>
  ) : (
    <EmojiDetails
      emoji={selected}
      activeDefaultAliases={activeDefaultAliases}
      addedAliases={addedAliases}
      removedDefaultAliases={removedDefaultAliases}
      aliasInput={aliasInput}
      canEdit={canEdit}
      hasCustomization={hasCustomization}
      onAliasInputChange={setAliasInput}
      onAliasKeyDown={handleAliasKeyDown}
      onAddAlias={() => {
        void handleAddAlias();
      }}
      onRemoveAlias={handleRemoveAlias}
      onRestoreAlias={handleRestoreAlias}
      onReset={handleResetEmoji}
    />
  );

  return (
    <Stack className="home-content-panel" spacing={2}>
      <Box>
        <Typography variant="h5" component="h2">
          {t("emojiCatalog.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("emojiCatalog.description")}
        </Typography>
      </Box>
      {emojiStore.errorMessage !== null ? (
        <Alert severity="error" onClose={emojiStore.clearError}>
          {emojiStore.errorMessage}
        </Alert>
      ) : null}
      {emojiStore.isLoading ? <LinearProgress /> : null}
      <TextField
        value={searchTerm}
        label={t("emojiCatalog.search")}
        placeholder={t("emojiCatalog.searchPlaceholder")}
        size="small"
        fullWidth
        onChange={(event) => setSearchTerm(event.target.value)}
      />
      {noResults ? (
        <Typography color="text.secondary">{t("emojiCatalog.noResults")}</Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: {
              xs: "1fr",
              md: "minmax(260px, 0.9fr) minmax(320px, 1.5fr)"
            }
          }}
        >
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Box
              sx={{
                display: "grid",
                gap: 0.75,
                gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))"
              }}
            >
              {visibleEmojis.map((emoji) => (
                <ButtonBase
                  key={emoji}
                  aria-label={emoji}
                  aria-pressed={emoji === selected}
                  onClick={() => setSelectedEmoji(emoji)}
                  sx={{
                    minHeight: 48,
                    border: 1,
                    borderColor: emoji === selected ? "primary.main" : "divider",
                    borderRadius: 1,
                    fontFamily: '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
                    fontSize: 26,
                    "&:hover": { backgroundColor: "action.hover" }
                  }}
                >
                  {emoji}
                </ButtonBase>
              ))}
            </Box>
          </Paper>
          <Paper variant="outlined" sx={{ minWidth: 0, p: 2 }}>
            {details}
          </Paper>
        </Box>
      )}
    </Stack>
  );
}

export const HomeEmojiViewX = observer(HomeEmojiView);

type EmojiDetailsProps = {
  emoji: string;
  activeDefaultAliases: string[];
  addedAliases: string[];
  removedDefaultAliases: string[];
  aliasInput: string;
  canEdit: boolean;
  hasCustomization: boolean;
  onAliasInputChange(value: string): void;
  onAliasKeyDown(event: KeyboardEvent<HTMLInputElement>): void;
  onAddAlias(): void;
  onRemoveAlias(alias: string): void;
  onRestoreAlias(alias: string): void;
  onReset(): void;
};

/** Renders the editable alias list for the selected emoji. */
function EmojiDetails({
  emoji,
  activeDefaultAliases,
  addedAliases,
  removedDefaultAliases,
  aliasInput,
  canEdit,
  hasCustomization,
  onAliasInputChange,
  onAliasKeyDown,
  onAddAlias,
  onRemoveAlias,
  onRestoreAlias,
  onReset
}: EmojiDetailsProps) {
  const { t } = useTranslation();
  const hasHiddenAliases = removedDefaultAliases.length > 0;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <Typography
          aria-label={emoji}
          sx={{
            fontFamily: '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
            fontSize: 42,
            lineHeight: 1
          }}
        >
          {emoji}
        </Typography>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6">{t("emojiCatalog.aliasesTitle")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t("emojiCatalog.aliasesDescription")}
          </Typography>
        </Box>
      </Stack>
      <AliasGroup
        title={t("emojiCatalog.defaultAliases")}
        aliases={activeDefaultAliases}
        emptyMessage={t("emojiCatalog.noDefaultAliases")}
        canEdit={canEdit}
        onRemove={onRemoveAlias}
      />
      <AliasGroup
        title={t("emojiCatalog.customAliases")}
        aliases={addedAliases}
        emptyMessage={t("emojiCatalog.noCustomAliases")}
        canEdit={canEdit}
        onRemove={onRemoveAlias}
      />
      {hasHiddenAliases ? (
        <AliasGroup
          title={t("emojiCatalog.hiddenAliases")}
          aliases={removedDefaultAliases}
          canEdit={canEdit}
          onRemove={onRemoveAlias}
          onRestore={onRestoreAlias}
          restore
        />
      ) : null}
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <TextField
          value={aliasInput}
          label={t("emojiCatalog.addAlias")}
          placeholder={t("emojiCatalog.aliasPlaceholder")}
          size="small"
          fullWidth
          disabled={!canEdit}
          onChange={(event) => onAliasInputChange(event.target.value)}
          onKeyDown={onAliasKeyDown}
        />
        <Button
          variant="contained"
          startIcon={<AddOutlinedIcon />}
          disabled={!canEdit || aliasInput.trim().length === 0}
          onClick={onAddAlias}
        >
          {t("emojiCatalog.add")}
        </Button>
      </Stack>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <Button
          size="small"
          startIcon={<RestartAltOutlinedIcon />}
          disabled={!canEdit || !hasCustomization}
          onClick={onReset}
        >
          {t("emojiCatalog.reset")}
        </Button>
      </Stack>
    </Stack>
  );
}

type AliasGroupProps = {
  title: string;
  aliases: string[];
  emptyMessage?: string;
  canEdit: boolean;
  onRemove(alias: string): void;
  onRestore?(alias: string): void;
  restore?: boolean;
};

/** Displays removable aliases while keeping the default/custom distinction visible. */
function AliasGroup({
  title,
  aliases,
  emptyMessage,
  canEdit,
  onRemove,
  onRestore,
  restore = false
}: AliasGroupProps) {
  const { t } = useTranslation();

  return (
    <Stack spacing={0.75}>
      <Typography variant="subtitle2">{title}</Typography>
      {aliases.length === 0 && emptyMessage !== undefined ? (
        <Typography variant="body2" color="text.secondary">
          {emptyMessage}
        </Typography>
      ) : null}
      {aliases.length > 0 ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {aliases.map((alias) => (
            <Chip
              key={alias}
              label={alias}
              size="small"
              color={restore ? "warning" : "default"}
              variant={restore ? "outlined" : "filled"}
              disabled={!canEdit}
              onDelete={() => {
                if (restore && onRestore !== undefined) {
                  onRestore(alias);
                  return;
                }

                onRemove(alias);
              }}
              deleteIcon={restore ? <AddOutlinedIcon /> : undefined}
              aria-label={restore
                ? t("emojiCatalog.restoreAlias", { alias })
                : t("emojiCatalog.removeAlias", { alias })}
            />
          ))}
        </Box>
      ) : null}
    </Stack>
  );
}
