import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Calendar, Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  type StageOut,
  useCreateStage,
  useDeleteStage,
  usePipeline,
  useReorderStages,
  useUpdateStage,
} from "@/app/settings/usePipelineSettings";
import { InvoiceDetailsCard } from "@/app/settings/InvoiceDetailsCard";
import { BillingSection } from "@/app/settings/sections/BillingSection";
import { SmtpSettingsCard } from "@/app/settings/SmtpSettingsCard";
import { InvitationsSection } from "@/app/settings/InvitationsSection";
import { BlockedCompaniesSection } from "@/app/settings/BlockedCompaniesSection";
import { PrivacySection } from "@/app/settings/PrivacySection";
import { TeamsSection } from "@/app/settings/TeamsSection";
import { UsersSection } from "@/app/settings/UsersSection";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import {
  useGoogleCalendarConnect,
  useGoogleCalendarDisconnect,
  useGoogleCalendarStatus,
} from "@/app/settings/useGoogleCalendar";
import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { formatCzkMinor } from "@/components/billing/format";
import { useCurrentSubscription } from "@/components/billing/useCurrentSubscription";
import { isSeatUpgradePaymentRequired, useSeatChangeInit } from "@/components/billing/usePayments";
import { ApiError, apiFetch } from "@/lib/api";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { useToast } from "@/lib/toast";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";
import type { components } from "@/types/api.generated";

type OrganizationOut = components["schemas"]["OrganizationOut"];

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

type StageType = "open" | "won" | "lost";

const STAGE_TYPE_LABEL: Record<StageType, string> = {
  open: "Otevřená",
  won: "Výhra",
  lost: "Prohra",
};

interface StageFormState {
  name: string;
  default_probability: number;
  color: string;
  stage_type: StageType;
}

const EMPTY_FORM: StageFormState = {
  name: "",
  default_probability: 0,
  color: "#3D5AFE",
  stage_type: "open",
};

function StageForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
}: {
  initial: StageFormState;
  submitLabel: string;
  onSubmit: (values: StageFormState) => Promise<void>;
  onCancel?: () => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<StageFormState>(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(String((err.body as { detail?: unknown })?.detail ?? err.message));
      } else {
        setError(err instanceof Error ? err.message : "Neznámá chyba.");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-12">
      <label className="text-xs font-medium text-text-tertiary sm:col-span-5">
        Název
        <input
          type="text"
          required
          maxLength={80}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
        />
      </label>
      <label className="text-xs font-medium text-text-tertiary sm:col-span-2">
        Pravděp. (%)
        <input
          type="number"
          min={0}
          max={100}
          value={form.default_probability}
          onChange={(e) => setForm((f) => ({ ...f, default_probability: Number(e.target.value) }))}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm tabular-nums text-text-primary"
        />
      </label>
      <label className="text-xs font-medium text-text-tertiary sm:col-span-2">
        Barva
        <input
          type="color"
          value={form.color}
          onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
          className="mt-1 block h-[34px] w-full rounded-md border border-border bg-surface"
        />
      </label>
      <label className="text-xs font-medium text-text-tertiary sm:col-span-3">
        Typ
        <select
          value={form.stage_type}
          onChange={(e) => setForm((f) => ({ ...f, stage_type: e.target.value as StageType }))}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
        >
          <option value="open">Otevřená</option>
          <option value="won">Výhra</option>
          <option value="lost">Prohra</option>
        </select>
      </label>
      {error ? (
        <p className="text-sm text-danger sm:col-span-12" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2 sm:col-span-12">
        <button
          type="submit"
          disabled={busy}
          className="text-accent-foreground rounded-md bg-accent px-3 py-1.5 text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
        >
          {submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            Zrušit
          </button>
        ) : null}
      </div>
    </form>
  );
}

function StageRow({
  stage,
  canMoveUp,
  canMoveDown,
  onMove,
  onEdit,
  onDelete,
}: {
  stage: StageOut;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-border-subtle py-3 last:border-0">
      <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
      <div className="flex-1">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-medium text-text-primary">{stage.name}</span>
          <span className="text-xs text-text-tertiary">
            {STAGE_TYPE_LABEL[stage.stage_type as StageType]} · {stage.default_probability}%
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Posunout nahoru"
          disabled={!canMoveUp}
          onClick={() => onMove(-1)}
          className="rounded p-1.5 text-text-secondary hover:bg-surface-elevated hover:text-text-primary disabled:opacity-30"
        >
          <ArrowUp size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Posunout dolů"
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
          className="rounded p-1.5 text-text-secondary hover:bg-surface-elevated hover:text-text-primary disabled:opacity-30"
        >
          <ArrowDown size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Upravit"
          onClick={onEdit}
          className="rounded p-1.5 text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
        >
          <Pencil size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Smazat"
          onClick={onDelete}
          className="rounded p-1.5 text-text-secondary hover:bg-danger-subtle hover:text-danger"
        >
          <Trash2 size={16} strokeWidth={1.75} />
        </button>
      </div>
    </li>
  );
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
  const { data: pipeline, isPending, isError } = usePipeline();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const reorder = useReorderStages();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [addingOpen, setAddingOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
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

  const stagesReady = !isPending && !isError && pipeline;
  const stages = stagesReady ? [...pipeline.stages].sort((a, b) => a.position - b.position) : [];

  async function handleMove(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= stages.length) return;
    const newOrder = stages.map((s) => s.id);
    // Both indices are within range (caller checks); the non-null assertions
    // satisfy noUncheckedIndexedAccess on the tuple-swap shorthand.
    [newOrder[idx], newOrder[target]] = [newOrder[target]!, newOrder[idx]!];
    setGlobalError(null);
    try {
      await reorder.mutateAsync(newOrder);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Přesun se nezdařil.");
    }
  }

  async function handleDelete(stage: StageOut) {
    if (!window.confirm(`Smazat fázi "${stage.name}"?`)) return;
    setGlobalError(null);
    try {
      await deleteStage.mutateAsync(stage.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setGlobalError(String((err.body as { detail?: unknown })?.detail ?? err.message));
      } else {
        setGlobalError(err instanceof Error ? err.message : "Smazání se nezdařilo.");
      }
    }
  }

  const editing = editingId ? (stages.find((s) => s.id === editingId) ?? null) : null;

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

      {globalError ? (
        <div
          className="mb-4 rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {globalError}
        </div>
      ) : null}

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
      {activeTab !== "pipeline" ? null : isPending ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-tertiary">
          Načítání pipeline…
        </div>
      ) : isError || !pipeline ? (
        <div className="rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger">
          Pipeline se nepodařilo načíst.
        </div>
      ) : (
        <section className="rounded-lg border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Fáze</h2>
            {!addingOpen ? (
              <button
                type="button"
                onClick={() => setAddingOpen(true)}
                className="text-accent-foreground inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium hover:bg-accent-hover"
              >
                <Plus size={16} strokeWidth={1.75} /> Přidat fázi
              </button>
            ) : null}
          </div>

          {addingOpen ? (
            <div className="mt-4 rounded-md border border-border-subtle p-4">
              <StageForm
                initial={EMPTY_FORM}
                submitLabel="Vytvořit"
                busy={createStage.isPending}
                onCancel={() => setAddingOpen(false)}
                onSubmit={async (values) => {
                  await createStage.mutateAsync(values);
                  setAddingOpen(false);
                }}
              />
            </div>
          ) : null}

          <ol className="mt-4">
            {stages.map((stage, idx) => {
              const isEditing = editing && editing.id === stage.id;
              if (isEditing && editing) {
                return (
                  <li key={stage.id} className="border-b border-border-subtle py-3 last:border-0">
                    <StageForm
                      initial={{
                        name: editing.name,
                        default_probability: editing.default_probability,
                        color: editing.color,
                        stage_type: editing.stage_type as StageType,
                      }}
                      submitLabel="Uložit"
                      busy={updateStage.isPending}
                      onCancel={() => setEditingId(null)}
                      onSubmit={async (values) => {
                        await updateStage.mutateAsync({ id: editing.id, patch: values });
                        setEditingId(null);
                      }}
                    />
                  </li>
                );
              }
              return (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < stages.length - 1}
                  onMove={(dir) => void handleMove(idx, dir)}
                  onEdit={() => setEditingId(stage.id)}
                  onDelete={() => void handleDelete(stage)}
                />
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

function AppearanceSection() {
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Vzhled</h2>
      <p className="mt-1 text-sm text-text-tertiary">
        Vyberte světlý nebo tmavý motiv. Volba se ukládá lokálně v prohlížeči.
      </p>
      <div className="mt-4">
        <ThemeToggle />
      </div>
    </section>
  );
}

function LeaderboardVisibilityToggle() {
  const { data: user } = useCurrentUser();
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const initial = !!user?.organization?.show_leaderboard_to_salespeople;
  const [checked, setChecked] = useState(initial);

  // Keep local state in sync if /auth/me re-resolves with a different value
  // (e.g. another admin flips it in another tab).
  useEffect(() => {
    setChecked(initial);
  }, [initial]);

  const mutation = useMutation<OrganizationOut, Error, boolean>({
    mutationFn: (next) =>
      apiFetch<OrganizationOut>("/api/v1/organizations/current", {
        method: "PUT",
        token: accessToken,
        body: { show_leaderboard_to_salespeople: next },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  function onToggle(next: boolean) {
    setChecked(next);
    mutation.mutate(next, {
      onError: () => setChecked(!next),
    });
  }

  return (
    <label className="flex items-start gap-3 rounded-md border border-border-subtle bg-surface-overlay p-4">
      <input
        type="checkbox"
        checked={checked}
        disabled={mutation.isPending}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
      />
      <span>
        <span className="block text-sm font-medium text-text-primary">
          Zobrazit obchodníkům žebříček
        </span>
        <span className="mt-0.5 block text-xs text-text-tertiary">
          Když je vypnuto, obchodníci v Reportech vidí pouze své vlastní výsledky. Manažeři a
          administrátoři žebříček vidí vždy.
        </span>
        {mutation.isError ? (
          <span className="mt-1 block text-xs text-danger" role="alert">
            Uložení se nezdařilo.
          </span>
        ) : null}
      </span>
    </label>
  );
}

function OwnershipWindowSetting() {
  const { data: user } = useCurrentUser();
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const initial = user?.organization?.ownership_window_days ?? 365;
  const [days, setDays] = useState<string>(String(initial));
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the input in sync if /auth/me re-resolves with a different value
  // (e.g. another admin updated it in another tab).
  useEffect(() => {
    setDays(String(initial));
  }, [initial]);

  const mutation = useMutation<OrganizationOut, Error, number>({
    mutationFn: (next) =>
      apiFetch<OrganizationOut>("/api/v1/organizations/current", {
        method: "PUT",
        token: accessToken,
        body: { ownership_window_days: next },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["auth", "me"] });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2500);
    },
    onError: () => setError("Uložení se nezdařilo. Zkuste to prosím znovu."),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(days);
    if (!Number.isFinite(n) || n < 1 || n > 3650) {
      setError("Hodnota musí být mezi 1 a 3650 dny.");
      return;
    }
    if (n === initial) return; // no-op
    mutation.mutate(n);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-md border border-border-subtle bg-surface-overlay p-4"
    >
      <div>
        <label
          htmlFor="ownership-window-days"
          className="block text-sm font-medium text-text-primary"
        >
          Doba držení firem (dny)
        </label>
        <p className="mt-1 text-xs text-text-tertiary">
          Po této době bez vyhraného obchodu se firma automaticky uvolní z poolu obchodníka zpět
          manažerům k přerozdělení. Výchozí hodnota je 365 dní (1 rok). Povolený rozsah 1–3650 dní.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id="ownership-window-days"
          type="number"
          min={1}
          max={3650}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          disabled={mutation.isPending}
          className="block h-10 w-32 rounded-md border border-border bg-bg px-3 text-sm tabular-nums text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={mutation.isPending || Number(days) === initial}
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending ? "Ukládáme…" : "Uložit"}
        </button>
        {savedFlash ? (
          <span className="text-sm text-success" role="status">
            Uloženo.
          </span>
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}

function PermissionsSection() {
  const rows: { action: string; rep: string; manager: string; admin: string }[] = [
    {
      action: "Vidět všechny obchody v rámci pipeline",
      rep: "Jen vlastní",
      manager: "Tým",
      admin: "Vše",
    },
    { action: "Editovat firmy", rep: "Jen vlastní", manager: "Tým", admin: "Vše" },
    { action: "Mazat firmy a uvolňovat z poolu", rep: "—", manager: "—", admin: "Ano" },
    { action: "Spravovat uživatele a týmy", rep: "—", manager: "—", admin: "Ano" },
    { action: "Editovat fáze pipeline", rep: "—", manager: "—", admin: "Ano" },
    { action: "Exportovat reporty", rep: "—", manager: "Ano", admin: "Ano" },
  ];
  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">Viditelnost</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Co vidí jednotlivé role v Reportech a na Přehledu.
        </p>
        <div className="mt-4">
          <LeaderboardVisibilityToggle />
        </div>
      </div>
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">Pravidla pro firmy</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Doba, po které neaktivní firmy připadají manažerům zpět k přerozdělení.
        </p>
        <div className="mt-4">
          <OwnershipWindowSetting />
        </div>
      </div>
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">Oprávnění</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Oprávnění jsou v této verzi pevně daná. Pokud potřebujete vlastní role, dejte nám vědět.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-text-tertiary">
                <th className="py-2 pr-4 font-medium">Akce</th>
                <th className="py-2 pr-4 font-medium">Obchodník</th>
                <th className="py-2 pr-4 font-medium">Manažer</th>
                <th className="py-2 font-medium">Administrátor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((r) => (
                <tr key={r.action}>
                  <td className="py-2 pr-4 text-text-primary">{r.action}</td>
                  <td className="py-2 pr-4 text-text-secondary">{r.rep}</td>
                  <td className="py-2 pr-4 text-text-secondary">{r.manager}</td>
                  <td className="py-2 text-text-secondary">{r.admin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

interface SubscriptionLite {
  seat_count: number;
  status: string;
  current_period_ends_at: string | null;
  plan: { code: string; display_name_cs: string };
  pending_plan: { code: string; display_name_cs: string } | null;
  pending_seat_count: number | null;
  pending_user_deactivations: string[] | null;
  effective_price_per_user_minor: number | null;
}

function OrganizationSection() {
  const subQuery = useCurrentSubscription();
  const sub = subQuery.data as SubscriptionLite | null | undefined;
  const usersPage = useOrgUsers();
  const activeUsers = (usersPage.data?.items ?? []).filter((u) => u.is_active);

  if (subQuery.isPending) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-sm text-text-tertiary">
        Načítání…
      </section>
    );
  }
  if (!sub) {
    return (
      <section
        className="rounded-lg border border-border bg-surface p-6 text-sm text-danger"
        role="alert"
      >
        Načítání předplatného se nezdařilo.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <InvoiceDetailsCard />
      <SeatCountCard sub={sub} activeUserCount={activeUsers.length} activeUsers={activeUsers} />
      <BillingIntervalCard sub={sub} />
    </div>
  );
}

interface SeatCountCardProps {
  sub: SubscriptionLite;
  activeUserCount: number;
  activeUsers: components["schemas"]["UserOut"][];
}

function SeatCountCard({ sub, activeUserCount, activeUsers }: SeatCountCardProps) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const seatChangeInit = useSeatChangeInit();
  const [draft, setDraft] = useState<string>(String(sub.seat_count));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    setDraft(String(sub.seat_count));
    setPicked(new Set());
    setError(null);
  }, [sub.seat_count]);

  const target = Number(draft);
  const targetValid = Number.isFinite(target) && target >= 1 && target <= 500;
  const needsToDeactivate = targetValid && target < activeUserCount;
  const requiredCount = needsToDeactivate ? activeUserCount - target : 0;
  const pickedArray = useMemo(() => Array.from(picked), [picked]);

  const mutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      return apiFetch("/api/v1/organizations/current/subscription/seat-count", {
        method: "PUT",
        token: accessToken,
        body: {
          seat_count: target,
          deactivate_user_ids: needsToDeactivate ? pickedArray : [],
        },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["subscription", "current"] });
      void qc.invalidateQueries({ queryKey: ["billing-summary", "current"] });
      void qc.invalidateQueries({ queryKey: ["users", "org"] });
      setSavedFlash(true);
      setPicked(new Set());
      window.setTimeout(() => setSavedFlash(false), 2500);
    },
    onError: (err) => {
      // Active org bumping above contracted_seat_count → backend 402s
      // with a redirect_endpoint pointing at /payments/seat-change-init.
      // Kick off the prorated ComGate charge; the call returns
      // `accepted` while the webhook lands the actual outcome — we
      // route to the billing-return page in `pending` state so the
      // user sees a "processing…" panel until /subscription updates.
      if (isSeatUpgradePaymentRequired(err)) {
        setRedirecting(true);
        seatChangeInit.mutate(
          { seat_count: target },
          {
            onSuccess: () => {
              window.location.assign("/app/billing/return?status=pending");
            },
            onError: () => {
              setRedirecting(false);
              setError("Platební brána není dostupná, zkuste to prosím za chvíli.");
            },
          },
        );
        return;
      }
      if (err instanceof ApiError) {
        const detail = (err.body as { detail?: { detail?: string } })?.detail;
        const msg = typeof detail === "string" ? detail : detail?.detail;
        setError(msg ?? "Uložení se nezdařilo.");
      } else {
        setError("Něco se pokazilo. Zkontrolujte připojení.");
      }
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!targetValid) {
      setError("Hodnota musí být v rozsahu 1–500.");
      return;
    }
    if (target === sub.seat_count) return;
    if (needsToDeactivate && picked.size !== requiredCount) {
      setError(
        `Snížením na ${target} ztratí přístup ${requiredCount} uživatelů — vyberte přesně ${requiredCount}.`,
      );
      return;
    }
    mutation.mutate();
  }

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Anyone who's still active and isn't the founding admin themself.
  const eligibleVictims = activeUsers.filter((u) => u.id !== me?.id);

  // Resolve the queued user names so the banner can spell them out instead
  // of just dropping IDs on the screen.
  const queuedIds = new Set(sub.pending_user_deactivations ?? []);
  const queuedUsers = activeUsers.filter((u) => queuedIds.has(u.id));
  const periodEndsAt = sub.current_period_ends_at
    ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long" }).format(
        new Date(sub.current_period_ends_at),
      )
    : null;

  function cancelQueue() {
    setError(null);
    // PUT seat-count with target == current is the documented cancel signal.
    apiFetch("/api/v1/organizations/current/subscription/seat-count", {
      method: "PUT",
      token: accessToken,
      body: { seat_count: sub.seat_count, deactivate_user_ids: [] },
    })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ["subscription", "current"] });
        void qc.invalidateQueries({ queryKey: ["billing-summary", "current"] });
        void qc.invalidateQueries({ queryKey: ["users", "org"] });
      })
      .catch(() => setError("Zrušení naplánované změny se nezdařilo."));
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-border bg-surface p-6">
      <header>
        <h2 className="text-lg font-semibold">Smluvní počet uživatelů</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Aktuálně máte {activeUserCount} aktivních uživatelů z {sub.seat_count} smluvních. Limit
          ovlivňuje, kolik pozvánek lze odeslat, a odpovídá fakturované ceně.
        </p>
      </header>

      {sub.pending_seat_count != null && queuedUsers.length > 0 ? (
        <div
          data-testid="seat-count-pending-banner"
          className="mt-4 rounded-md border border-info/40 bg-info-subtle p-4"
        >
          <p className="text-sm font-medium text-text-primary">
            Naplánovaná změna: počet klesne na {sub.pending_seat_count}
            {periodEndsAt ? ` ke dni ${periodEndsAt}` : ""}.
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Přístup ztratí: {queuedUsers.map((u) => u.name).join(", ")}. Do té doby si plně užijí
            placené sloty.
          </p>
          <button
            type="button"
            onClick={cancelQueue}
            className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
          >
            Zrušit naplánovanou změnu
          </button>
        </div>
      ) : null}

      <label className="mt-4 block text-sm font-medium text-text-primary">
        Cílový počet uživatelů
        <input
          type="number"
          min={1}
          max={500}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="mt-1 block h-10 w-32 rounded-md border border-border bg-bg px-3 text-sm tabular-nums text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </label>

      <LiveSeatCostPreview
        targetValid={targetValid}
        target={target}
        currentSeatCount={sub.seat_count}
        perUserMinor={sub.effective_price_per_user_minor}
        planCode={sub.plan.code}
      />

      {needsToDeactivate ? (
        <div className="mt-4 rounded-md border border-warning/40 bg-warning-subtle p-4">
          <p className="text-sm font-medium text-text-primary">
            {periodEndsAt
              ? `Po skončení současného období (${periodEndsAt}) ztratí přístup ${requiredCount} `
              : `Po skončení současného období ztratí přístup ${requiredCount} `}
            {requiredCount === 1 ? "uživatel" : "uživatelů"}.
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Vyberte koho. Sami sebe odstranit nemůžete. Do konce období mají vybraní lidé plný
            přístup; deaktivace proběhne při dalším zúčtování. Účet zůstane v databázi (pro historii
            dat), ale přihlášení skončí.
          </p>
          <ul className="mt-3 space-y-1.5">
            {eligibleVictims.map((u) => {
              const checked = picked.has(u.id);
              return (
                <li key={u.id}>
                  <label className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-surface-overlay">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePick(u.id)}
                      className="h-4 w-4"
                    />
                    <span className="font-medium text-text-primary">{u.name}</span>
                    <span className="text-xs text-text-tertiary">· {u.email}</span>
                  </label>
                </li>
              );
            })}
            {eligibleVictims.length === 0 ? (
              <li className="text-xs text-text-tertiary">
                Nelze snížit pod 1 — jste jediný aktivní uživatel.
              </li>
            ) : null}
          </ul>
          <p className="mt-2 text-xs text-text-tertiary">
            Vybráno {picked.size} z {requiredCount}.
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={
            mutation.isPending ||
            redirecting ||
            !targetValid ||
            target === sub.seat_count ||
            (needsToDeactivate && picked.size !== requiredCount)
          }
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {redirecting
            ? "Přesměrování na platební bránu…"
            : mutation.isPending
              ? "Ukládáme…"
              : "Uložit počet"}
        </button>
        {savedFlash ? (
          <span className="text-sm text-success" role="status">
            Uloženo.
          </span>
        ) : null}
      </div>
    </form>
  );
}

function LiveSeatCostPreview({
  targetValid,
  target,
  currentSeatCount,
  perUserMinor,
  planCode,
}: {
  targetValid: boolean;
  target: number;
  currentSeatCount: number;
  perUserMinor: number | null;
  planCode: string;
}) {
  // Live preview while the admin is typing a new target. Recomputes from
  // `target × per-user × interval-multiplier` so they see what the next
  // bill will look like before committing. Skipped when the per-user
  // price isn't surfaced (trial / enterprise / comp orgs sit outside
  // the published ladder).
  if (!targetValid) return null;
  if (perUserMinor == null) return null;
  if (planCode !== "monthly" && planCode !== "annual") return null;
  const isAnnual = planCode === "annual";
  const periodLabel = isAnnual ? "rok" : "měsíc";
  const multiplier = isAnnual ? 12 : 1;
  const newTotal = perUserMinor * multiplier * target;
  const oldTotal = perUserMinor * multiplier * currentSeatCount;
  const delta = newTotal - oldTotal;
  const unchanged = target === currentSeatCount;
  return (
    <div
      className="mt-3 rounded-md border border-border-subtle bg-surface-overlay px-3 py-2.5 text-sm"
      data-testid="seat-cost-preview"
    >
      <p className="text-text-secondary">
        Nový náklad:{" "}
        <span className="font-semibold tabular-nums text-text-primary">
          {formatCzkMinor(newTotal)}
        </span>{" "}
        / {periodLabel}
        {!unchanged ? (
          <>
            {" ("}
            <span className={delta > 0 ? "text-warning" : "text-success"}>
              {delta > 0 ? "+" : "−"}
              {formatCzkMinor(Math.abs(delta))} / {periodLabel}
            </span>
            {")"}
          </>
        ) : null}
      </p>
    </div>
  );
}

function BillingIntervalCard({ sub }: { sub: SubscriptionLite }) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();

  const currentInterval: "monthly" | "annual" | "other" =
    sub.plan.code === "monthly" ? "monthly" : sub.plan.code === "annual" ? "annual" : "other";
  const pendingInterval: "monthly" | "annual" | null =
    sub.pending_plan?.code === "monthly"
      ? "monthly"
      : sub.pending_plan?.code === "annual"
        ? "annual"
        : null;
  const effective = pendingInterval ?? currentInterval;

  const [target, setTarget] = useState<"monthly" | "annual">(
    effective === "annual" ? "annual" : "monthly",
  );
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setTarget(effective === "annual" ? "annual" : "monthly");
  }, [effective]);

  const mutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      return apiFetch("/api/v1/organizations/current/subscription/change-interval", {
        method: "POST",
        token: accessToken,
        body: { plan_code: target },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["subscription", "current"] });
      void qc.invalidateQueries({ queryKey: ["billing-summary", "current"] });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2500);
    },
    onError: () => setError("Uložení se nezdařilo. Zkuste to znovu."),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (target === effective) return;
    mutation.mutate();
  }

  // For trial-stage orgs, the "current" interval is the trial; the
  // pending plan is what they intend to land on. Show that wording
  // explicitly so the admin understands what changes when.
  const isTrial = sub.plan.code === "trial";
  const switchTakesEffect = isTrial ? "po skončení zkušební doby" : "při dalším zúčtovacím období";

  // Published price ladder: 99 Kč / month vs 999 Kč / year. Mirrors
  // `compute_savings` on the backend. We render both the percent and
  // the absolute koruna amount the org would save this year on its
  // current seat count.
  const MONTHLY_PER_USER_MINOR = 9900;
  const ANNUAL_PER_USER_MINOR = 99900;
  const annualSavingsMinor =
    Math.max(0, MONTHLY_PER_USER_MINOR * 12 - ANNUAL_PER_USER_MINOR) * sub.seat_count;
  const annualSubtitle =
    annualSavingsMinor > 0
      ? `Účtováno jednou ročně, ušetříte 16 % — ${formatCzkMinor(annualSavingsMinor)} / rok`
      : "Účtováno jednou ročně, ušetříte 16 %";

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-border bg-surface p-6">
      <header>
        <h2 className="text-lg font-semibold">Způsob fakturace</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Změna se projeví {switchTakesEffect}. Nezasahuje do aktuálního období.
        </p>
      </header>

      <div
        role="radiogroup"
        aria-label="Způsob fakturace"
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <IntervalRadio
          code="monthly"
          title="Měsíční"
          subtitle="Účtováno každý měsíc"
          selected={target === "monthly"}
          onSelect={() => setTarget("monthly")}
        />
        <IntervalRadio
          code="annual"
          title="Roční"
          subtitle={annualSubtitle}
          selected={target === "annual"}
          onSelect={() => setTarget("annual")}
        />
      </div>

      {pendingInterval && pendingInterval !== currentInterval ? (
        <p className="mt-4 rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info">
          Aktuálně účtujeme{" "}
          {currentInterval === "monthly"
            ? "měsíčně"
            : currentInterval === "annual"
              ? "ročně"
              : "dle vašeho plánu"}
          . Při dalším období přejdete na {pendingInterval === "annual" ? "roční" : "měsíční"}{" "}
          fakturaci.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={mutation.isPending || target === effective}
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending ? "Ukládáme…" : "Uložit způsob fakturace"}
        </button>
        {savedFlash ? (
          <span className="text-sm text-success" role="status">
            Uloženo.
          </span>
        ) : null}
      </div>
    </form>
  );
}

function IntervalRadio({
  code,
  title,
  subtitle,
  selected,
  onSelect,
}: {
  code: string;
  title: string;
  subtitle: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      data-interval={code}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "cursor-pointer rounded-md border-2 bg-surface p-4 transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        selected ? "border-accent shadow-sm" : "border-border hover:border-text-tertiary",
      )}
    >
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      <p className="mt-0.5 text-xs text-text-tertiary">{subtitle}</p>
    </div>
  );
}

function GoogleCalendarCard() {
  const toast = useToast();
  const { data: status, isPending } = useGoogleCalendarStatus();
  const connect = useGoogleCalendarConnect();
  const disconnect = useGoogleCalendarDisconnect();

  const connected = status?.connected ?? false;
  const needsReconnect = connected && (status?.sync_broken ?? false);

  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-md bg-accent-subtle p-2 text-accent">
            <Calendar size={18} strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-medium text-text-primary">Google Kalendář</p>
            <p className="mt-0.5 text-sm text-text-secondary">
              Události u obchodů se na přání zapíší i do vašeho Google kalendáře.
            </p>
            {connected ? (
              <p className="mt-1 text-xs text-text-tertiary">
                Propojeno s účtem{" "}
                <span className="font-medium text-text-secondary">{status?.google_email}</span>
              </p>
            ) : null}
            {needsReconnect ? (
              <p className="mt-1 text-xs text-warning">
                Google přístup odvolal — propojte kalendář prosím znovu.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected && !needsReconnect ? (
            <span className="inline-flex items-center rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
              Aktivní
            </span>
          ) : null}
          {connected ? (
            <>
              {needsReconnect ? (
                <button
                  type="button"
                  onClick={() => connect.mutate()}
                  disabled={connect.isPending}
                  className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Propojit znovu
                </button>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  disconnect.mutate(undefined, {
                    onSuccess: () => toast.success("Google Kalendář byl odpojen"),
                    onError: () => toast.error("Odpojení se nezdařilo, zkuste to prosím znovu"),
                  })
                }
                disabled={disconnect.isPending}
                className="h-9 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:border-danger-subtle hover:bg-danger-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
              >
                Odpojit
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() =>
                connect.mutate(undefined, {
                  onError: () => toast.error("Propojení se nepodařilo zahájit, zkuste to znovu"),
                })
              }
              disabled={isPending || connect.isPending}
              className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {connect.isPending ? "Přesměrování…" : "Propojit"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function IntegrationsSection() {
  const integrations = [
    {
      name: "ARES",
      body: "Automatické doplňování firemních údajů z veřejného registru.",
      active: true,
    },
    {
      name: "Slack",
      body: "Notifikace o vyhraných obchodech do týmového kanálu.",
      active: false,
    },
    {
      name: "Webhooky",
      body: "Posílejte události (deal won / company freed) na vlastní URL.",
      active: false,
    },
  ];
  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-lg font-semibold">Integrace</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Propojte SimpleCRM s nástroji, které již používáte.
        </p>
      </header>
      <ul className="space-y-3">
        <SmtpSettingsCard />
        <GoogleCalendarCard />
        {integrations.map((i) => (
          <li
            key={i.name}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4"
          >
            <div>
              <p className="text-sm font-medium text-text-primary">{i.name}</p>
              <p className="mt-0.5 text-sm text-text-secondary">{i.body}</p>
            </div>
            {i.active ? (
              <span className="inline-flex items-center rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
                Aktivní
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-surface-overlay px-2 py-0.5 text-xs font-medium text-text-tertiary">
                Brzy
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
