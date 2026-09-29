import type { TranslationShape } from "../../translationShape.js";
import type { frMessageRendering } from "../fr/messageRendering.js";

export const enMessageRendering = {
  "messageRendering": {
    "title": "Message display",
    "globalTitle": "Message display defaults",
    "globalDescription": "Default values. Each message can keep its own settings through its gear button. Text sent to the model is unchanged.",
    "user": "User messages",
    "assistant": "Assistant messages",
    "markdown": "Markdown rendering",
    "math": "Equation rendering",
    "enabled": "Enabled",
    "disabled": "Disabled",
    "inherit": "Default ({{value}})",
    "description": "These choices only apply to this message. Equations require Markdown rendering.",
    "saveError": "Unable to load or save display preferences.",
    "retry": "Retry",
    "details": "Details"
  }
} as const satisfies TranslationShape<typeof frMessageRendering>;
