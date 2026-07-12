import type { ParseKeys } from "i18next";
import {
  Ban,
  Building2,
  CreditCard,
  Kanban,
  Lock,
  MailPlus,
  Palette,
  Plug,
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
  | "organization"
  | "billing"
  | "integrations"
  | "privacy";

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
    key: "privacy",
    labelKey: "nav.sections.privacy.label",
    descriptionKey: "nav.sections.privacy.description",
    group: "sales",
    icon: Lock,
  },
  {
    key: "billing",
    labelKey: "nav.sections.billing.label",
    descriptionKey: "nav.sections.billing.description",
    group: "billing",
    icon: CreditCard,
  },
];

export const IMPORT_NAV_ITEM = {
  labelKey: "nav.importItem.label" as ParseKeys<"settings">,
  descriptionKey: "nav.importItem.description" as ParseKeys<"settings">,
  icon: Upload,
  to: "/app/settings/import",
  group: "sales" as SettingsGroup,
};

export function isSettingsSectionKey(
  value: string | null | undefined,
): value is SettingsSectionKey {
  return !!value && SETTINGS_SECTIONS.some((s) => s.key === value);
}

/** Admins get everything; everyone else gets their personal settings, plus
 * the invitations section when they hold the invite privilege. */
export function visibleSectionKeys(role: string, canInvite: boolean): SettingsSectionKey[] {
  if (role === "admin") return SETTINGS_SECTIONS.map((s) => s.key);
  const keys = SETTINGS_SECTIONS.filter((s) => s.personal).map((s) => s.key);
  if (canInvite) keys.push("invitations");
  return keys;
}

export function defaultSectionKey(role: string, canInvite: boolean): SettingsSectionKey {
  return role === "admin" ? "pipeline" : visibleSectionKeys(role, canInvite)[0]!;
}
