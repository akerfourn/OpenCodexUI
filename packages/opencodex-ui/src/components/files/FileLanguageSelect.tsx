import { TextField } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { ChangeEvent } from "react";
import { fileLanguages } from "../../features/fileLanguages/catalogue";
import type { FileDocument } from "../../stores/files/FileDocument";
import type { FileLanguagesStore } from "../../stores/files/FileLanguagesStore";

/** Allows unusual filenames and languages without upstream associations to use the catalogue. */
export function FileLanguageSelect({ document, store }: { document: FileDocument; store: FileLanguagesStore }) {
  const { t } = useTranslation();
  /** Changes only this document's in-memory viewer preference. */
  function select(event: ChangeEvent<HTMLInputElement>): void {
    document.setLanguageOverride(event.target.value === "" ? null : event.target.value);
  }
  return (
    <TextField select size="small" label={t("fileLanguages.language")} sx={{ width: 150 }}
      value={document.languageOverride ?? ""} onChange={select}
      slotProps={{ inputLabel: { shrink: true }, select: { native: true } }}>
      <option value="">{t("fileLanguages.automatic")}</option>
      <option value="plaintext">{t("fileLanguages.plaintext")}</option>
      {fileLanguages.map(language => <option key={language.id} value={language.id}
        disabled={!store.isEnabled(language.id)}>{language.name}</option>)}
    </TextField>
  );
}
export const FileLanguageSelectX = observer(FileLanguageSelect);
