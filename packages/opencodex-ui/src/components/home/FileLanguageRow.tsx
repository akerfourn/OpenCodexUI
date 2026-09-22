import { FormControlLabel, ListItem, ListItemText, Switch } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { FileLanguage } from "../../features/fileLanguages/catalogue";
import type { FileLanguagesStore } from "../../stores/files/FileLanguagesStore";

/** Displays one catalogue entry with a durable enable/disable control. */
export function FileLanguageRow({ language, store }: { language: FileLanguage; store: FileLanguagesStore }) {
  const { t } = useTranslation();
  const associations = [...new Set([...language.extensions.map(value => `*${value}`), ...language.filenames])];
  const description = associations.join(", ") || language.aliases.join(", ") || language.id;
  /** Keeps the switch unchanged until settings persistence succeeds. */
  function toggle(_event: unknown, checked: boolean): void {
    void store.setEnabled(language.id, checked);
  }
  return (
    <ListItem divider>
      <ListItemText primary={language.name} secondary={description}
        slotProps={{ secondary: { sx: { overflowWrap: "anywhere" } } }} />
      <FormControlLabel label={t("fileLanguages.enabled")} sx={{ ml: 2, flexShrink: 0 }}
        control={<Switch size="small" checked={store.isEnabled(language.id)} disabled={store.saving}
          onChange={toggle} slotProps={{ input: { "aria-label": t("fileLanguages.toggle", { language: language.name }) } }} />} />
    </ListItem>
  );
}
export const FileLanguageRowX = observer(FileLanguageRow);
