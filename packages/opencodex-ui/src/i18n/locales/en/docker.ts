/** English translations for host Docker management. */
import type { TranslationShape } from "../../translationShape.js";
import type { frDocker } from "../fr/docker.js";

export const enDocker = {
  docker: {
    availability: {
      close: "Close",
      explain: "Explain status: {{status}}",
      recheck: "Check again",
      host: "This check uses Docker on the computer running OpenCodexUI and its active Docker context.",
      source: "This check uses the project source environment. Installing Docker on the host computer may not make it available to a WSL or SSH source.",
      pollingPaused: "Automatic refresh is paused. After resolving the issue, click Check again to resume.",
      "cli-missing": {
        title: "Docker not found",
        description: "The Docker command was not found. Check its installation and PATH in this environment, then restart the source if needed."
      },
      "compose-missing": {
        title: "Compose unavailable",
        description: "The Docker Compose plugin is unavailable. Install or repair the Compose v2 plugin in this environment."
      },
      "engine-unreachable": {
        title: "Docker engine unreachable",
        description: "The Docker command is present, but its engine is unreachable. On Windows or macOS, check that Docker Desktop is running. Also check the Docker service and selected context."
      },
      "permission-denied": {
        title: "Docker access denied",
        description: "This environment does not have permission to access Docker. Check access permissions for the Docker engine."
      },
      unknown: {
        title: "Check Docker",
        description: "A Docker check failed. Consult the error journal to identify the failed step. Also check the project's Compose configuration if the engine is working."
      }
    },
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
      fileSelection: "Compose file",
      chooseFile: "Choose a Compose file",
      fileMissing: "The selected file is missing. Choose another file; no automatic fallback will be used.",
      fileSelectionHelp: "Only this file is used, without automatic merging. Variants in the same directory can share containers and volumes.",

      actions: {
        logs: "View logs",
        refresh: "Refresh",
        restart: "Restart",
        start: "Start",
        stop: "Stop"
      },
      closeDetails: "Close details",
      composeFile: "Compose file: {{file}}",
      containerCount_one: "{{count}} container",
      containerCount_other: "{{count}} containers",
      containerState: {
        created: "Created",
        dead: "Dead",
        exited: "Exited",
        paused: "Paused",
        removing: "Removing",
        restarting: "Restarting",
        running: "Running"
      },
      containers: "Containers",
      description: "Docker Compose services for this project.",
      empty: "No Compose service was detected.",
      exitCode: "Exit code: {{code}}",
      exitCodeLabel: "Exit code",
      health: "Health",
      healthStatus: {
        healthy: "Healthy",
        starting: "Starting",
        unhealthy: "Unhealthy"
      },
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
      noPublishedPorts: "No published ports",
      ports: "Ports",
      serviceDetails: "Docker Compose service details",
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
