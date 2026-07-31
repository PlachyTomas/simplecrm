/**
 * Keyboard-shortcut catalog — the single source rendered by the `?` help
 * dialog AND Settings → Klávesové zkratky, and interpreted by
 * `useGlobalShortcuts`. Desktop-only (guards live in the hook).
 *
 * Why keys and not handlers here: the catalog must be renderable without
 * the app shell (Settings page), so it stays pure data; the hook maps ids
 * to actions.
 *
 * From the UI/UX research (docs/research/2026-07-31-ui-ux-best-practices.md):
 * a keyboard layer is the cheapest way to make a tool FEEL fast — the
 * Linear model. Mnemonics follow the Czech UI (g f = Firmy, g o = Obchody,
 * g m = E-maily).
 */

import type { ParseKeys } from "i18next";

export interface ShortcutDef {
  id: string;
  /** Keys as displayed, e.g. ["g", "p"] or ["Ctrl", "K"]. */
  keys: string[];
  labelKey: ParseKeys<"common">;
}

export interface ShortcutGroup {
  id: string;
  titleKey: ParseKeys<"common">;
  items: ShortcutDef[];
}

export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform);

const MOD = IS_MAC ? "⌘" : "Ctrl";

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: "actions",
    titleKey: "shortcuts.groups.actions",
    items: [
      { id: "search", keys: [MOD, "K"], labelKey: "shortcuts.items.search" },
      { id: "search-slash", keys: ["/"], labelKey: "shortcuts.items.search" },
      { id: "new-deal", keys: ["N"], labelKey: "shortcuts.items.newDeal" },
      { id: "help", keys: ["?"], labelKey: "shortcuts.items.help" },
    ],
  },
  {
    id: "navigation",
    titleKey: "shortcuts.groups.navigation",
    items: [
      { id: "go-overview", keys: ["G", "D"], labelKey: "shortcuts.items.goOverview" },
      { id: "go-pipeline", keys: ["G", "P"], labelKey: "shortcuts.items.goPipeline" },
      { id: "go-companies", keys: ["G", "F"], labelKey: "shortcuts.items.goCompanies" },
      { id: "go-contacts", keys: ["G", "K"], labelKey: "shortcuts.items.goContacts" },
      { id: "go-deals", keys: ["G", "O"], labelKey: "shortcuts.items.goDeals" },
      { id: "go-emails", keys: ["G", "M"], labelKey: "shortcuts.items.goEmails" },
      { id: "go-calendar", keys: ["G", "C"], labelKey: "shortcuts.items.goCalendar" },
      { id: "go-reports", keys: ["G", "R"], labelKey: "shortcuts.items.goReports" },
      { id: "go-settings", keys: ["G", "N"], labelKey: "shortcuts.items.goSettings" },
    ],
  },
];

/** Route for each `go-*` shortcut — consumed by the hook. */
export const GO_ROUTES: Record<string, string> = {
  d: "/app",
  p: "/app/pipeline",
  f: "/app/companies",
  k: "/app/contacts",
  o: "/app/deals",
  m: "/app/emails",
  c: "/app/calendar",
  r: "/app/reports",
  n: "/app/settings",
};

/** Event GlobalSearch listens for — fired by ⌘K and `/`. */
export const FOCUS_SEARCH_EVENT = "simplecrm:focus-search";

/** True when the keystroke belongs to a text control, not to us. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** True while any app dialog is open — sequences would fight focus traps. */
export function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"]') != null;
}
