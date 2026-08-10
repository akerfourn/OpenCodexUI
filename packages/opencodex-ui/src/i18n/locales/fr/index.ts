import { frApp } from "./app.js";
import { frAutomation } from "./automation.js";
import { frConversation } from "./conversation.js";
import { frGit } from "./git.js";
import { frNavigation } from "./navigation.js";
import { frProjects } from "./projects.js";
import { frSources } from "./sources.js";
import { frSupport } from "./support.js";
import { frUsage } from "./usage.js";

export const frTranslation = {
  ...frApp,
  ...frAutomation,
  ...frConversation,
  ...frGit,
  ...frNavigation,
  ...frProjects,
  ...frSources,
  ...frSupport,
  ...frUsage
} as const;
