import type { RootStore } from "../../stores/RootStore";

/** Checks whether the selected destination can handle project file references. */
export function canOpenProjectFileLinks(store: RootStore, sourceId: string | null): boolean {
  if (sourceId === null) {
    return false;
  }

  if (store.appStore.settingsStore.settings.fileOpeningMode !== "external") return true;

  const source = store.sourcesStore.sources.find((entry) => entry.id === sourceId);

  return source !== undefined &&
    store.sourcesStore.hasLocalAccess(source.id) &&
    "openFileCommand" in source.settings &&
    source.settings.openFileCommand !== null;
}
