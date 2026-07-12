import "i18next";

import type { cs } from "@/locales/cs";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: typeof cs;
  }
}
