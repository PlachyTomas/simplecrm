import { GripVertical, Settings2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { testIds } from "@/lib/testids";

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
 * Edit affordance for widgets that keep their own card chrome (quick actions
 * and any future bare tile — framed widgets carry `WidgetFrame` instead). In
 * view mode the child renders untouched. In edit mode the controls (drag
 * handle, optional gear, remove) sit as an absolute overlay inside the tile's
 * top-right corner so no extra height is added — the tile still fits its grid
 * box exactly. The overlay buttons get a translucent backdrop since they sit
 * over the card's own content.
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
    <div className="relative h-full">
      {children}
      <div className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-md bg-surface-elevated/90 p-0.5 shadow-sm">
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
    </div>
  );
}
