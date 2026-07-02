# Settings Sub-nav Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Settings page's grouped pill-strip navigation with a Stripe-style sub-nav column (desktop) and a drill-in home list (mobile), with one route per section.

**Architecture:** `/app/settings` becomes a layout route (`SettingsLayout`: guards + desktop sub-nav + `<Outlet/>`) with an index route (`SettingsHome`: mobile home list / desktop redirect) and a `:section` route (`SettingsSectionPage`: slug+role validation, header, section component). The 2,510-line `SettingsPage.tsx` monolith is dissolved: section components move as-is into `sections/` files; nav metadata moves to `settingsNav.ts`. Spec: `docs/superpowers/specs/2026-07-02-settings-subnav-redesign-design.md`.

**Tech Stack:** React 18, react-router-dom v6, TanStack Query, Tailwind (design tokens), lucide-react, vitest + testing-library.

## Global Constraints

- All UI copy is Czech (match existing strings verbatim when moving code).
- Colors/spacing via design tokens only (`bg-surface`, `text-text-tertiary`, `bg-accent-subtle`, `duration-fast`, …) — never raw hex/named colors.
- lucide icons: `size={16}` in nav rows, `strokeWidth={1.75}` everywhere.
- Section *contents* must not change — extraction tasks are pure moves (same JSX, same strings, same hooks).
- Frontend checks from repo root `frontend/`: `npx tsc --noEmit`, `npx eslint <files>`, `pnpm test`, `pnpm build`.
- Commit after every task (small chunks; owner's machine crashes often).
- Baseline before Task 1: 127/127 tests pass.

---

### Task 1: `settingsNav.ts` — section metadata + helpers

**Files:**
- Create: `frontend/src/app/settings/settingsNav.ts`
- Test: `frontend/src/__tests__/settingsNav.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module). Metadata copied from `TABS` in `frontend/src/app/settings/SettingsPage.tsx:67-182`.
- Produces (used by Tasks 4):
  - `type SettingsSectionKey` (11 keys, identical to old `SettingsTab`)
  - `type SettingsGroup`, `GROUP_ORDER: SettingsGroup[]`, `GROUP_LABELS: Record<SettingsGroup, string>`
  - `interface SettingsSectionMeta { key; label; description; group; icon: LucideIcon; personal?: boolean }`
  - `SETTINGS_SECTIONS: SettingsSectionMeta[]` (same order as old `TABS`)
  - `IMPORT_NAV_ITEM: { label; description; icon; to; group }`
  - `isSettingsSectionKey(v: string | null | undefined): v is SettingsSectionKey`
  - `visibleSectionKeys(role: string, canInvite: boolean): SettingsSectionKey[]`
  - `defaultSectionKey(role: string, canInvite: boolean): SettingsSectionKey`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/__tests__/settingsNav.test.ts
import { describe, expect, it } from "vitest";

import {
  defaultSectionKey,
  isSettingsSectionKey,
  SETTINGS_SECTIONS,
  visibleSectionKeys,
} from "@/app/settings/settingsNav";

describe("settingsNav", () => {
  it("admins see all 11 sections", () => {
    expect(visibleSectionKeys("admin", false)).toHaveLength(11);
  });

  it("salespeople see only personal sections", () => {
    expect(visibleSectionKeys("salesperson", false)).toEqual(["appearance", "integrations"]);
  });

  it("invite privilege adds Pozvánky for non-admins", () => {
    expect(visibleSectionKeys("salesperson", true)).toEqual([
      "appearance",
      "integrations",
      "invitations",
    ]);
  });

  it("default section: pipeline for admins, appearance otherwise", () => {
    expect(defaultSectionKey("admin", false)).toBe("pipeline");
    expect(defaultSectionKey("manager", false)).toBe("appearance");
  });

  it("isSettingsSectionKey guards slugs", () => {
    expect(isSettingsSectionKey("billing")).toBe(true);
    expect(isSettingsSectionKey("blocked-companies")).toBe(true);
    expect(isSettingsSectionKey("nonsense")).toBe(false);
    expect(isSettingsSectionKey(null)).toBe(false);
  });

  it("every section has an icon and a description", () => {
    for (const s of SETTINGS_SECTIONS) {
      expect(s.icon).toBeTruthy();
      expect(s.description.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/settingsNav.test.ts`
Expected: FAIL — "Cannot find module '@/app/settings/settingsNav'".

- [ ] **Step 3: Write the implementation**

Copy `label`/`description`/`group`/`personal` values verbatim from `TABS` (`SettingsPage.tsx:103-172`); same array order (appearance, integrations, organization, teams, users, invitations, permissions, pipeline, blocked-companies, privacy, billing).

```ts
// frontend/src/app/settings/settingsNav.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/settingsNav.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/app/settings/settingsNav.ts src/__tests__/settingsNav.test.ts`

```bash
git add frontend/src/app/settings/settingsNav.ts frontend/src/__tests__/settingsNav.test.ts
git commit -m "feat(settings): section nav metadata module with icons"
```

---

### Task 2: Extract billing machinery from the monolith

**Files:**
- Create: `frontend/src/app/settings/sections/billingShared.ts`
- Create: `frontend/src/app/settings/sections/BillingSection.tsx`
- Modify: `frontend/src/app/settings/SettingsPage.tsx` (delete moved code, import `BillingSection`)

**Interfaces:**
- Consumes: existing hooks in `frontend/src/components/billing/*` (unchanged).
- Produces:
  - `billingShared.ts` exports: `SUPPORT_MAILTO`, `ENTERPRISE_MAILTO`, `formatCsDate(iso: string | null | undefined): string | null`, `getStatusPill(sub): { label: string; className: string }`, `planDisplayName(sub): string`, `planInterval(sub): "monthly" | "annual" | "custom"`, `type SubscriptionOut`, `type PlanCode`.
  - `BillingSection.tsx` exports: `BillingSection: () => JSX.Element` (no props).

This is a **pure move** — JSX, strings, and logic stay byte-identical.

- [ ] **Step 1: Create `billingShared.ts`**

Move from `SettingsPage.tsx` lines 913–964: types `SubscriptionOut`, `PlanCode`; constants `SUPPORT_MAILTO`, `ENTERPRISE_MAILTO`; `csDate` formatter + `formatCsDate`; `StatusPillSpec` + `getStatusPill`; `planDisplayName`; `planInterval`. Add `export` to each. Imports needed: `import type { components } from "@/types/api.generated";`.

- [ ] **Step 2: Create `BillingSection.tsx`**

Move from `SettingsPage.tsx` these components verbatim (line refs pre-move): `BillingSection` (966), `PaidThroughBlock` (1015), `CurrentPlanCard` (1078), `BillingDetailsCard` (1184), `PAYMENT_KIND_LABEL`/`PAYMENT_STATUS_PILL` (1257–1268), `PaymentsCard` (1270), `TAX_INVOICE_KIND_LABEL`/`TAX_INVOICE_STATUS_PILL` (1326–1341), `TaxInvoicesCard` (1343), `CancelSubscriptionCard` (1434), `ChoosePlanModal` (1573), `PlanModalCard` (1779). Export only `BillingSection`; the rest stay module-private. Shared helpers import from `./billingShared`. Carry over the needed imports from the monolith's header (usePayments, useTaxInvoices, useBillingSummary, useCurrentSubscription, usePublicPlans, PriceDisplay, RecurringPaymentConsent, formatCzkMinor, csNoun, cn, lucide icons, react/useState, ApiError if used) — let `npx tsc --noEmit` report anything missed.

- [ ] **Step 3: Slim the monolith**

In `SettingsPage.tsx`: delete everything moved in Steps 1–2, add `import { BillingSection } from "@/app/settings/sections/BillingSection";`. The `{activeTab === "billing" ? <BillingSection /> : null}` line keeps working. Note: `OrganizationSection` (still in the monolith until Task 3) also uses `formatCsDate`/`SubscriptionOut`-related helpers — import what it needs from `./sections/billingShared`.

- [ ] **Step 4: Verify green + commit**

Run: `cd frontend && npx tsc --noEmit && pnpm test`
Expected: 0 type errors; 133/133 tests pass (127 baseline + 6 from Task 1). `billingSettings.test.tsx` is the real gate here.

```bash
git add frontend/src/app/settings
git commit -m "refactor(settings): extract BillingSection + billing helpers from monolith"
```

---

### Task 3: Extract the remaining sections

**Files:**
- Create: `frontend/src/app/settings/sections/OrganizationSection.tsx`
- Create: `frontend/src/app/settings/sections/IntegrationsSection.tsx`
- Create: `frontend/src/app/settings/sections/PermissionsSection.tsx`
- Create: `frontend/src/app/settings/sections/AppearanceSection.tsx`
- Create: `frontend/src/app/settings/sections/PipelineSection.tsx`
- Modify: `frontend/src/app/settings/SettingsPage.tsx` (delete moved code, import the five sections)

**Interfaces:**
- Consumes: `billingShared.ts` exports (Task 2), existing hooks (`usePipelineSettings`, `useGoogleCalendar`, `useUsersTeams`, billing hooks), existing cards (`InvoiceDetailsCard`, `SmtpSettingsCard`).
- Produces: five components, each `() => JSX.Element`, no props: `OrganizationSection`, `IntegrationsSection`, `PermissionsSection`, `AppearanceSection`, `PipelineSection`.

Pure moves again (line refs pre-move, i.e. original file):

- [ ] **Step 1: `OrganizationSection.tsx`** — move `OrganizationSection` (1840), `SeatCountCard` (1879), `LiveSeatCostPreview` (2142), `BillingIntervalCard` (2196), `IntervalRadio` (2333). It renders `<InvoiceDetailsCard />` — keep that import. Helpers from `./billingShared`.

- [ ] **Step 2: `IntegrationsSection.tsx`** — move `GoogleCalendarCard` (2371) and `IntegrationsSection` (2457, includes the static ARES/Slack/Webhooky list, `SmtpSettingsCard`).

- [ ] **Step 3: `PermissionsSection.tsx`** — move `LeaderboardVisibilityToggle` (693), `OwnershipWindowSetting` (752), `PermissionsSection` (847). Needs `OrganizationOut` type (`components["schemas"]["OrganizationOut"]`), `apiFetch`, `useAuth`, `useCurrentUser`, query-client invalidation — copy those imports over.

- [ ] **Step 4: `AppearanceSection.tsx`** — move `AppearanceSection` (679) with its `ThemeToggle` import.

- [ ] **Step 5: `PipelineSection.tsx`** — move `StageForm` (206), `StageRow` (312), `StageType`/`STAGE_TYPE_LABEL`/`StageFormState`/`EMPTY_FORM` (184–204), and extract the pipeline behavior out of the `SettingsPage` body into a new component. Complete component shell (bodies of the moved handlers/JSX are byte-identical to the monolith's — `handleMove` from lines 462–475, `handleDelete` from 477–489, the pipeline JSX from 598–674, the `globalError` alert div from 579–586):

```tsx
export function PipelineSection() {
  const { data: pipeline, isPending, isError } = usePipeline();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const reorder = useReorderStages();
  const [addingOpen, setAddingOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const stagesReady = !isPending && !isError && pipeline;
  const stages = stagesReady ? [...pipeline.stages].sort((a, b) => a.position - b.position) : [];

  // handleMove and handleDelete: byte-identical to SettingsPage.tsx:462-489
  // editing lookup: byte-identical to SettingsPage.tsx:491

  return (
    <>
      {/* globalError alert div: byte-identical to SettingsPage.tsx:579-586 */}
      {/* pipeline content: byte-identical to SettingsPage.tsx:598-674
          (the `activeTab !== "pipeline" ? null :` guard is dropped;
          start directly with the isPending ternary) */}
    </>
  );
}
```

- [ ] **Step 6: Slim the monolith** — `SettingsPage.tsx` now only holds: `SettingsTab`/groups/`TABS` meta, `visibleTabKeys`, `isSettingsTab`, the `SettingsPage` component (header, nav strip, gcal toast effect, tab switching) rendering the imported sections. All pipeline hooks/state moved out in Step 5.

- [ ] **Step 7: Verify green + commit**

Run: `cd frontend && npx tsc --noEmit && pnpm test && npx eslint src/app/settings`
Expected: all pass (ownershipWindow + smtpSettings + billingSettings cover the moved sections).

```bash
git add frontend/src/app/settings
git commit -m "refactor(settings): extract remaining sections from monolith"
```

---

### Task 4: New routing + layout + home; delete the monolith

**Files:**
- Create: `frontend/src/app/settings/SettingsLayout.tsx`
- Create: `frontend/src/app/settings/SettingsHome.tsx`
- Create: `frontend/src/app/settings/SettingsSectionPage.tsx`
- Create: `frontend/src/__tests__/settingsNavigation.test.tsx`
- Modify: `frontend/src/App.tsx:97-99` (routes)
- Modify: `frontend/src/__tests__/ownershipWindow.test.tsx` (4× `role="tab"` clicks)
- Delete: `frontend/src/app/settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: everything Tasks 1–3 produce; existing standalone sections `TeamsSection`, `UsersSection`, `InvitationsSection`, `PrivacySection`, `BlockedCompaniesSection`; `useCurrentUser` (`user.role: string`, `user.can_invite: boolean`); `useToast`; `usePageTitle`; `cn`.
- Produces: routes `/app/settings` (index), `/app/settings/:section`; redirect `/app/nastaveni/predplatne` → `/app/settings/billing`; legacy `?tab=X` redirect.

- [ ] **Step 1: Write the failing navigation test**

```tsx
// frontend/src/__tests__/settingsNavigation.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buildMe(role: string, canInvite: boolean) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    email: "user@example.cz",
    name: "Test User",
    avatar_url: null,
    role,
    can_invite: canInvite,
    is_super_admin: false,
    organization: {
      id: "00000000-0000-0000-0000-0000000000aa",
      name: "Example s.r.o.",
      ico: "27082440",
      locale: "cs-CZ",
      currency: "CZK",
      trial_ends_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      show_leaderboard_to_salespeople: false,
      ownership_window_days: 365,
    },
  };
}

function setupFetch(role = "admin", canInvite = true) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.endsWith("/api/v1/auth/me")) return jsonResponse(buildMe(role, canInvite));
    if (url.includes("/api/v1/pipeline")) return jsonResponse({ stages: [] });
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake-token">
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Settings navigation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the grouped home list on the index route (mobile default)", async () => {
    setupFetch();
    renderAt("/app/settings");
    expect(await screen.findByRole("heading", { level: 1, name: "Nastavení" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Vzhled/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Fakturace/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Import z CSV/ })).toBeInTheDocument();
  });

  it("redirects legacy ?tab= deep links and keeps other params", async () => {
    setupFetch();
    renderAt("/app/settings?tab=integrations&gcal=connected");
    expect(await screen.findByRole("heading", { level: 1, name: "Integrace" })).toBeInTheDocument();
  });

  it("redirects /app/nastaveni/predplatne to the billing section", async () => {
    setupFetch();
    renderAt("/app/nastaveni/predplatne");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Fakturace" }),
    ).toBeInTheDocument();
  });

  it("bounces non-admins from admin sections to their default", async () => {
    setupFetch("salesperson", false);
    renderAt("/app/settings/users");
    expect(await screen.findByRole("heading", { level: 1, name: "Vzhled" })).toBeInTheDocument();
  });

  it("bounces unknown slugs to the default section", async () => {
    setupFetch();
    renderAt("/app/settings/does-not-exist");
    expect(await screen.findByRole("heading", { level: 1, name: "Pipeline" })).toBeInTheDocument();
  });

  it("hides admin sections from the salesperson home list", async () => {
    setupFetch("salesperson", false);
    renderAt("/app/settings");
    await screen.findByRole("heading", { level: 1, name: "Nastavení" });
    expect(screen.queryByRole("link", { name: /Uživatelé/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Import z CSV/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/settingsNavigation.test.tsx`
Expected: FAIL — index route still renders old `SettingsPage` ("Nastavení — Pipeline" heading, no home list).

- [ ] **Step 3: Create `SettingsLayout.tsx`**

```tsx
// frontend/src/app/settings/SettingsLayout.tsx
import { useEffect } from "react";
import { Navigate, NavLink, Outlet, useSearchParams } from "react-router-dom";

import {
  GROUP_LABELS,
  GROUP_ORDER,
  IMPORT_NAV_ITEM,
  isSettingsSectionKey,
  SETTINGS_SECTIONS,
  visibleSectionKeys,
} from "@/app/settings/settingsNav";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const navItemBase =
  "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-fast";
const navItemActive = "bg-accent-subtle text-accent";
const navItemIdle = "text-text-secondary hover:bg-surface-overlay hover:text-text-primary";

export function SettingsLayout() {
  const { data: user } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  const tabParam = searchParams.get("tab");

  // One-shot toast for the Google Calendar OAuth callback outcome, then clean
  // the URL so a refresh doesn't re-announce it. Skipped while a legacy ?tab=
  // is pending so this effect doesn't race the redirect below.
  useEffect(() => {
    if (tabParam) return;
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
    setSearchParams(next, { replace: true });
  }, [tabParam, searchParams, setSearchParams, toast]);

  // Legacy deep links (`/app/settings?tab=X` — used by the gcal OAuth
  // callback) become section routes; remaining query params survive.
  if (isSettingsSectionKey(tabParam)) {
    const rest = new URLSearchParams(searchParams);
    rest.delete("tab");
    const suffix = rest.toString();
    return <Navigate to={`/app/settings/${tabParam}${suffix ? `?${suffix}` : ""}`} replace />;
  }

  if (!user) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání…
      </div>
    );
  }

  const visibleKeys = visibleSectionKeys(user.role, user.can_invite);
  const isAdmin = user.role === "admin";

  return (
    <div className="flex">
      <nav
        aria-label="Sekce nastavení"
        className="hidden w-56 shrink-0 border-r border-border-subtle px-3 py-6 md:block"
      >
        <div className="sticky top-20 space-y-5">
          <h2 className="px-3 text-lg font-semibold">Nastavení</h2>
          {GROUP_ORDER.map((group) => {
            const items = SETTINGS_SECTIONS.filter(
              (s) => s.group === group && visibleKeys.includes(s.key),
            );
            const withImport = group === "sales" && isAdmin;
            if (items.length === 0 && !withImport) return null;
            return (
              <div key={group}>
                <p className="px-3 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  {GROUP_LABELS[group]}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {items.map((s) => (
                    <li key={s.key}>
                      <NavLink
                        to={`/app/settings/${s.key}`}
                        className={({ isActive }) =>
                          cn(navItemBase, isActive ? navItemActive : navItemIdle)
                        }
                      >
                        <s.icon size={16} strokeWidth={1.75} aria-hidden />
                        {s.label}
                      </NavLink>
                    </li>
                  ))}
                  {withImport ? (
                    <li>
                      <NavLink
                        to={IMPORT_NAV_ITEM.to}
                        className={({ isActive }) =>
                          cn(navItemBase, isActive ? navItemActive : navItemIdle)
                        }
                      >
                        <IMPORT_NAV_ITEM.icon size={16} strokeWidth={1.75} aria-hidden />
                        {IMPORT_NAV_ITEM.label}
                      </NavLink>
                    </li>
                  ) : null}
                </ul>
              </div>
            );
          })}
        </div>
      </nav>

      <div className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-3xl md:mx-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `SettingsHome.tsx`**

```tsx
// frontend/src/app/settings/SettingsHome.tsx
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Link, Navigate } from "react-router-dom";

import {
  defaultSectionKey,
  GROUP_LABELS,
  GROUP_ORDER,
  IMPORT_NAV_ITEM,
  SETTINGS_SECTIONS,
  visibleSectionKeys,
} from "@/app/settings/settingsNav";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { usePageTitle } from "@/lib/usePageTitle";

function HomeRow({
  to,
  icon: Icon,
  label,
  description,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  description: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-surface-overlay"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent"
        >
          <Icon size={16} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-text-primary">{label}</span>
          <span className="block truncate text-xs text-text-tertiary">{description}</span>
        </span>
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="text-text-tertiary" />
      </Link>
    </li>
  );
}

export function SettingsHome() {
  const { data: user } = useCurrentUser();
  usePageTitle("Nastavení");

  if (!user) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání…
      </div>
    );
  }

  // Desktop has the sub-nav for orientation — land straight on the default
  // section. The home list is the mobile drill-in entry point.
  if (window.matchMedia("(min-width: 768px)").matches) {
    return <Navigate to={`/app/settings/${defaultSectionKey(user.role, user.can_invite)}`} replace />;
  }

  const visibleKeys = visibleSectionKeys(user.role, user.can_invite);
  const isAdmin = user.role === "admin";

  return (
    <div>
      <h1 className="text-2xl font-semibold">Nastavení</h1>
      <div className="mt-5 space-y-6">
        {GROUP_ORDER.map((group) => {
          const items = SETTINGS_SECTIONS.filter(
            (s) => s.group === group && visibleKeys.includes(s.key),
          );
          const withImport = group === "sales" && isAdmin;
          if (items.length === 0 && !withImport) return null;
          return (
            <section key={group}>
              <h2 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                {GROUP_LABELS[group]}
              </h2>
              <ul className="mt-2 divide-y divide-border-subtle overflow-hidden rounded-lg border border-border bg-surface">
                {items.map((s) => (
                  <HomeRow
                    key={s.key}
                    to={`/app/settings/${s.key}`}
                    icon={s.icon}
                    label={s.label}
                    description={s.description}
                  />
                ))}
                {withImport ? (
                  <HomeRow
                    to={IMPORT_NAV_ITEM.to}
                    icon={IMPORT_NAV_ITEM.icon}
                    label={IMPORT_NAV_ITEM.label}
                    description={IMPORT_NAV_ITEM.description}
                  />
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `SettingsSectionPage.tsx`**

```tsx
// frontend/src/app/settings/SettingsSectionPage.tsx
import { ArrowLeft } from "lucide-react";
import { type ComponentType } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { BlockedCompaniesSection } from "@/app/settings/BlockedCompaniesSection";
import { InvitationsSection } from "@/app/settings/InvitationsSection";
import { PrivacySection } from "@/app/settings/PrivacySection";
import { AppearanceSection } from "@/app/settings/sections/AppearanceSection";
import { BillingSection } from "@/app/settings/sections/BillingSection";
import { IntegrationsSection } from "@/app/settings/sections/IntegrationsSection";
import { OrganizationSection } from "@/app/settings/sections/OrganizationSection";
import { PermissionsSection } from "@/app/settings/sections/PermissionsSection";
import { PipelineSection } from "@/app/settings/sections/PipelineSection";
import {
  defaultSectionKey,
  isSettingsSectionKey,
  SETTINGS_SECTIONS,
  visibleSectionKeys,
  type SettingsSectionKey,
} from "@/app/settings/settingsNav";
import { TeamsSection } from "@/app/settings/TeamsSection";
import { UsersSection } from "@/app/settings/UsersSection";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { usePageTitle } from "@/lib/usePageTitle";

const SECTION_COMPONENTS: Record<SettingsSectionKey, ComponentType> = {
  pipeline: PipelineSection,
  teams: TeamsSection,
  users: UsersSection,
  invitations: InvitationsSection,
  appearance: AppearanceSection,
  permissions: PermissionsSection,
  "blocked-companies": BlockedCompaniesSection,
  organization: OrganizationSection,
  billing: BillingSection,
  integrations: IntegrationsSection,
  privacy: PrivacySection,
};

export function SettingsSectionPage() {
  const { section } = useParams();
  const { data: user } = useCurrentUser();
  const meta = isSettingsSectionKey(section)
    ? SETTINGS_SECTIONS.find((s) => s.key === section)
    : undefined;
  usePageTitle(meta ? `Nastavení — ${meta.label}` : "Nastavení");

  if (!user) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání…
      </div>
    );
  }

  const visibleKeys = visibleSectionKeys(user.role, user.can_invite);
  if (!meta || !visibleKeys.includes(meta.key)) {
    return <Navigate to={`/app/settings/${defaultSectionKey(user.role, user.can_invite)}`} replace />;
  }

  const Section = SECTION_COMPONENTS[meta.key];

  return (
    <div>
      <Link
        to="/app/settings"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary md:hidden"
      >
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
        Nastavení
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{meta.label}</h1>
        <p className="mt-1 text-sm text-text-tertiary">{meta.description}</p>
      </header>
      <Section />
    </div>
  );
}
```

- [ ] **Step 6: Rewire `App.tsx` and delete the monolith**

Replace lines 97–99 of `frontend/src/App.tsx`:

```tsx
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<SettingsHome />} />
          <Route path=":section" element={<SettingsSectionPage />} />
        </Route>
        <Route path="settings/import" element={<ImportPage />} />
        <Route path="nastaveni/predplatne" element={<Navigate to="/app/settings/billing" replace />} />
```

Update imports: drop `SettingsPage`, add `SettingsLayout`, `SettingsHome`, `SettingsSectionPage`, and `Navigate` (from `react-router-dom`, already partially imported — extend the existing import). `settings/import` stays a static sibling — React Router ranks it above `:section`. Delete `frontend/src/app/settings/SettingsPage.tsx` (`git rm`).

- [ ] **Step 7: Update `ownershipWindow.test.tsx`**

Replace all four occurrences (lines 111, 119, 134, 145) of:

```tsx
fireEvent.click(await screen.findByRole("tab", { name: /^Oprávnění$/ }));
```

with:

```tsx
fireEvent.click(await screen.findByRole("link", { name: /Oprávnění/ }));
```

(jsdom's stubbed `matchMedia` returns `matches: false`, so the index route renders the home list and its rows are links; the accessible name includes the description, hence the loosened regex.)

- [ ] **Step 8: Run the full suite**

Run: `cd frontend && npx vitest run src/__tests__/settingsNavigation.test.tsx` → PASS (6 tests).
Run: `cd frontend && npx tsc --noEmit && pnpm test` → all pass (139 total expected).
If `billingSettings.test.tsx` fails on the heading (it may assert old copy "Nastavení — Fakturace"), update its assertions to the new `h1` "Fakturace" — check with `grep -n "Nastavení" src/__tests__/billingSettings.test.tsx`.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/App.tsx frontend/src/app/settings frontend/src/__tests__
git rm frontend/src/app/settings/SettingsPage.tsx 2>/dev/null || true
git commit -m "feat(settings): route-per-section sub-nav (desktop) + drill-in home (mobile)"
```

---

### Task 5: Playwright visual verification + polish

**Files:**
- Possibly modify: `SettingsLayout.tsx`, `SettingsHome.tsx`, `SettingsSectionPage.tsx` (styling only)

**Interfaces:** none new — this is verification/iteration.

- [ ] **Step 1: Ensure stack is running** — postgres via `docker compose -f docker-compose.dev.yml up -d postgres`; backend `cd backend && uv run uvicorn app.main:app --reload --port 8000`; frontend `cd frontend && pnpm dev`. Login: `eva@demo.cz` / `ClaudeDemo123!` (comp-org admin; password was reset for this session).

- [ ] **Step 2: Desktop pass (use playwright mcp)** — viewport 1440×900, visit `/app/settings` → expect redirect to `/app/settings/pipeline` with sub-nav column; screenshot. Click through Fakturace, Uživatelé, Integrace — active state follows, content headers correct. Verify browser back returns to previous section. Check console for errors.

- [ ] **Step 3: Mobile pass** — viewport 390×844, visit `/app/settings` → home list with 4 groups + icons; screenshot. Tap Pipeline → section page with "← Nastavení" back link; screenshot. Tap back → home again. Check console.

- [ ] **Step 4: Legacy link pass** — visit `/app/settings?tab=integrations` → lands on `/app/settings/integrations`. Visit `/app/nastaveni/predplatne` → lands on `/app/settings/billing`.

- [ ] **Step 5: Iterate on visual issues** (spacing, sticky offset `top-20` vs the h-16 header, nav column width, truncation) until screenshots look calm and aligned. Re-screenshot after each fix.

- [ ] **Step 6: Close the Playwright browser** (`browser_close` — required by owner's global rules).

- [ ] **Step 7: Commit any polish tweaks**

```bash
git add frontend/src/app/settings
git commit -m "polish(settings): visual tweaks from Playwright verification"
```

(Skip the commit if no changes were needed.)

---

### Task 6: Comment minimization + CI mirror + wrap-up

**Files:**
- Possibly modify: files changed in Tasks 1–5 (comment removal only)

- [ ] **Step 1: Comment-minimization pass (owner's global rule)** — `git diff 1c0e57b..HEAD -- frontend` and list added comment lines. Keep at most 2–3 single-line comments capturing non-obvious WHY (the gcal-race guard in `SettingsLayout` and the desktop-redirect rationale in `SettingsHome` qualify); remove any comment that restates code and ALL multiline comments added by this work. Pre-existing comments that moved with extracted code stay untouched.

- [ ] **Step 2: CI mirror (owner's global rule — mirrors `.github/workflows/ci.yml`)**

Run from `frontend/`: `npx eslint src --max-warnings 0 && npx prettier --check src && npx tsc --noEmit && pnpm test && pnpm build`
Also run whatever `ci.yml` additionally lists (check `types:check` script in `package.json`).
Expected: everything green.

- [ ] **Step 3: Final commit**

```bash
git add -A frontend
git commit -m "chore(settings): comment cleanup + CI-mirror pass for sub-nav redesign"
```

(Skip if Step 1–2 produced no changes.)

- [ ] **Step 4: Code review** — dispatch the code reviewer (superpowers:requesting-code-review flow) over `git diff 0f60ac5..HEAD`, i.e. everything since the trial-banner fix.
