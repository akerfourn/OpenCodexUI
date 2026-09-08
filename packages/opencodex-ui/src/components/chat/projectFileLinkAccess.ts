import type { RootStore } from "../../stores/RootStore";

/** Returns whether the current source can open project file references locally. */
export function canOpenProjectFileLinks(store: RootStore, sourceId: string | null): boolean {
  if (sourceId === null) {
    return false;
  }

  const source = store.sourcesStore.sources.find((entry) => entry.id === sourceId);

  return source !== undefined &&
    store.sourcesStore.hasLocalAccess(source.id) &&
    "openFileCommand" in source.settings &&
    source.settings.openFileCommand !== null;
}
