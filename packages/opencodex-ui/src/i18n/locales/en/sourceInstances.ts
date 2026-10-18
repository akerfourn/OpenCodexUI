import type { TranslationShape } from "../../translationShape.js";
import type { frSourceInstances } from "../fr/sourceInstances.js";

export const enSourceInstances = {
  sourceInstances: {
    unknown: "Instance: unknown state",
    stopped: "Instance stopped",
    starting: "Instance starting",
    ready: "Instance running",
    active: "Instance active",
    stopping: "Instance stopping",
    updating: "Codex update in progress",
    error: "Instance error",
    start: "Start instance",
    stop: "Stop instance",
    restart: "Restart instance",
    confirmStop: "Stop the instance for {{name}}?",
    confirmRestart: "Restart the instance for {{name}}?",
    scope: "This action affects this source's OpenCodexUI instance and all its chats. Saved history is preserved.",
    manualStop: "A manually stopped instance stays stopped until you explicitly start or restart it from this list.",
    busy: "This source is working or waiting for a response. Check the force confirmation to interrupt its work.",
    force: "I confirm that I want to forcibly interrupt ongoing work on this source.",
    forceHelp: "Ongoing responses, commands and approval requests may be interrupted. Interrupted operations may need verification before resuming.",
    idle: "No ongoing work detected.",
    startingReason: "The instance is still starting.",
    requests_one: "{{count}} pending request: {{methods}}",
    requests_other: "{{count}} pending requests: {{methods}}",
    turns_one: "{{count}} ongoing agent response",
    turns_other: "{{count}} ongoing agent responses",
    threads_one: "{{count}} conversation reported active by Codex",
    threads_other: "{{count}} conversations reported active by Codex",
    approvals_one: "{{count}} pending approval",
    approvals_other: "{{count}} pending approvals",
    processes_one: "{{count}} running process",
    processes_other: "{{count}} running processes",
    cancel: "Cancel"
  }
} as const satisfies TranslationShape<typeof frSourceInstances>;
