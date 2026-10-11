import { dialog, type BrowserWindow } from "electron";

/** Opens a host directory picker, optionally parented to a window; cancellation returns null. */
export async function pickProjectDirectory(
  window: BrowserWindow | null,
  mode: "open" | "create"
): Promise<string | null> {
  const properties: Array<"openDirectory" | "createDirectory"> = ["openDirectory"];

  if (mode === "create") {
    properties.push("createDirectory");
  }

  const options = {
    properties,
    title: mode === "create" ? "Create or select project folder" : "Open project folder"
  };
  const result = window === null
    ? await dialog.showOpenDialog(options)
    : await dialog.showOpenDialog(window, options);

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0] ?? null;
}

/** Selects a Codex executable on the host, optionally parented to a window; cancellation returns null. */
export async function pickExecutableFile(window: BrowserWindow | null): Promise<string | null> {
  const options = {
    properties: ["openFile"] as Array<"openFile">,
    title: "Select Codex executable"
  };
  const result = window === null
    ? await dialog.showOpenDialog(options)
    : await dialog.showOpenDialog(window, options);

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0] ?? null;
}
