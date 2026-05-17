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
 * The magenta-budget rule (see SIMPLECRM_DESIGN_BRIEF.md) limits the
 * tour to a single celebratory accent — only the final step sets
 * `accent: "magenta"`. Everything else uses the default indigo.
 */

import { testIds } from "@/lib/testids";

export type TourStepAccent = "indigo" | "magenta";

export interface TourStep {
  id: string;
  /** `data-testid` to anchor the spotlight to, or `null` for a
   *  centered card with no spotlight. */
  anchorTestId: string | null;
  title: string;
  /** Czech body copy in vykání. Plain string; rendered inside <p>. */
  body: string;
  /** Visual tone — drives the card border + the icon-circle color on
   *  the welcome / outro steps. Use `"magenta"` only on the final
   *  celebratory step. */
  accent: TourStepAccent;
}

export const TUTORIAL_STEPS: TourStep[] = [
  {
    id: "welcome",
    anchorTestId: null,
    title: "Vítejte v SimpleCRM",
    body: "Provedeme Vás pěti kroky, kterými se za minutu zorientujete v aplikaci. Tour kdykoli přeskočíte a znovu spustíte přes ikonu ? v pravém horním rohu.",
    accent: "indigo",
  },
  {
    id: "companies",
    anchorTestId: testIds.nav.companies,
    title: "Firmy jsou základ",
    body: "Začněte u firmy. Stačí zadat IČO — název, adresu i právní formu doplníme z registru ARES.",
    accent: "indigo",
  },
  {
    id: "pipeline",
    anchorTestId: testIds.nav.pipeline,
    title: "Obchod patří do pipeline",
    body: 'V Pipeline najdete Kanban s vašimi obchody. Přidejte první přes „+ Přidat obchod" vpravo nahoře a přetahujte je mezi fázemi podle vývoje.',
    accent: "indigo",
  },
  {
    id: "reports",
    anchorTestId: testIds.nav.reports,
    title: "Reporty Vám napoví",
    body: "Až budete mít data, uvidíte tady, kdo vede žebříček, jak rychle se obchody zavírají a co se neprodává. Manažerům odemkne extra widgety přepnutí role v Nastavení.",
    accent: "indigo",
  },
  {
    id: "settings",
    anchorTestId: testIds.nav.settings,
    title: "Pozvěte tým, ať to nezůstane jen u Vás",
    body: "V Nastavení upravíte pipeline na míru, pozvete obchodníky a doplníte fakturační údaje. Hotovo, můžete jít na věc!",
    accent: "magenta",
  },
];
