import type { ParseKeys } from "i18next";
import {
  Ban,
  Building2,
  CreditCard,
  Kanban,
  Keyboard,
  Lock,
  MailPlus,
  Mails,
  Palette,
  Plug,
  Tags,
  Target,
  ShieldCheck,
  Upload,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export type SettingsSectionKey =
  | "pipeline"
  | "teams"
  | "users"
  | "invitations"
  | "appearance"
  | "permissions"
  | "blocked-companies"
  | "email-templates"
  | "sales-goals"
  | "event-labels"
  | "organization"
  | "billing"
  | "integrations"
  | "shortcuts"
  | "privacy"
  | "import";

export type SettingsGroup = "personal" | "organization" | "sales" | "billing";

export const GROUP_ORDER: SettingsGroup[] = ["personal", "organization", "sales", "billing"];

export const GROUP_LABELS: Record<SettingsGroup, ParseKeys<"settings">> = {
  personal: "nav.groups.personal",
  organization: "nav.groups.organization",
  sales: "nav.groups.sales",
  billing: "nav.groups.billing",
};

export interface SettingsSectionMeta {
  key: SettingsSectionKey;
  labelKey: ParseKeys<"settings">;
  descriptionKey: ParseKeys<"settings">;
  group: SettingsGroup;
  icon: LucideIcon;
  /** Per-user setting reachable by any role (not just admins). */
  personal?: boolean;
  /** Org-level setting every role may *read* (the section itself hides the
   * write controls for roles the backend rejects). */
  sharedRead?: boolean;
}

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    key: "appearance",
    labelKey: "nav.sections.appearance.label",
    descriptionKey: "nav.sections.appearance.description",
    group: "personal",
    icon: Palette,
    personal: true,
  },
  {
    key: "integrations",
    labelKey: "nav.sections.integrations.label",
    descriptionKey: "nav.sections.integrations.description",
    group: "personal",
    icon: Plug,
    personal: true,
  },
  {
    key: "shortcuts",
    labelKey: "nav.sections.shortcuts.label",
    descriptionKey: "nav.sections.shortcuts.description",
    group: "personal",
    icon: Keyboard,
    personal: true,
  },
  {
    key: "organization",
    labelKey: "nav.sections.organization.label",
    descriptionKey: "nav.sections.organization.description",
    group: "organization",
    icon: Building2,
  },
  {
    key: "teams",
    labelKey: "nav.sections.teams.label",
    descriptionKey: "nav.sections.teams.description",
    group: "organization",
    icon: Users,
  },
  {
    key: "users",
    labelKey: "nav.sections.users.label",
    descriptionKey: "nav.sections.users.description",
    group: "organization",
    icon: UserRound,
  },
  {
    key: "invitations",
    labelKey: "nav.sections.invitations.label",
    descriptionKey: "nav.sections.invitations.description",
    group: "organization",
    icon: MailPlus,
  },
  {
    key: "permissions",
    labelKey: "nav.sections.permissions.label",
    descriptionKey: "nav.sections.permissions.description",
    group: "organization",
    icon: ShieldCheck,
  },
  {
    key: "pipeline",
    labelKey: "nav.sections.pipeline.label",
    descriptionKey: "nav.sections.pipeline.description",
    group: "sales",
    icon: Kanban,
  },
  {
    key: "blocked-companies",
    labelKey: "nav.sections.blocked-companies.label",
    descriptionKey: "nav.sections.blocked-companies.description",
    group: "sales",
    icon: Ban,
  },
  {
    key: "email-templates",
    labelKey: "nav.sections.email-templates.label",
    descriptionKey: "nav.sections.email-templates.description",
    group: "sales",
    icon: Mails,
    // Salespeople pick templates when composing, so they must be able to read
    // the list; create/edit/delete stay admin/manager (backend-gated).
    sharedRead: true,
  },
  {
    key: "sales-goals",
    labelKey: "nav.sections.sales-goals.label",
    descriptionKey: "nav.sections.sales-goals.description",
    group: "sales",
    icon: Target,
    // A salesperson has to be able to see the number they're being measured
    // against; create/edit/delete stay admin/manager (backend-gated).
    sharedRead: true,
  },
  {
    key: "event-labels",
    labelKey: "nav.sections.event-labels.label",
    descriptionKey: "nav.sections.event-labels.description",
    group: "sales",
    icon: Tags,
    // Anyone picks labels on the event form, so anyone must be able to read
    // this list; rename/recolor/delete stay admin-only (backend-gated).
    sharedRead: true,
  },
  {
    key: "privacy",
    labelKey: "nav.sections.privacy.label",
    descriptionKey: "nav.sections.privacy.description",
    group: "sales",
    icon: Lock,
  },
  {
    key: "import",
    labelKey: "nav.importItem.label",
    descriptionKey: "nav.importItem.description",
    group: "sales",
    icon: Upload,
  },
  {
    key: "billing",
    labelKey: "nav.sections.billing.label",
    descriptionKey: "nav.sections.billing.description",
    group: "billing",
    icon: CreditCard,
  },
];

export function isSettingsSectionKey(
  value: string | null | undefined,
): value is SettingsSectionKey {
  return !!value && SETTINGS_SECTIONS.some((s) => s.key === value);
}

/** Admins get everything; everyone else gets their personal settings and the
 * read-for-all org sections, plus the invitations section when they hold the
 * invite privilege. */
export function visibleSectionKeys(role: string, canInvite: boolean): SettingsSectionKey[] {
  if (role === "admin") return SETTINGS_SECTIONS.map((s) => s.key);
  const keys = SETTINGS_SECTIONS.filter((s) => s.personal || s.sharedRead).map((s) => s.key);
  if (canInvite) keys.push("invitations");
  return keys;
}

export function defaultSectionKey(role: string, canInvite: boolean): SettingsSectionKey {
  return role === "admin" ? "pipeline" : visibleSectionKeys(role, canInvite)[0]!;
}
