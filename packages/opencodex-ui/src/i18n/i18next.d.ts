import "i18next";

import { defaultNS, resources } from "./resources.js";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: typeof resources.fr.translation;
  }
}
