import { Pencil, Plus, RotateCcw, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { AddCompanyModal } from "@/app/companies/AddCompanyModal";
import { AddContactModal } from "@/app/contacts/AddContactModal";
import { AddDealModal } from "@/app/deals/AddDealModal";
import { EventFormModal } from "@/app/events/EventFormModal";
import { usePipelineBoard } from "@/app/pipeline/useBoard";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { WidgetSkeleton } from "@/components/widget-dashboard/WidgetFrame";
import { WidgetGrid } from "@/components/widget-dashboard/WidgetGrid";
import { MobileWidgetList } from "@/components/widget-dashboard/MobileWidgetList";
import { WidgetPicker, type WidgetPickerGroup } from "@/components/widget-dashboard/WidgetPicker";
import { useDashboardEditor } from "@/components/widget-dashboard/useDashboardEditor";
import { useLocale } from "@/lib/i18n/useLocale";
import { testIds } from "@/lib/testids";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { usePageTitle } from "@/lib/usePageTitle";

import { HomeWidgetByType } from "@/app/dashboard/HomeWidgetByType";
import { addWidget, removeWidget, setWidgetDatePreset } from "@/app/dashboard/homeLayout";
import { buildHomePickerGroups } from "@/app/dashboard/homeWidgetCatalog";
import {
  useHomeDashboardConfig,
  useResetHomeDashboardConfig,
  useSaveHomeDashboardConfig,
  type HomeDashboardConfig,
  type HomeWidgetEntry,
  type HomeWidgetType,
} from "@/app/dashboard/useHomeDashboard";
import {
  WidgetConfigPopover,
  type HomeDatePreset,
} from "@/app/dashboard/widgets/WidgetConfigPopover";

/**
 * Extract a friendly first name. The backend's `user.name` is "first last"
 * for Google OAuth signups; the email local-part is the fallback when
 * `name` is empty. Splitting on whitespace handles both cases without
 * showing the role or domain.
 */
function firstName(name: string, email: string, fallback: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    const [head] = trimmed.split(/\s+/);
    if (head) return head;
  }
  const local = email.split("@")[0] ?? "";
  return local || fallback;
}

type QuickAction = "deal" | "company" | "contact" | "activity";

const ACTION_BY_TYPE: Partial<Record<HomeWidgetType, QuickAction>> = {
  action_new_deal: "deal",
  action_new_company: "company",
  action_new_contact: "contact",
  action_new_activity: "activity",
};

/**
 * The home dashboard: a fixed welcome header (name + month line) above an
 * editable widget grid. Widgets, layout, and the mobile stacking order
 * persist per user via `/users/me/home-dashboard`; edit mode mirrors the
 * Reports page (draft state in `useDashboardEditor`, Escape cancels).
 * Desktop/tablet render the 2D grid; <768px renders a reorderable list.
 */
export function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const { t: tReports } = useTranslation("reports");
  const { t: tw } = useTranslation("widgets");
  usePageTitle(t("dashboardPage.title"));
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const isMobile = useMediaQuery("(max-width: 767px)");

  const config = useHomeDashboardConfig();
  const save = useSaveHomeDashboardConfig();
  const reset = useResetHomeDashboardConfig();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null);
  const [openAction, setOpenAction] = useState<QuickAction | null>(null);

  const editor = useDashboardEditor<HomeDashboardConfig>({
    loaded: config.data,
    onSave: (draft) => save.mutateAsync(draft),
    onReset: () => reset.mutateAsync(),
    confirmReset: () => window.confirm(tw("editor.resetConfirm")),
  });
  const { isEditMode, working, setDraft } = editor;

  const locale = useLocale();
  const monthLabel = useMemo(() => {
    try {
      // Intl casing already follows the locale's convention: Czech long
      // months are lowercase ("červenec"), English are capitalized ("July").
      // Both read correctly mid-sentence, so we don't force a case here.
      return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date());
    } catch {
      return "";
    }
  }, [locale]);

  const widgets = useMemo(() => working?.widgets ?? [], [working]);

  const pickerGroups = useMemo<WidgetPickerGroup[]>(() => {
    if (!user) return [];
    const presentTypes = new Set<HomeWidgetType>(widgets.map((w) => w.config.type));
    return buildHomePickerGroups({ user, presentTypes, t, tReports });
  }, [user, widgets, t, tReports]);

  function handleLayoutChange(next: HomeWidgetEntry[]) {
    if (!working) return;
    setDraft({ ...working, widgets: next });
  }

  function handleAddWidget(type: string) {
    if (!working) return;
    setDraft(addWidget(working, type as HomeWidgetType));
  }

  function handleRemoveWidget(id: string) {
    if (!working) return;
    setDraft(removeWidget(working, id));
  }

  function handleReorder(nextOrder: string[]) {
    if (!working) return;
    setDraft({ ...working, mobileOrder: nextOrder });
  }

  function handlePresetChange(preset: HomeDatePreset) {
    if (!working || !configWidgetId) return;
    setDraft(setWidgetDatePreset(working, configWidgetId, preset));
  }

  function handleAction(type: HomeWidgetType) {
    const action = ACTION_BY_TYPE[type];
    if (action) setOpenAction(action);
  }

  if (!user) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        {t("dashboardPage.loadingSummary")}
      </div>
    );
  }

  const configEntry = configWidgetId ? widgets.find((w) => w.id === configWidgetId) : undefined;

  const renderEntry = (entry: HomeWidgetEntry) => (
    <HomeWidgetByType
      entry={entry}
      isEditMode={isEditMode}
      onRemove={() => handleRemoveWidget(entry.id)}
      onConfigOpen={setConfigWidgetId}
      onAction={handleAction}
    />
  );

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {t("dashboardPage.welcome", {
              name: firstName(user.name, user.email, t("dashboardPage.userFallback")),
            })}
          </h1>
          <p className="mt-1 text-sm text-text-tertiary">
            {t("dashboardPage.summaryFor", {
              month: monthLabel || t("dashboardPage.summaryForFallback"),
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isEditMode ? (
            <>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                data-testid={testIds.dashboard.addWidget}
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
            <button
              type="button"
              onClick={editor.enterEdit}
              data-testid={testIds.dashboard.editLayout}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-secondary hover:border-accent hover:text-accent"
            >
              <Pencil size={14} strokeWidth={1.75} aria-hidden /> {tw("editor.editLayout")}
            </button>
          )}
        </div>
      </header>

      <section aria-label={t("dashboardPage.widgetsAriaLabel")}>
        {config.isPending ? (
          <DashboardSkeleton />
        ) : !working ? (
          <div
            className="rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger"
            role="alert"
          >
            {t("dashboardPage.summaryLoadError")}
          </div>
        ) : widgets.length === 0 ? (
          <EmptyDashboard onEdit={editor.enterEdit} />
        ) : isMobile ? (
          <MobileWidgetList
            items={[...widgets]
              .sort((a, b) =>
                a.position.y !== b.position.y
                  ? a.position.y - b.position.y
                  : a.position.x - b.position.x,
              )
              .map((entry) => ({ id: entry.id, node: renderEntry(entry) }))}
            order={working.mobileOrder ?? []}
            onReorder={handleReorder}
            isEditMode={isEditMode}
          />
        ) : (
          <WidgetGrid
            widgets={widgets}
            isEditMode={isEditMode}
            onLayoutChange={handleLayoutChange}
            renderWidget={renderEntry}
          />
        )}
      </section>

      <WidgetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        groups={pickerGroups}
        onAdd={handleAddWidget}
      />

      <WidgetConfigPopover
        open={!!configEntry}
        onClose={() => setConfigWidgetId(null)}
        value={(configEntry?.config.date_preset ?? null) as HomeDatePreset | null}
        onChange={handlePresetChange}
      />

      {openAction === "deal" ? <DealQuickAction open onClose={() => setOpenAction(null)} /> : null}
      <AddCompanyModal
        open={openAction === "company"}
        onClose={() => setOpenAction(null)}
        onCreated={(companyId) => navigate(`/app/companies/${companyId}`)}
      />
      <AddContactModal
        open={openAction === "contact"}
        onClose={() => setOpenAction(null)}
        onCreated={(contactId) => navigate(`/app/contacts/${contactId}`)}
      />
      <EventFormModal open={openAction === "activity"} onClose={() => setOpenAction(null)} />
    </div>
  );
}

/**
 * Mounted only while the "new deal" quick action is open so the pipeline
 * board (stages + deals) isn't fetched on every dashboard visit.
 */
function DealQuickAction({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: board } = usePipelineBoard();
  const stages = useMemo(
    () => (board?.stages ?? []).map((s) => ({ id: s.id, name: s.name })),
    [board?.stages],
  );
  const initialStageId = useMemo(
    () => board?.stages.find((s) => s.stage_type === "open")?.id ?? board?.stages[0]?.id,
    [board?.stages],
  );
  return (
    <AddDealModal open={open} onClose={onClose} stages={stages} initialStageId={initialStageId} />
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
  const { t } = useTranslation("dashboard");
  const { t: tw } = useTranslation("widgets");
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
      <h2 className="text-lg font-semibold">{t("dashboardEmpty.title")}</h2>
      <p className="mt-2 text-sm text-text-tertiary">{t("dashboardEmpty.message")}</p>
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
