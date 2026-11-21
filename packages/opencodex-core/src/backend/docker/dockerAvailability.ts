import type { DockerAvailability } from "@open-codex-ui/docker-client";
import type { OpenCodexDockerAvailability } from "@open-codex-ui/opencodex-protocol";

/** Maps source or host Docker capability checks to plain renderer data. */
export function mapDockerAvailability(availability: DockerAvailability): OpenCodexDockerAvailability {
  if (!availability.available) {
    return { ...availability };
  }
  return { available: true, ...availability.version };
}
