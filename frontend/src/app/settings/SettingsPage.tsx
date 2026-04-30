import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

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
import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { ApiError, apiFetch } from "@/lib/api";
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
      <label className="sm:col-span-5 text-xs font-medium text-text-tertiary">
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
      <label className="sm:col-span-2 text-xs font-medium text-text-tertiary">
        Pravděp. (%)
        <input
          type="number"
          min={0}
          max={100}
          value={form.default_probability}
          onChange={(e) =>
            setForm((f) => ({ ...f, default_probability: Number(e.target.value) }))
          }
          className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary tabular-nums"
        />
      </label>
      <label className="sm:col-span-2 text-xs font-medium text-text-tertiary">
        Barva
        <input
          type="color"
          value={form.color}
          onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
          className="mt-1 block h-[34px] w-full rounded-md border border-border bg-surface"
        />
      </label>
      <label className="sm:col-span-3 text-xs font-medium text-text-tertiary">
        Typ
        <select
          value={form.stage_type}
          onChange={(e) =>
            setForm((f) => ({ ...f, stage_type: e.target.value as StageType }))
          }
          className="mt-1 block w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
        >
          <option value="open">Otevřená</option>
          <option value="won">Výhra</option>
          <option value="lost">Prohra</option>
        </select>
      </label>
      {error ? (
        <p className="sm:col-span-12 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="sm:col-span-12 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
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
      <span
        aria-hidden
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: stage.color }}
      />
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

export function SettingsPage() {
  const { data: user } = useCurrentUser();
  const { data: pipeline, isPending, isError } = usePipeline();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const reorder = useReorderStages();

  const [addingOpen, setAddingOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("pipeline");

  const activeTabMeta = TABS.find((t) => t.key === activeTab) ?? TABS[0];
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
  const visibleTabs = canInviteOnly
    ? TABS.filter((t) => t.key === "invitations")
    : TABS;

  const stagesReady = !isPending && !isError && pipeline;
  const stages = stagesReady ? [...pipeline.stages].sort((a, b) => a.position - b.position) : [];

  async function handleMove(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= stages.length) return;
    const newOrder = stages.map((s) => s.id);
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
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

  const editing = editingId ? stages.find((s) => s.id === editingId) ?? null : null;

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
              className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
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
                <li
                  key={stage.id}
                  className="border-b border-border-subtle py-3 last:border-0"
                >
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
          Když je vypnuto, obchodníci v Reportech vidí pouze své vlastní výsledky.
          Manažeři a administrátoři žebříček vidí vždy.
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

function PermissionsSection() {
  const rows: { action: string; rep: string; manager: string; admin: string }[] = [
    { action: "Vidět všechny obchody v rámci pipeline", rep: "Jen vlastní", manager: "Tým", admin: "Vše" },
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

const PRICE_PER_USER_CZK = 99;
const priceFormatter = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});

function BillingSection() {
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Fakturace</h2>
      <p className="mt-1 text-sm text-text-tertiary">
        Detaily plánu, faktur a způsobu platby.
      </p>
      <div className="mt-4 rounded-md border border-border-subtle bg-surface-overlay p-4">
        <p className="text-sm text-text-primary">
          Zkušební verze · {priceFormatter.format(PRICE_PER_USER_CZK)} / uživatel / měsíc po
          skončení.
        </p>
        <p className="mt-1 text-xs text-text-tertiary">
          Spravování plateb a fakturace připravujeme.
        </p>
        <button
          type="button"
          disabled
          title="Brzy"
          className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-tertiary"
        >
          Spravovat platbu
        </button>
      </div>
    </section>
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
