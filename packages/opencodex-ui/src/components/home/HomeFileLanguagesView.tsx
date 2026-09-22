import { type ChangeEvent, useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Button, FormControlLabel, List, Stack, Switch, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { RootStore } from "../../stores/RootStore";
import { fileLanguages } from "../../features/fileLanguages/catalogue";
import { FileLanguageRowX } from "./FileLanguageRow";

const LANGUAGE_BATCH_SIZE = 30;

/** Manages bundled syntax grammars without loading Monaco into the Home page. */
export function HomeFileLanguagesView({ store }: { store: RootStore }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [enabledOnly, setEnabledOnly] = useState(false);
  const [limit, setLimit] = useState(LANGUAGE_BATCH_SIZE);
  const preferences = store.fileLanguagesStore;
  const query = search.trim().toLowerCase();
  const filtered = fileLanguages.filter(language => {
    if (enabledOnly && !preferences.isEnabled(language.id)) return false;
    return [language.name, language.id, ...language.aliases, ...language.extensions, ...language.filenames]
      .some(value => value.toLowerCase().includes(query));
  });
  const enabledCount = fileLanguages.filter(language => preferences.isEnabled(language.id)).length;
  /** Searches the whole catalogue and starts a fresh display batch. */
  function changeSearch(event: ChangeEvent<HTMLInputElement>): void {
    setSearch(event.target.value);
    setLimit(LANGUAGE_BATCH_SIZE);
  }

  /** Resets the display batch when the enabled-language filter changes. */
  function changeEnabledOnly(_event: ChangeEvent<HTMLInputElement>, checked: boolean): void {
    setEnabledOnly(checked);
    setLimit(LANGUAGE_BATCH_SIZE);
  }

  /** Mounts another bounded batch of language controls on demand. */
  function showMore(): void {
    setLimit(current => current + LANGUAGE_BATCH_SIZE);
  }

  let moreButton = null;
  if (filtered.length > limit) {
    moreButton = <Button onClick={showMore}>{t("fileLanguages.showMore")}</Button>;
  }
  let error = null;
  if (preferences.error !== null) {
    error = <Alert severity="error">{t("fileLanguages.saveError")}
      <details><summary>{t("fileLanguages.details")}</summary>{preferences.error}</details>
    </Alert>;
  }
  let content = <Typography color="text.secondary">{t("fileLanguages.empty")}</Typography>;
  if (filtered.length > 0) {
    content = <List dense>{filtered.slice(0, limit).map(language =>
      <FileLanguageRowX key={language.id} language={language} store={preferences} />)}</List>;
  }

  return (
    <Stack className="home-content-panel" spacing={2}>
      <Typography variant="h5" component="h2">{t("home.fileLanguages")}</Typography>
      <Typography color="text.secondary">{t("fileLanguages.description")}</Typography>
      <Typography variant="body2">{t("fileLanguages.count", { enabled: enabledCount, total: fileLanguages.length })}</Typography>
      {error}
      <TextField size="small" label={t("fileLanguages.search")} value={search}
        onChange={changeSearch} />
      <FormControlLabel label={t("fileLanguages.enabledOnly")} control={
        <Switch checked={enabledOnly} onChange={changeEnabledOnly} />
      } />
      {content}
      {moreButton}
    </Stack>
  );
}
export const HomeFileLanguagesViewX = observer(HomeFileLanguagesView);
