import type { TranslationShape } from "../../translationShape.js";
import type { frTranslation } from "../fr/index.js";

import { enApp } from "./app.js";
import { enAutomation } from "./automation.js";
import { enCommon } from "./common.js";
import { enConversation } from "./conversation.js";
import { enDocker } from "./docker.js";
import { enGit } from "./git.js";
import { enNavigation } from "./navigation.js";
import { enProjects } from "./projects.js";
import { enSources } from "./sources.js";
import { enSupport } from "./support.js";
import { enUsage } from "./usage.js";

export const enTranslation = {
  ...enApp,
  ...enAutomation,
  ...enCommon,
  ...enConversation,
  ...enDocker,
  ...enGit,
  ...enNavigation,
  ...enProjects,
  ...enSources,
  ...enSupport,
  ...enUsage
} as const satisfies TranslationShape<typeof frTranslation>;
