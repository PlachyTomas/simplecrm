import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  type StageOut,
  useCreateStage,
  useDeleteStage,
  usePipeline,
  useReorderStages,
  useUpdateStage,
} from "@/app/settings/usePipelineSettings";
import { InvitationsSection } from "@/app/settings/InvitationsSection";
import { TeamsSection } from "@/app/settings/TeamsSection";
import { UsersSection } from "@/app/settings/UsersSection";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { formatCzkMinor } from "@/components/billing/format";
import { PriceDisplay } from "@/components/billing/PriceDisplay";
import { useBillingSummary } from "@/components/billing/useBillingSummary";
import { useCurrentSubscription } from "@/components/billing/useCurrentSubscription";
import { usePublicPlans } from "@/components/billing/usePublicPlans";
import {
  isSeatUpgradePaymentRequired,
  useCancelSubscription,
  useInitialPaymentInit,
  useInvoices,
  useReactivateSubscription,
  useSeatChangeInit,
  type ChargeOut,
} from "@/components/billing/usePayments";
import { ApiError, apiFetch } from "@/lib/api";
import { csNoun } from "@/lib/i18n/nouns";
import { ThemeToggle } from "@/lib/ThemeToggle";
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
  | "organization"
  | "billing"
  | "integrations";

const TABS: { key: SettingsTab; label: string; description: string }[] = [
  {
    key: "pipeline",
    label: "Pipeline",
    description: "Spravujte fáze pipeline a jejich pořadí.",
  },
  {
    key: "teams",
    label: "Týmy",
    description: "Sdružujte obchodníky pod manažery.",
  },
  {
    key: "users",
    label: "Uživatelé",
    description: "Spravujte role, týmovou příslušnost a aktivitu členů.",
  },
  {
    key: "invitations",
    label: "Pozvánky",
    description: "Pozvěte nové členy a spravujte oprávnění.",
  },
  {
    key: "appearance",
    label: "Vzhled",
    description: "Motiv, barvy a další vizuální nastavení.",
  },
  {
    key: "permissions",
    label: "Oprávnění",
    description: "Pravidla, kdo a co může v aplikaci dělat.",
  },
  {
    key: "organization",
    label: "Organizace",
    description: "Smluvní počet uživatelů a způsob fakturace.",
  },
  {
    key: "billing",
    label: "Fakturace",
    description: "Detaily plánu, faktur a způsobu platby.",
  },
  {
    key: "integrations",
    label: "Integrace",
    description: "Propojení s externími službami.",
  },
];

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

export function SettingsPage({ initialTab = "pipeline" }: SettingsPageProps = {}) {
  const { data: user } = useCurrentUser();
  const { data: pipeline, isPending, isError } = usePipeline();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const reorder = useReorderStages();

  const [addingOpen, setAddingOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // TABS is a non-empty literal — index 0 always exists, but
  // noUncheckedIndexedAccess forces a non-null assertion.
  const activeTabMeta = TABS.find((t) => t.key === activeTab) ?? TABS[0]!;
  usePageTitle(`Nastavení — ${activeTabMeta.label}`);

  // Admins see the full Settings page. Non-admins with `can_invite=true`
  // get a stripped-down view that only exposes the Invitations tab; that's
  // the one privilege they own. Everyone else gets the admin-only message.
  const canInviteOnly = !!user && user.role !== "admin" && user.can_invite;

  // Force can_invite-only users onto the invitations tab if they land
  // somewhere else (e.g. via deep-link). useEffect avoids a setState-in-render
  // warning, and lives above the early returns so hook order stays stable.
  useEffect(() => {
    if (canInviteOnly && activeTab !== "invitations") {
      setActiveTab("invitations");
    }
  }, [canInviteOnly, activeTab]);

  if (!user) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání…
      </div>
    );
  }

  if (user.role !== "admin" && !canInviteOnly) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold">Nastavení</h1>
        <p className="mt-3 text-sm text-text-secondary">
          Úpravy pipeline může provádět pouze administrátor.
        </p>
      </div>
    );
  }
  const visibleTabs = canInviteOnly ? TABS.filter((t) => t.key === "invitations") : TABS;

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
      </header>

      <nav aria-label="Karty nastavení" className="mb-6 border-b border-border-subtle">
        <ul role="tablist" className="-mb-px flex gap-1 overflow-x-auto">
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <li key={tab.key} role="presentation">
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-fast",
                    isActive
                      ? "border-accent text-accent"
                      : "border-transparent text-text-secondary hover:text-text-primary",
                  )}
                >
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
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
      {activeTab === "invitations" ? <InvitationsSection /> : null}
      {activeTab === "appearance" ? <AppearanceSection /> : null}
      {activeTab === "permissions" ? <PermissionsSection /> : null}
      {activeTab === "organization" ? <OrganizationSection /> : null}
      {activeTab === "billing" ? <BillingSection /> : null}
      {activeTab === "integrations" ? <IntegrationsSection /> : null}
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
          className="border-danger/40 rounded-md border bg-danger-subtle px-3 py-2 text-sm text-danger"
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

type SubscriptionOut = components["schemas"]["SubscriptionOut"];
type PlanCode = "monthly" | "annual";

const SUPPORT_MAILTO = "mailto:podpora@simplecrm.cz";
const ENTERPRISE_MAILTO =
  "mailto:podpora@simplecrm.cz?subject=" + encodeURIComponent("SimpleCRM enterprise — dotaz");

const csDate = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long" });
function formatCsDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return csDate.format(new Date(iso));
}

interface StatusPillSpec {
  label: string;
  className: string;
}

function getStatusPill(sub: SubscriptionOut | null | undefined): StatusPillSpec {
  if (!sub) return { label: "Načítání…", className: "bg-surface-overlay text-text-tertiary" };
  if (sub.is_comp) return { label: "Komplementární", className: "bg-info-subtle text-info" };
  if (sub.plan?.code === "enterprise" && sub.status === "active") {
    return { label: "Aktivní · Enterprise", className: "bg-info-subtle text-info" };
  }
  switch (sub.status) {
    case "trialing":
      return { label: "Zkušební verze", className: "bg-info-subtle text-info" };
    case "pending_activation":
      return { label: "Čeká na platbu", className: "bg-warning-subtle text-warning" };
    case "active":
      return { label: "Aktivní", className: "bg-success-subtle text-success" };
    case "past_due":
      return { label: "Po splatnosti", className: "bg-warning-subtle text-warning" };
    case "canceled":
      return { label: "Zrušeno", className: "bg-danger-subtle text-danger" };
    default:
      return { label: sub.status, className: "bg-surface-overlay text-text-tertiary" };
  }
}

function planDisplayName(sub: SubscriptionOut | null | undefined): string {
  if (!sub?.plan) return "—";
  if (sub.is_comp) return "Komplementární";
  if (sub.plan.code === "enterprise") return "Vlastní balíček";
  return sub.plan.display_name_cs;
}

function planInterval(sub: SubscriptionOut | null | undefined): "monthly" | "annual" | "custom" {
  const interval = sub?.plan?.billing_interval;
  if (interval === "monthly" || interval === "annual") return interval;
  return "custom";
}

function BillingSection() {
  const subQuery = useCurrentSubscription();
  const summaryQuery = useBillingSummary();
  const sub = subQuery.data;
  const summary = summaryQuery.data;

  const [modalOpen, setModalOpen] = useState(false);
  const [modalPreselect, setModalPreselect] = useState<PlanCode | null>(null);

  function openModal(preselect: PlanCode | null = null) {
    setModalPreselect(preselect);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setModalPreselect(null);
  }

  if (subQuery.isPending) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-sm text-text-tertiary">
        Načítání…
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <CurrentPlanCard sub={sub} onChangePlan={() => openModal(null)} />
      <BillingDetailsCard
        sub={sub}
        summary={summary}
        onSwitchToAnnual={() => openModal("annual")}
      />
      <InvoicesCard />
      <CancelSubscriptionCard sub={sub} />
      {modalOpen ? <ChoosePlanModal preselect={modalPreselect} onClose={closeModal} /> : null}
    </div>
  );
}

interface CurrentPlanCardProps {
  sub: SubscriptionOut | null | undefined;
  onChangePlan: () => void;
}

function CurrentPlanCard({ sub, onChangePlan }: CurrentPlanCardProps) {
  const pill = getStatusPill(sub);
  const planName = planDisplayName(sub);
  const isComp = !!sub?.is_comp;
  const isEnterprise = sub?.plan?.code === "enterprise";
  const showChangePlan =
    !isComp && !isEnterprise && (sub?.status === "trialing" || sub?.status === "past_due");
  const showContactSupport =
    !isComp && !isEnterprise && (sub?.status === "active" || sub?.status === "canceled");
  const effective = sub?.effective_price_per_user_minor ?? null;
  // Show the per-user price for standard paid plans only. Skip trial
  // (price=0 there is a placeholder, not a real bill), pending_activation
  // (showing the chosen price before activation is misleading), comp (no
  // bill), and enterprise (the override price is already rendered inline
  // in the enterprise block — avoid the duplicate).
  const showPrice =
    !isComp &&
    !isEnterprise &&
    sub?.status !== "pending_activation" &&
    sub?.status !== "trialing" &&
    effective !== null &&
    effective > 0;

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Aktuální plán</h2>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-base font-medium text-text-primary">{planName}</span>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
            pill.className,
          )}
        >
          {pill.label}
        </span>
      </div>

      {showPrice && effective !== null ? (
        <div className="mt-4">
          <PriceDisplay baseMinor={effective} interval={planInterval(sub)} size="md" hideVatLine />
        </div>
      ) : null}

      {sub?.status === "pending_activation" ? (
        <p className="mt-4 text-sm text-text-secondary">
          Vybrali jste plán <span className="font-medium">{planName}</span>. Po připsání platby vás
          aktivujeme do 24 hodin.
        </p>
      ) : null}

      {isComp ? (
        <p className="mt-4 text-sm text-text-secondary">
          Vaše organizace má speciální podmínky. Pro detaily kontaktujte podporu.
        </p>
      ) : null}

      {isEnterprise ? (
        <div className="mt-4 space-y-3">
          {effective !== null ? (
            <p className="text-sm text-text-secondary">
              Vlastní balíček ·{" "}
              <span className="font-medium text-text-primary">{formatCzkMinor(effective)}</span> /
              uživatel / měsíc
            </p>
          ) : null}
          <a
            href={ENTERPRISE_MAILTO}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
          >
            Kontaktovat obchod
          </a>
        </div>
      ) : null}

      {showChangePlan ? (
        <button
          type="button"
          onClick={onChangePlan}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
        >
          Změnit plán
        </button>
      ) : null}

      {showContactSupport ? (
        <a
          href={SUPPORT_MAILTO}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
        >
          Kontaktujte podporu
        </a>
      ) : null}
    </section>
  );
}

interface BillingDetailsCardProps {
  sub: SubscriptionOut | null | undefined;
  summary: components["schemas"]["BillingSummary"] | null | undefined;
  onSwitchToAnnual: () => void;
}

function BillingDetailsCard({ sub, summary, onSwitchToAnnual }: BillingDetailsCardProps) {
  if (!sub) return null;
  if (sub.is_comp) return null;
  if (sub.plan?.code === "enterprise") return null;
  // Only show real billing math when there's an actual bill to discuss —
  // trialing/pending/canceled have no current charge.
  if (sub.status !== "active" && sub.status !== "past_due") return null;
  if (!summary) return null;
  if (summary.effective_price_per_user_minor == null || summary.monthly_total_minor == null) {
    return null;
  }

  const interval = planInterval(sub);
  const isAnnual = interval === "annual";
  const periodLabel = isAnnual ? "rok" : "měsíc";
  // Bill total is computed against the contracted seat_count, not the
  // live active-user count — so a queued downsize that takes effect next
  // period still bills the contracted amount this period, and a
  // headcount that's below seats still pays for what was bought.
  const billedSeats = sub.seat_count;
  const perUserMinor = summary.effective_price_per_user_minor;
  const monthlyContractTotal = perUserMinor * billedSeats;
  const annualContractTotal = perUserMinor * 12 * billedSeats;
  const totalMinor = isAnnual ? annualContractTotal : monthlyContractTotal;
  const renewalDate = formatCsDate(sub.current_period_ends_at);

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Účtování</h2>

      <p className="mt-4 text-sm text-text-secondary">
        {billedSeats} {csNoun(billedSeats, "uzivatel")} ×{" "}
        <span className="font-medium text-text-primary">{formatCzkMinor(perUserMinor)}</span> ={" "}
        <span className="font-semibold text-text-primary">{formatCzkMinor(totalMinor)}</span> /{" "}
        {periodLabel}
      </p>

      {!isAnnual && summary.savings_minor != null && summary.savings_minor > 0 ? (
        <p className="mt-3 text-sm text-text-secondary">
          Pokud byste platili ročně, ušetříte{" "}
          <span className="font-semibold text-text-primary">
            {formatCzkMinor(summary.savings_minor)}
          </span>{" "}
          ročně.{" "}
          <button
            type="button"
            onClick={onSwitchToAnnual}
            className="text-accent underline-offset-2 hover:underline"
          >
            Přejít na roční
          </button>
        </p>
      ) : null}

      {isAnnual && summary.savings_minor != null && summary.savings_minor > 0 ? (
        <p className="mt-3 text-sm text-text-secondary">
          Šetříte{" "}
          <span className="font-semibold text-text-primary">
            {formatCzkMinor(summary.savings_minor)}
          </span>{" "}
          oproti měsíčnímu plánu.
        </p>
      ) : null}

      {renewalDate && (sub.status === "active" || sub.status === "past_due") ? (
        <p className="mt-3 text-sm text-text-tertiary">
          Další obnova: <span className="text-text-primary">{renewalDate}</span>
        </p>
      ) : null}
    </section>
  );
}

const INVOICE_KIND_LABEL: Record<ChargeOut["kind"], string> = {
  initial: "První aktivace",
  renewal: "Obnova",
  seat_upgrade: "Navýšení uživatelů",
};

const INVOICE_STATUS_PILL: Record<ChargeOut["status"], { label: string; className: string }> = {
  paid: { label: "Zaplaceno", className: "bg-success-subtle text-success" },
  pending: { label: "Čeká", className: "bg-warning-subtle text-warning" },
  failed: { label: "Selhalo", className: "bg-danger-subtle text-danger" },
  refunded: { label: "Vráceno", className: "bg-info-subtle text-info" },
};

function InvoicesCard() {
  const invoices = useInvoices();

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Faktury</h2>
      {invoices.isPending ? (
        <p className="mt-3 text-sm text-text-tertiary">Načítání…</p>
      ) : invoices.isError ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          Faktury se nepodařilo načíst.
        </p>
      ) : !invoices.data || invoices.data.items.length === 0 ? (
        <p className="mt-3 text-sm text-text-secondary">Faktury budou dostupné po první platbě.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border-subtle">
          {invoices.data.items.map((inv) => {
            const pill = INVOICE_STATUS_PILL[inv.status];
            const created = formatCsDate(inv.created_at) ?? "";
            return (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {INVOICE_KIND_LABEL[inv.kind]}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {created}
                    {inv.seats != null ? ` · ${inv.seats} ${csNoun(inv.seats, "uzivatel")}` : ""}
                    {inv.failure_reason ? ` · ${inv.failure_reason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-text-primary">
                    {formatCzkMinor(inv.amount_minor)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      pill.className,
                    )}
                  >
                    {pill.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface CancelSubscriptionCardProps {
  sub: SubscriptionOut | null | undefined;
}

function CancelSubscriptionCard({ sub }: CancelSubscriptionCardProps) {
  const cancel = useCancelSubscription();
  const reactivate = useReactivateSubscription();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Hide entirely for orgs that can't self-cancel: comp + enterprise go
  // through the founder, trial doesn't have an active subscription to
  // cancel, and an already-canceled-and-period-expired sub can't be
  // reactivated anyway.
  if (!sub) return null;
  if (sub.is_comp) return null;
  if (sub.plan?.code === "enterprise") return null;
  if (sub.status === "trialing" || sub.status === "pending_activation") return null;

  // Distinguishes "already self-cancelled, can still un-cancel" from
  // "active, can cancel". The backend uses canceled_at != null + status
  // 'active' as the "scheduled to cancel at period end" signal.
  const isScheduledForCancel = sub.canceled_at != null && sub.status === "active";
  const endsAt = formatCsDate(sub.current_period_ends_at);

  if (isScheduledForCancel) {
    return (
      <section className="border-warning/40 rounded-lg border bg-warning-subtle p-6">
        <h2 className="text-lg font-semibold text-text-primary">
          Předplatné je naplánované ke zrušení
        </h2>
        <p className="mt-3 text-sm text-text-primary">
          {endsAt
            ? `Přístup do aplikace zachováme do ${endsAt}. Poté pay-gate omezí činnost — data můžete kdykoli vyexportovat.`
            : "Přístup do aplikace zachováme do konce aktuálního období. Poté pay-gate omezí činnost — data můžete kdykoli vyexportovat."}
        </p>
        {error ? (
          <p
            role="alert"
            className="border-danger/40 mt-3 rounded-md border bg-bg px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={reactivate.isPending}
          onClick={() => {
            setError(null);
            reactivate.mutate(undefined, {
              onError: () => setError("Obnovení se nezdařilo. Zkuste to prosím znovu."),
            });
          }}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {reactivate.isPending ? "Obnovuji…" : "Obnovit předplatné"}
        </button>
      </section>
    );
  }

  if (sub.status !== "active" && sub.status !== "past_due") return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Zrušit předplatné</h2>
      <p className="mt-3 text-sm text-text-secondary">
        Po zrušení dále hradíme až do konce aktuálního období
        {endsAt ? ` (do ${endsAt})` : ""} — nikdo o přístup nepřijde okamžitě. Žádné další platby
        vám pak strhnuty nebudou. Data si vždy můžete vyexportovat ze sekce Reporty.
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => {
            setConfirming(true);
            setError(null);
          }}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md border border-danger bg-surface px-5 text-sm font-medium text-danger transition-colors duration-fast hover:bg-danger-subtle"
        >
          Zrušit předplatné
        </button>
      ) : (
        <div className="border-danger/40 mt-4 space-y-3 rounded-md border bg-danger-subtle p-4">
          <p className="text-sm font-medium text-text-primary">Opravdu chcete zrušit předplatné?</p>
          <label className="block text-xs font-medium text-text-tertiary">
            Důvod (nepovinné, pomůže nám se zlepšit)
            <textarea
              rows={2}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => {
                setError(null);
                cancel.mutate(
                  { reason: reason.trim() || undefined },
                  {
                    onSuccess: () => setConfirming(false),
                    onError: () => setError("Zrušení se nezdařilo. Zkuste to prosím znovu."),
                  },
                );
              }}
              className="hover:bg-danger/90 inline-flex h-10 items-center justify-center rounded-md bg-danger px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancel.isPending ? "Rušíme…" : "Ano, zrušit"}
            </button>
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-secondary hover:text-text-primary"
            >
              Ne, ponechat
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

interface ChoosePlanModalProps {
  preselect: PlanCode | null;
  onClose: () => void;
}

function ChoosePlanModal({ preselect, onClose }: ChoosePlanModalProps) {
  const plans = usePublicPlans();
  const summary = useBillingSummary();
  const [selected, setSelected] = useState<PlanCode | null>(preselect);
  const [error, setError] = useState<string | null>(null);

  const monthlyPlan = plans.data?.find((p) => p.code === "monthly");
  const annualPlan = plans.data?.find((p) => p.code === "annual");

  // Routes through the new ComGate-backed initial-payment-init endpoint;
  // returns a hosted-page redirect URL that we send the customer to.
  // The legacy choose-plan endpoint still exists as a deprecated
  // fallback but is no longer wired here.
  const initPayment = useInitialPaymentInit();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected || initPayment.isPending) return;
    setError(null);
    initPayment.mutate(
      { plan_code: selected },
      {
        onSuccess: (init) => {
          window.location.assign(init.redirect_url);
        },
        onError: () => {
          setError("Platební brána není dostupná, zkuste to prosím za chvíli.");
        },
      },
    );
  }
  const submitting = initPayment.isPending;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="choose-plan-title"
      className="bg-bg/80 fixed inset-0 z-50 flex items-center justify-center px-4 py-8 backdrop-blur-md"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl rounded-xl border border-border bg-surface p-6 shadow-lg sm:p-8"
      >
        <h2 id="choose-plan-title" className="text-xl font-semibold text-text-primary">
          Vyberte plán
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Po výběru vás přesměrujeme na zabezpečenou platební bránu. Po úspěšné platbě se vrátíte
          zpět a předplatné bude okamžitě aktivní.
        </p>

        <div
          role="radiogroup"
          aria-label="Plán"
          className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <PlanModalCard
            code="monthly"
            title="Měsíční"
            priceMinor={monthlyPlan?.price_per_user_minor ?? null}
            priceInterval="monthly"
            selected={selected === "monthly"}
            disabled={submitting}
            onSelect={() => setSelected("monthly")}
          />
          <PlanModalCard
            code="annual"
            title="Roční"
            priceMinor={annualPlan?.price_per_user_minor ?? null}
            priceInterval="annual"
            selected={selected === "annual"}
            disabled={submitting}
            onSelect={() => setSelected("annual")}
            badge="Ušetříte 16 %"
            caption={
              summary.data && summary.data.savings_minor != null ? (
                <p className="text-sm text-text-secondary">
                  {summary.data.user_count === 1
                    ? "S Vaším 1 uživatelem"
                    : `S Vašimi ${summary.data.user_count} uživateli`}{" "}
                  ušetříte{" "}
                  <span className="font-semibold text-text-primary">
                    {formatCzkMinor(summary.data.savings_minor)}
                  </span>{" "}
                  ročně.
                </p>
              ) : null
            }
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="border-danger/40 mt-4 rounded-md border bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center rounded-md bg-transparent px-4 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            Zrušit
          </button>
          <button
            type="submit"
            disabled={!selected || submitting}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Přesměrování…" : "Pokračovat na platbu"}
          </button>
        </div>
      </form>
    </div>
  );
}

interface PlanModalCardProps {
  code: PlanCode;
  title: string;
  priceMinor: number | null;
  priceInterval: "monthly" | "annual";
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  badge?: string;
  caption?: React.ReactNode;
}

function PlanModalCard({
  code,
  title,
  priceMinor,
  priceInterval,
  selected,
  disabled,
  onSelect,
  badge,
  caption,
}: PlanModalCardProps) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={disabled ? -1 : 0}
      data-plan-code={code}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "relative flex cursor-pointer flex-col rounded-lg border-2 bg-surface p-5 transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        selected ? "border-accent shadow-md" : "border-border hover:border-text-tertiary",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {badge ? (
        <span className="absolute -top-3 right-4 rounded-full bg-brand-accent px-3 py-1 text-xs font-semibold text-text-on-brand-accent">
          {badge}
        </span>
      ) : null}
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      <div className="mt-3">
        {priceMinor != null ? (
          <PriceDisplay baseMinor={priceMinor} interval={priceInterval} size="lg" hideVatLine />
        ) : (
          <div aria-hidden className="h-9 w-32 animate-pulse rounded bg-surface-overlay" />
        )}
      </div>
      {caption ? <div className="mt-3">{caption}</div> : null}
    </div>
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
          className="border-info/40 mt-4 rounded-md border bg-info-subtle p-4"
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

      {needsToDeactivate ? (
        <div className="border-warning/40 mt-4 rounded-md border bg-warning-subtle p-4">
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
          className="border-danger/40 mt-4 rounded-md border bg-danger-subtle px-3 py-2 text-sm text-danger"
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
          subtitle="Účtováno jednou ročně, ušetříte 16 %"
          selected={target === "annual"}
          onSelect={() => setTarget("annual")}
        />
      </div>

      {pendingInterval && pendingInterval !== currentInterval ? (
        <p className="border-info/40 mt-4 rounded-md border bg-info-subtle px-3 py-2 text-sm text-info">
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
          className="border-danger/40 mt-4 rounded-md border bg-danger-subtle px-3 py-2 text-sm text-danger"
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
