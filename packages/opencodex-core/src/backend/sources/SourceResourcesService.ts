import { defaultSourceResources, type SourceResourceSnapshot } from "@open-codex-ui/opencodex-protocol";
import type { ProjectSourcePort } from "../runtime/runtimePorts.js";
import { readSourceResourceCapabilities } from "./resources/resourceCapabilities.js";

/** Reads optional local host controls without starting or reconnecting the selected Codex instance. */
export class SourceResourcesService {
  /** Resolves every request explicitly so another source cannot inherit local host settings. */
  constructor(private readonly sources: Pick<ProjectSourcePort, "resolveRequestedSource">) {}

  /** Returns plain settings and tested capabilities only for an existing native local source. */
  async read(sourceId: string): Promise<SourceResourceSnapshot> {
    if (typeof sourceId !== "string" || sourceId.trim().length === 0) throw new Error("An explicit Codex source is required.");
    const source = await this.sources.resolveRequestedSource(sourceId);
    if (source.id !== sourceId || source.kind !== "local") {
      throw new Error("Resource controls are supported only for local sources.");
    }
    const settings = source.settings.resources ?? defaultSourceResources();
    const capabilities = await readSourceResourceCapabilities();
    return { settings: { ...settings }, capabilities: { ...capabilities } };
  }
}
