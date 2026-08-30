/** English translations for host Docker management. */
import type { TranslationShape } from "../../translationShape.js";
import type { frDocker } from "../fr/docker.js";

export const enDocker = {
  docker: {
    actions: {
      logs: "View logs",
      restart: "Restart",
      start: "Start",
      stop: "Stop"
    },
    columns: {
      actions: "Actions",
      image: "Image",
      name: "Container",
      ports: "Ports",
      status: "Status"
    },
    containerCount_one: "{{count}} container",
    containerCount_other: "{{count}} containers",
    description: "View and control containers from the local Docker engine.",
    empty: "No existing container was found in the active Docker context.",
    logs: {
      close: "Close",
      empty: "No logs are available for this container.",
      stderr: "Standard error",
      stdout: "Standard output",
      title: "Logs for {{container}}",
      truncated: "This output was truncated to limit the amount of displayed data."
    },
    refresh: "Refresh",
    serverVersion: "Docker {{version}}",
    title: "Local Docker",
    unavailableTitle: "Docker is unavailable",
    compose: {
      actions: {
        logs: "View logs",
        refresh: "Refresh",
        restart: "Restart",
        start: "Start",
        stop: "Stop"
      },
      composeFile: "Compose file: {{file}}",
      containers: "Containers",
      description: "Docker Compose services for this project.",
      empty: "No Compose service was detected.",
      exitCode: "Exit code: {{code}}",
      health: "Health",
      loading: "Detecting Docker Compose…",
      logs: {
        close: "Close",
        empty: "No logs are available for this service.",
        stderr: "Standard error",
        stdout: "Standard output",
        title: "Logs for {{service}}",
        truncated: "This output was truncated to limit the amount of displayed data."
      },
      name: "Name",
      noContainers: "No containers",
      ports: "Ports",
      sourceUnavailable: "This project's source is inactive.",
      state: "State",
      status: {
        missing: "Missing",
        partial: "Partial",
        running: "Running",
        stopped: "Stopped",
        unhealthy: "Unhealthy",
        unknown: "Unknown"
      },
      title: "Docker Compose"
    }
  }
} satisfies TranslationShape<typeof frDocker>;
