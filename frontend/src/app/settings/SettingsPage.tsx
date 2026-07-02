import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { BlockedCompaniesSection } from "@/app/settings/BlockedCompaniesSection";
import { InvitationsSection } from "@/app/settings/InvitationsSection";
import { PrivacySection } from "@/app/settings/PrivacySection";
import { AppearanceSection } from "@/app/settings/sections/AppearanceSection";
import { BillingSection } from "@/app/settings/sections/BillingSection";
import { IntegrationsSection } from "@/app/settings/sections/IntegrationsSection";
import { OrganizationSection } from "@/app/settings/sections/OrganizationSection";
import { PermissionsSection } from "@/app/settings/sections/PermissionsSection";
import { PipelineSection } from "@/app/settings/sections/PipelineSection";
import { TeamsSection } from "@/app/settings/TeamsSection";
import { UsersSection } from "@/app/settings/UsersSection";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { useToast } from "@/lib/toast";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";

type SettingsTab =
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

// Settings groups give the (now 11) tabs an information architecture instead
// of one flat row. `personal` tabs are per-user and reachable by everyone;
// the rest are admin-only (see `visibleTabKeys`).
type SettingsGroup = "personal" | "organization" | "sales" | "billing";

const GROUP_ORDER: SettingsGroup[] = ["personal", "organization", "sales", "billing"];

const GROUP_LABELS: Record<SettingsGroup, string> = {
  personal: "Osobní",
  organization: "Organizace",
  sales: "Prodej & data",
  billing: "Předplatné",
};

interface SettingsTabMeta {
  key: SettingsTab;
  label: string;
  description: string;
  group: SettingsGroup;
  /** Per-user setting reachable by any role (not just admins). */
  personal?: boolean;
}

const TABS: SettingsTabMeta[] = [
  {
    key: "appearance",
    label: "Vzhled",
    description: "Motiv, barvy a další vizuální nastavení.",
    group: "personal",
    personal: true,
  },
  {
    key: "integrations",
    label: "Integrace",
    description: "Propojení s externími službami a odesílání e-mailů (SMTP).",
    group: "personal",
    personal: true,
  },
  {
    key: "organization",
    label: "Organizace",
    description: "Smluvní počet uživatelů a způsob fakturace.",
    group: "organization",
  },
  {
    key: "teams",
    label: "Týmy",
    description: "Sdružujte obchodníky pod manažery.",
    group: "organization",
  },
  {
    key: "users",
    label: "Uživatelé",
    description: "Spravujte role, týmovou příslušnost a aktivitu členů.",
    group: "organization",
  },
  {
    key: "invitations",
    label: "Pozvánky",
    description: "Pozvěte nové členy a spravujte oprávnění.",
    group: "organization",
  },
  {
    key: "permissions",
    label: "Oprávnění",
    description: "Pravidla, kdo a co může v aplikaci dělat.",
    group: "organization",
  },
  {
    key: "pipeline",
    label: "Pipeline",
    description: "Spravujte fáze pipeline a jejich pořadí.",
    group: "sales",
  },
  {
    key: "blocked-companies",
    label: "Blokovaná IČO",
    description: "Seznam IČO, která obchodníci nemohou přidat jako firmu.",
    group: "sales",
  },
  {
    key: "privacy",
    label: "Soukromí",
    description: "Historie přístupů týmu SimpleCRM k Vašim datům a zrušení organizace.",
    group: "sales",
  },
  {
    key: "billing",
    label: "Fakturace",
    description: "Detaily plánu, faktur a způsobu platby.",
    group: "billing",
  },
];

/** Which tabs a user may see. Admins get everything; everyone else gets their
 * personal settings (so e.g. salespeople can set up their own SMTP), plus
 * Pozvánky when they hold the invite privilege. */
function visibleTabKeys(role: string, canInvite: boolean): SettingsTab[] {
  if (role === "admin") return TABS.map((t) => t.key);
  const keys: SettingsTab[] = TABS.filter((t) => t.personal).map((t) => t.key);
  if (canInvite) keys.push("invitations");
  return keys;
}

interface SettingsPageProps {
  /** Pre-selects a tab on mount. Used by `/app/nastaveni/predplatne`
   *  to land directly on the billing tab. */
  initialTab?: SettingsTab;
}

function isSettingsTab(value: string | null): value is SettingsTab {
  return value !== null && TABS.some((t) => t.key === value);
}

export function SettingsPage({ initialTab = "pipeline" }: SettingsPageProps = {}) {
  const { data: user } = useCurrentUser();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // `?tab=` deep-links a specific tab — the Google Calendar OAuth callback
  // bounces to `/app/settings?tab=integrations&gcal=…`.
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const fromUrl = searchParams.get("tab");
    return isSettingsTab(fromUrl) ? fromUrl : initialTab;
  });

  // One-shot toast for the OAuth callback outcome, then clean the URL so
  // a refresh doesn't re-announce it.
  useEffect(() => {
    const connected = searchParams.get("gcal");
    const errorCode = searchParams.get("gcal_error");
    if (!connected && !errorCode) return;
    if (connected === "connected") {
      toast.success("Google Kalendář byl propojen");
    } else if (errorCode === "denied") {
      toast.error("Propojení Google Kalendáře bylo zrušeno");
    } else if (errorCode) {
      toast.error("Propojení Google Kalendáře se nezdařilo, zkuste to prosím znovu");
    }
    const next = new URLSearchParams(searchParams);
    next.delete("gcal");
    next.delete("gcal_error");
    next.delete("tab");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, toast]);

  // TABS is a non-empty literal — index 0 always exists, but
  // noUncheckedIndexedAccess forces a non-null assertion.
  const activeTabMeta = TABS.find((t) => t.key === activeTab) ?? TABS[0]!;
  usePageTitle(`Nastavení — ${activeTabMeta.label}`);

  // Which tabs this user may see. Admins get everything; everyone else gets
  // their personal settings (Vzhled, Integrace — so e.g. salespeople can set
  // up their own SMTP for bulk email) plus Pozvánky when they may invite.
  const visibleKeys = useMemo(
    () => (user ? visibleTabKeys(user.role, user.can_invite) : []),
    [user],
  );
  const visibleTabs = TABS.filter((t) => visibleKeys.includes(t.key));

  // If the active tab isn't available to this user (non-admin deep-linking an
  // admin tab, or the default "pipeline"), fall back to their first visible
  // tab. Above the early returns so hook order stays stable.
  useEffect(() => {
    if (visibleKeys.length > 0 && !visibleKeys.includes(activeTab)) {
      setActiveTab(visibleKeys[0]!);
    }
  }, [visibleKeys, activeTab]);

  if (!user) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání…
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Nastavení — {activeTabMeta.label}</h1>
        <p className="mt-1 text-sm text-text-tertiary">{activeTabMeta.description}</p>
        {user?.role === "admin" && activeTabMeta.group === "sales" ? (
          <p className="mt-2 text-xs text-text-tertiary">
            <Link
              to="/app/settings/import"
              className="text-accent hover:underline"
              data-testid="settings-import-link"
            >
              Hromadný import z CSV →
            </Link>
          </p>
        ) : null}
      </header>

      <nav aria-label="Sekce nastavení" className="mb-6">
        {/* Mobile: grouped dropdown — replaces the old horizontal-scroll strip
            that hid most of the (11) tabs behind an off-screen scrollbar. */}
        <div className="md:hidden">
          <label htmlFor="settings-section" className="sr-only">
            Sekce nastavení
          </label>
          <select
            id="settings-section"
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as SettingsTab)}
            className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            {GROUP_ORDER.map((group) => {
              const items = visibleTabs.filter((t) => t.group === group);
              if (items.length === 0) return null;
              return (
                <optgroup key={group} label={GROUP_LABELS[group]}>
                  {items.map((tab) => (
                    <option key={tab.key} value={tab.key}>
                      {tab.label}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        {/* Desktop: tabs grouped under section labels instead of one flat row. */}
        <div className="hidden flex-wrap gap-x-6 gap-y-3 border-b border-border-subtle pb-3 md:flex">
          {GROUP_ORDER.map((group) => {
            const items = visibleTabs.filter((t) => t.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  {GROUP_LABELS[group]}
                </span>
                <ul role="tablist" aria-label={GROUP_LABELS[group]} className="flex gap-1">
                  {items.map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                      <li key={tab.key} role="presentation">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setActiveTab(tab.key)}
                          className={cn(
                            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-fast",
                            isActive
                              ? "bg-accent-subtle text-accent"
                              : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
                          )}
                        >
                          {tab.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </nav>

      {activeTab === "teams" ? <TeamsSection /> : null}
      {activeTab === "users" ? <UsersSection /> : null}
      {activeTab === "blocked-companies" ? <BlockedCompaniesSection /> : null}
      {activeTab === "invitations" ? <InvitationsSection /> : null}
      {activeTab === "appearance" ? <AppearanceSection /> : null}
      {activeTab === "permissions" ? <PermissionsSection /> : null}
      {activeTab === "organization" ? <OrganizationSection /> : null}
      {activeTab === "billing" ? <BillingSection /> : null}
      {activeTab === "integrations" ? <IntegrationsSection /> : null}
      {activeTab === "privacy" ? <PrivacySection /> : null}
      {activeTab === "pipeline" ? <PipelineSection /> : null}
    </div>
  );
}
