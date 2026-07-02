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

export const GROUP_LABELS: Record<SettingsGroup, string> = {
  personal: "Osobní",
  organization: "Organizace",
  sales: "Prodej & data",
  billing: "Předplatné",
};

export interface SettingsSectionMeta {
  key: SettingsSectionKey;
  label: string;
  description: string;
  group: SettingsGroup;
  icon: LucideIcon;
  /** Per-user setting reachable by any role (not just admins). */
  personal?: boolean;
}

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    key: "appearance",
    label: "Vzhled",
    description: "Motiv, barvy a další vizuální nastavení.",
    group: "personal",
    icon: Palette,
    personal: true,
  },
  {
    key: "integrations",
    label: "Integrace",
    description: "Propojení s externími službami a odesílání e-mailů (SMTP).",
    group: "personal",
    icon: Plug,
    personal: true,
  },
  {
    key: "organization",
    label: "Organizace",
    description: "Smluvní počet uživatelů a způsob fakturace.",
    group: "organization",
    icon: Building2,
  },
  {
    key: "teams",
    label: "Týmy",
    description: "Sdružujte obchodníky pod manažery.",
    group: "organization",
    icon: Users,
  },
  {
    key: "users",
    label: "Uživatelé",
    description: "Spravujte role, týmovou příslušnost a aktivitu členů.",
    group: "organization",
    icon: UserRound,
  },
  {
    key: "invitations",
    label: "Pozvánky",
    description: "Pozvěte nové členy a spravujte oprávnění.",
    group: "organization",
    icon: MailPlus,
  },
  {
    key: "permissions",
    label: "Oprávnění",
    description: "Pravidla, kdo a co může v aplikaci dělat.",
    group: "organization",
    icon: ShieldCheck,
  },
  {
    key: "pipeline",
    label: "Pipeline",
    description: "Spravujte fáze pipeline a jejich pořadí.",
    group: "sales",
    icon: Kanban,
  },
  {
    key: "blocked-companies",
    label: "Blokovaná IČO",
    description: "Seznam IČO, která obchodníci nemohou přidat jako firmu.",
    group: "sales",
    icon: Ban,
  },
  {
    key: "privacy",
    label: "Soukromí",
    description: "Historie přístupů týmu SimpleCRM k Vašim datům a zrušení organizace.",
    group: "sales",
    icon: Lock,
  },
  {
    key: "billing",
    label: "Fakturace",
    description: "Detaily plánu, faktur a způsobu platby.",
    group: "billing",
    icon: CreditCard,
  },
];

/** Import z CSV is a standalone page (/app/settings/import) but appears in the
 * settings nav as a first-class item under Prodej & data. Admin-only. */
export const IMPORT_NAV_ITEM = {
  label: "Import z CSV",
  description: "Hromadný import firem a kontaktů z CSV souborů.",
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
 * Pozvánky when they hold the invite privilege. */
export function visibleSectionKeys(role: string, canInvite: boolean): SettingsSectionKey[] {
  if (role === "admin") return SETTINGS_SECTIONS.map((s) => s.key);
  const keys = SETTINGS_SECTIONS.filter((s) => s.personal).map((s) => s.key);
  if (canInvite) keys.push("invitations");
  return keys;
}

export function defaultSectionKey(role: string, canInvite: boolean): SettingsSectionKey {
  return role === "admin" ? "pipeline" : visibleSectionKeys(role, canInvite)[0]!;
}
