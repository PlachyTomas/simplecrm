/**
 * Per-page tour definitions — pure data so steps are unit-testable
 * without rendering and copy swaps never touch React.
 *
 * Every page with a tour auto-opens it on the user's first visit and can
 * be replayed any time via the header `?`. Steps anchor to
 * `data-testid`s from `@/lib/testids`; per-entity ids (cards, rows) use
 * `anchorIsPrefix` so the spotlight lands on the first match. A step
 * with `advanceOnAppear` has no Next button — it waits for the user to
 * actually perform the action (the target testid appearing in the DOM),
 * with a small "skip this step" escape hatch for empty pages.
 *
 * Copy lives in `common.tutorial.tours.*`. The magenta-budget rule
 * (SIMPLECRM_DESIGN_BRIEF.md) allows one magenta moment per tour — by
 * convention its final step.
 */

import type { ParseKeys } from "i18next";

import { testIds } from "@/lib/testids";

export type TourStepAccent = "indigo" | "magenta";

export interface TourStep {
  id: string;
  /** `data-testid` to spotlight, or `null` for a centered card. */
  anchorTestId: string | null;
  /** Match `[data-testid^=…]` — for per-entity ids like pipeline cards. */
  anchorIsPrefix?: boolean;
  titleKey: ParseKeys<"common">;
  bodyKey: ParseKeys<"common">;
  accent: TourStepAccent;
  /**
   * Action-gated step: no Next button; the tour advances when a node
   * with this testid appears (the user performed the ask). Prefix match
   * is never needed here — point at a stable dialog/panel id.
   */
  advanceOnAppear?: string;
}

export type TourId =
  | "overview"
  | "pipeline"
  | "companies"
  | "contacts"
  | "deals"
  | "emails"
  | "calendar"
  | "reports";

export const PAGE_TOURS: Record<TourId, TourStep[]> = {
  overview: [
    {
      id: "welcome",
      anchorTestId: null,
      titleKey: "tutorial.tours.overview.welcome.title",
      bodyKey: "tutorial.tours.overview.welcome.body",
      accent: "indigo",
    },
    {
      id: "widgets",
      anchorTestId: testIds.dashboard.editLayout,
      titleKey: "tutorial.tours.overview.widgets.title",
      bodyKey: "tutorial.tours.overview.widgets.body",
      accent: "indigo",
    },
    {
      id: "quick-actions",
      anchorTestId: "dashboard-quick-action-",
      anchorIsPrefix: true,
      titleKey: "tutorial.tours.overview.quickActions.title",
      bodyKey: "tutorial.tours.overview.quickActions.body",
      accent: "magenta",
    },
  ],
  pipeline: [
    {
      id: "card-actions",
      anchorTestId: "pipeline-deal-",
      anchorIsPrefix: true,
      titleKey: "tutorial.tours.pipeline.cardActions.title",
      bodyKey: "tutorial.tours.pipeline.cardActions.body",
      accent: "indigo",
    },
    {
      id: "quick-actions",
      anchorTestId: "pipeline-quick-actions-",
      anchorIsPrefix: true,
      titleKey: "tutorial.tours.pipeline.quickActions.title",
      bodyKey: "tutorial.tours.pipeline.quickActions.body",
      accent: "indigo",
      advanceOnAppear: testIds.pipeline.quickActions.modal,
    },
    {
      id: "preview",
      anchorTestId: "pipeline-deal-",
      anchorIsPrefix: true,
      titleKey: "tutorial.tours.pipeline.preview.title",
      bodyKey: "tutorial.tours.pipeline.preview.body",
      accent: "indigo",
    },
    {
      id: "filters",
      anchorTestId: testIds.pipeline.wonWindow,
      titleKey: "tutorial.tours.pipeline.filters.title",
      bodyKey: "tutorial.tours.pipeline.filters.body",
      accent: "indigo",
    },
    {
      id: "health",
      anchorTestId: "pipeline-rotting-",
      anchorIsPrefix: true,
      titleKey: "tutorial.tours.pipeline.health.title",
      bodyKey: "tutorial.tours.pipeline.health.body",
      accent: "magenta",
    },
  ],
  companies: [
    {
      id: "ares",
      anchorTestId: testIds.companies.addButton,
      titleKey: "tutorial.tours.companies.ares.title",
      bodyKey: "tutorial.tours.companies.ares.body",
      accent: "indigo",
    },
    {
      id: "bulk-email",
      anchorTestId: testIds.companies.bulkEmailButton,
      titleKey: "tutorial.tours.companies.bulkEmail.title",
      bodyKey: "tutorial.tours.companies.bulkEmail.body",
      accent: "indigo",
    },
    {
      id: "ownership",
      anchorTestId: testIds.companies.ownerFilter,
      titleKey: "tutorial.tours.companies.ownership.title",
      bodyKey: "tutorial.tours.companies.ownership.body",
      accent: "magenta",
    },
  ],
  contacts: [
    {
      id: "csv",
      anchorTestId: testIds.contacts.exportCsv,
      titleKey: "tutorial.tours.contacts.csv.title",
      bodyKey: "tutorial.tours.contacts.csv.body",
      accent: "indigo",
    },
    {
      id: "main-contact",
      anchorTestId: null,
      titleKey: "tutorial.tours.contacts.mainContact.title",
      bodyKey: "tutorial.tours.contacts.mainContact.body",
      accent: "magenta",
    },
  ],
  deals: [
    {
      id: "status",
      anchorTestId: testIds.deals.statusFilter,
      titleKey: "tutorial.tours.deals.status.title",
      bodyKey: "tutorial.tours.deals.status.body",
      accent: "indigo",
    },
    {
      id: "csv",
      anchorTestId: testIds.deals.exportCsv,
      titleKey: "tutorial.tours.deals.csv.title",
      bodyKey: "tutorial.tours.deals.csv.body",
      accent: "indigo",
    },
    {
      id: "open-detail",
      anchorTestId: "deals-row-",
      anchorIsPrefix: true,
      titleKey: "tutorial.tours.deals.openDetail.title",
      bodyKey: "tutorial.tours.deals.openDetail.body",
      accent: "indigo",
      advanceOnAppear: testIds.deals.detail.dialog,
    },
    {
      id: "timeline",
      anchorTestId: testIds.deals.detail.timeline,
      titleKey: "tutorial.tours.deals.timeline.title",
      bodyKey: "tutorial.tours.deals.timeline.body",
      accent: "magenta",
    },
  ],
  emails: [
    {
      id: "bcc",
      anchorTestId: testIds.emails.mail.helpButton,
      titleKey: "tutorial.tours.emails.bcc.title",
      bodyKey: "tutorial.tours.emails.bcc.body",
      accent: "indigo",
    },
    {
      id: "filters",
      anchorTestId: testIds.emails.mail.typeFilter,
      titleKey: "tutorial.tours.emails.filters.title",
      bodyKey: "tutorial.tours.emails.filters.body",
      accent: "indigo",
    },
    {
      id: "tracking",
      anchorTestId: testIds.emails.mail.typeFilter,
      titleKey: "tutorial.tours.emails.tracking.title",
      bodyKey: "tutorial.tours.emails.tracking.body",
      accent: "magenta",
    },
  ],
  calendar: [
    {
      id: "google",
      anchorTestId: testIds.calendar.reconnect,
      titleKey: "tutorial.tours.calendar.google.title",
      bodyKey: "tutorial.tours.calendar.google.body",
      accent: "indigo",
    },
    {
      id: "deals",
      anchorTestId: testIds.calendar.newEvent,
      titleKey: "tutorial.tours.calendar.deals.title",
      bodyKey: "tutorial.tours.calendar.deals.body",
      accent: "magenta",
    },
  ],
  reports: [
    {
      id: "catalog",
      // NOT `reports.addWidget` — that button exists only in edit mode;
      // the tour runs in view mode, where Upravit rozložení is the way in.
      anchorTestId: testIds.reports.editLayout,
      titleKey: "tutorial.tours.reports.catalog.title",
      bodyKey: "tutorial.tours.reports.catalog.body",
      accent: "indigo",
    },
    {
      id: "period",
      anchorTestId: testIds.reports.filterBar,
      titleKey: "tutorial.tours.reports.period.title",
      bodyKey: "tutorial.tours.reports.period.body",
      accent: "indigo",
    },
    {
      id: "delta-csv",
      anchorTestId: testIds.reports.exportCsv,
      titleKey: "tutorial.tours.reports.deltaCsv.title",
      bodyKey: "tutorial.tours.reports.deltaCsv.body",
      accent: "magenta",
    },
  ],
};

/**
 * Route → tour. Detail routes inherit the list page's tour only where
 * that is the same screen (contacts/:id renders the list); pages without
 * an entry simply have no tour and hide the `?` button.
 */
export function tourForPath(pathname: string): TourId | null {
  if (pathname === "/app" || pathname === "/app/") return "overview";
  if (pathname.startsWith("/app/pipeline")) return "pipeline";
  if (pathname === "/app/companies") return "companies";
  if (pathname.startsWith("/app/contacts")) return "contacts";
  if (pathname.startsWith("/app/deals")) return "deals";
  if (pathname.startsWith("/app/emails")) return "emails";
  if (pathname.startsWith("/app/calendar")) return "calendar";
  if (pathname.startsWith("/app/reports")) return "reports";
  return null;
}
