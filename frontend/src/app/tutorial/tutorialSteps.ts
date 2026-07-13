/**
 * Tour step definitions — pure data so the steps are unit-testable
 * without rendering, and so QA can swap copy without touching React.
 *
 * Each step anchors to a sidebar `data-testid` from `@/lib/testids` (or
 * has no anchor for the welcome / outro centered cards). Keeping every
 * anchor inside the sidebar means the tour never needs to navigate
 * between routes, which both simplifies the overlay and stays robust
 * to slow page mounts after auto-navigation.
 *
 * Copy lives in the `common.tutorial.*` i18n catalog; this module stores
 * only the catalog keys — the consuming component (`TourCard`) translates
 * them at render time.
 *
 * The magenta-budget rule (see SIMPLECRM_DESIGN_BRIEF.md) limits the
 * tour to a single celebratory accent — only the final step sets
 * `accent: "magenta"`. Everything else uses the default indigo.
 */

import type { ParseKeys } from "i18next";

import { testIds } from "@/lib/testids";

export type TourStepAccent = "indigo" | "magenta";

export interface TourStep {
  id: string;
  /** `data-testid` to anchor the spotlight to, or `null` for a
   *  centered card with no spotlight. */
  anchorTestId: string | null;
  /** i18n key into `common.tutorial.*`; rendered as the card heading. */
  titleKey: ParseKeys<"common">;
  /** i18n key into `common.tutorial.*`; rendered inside <p>. */
  bodyKey: ParseKeys<"common">;
  /** Visual tone — drives the card border + the icon-circle color on
   *  the welcome / outro steps. Use `"magenta"` only on the final
   *  celebratory step. */
  accent: TourStepAccent;
}

export const TUTORIAL_STEPS: TourStep[] = [
  {
    id: "welcome",
    anchorTestId: null,
    titleKey: "tutorial.welcome.title",
    bodyKey: "tutorial.welcome.body",
    accent: "indigo",
  },
  {
    id: "companies",
    anchorTestId: testIds.nav.companies,
    titleKey: "tutorial.companies.title",
    bodyKey: "tutorial.companies.body",
    accent: "indigo",
  },
  {
    id: "pipeline",
    anchorTestId: testIds.nav.pipeline,
    titleKey: "tutorial.pipeline.title",
    bodyKey: "tutorial.pipeline.body",
    accent: "indigo",
  },
  {
    id: "reports",
    anchorTestId: testIds.nav.reports,
    titleKey: "tutorial.reports.title",
    bodyKey: "tutorial.reports.body",
    accent: "indigo",
  },
  {
    id: "settings",
    anchorTestId: testIds.nav.settings,
    titleKey: "tutorial.settings.title",
    bodyKey: "tutorial.settings.body",
    accent: "magenta",
  },
];
