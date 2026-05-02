import { Download, Pencil, RotateCcw, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import { GlobalFilterBar } from "@/app/reports/dashboard/GlobalFilterBar";
import {
  WidgetEmpty,
  WidgetFrame,
  WidgetSkeleton,
} from "@/app/reports/dashboard/WidgetFrame";
import { WidgetGrid } from "@/app/reports/dashboard/WidgetGrid";
import {
  type DashboardConfig,
  type GlobalFilters,
  type WidgetEntry,
  type WidgetType,
  WIDGET_LABEL,
} from "@/app/reports/dashboard/types";
import {
  useDashboardConfig,
  useResetDashboardConfig,
  useSaveDashboardConfig,
} from "@/app/reports/dashboard/useDashboardConfig";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";

function defaultFilters(): GlobalFilters {
  return {
    dateRange: { preset: "last_30_days", from: null, to: null },
    teamId: null,
    ownerUserId: null,
  };
}

/**
 * Configurable widget dashboard for managers and admins. Salespeople
 * land back on the main dashboard — their per-user KPIs already live
 * there.
 *
 * Edit mode is local state. The on-screen `config` is the working
 * copy; clicking "Uložit" PUTs it to the backend, "Zrušit" reverts to
 * the last loaded value, and "Obnovit výchozí" calls DELETE.
 */
export function ReportsPage() {
  usePageTitle("Reporty");
  const { data: me, isPending: meLoading } = useCurrentUser();
  const config = useDashboardConfig();
  const save = useSaveDashboardConfig();
  const reset = useResetDashboardConfig();

  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<DashboardConfig | null>(null);

  // The working copy is whatever's currently displayed: in view mode
  // the server config; in edit mode the in-memory draft (so unsaved
  // moves don't blow away when the query refetches).
  const working = editMode ? draft : config.data ?? null;

  // Initialize the draft once when entering edit mode.
  useEffect(() => {
    if (editMode && config.data && !draft) {
      setDraft(config.data);
    }
    if (!editMode && draft) {
      setDraft(null);
    }
  }, [editMode, config.data, draft]);

  if (meLoading) {
    return (
      <div className="px-4 py-6 md:px-8 md:py-8">
        <WidgetSkeleton />
      </div>
    );
  }

  if (me?.role === "salesperson") {
    return <Navigate to="/app" replace />;
  }

  const filters = working?.globalFilters ?? defaultFilters();

  function handleFiltersChange(next: GlobalFilters) {
    if (!working) return;
    if (editMode) {
      setDraft({ ...working, globalFilters: next });
    } else {
      // View-mode filter changes are persisted immediately so a
      // refetch doesn't clobber them. The PUT is small and the
      // backend already supports it.
      void save.mutateAsync({ ...working, globalFilters: next });
    }
  }

  function handleLayoutChange(nextWidgets: WidgetEntry[]) {
    if (!working) return;
    setDraft({ ...working, widgets: nextWidgets });
  }

  function handleRemoveWidget(id: string) {
    if (!working) return;
    setDraft({
      ...working,
      widgets: working.widgets.filter((w) => w.id !== id),
    });
  }

  async function handleSave() {
    if (!draft) return;
    await save.mutateAsync(draft);
    setEditMode(false);
  }

  function handleCancel() {
    setDraft(null);
    setEditMode(false);
  }

  async function handleReset() {
    const ok = window.confirm(
      "Opravdu chcete obnovit výchozí rozložení? Vaše úpravy budou ztraceny.",
    );
    if (!ok) return;
    await reset.mutateAsync();
    setEditMode(false);
    setDraft(null);
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reporty</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Vlastní rozložení widgetů — výsledky týmu i jednotlivců.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editMode ? (
            <>
              <button
                type="button"
                onClick={handleReset}
                disabled={reset.isPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <RotateCcw size={14} strokeWidth={1.75} aria-hidden /> Obnovit výchozí
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-secondary hover:border-accent hover:text-accent"
              >
                <X size={14} strokeWidth={1.75} aria-hidden /> Zrušit
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={save.isPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-accent bg-accent px-3 text-sm font-medium text-text-on-accent hover:bg-accent-strong disabled:opacity-50"
              >
                <Save size={14} strokeWidth={1.75} aria-hidden /> Uložit
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled
                title="Příprava — bude doplněno v R7"
                className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-tertiary opacity-60"
              >
                <Download size={14} strokeWidth={1.75} aria-hidden /> Stáhnout CSV
              </button>
              <button
                type="button"
                onClick={() => setEditMode(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-secondary hover:border-accent hover:text-accent"
              >
                <Pencil size={14} strokeWidth={1.75} aria-hidden /> Upravit rozložení
              </button>
            </>
          )}
        </div>
      </header>

      <GlobalFilterBar value={filters} onChange={handleFiltersChange} />

      <div className={cn("mt-4")}>
        {config.isPending ? (
          <DashboardSkeleton />
        ) : !working ? (
          <DashboardSkeleton />
        ) : working.widgets.length === 0 ? (
          <EmptyDashboard onEdit={() => setEditMode(true)} />
        ) : (
          <WidgetGrid
            config={working}
            isEditMode={editMode}
            onLayoutChange={handleLayoutChange}
            renderWidget={(entry) => (
              <PlaceholderWidget
                entry={entry}
                isEditMode={editMode}
                onRemove={() => handleRemoveWidget(entry.id)}
              />
            )}
          />
        )}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-[160px] rounded-lg border border-border bg-surface p-5"
        >
          <WidgetSkeleton />
        </div>
      ))}
    </div>
  );
}

function EmptyDashboard({ onEdit }: { onEdit: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
      <h2 className="text-lg font-semibold">Žádné widgety</h2>
      <p className="mt-2 text-sm text-text-tertiary">
        Přidejte si první widget — sledujte přesně to, co potřebujete.
      </p>
      <button
        type="button"
        onClick={onEdit}
        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md border border-accent bg-accent px-3 text-sm font-medium text-text-on-accent hover:bg-accent-strong"
      >
        <Pencil size={14} strokeWidth={1.75} aria-hidden /> Upravit rozložení
      </button>
    </div>
  );
}

/**
 * Stand-in body until R6 ships the real widgets. Each widget type
 * gets its own component there; this placeholder simply renders the
 * label and a "Připravujeme" hint inside the shared frame so layout
 * persistence, edit mode, and the grid can be exercised end-to-end
 * before the data widgets land.
 */
function PlaceholderWidget({
  entry,
  isEditMode,
  onRemove,
}: {
  entry: WidgetEntry;
  isEditMode: boolean;
  onRemove: () => void;
}) {
  const label = useMemo(() => {
    const t = (entry.config as { type: string }).type as WidgetType;
    return WIDGET_LABEL[t] ?? t;
  }, [entry.config]);
  return (
    <WidgetFrame label={label} isEditMode={isEditMode} onRemove={onRemove}>
      <WidgetEmpty message="Připravujeme — widget se zobrazí v R6." />
    </WidgetFrame>
  );
}
