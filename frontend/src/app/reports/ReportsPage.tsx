import { Download, Pencil, Plus, RotateCcw, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";

import { GlobalFilterBar } from "@/app/reports/dashboard/GlobalFilterBar";
import {
  WIDGET_DESCRIPTION_KEY,
  WIDGET_ICONS,
  REPORTS_ANALYTICS_TYPES,
  REPORTS_KPI_TYPES,
  defaultWidgetSize,
  nextRowY,
} from "@/app/reports/dashboard/reportsWidgetCatalog";
import {
  WIDGET_LABEL_KEY,
  type DashboardConfig,
  type GlobalFilters,
  type WidgetEntry,
  type WidgetType,
} from "@/app/reports/dashboard/types";
import {
  useDashboardConfig,
  useResetDashboardConfig,
  useSaveDashboardConfig,
} from "@/app/reports/dashboard/useDashboardConfig";
import { useExportCsv } from "@/app/reports/dashboard/useExportCsv";
import { WidgetByType } from "@/app/reports/dashboard/widgets/WidgetByType";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { WidgetSkeleton } from "@/components/widget-dashboard/WidgetFrame";
import { WidgetGrid } from "@/components/widget-dashboard/WidgetGrid";
import {
  WidgetPicker,
  type WidgetPickerGroup,
} from "@/components/widget-dashboard/WidgetPicker";
import { useDashboardEditor } from "@/components/widget-dashboard/useDashboardEditor";
import { makeWidgetId } from "@/components/widget-dashboard/widgetId";
import { testIds } from "@/lib/testids";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/lib/usePageTitle";

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
 * Edit mode is local draft state (see `useDashboardEditor`). The
 * on-screen `working` config is the working copy; Save PUTs it to the
 * backend, Cancel/Escape reverts to the last loaded value, and Reset
 * calls DELETE.
 */
export function ReportsPage() {
  const { t } = useTranslation("reports");
  const { t: tw } = useTranslation("widgets");
  usePageTitle(t("reportsPage.title"));
  const { data: me, isPending: meLoading } = useCurrentUser();
  const config = useDashboardConfig();
  const save = useSaveDashboardConfig();
  const reset = useResetDashboardConfig();
  const exportCsv = useExportCsv();
  const [pickerOpen, setPickerOpen] = useState(false);

  const editor = useDashboardEditor<DashboardConfig>({
    loaded: config.data,
    onSave: (draft) => save.mutateAsync(draft),
    onReset: () => reset.mutateAsync(),
    confirmReset: () => window.confirm(tw("editor.resetConfirm")),
  });
  const { isEditMode, working, setDraft } = editor;

  const pickerGroups = useMemo<WidgetPickerGroup[]>(() => {
    const make = (type: WidgetType) => ({
      type,
      label: t(WIDGET_LABEL_KEY[type]),
      description: t(WIDGET_DESCRIPTION_KEY[type]),
      icon: WIDGET_ICONS[type],
      // Analytics widgets are freely duplicable — none lock in the picker.
      unique: false,
      added: false,
    });
    return [
      { title: t("widgetPicker.groupKpi"), items: REPORTS_KPI_TYPES.map(make) },
      { title: t("widgetPicker.groupAnalytics"), items: REPORTS_ANALYTICS_TYPES.map(make) },
    ];
  }, [t]);

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
    if (isEditMode) {
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
      widgets: (working.widgets ?? []).filter((w) => w.id !== id),
    });
  }

  function handleAddWidget(type: string) {
    if (!working) return;
    const widgetType = type as WidgetType;
    const { w, h } = defaultWidgetSize(widgetType);
    const widgets = working.widgets ?? [];
    const y = nextRowY(widgets.map((entry) => entry.position));
    const entry: WidgetEntry = {
      id: makeWidgetId(),
      position: { x: 0, y, w, h },
      config: { type: widgetType } as WidgetEntry["config"],
    };
    setDraft({ ...working, widgets: [...widgets, entry] });
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("reportsPage.title")}</h1>
          <p className="mt-1 text-sm text-text-tertiary">{t("reportsPage.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isEditMode ? (
            <>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                data-testid={testIds.reports.addWidget}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-secondary hover:border-accent hover:text-accent"
              >
                <Plus size={14} strokeWidth={1.75} aria-hidden /> {tw("editor.addWidget")}
              </button>
              <button
                type="button"
                onClick={() => void editor.reset()}
                disabled={reset.isPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <RotateCcw size={14} strokeWidth={1.75} aria-hidden /> {tw("editor.resetLayout")}
              </button>
              <button
                type="button"
                onClick={editor.cancel}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-secondary hover:border-accent hover:text-accent"
              >
                <X size={14} strokeWidth={1.75} aria-hidden /> {tw("editor.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void editor.save()}
                disabled={save.isPending}
                className="hover:bg-accent-strong inline-flex h-9 items-center gap-1.5 rounded-md border border-accent bg-accent px-3 text-sm font-medium text-text-on-accent disabled:opacity-50"
              >
                <Save size={14} strokeWidth={1.75} aria-hidden /> {tw("editor.save")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  if (!working) return;
                  void exportCsv.mutateAsync({
                    config: working,
                    globalFilters: filters,
                  });
                }}
                disabled={!working || exportCsv.isPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <Download size={14} strokeWidth={1.75} aria-hidden />
                {exportCsv.isPending ? t("reportsPage.downloading") : t("reportsPage.downloadCsv")}
              </button>
              <button
                type="button"
                onClick={editor.enterEdit}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-secondary hover:border-accent hover:text-accent"
              >
                <Pencil size={14} strokeWidth={1.75} aria-hidden /> {tw("editor.editLayout")}
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
        ) : (working.widgets ?? []).length === 0 ? (
          <EmptyDashboard onEdit={editor.enterEdit} />
        ) : (
          <WidgetGrid
            widgets={working.widgets ?? []}
            isEditMode={isEditMode}
            onLayoutChange={handleLayoutChange}
            renderWidget={(entry) => (
              <WidgetByType
                entry={entry}
                globalFilters={filters}
                isEditMode={isEditMode}
                onRemove={() => handleRemoveWidget(entry.id)}
              />
            )}
          />
        )}
      </div>

      <WidgetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        groups={pickerGroups}
        onAdd={handleAddWidget}
      />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[160px] rounded-lg border border-border bg-surface p-5">
          <WidgetSkeleton />
        </div>
      ))}
    </div>
  );
}

function EmptyDashboard({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation("reports");
  const { t: tw } = useTranslation("widgets");
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
      <h2 className="text-lg font-semibold">{t("reportsPage.emptyTitle")}</h2>
      <p className="mt-2 text-sm text-text-tertiary">{t("reportsPage.emptyMessage")}</p>
      <button
        type="button"
        onClick={onEdit}
        className="hover:bg-accent-strong mt-4 inline-flex h-9 items-center gap-1.5 rounded-md border border-accent bg-accent px-3 text-sm font-medium text-text-on-accent"
      >
        <Pencil size={14} strokeWidth={1.75} aria-hidden /> {tw("editor.editLayout")}
      </button>
    </div>
  );
}
