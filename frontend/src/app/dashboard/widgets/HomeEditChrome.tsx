import { GripVertical, Settings2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { testIds } from "@/lib/testids";
import { cn } from "@/lib/utils";

interface HomeEditChromeProps {
  isEditMode: boolean;
  /** Stable widget id — drives control test ids. */
  widgetId: string;
  /** Resolved widget label, used for control aria-labels. */
  label: string;
  onRemove?: () => void;
  /** Provide to show the per-widget config gear (date preset). */
  onConfigClick?: () => void;
  children: ReactNode;
}

/**
 * Minimal edit affordance for widgets that carry their own card chrome
 * (KPI tiles, quick actions, the invite card). In view mode it renders
 * the child untouched — the bare `KpiCard`/tile keeps its own look. In
 * edit mode it adds an accent ring plus a floating toolbar (drag handle,
 * optional gear, remove) without introducing a second card border.
 */
export function HomeEditChrome({
  isEditMode,
  widgetId,
  label,
  onRemove,
  onConfigClick,
  children,
}: HomeEditChromeProps) {
  const { t } = useTranslation("widgets");
  if (!isEditMode) return <>{children}</>;

  return (
    <div className="flex h-full flex-col">
      {/* Reserved strip instead of a floating overlay so the controls can
          never cover the card's own top-right content (KPI icon, badges). */}
      <div className="flex shrink-0 items-center justify-end gap-1 px-1 pb-1">
        <button
          type="button"
          aria-label={t("widgetFrame.moveWidget")}
          className="widget-drag-handle inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded text-text-tertiary hover:bg-surface-overlay active:cursor-grabbing"
        >
          <GripVertical size={14} strokeWidth={1.75} aria-hidden />
        </button>
        {onConfigClick ? (
          <button
            type="button"
            onClick={onConfigClick}
            aria-label={t("widgetFrame.widgetSettings")}
            data-testid={testIds.dashboard.widgetConfig.open(widgetId)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-surface-overlay hover:text-text-primary"
          >
            <Settings2 size={14} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${t("widgetFrame.removeWidget")} — ${label}`}
            data-testid={testIds.dashboard.widgetRemove(widgetId)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-danger-subtle hover:text-danger"
          >
            <X size={14} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </div>
      {/* Ring hugs the card itself, not the strip, so the accent outline
          matches the widget's visible border. */}
      <div className={cn("min-h-0 flex-1 rounded-lg ring-1 ring-accent")}>{children}</div>
    </div>
  );
}
