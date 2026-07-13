import { GripVertical, Settings2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

interface WidgetFrameProps {
  label: string;
  isEditMode: boolean;
  onRemove?: () => void;
  onConfigClick?: () => void;
  /** Optional right-side header slot — per-widget controls (e.g. metric picker). */
  controls?: ReactNode;
  /** Body. Pass the loading/empty/error variant when needed. */
  children: ReactNode;
  /** Class hook so the parent grid item can position drag-handles consistently. */
  className?: string;
}

/**
 * Shared shell for every Reports widget. Header carries the label, an
 * optional gear button for the per-widget config sheet (only when
 * `onConfigClick` is provided), and — in edit mode — a drag handle on
 * the left and an X on the right. The drag handle gets the
 * `widget-drag-handle` class so `react-grid-layout` only initiates a
 * drag from that exact element rather than the whole card.
 */
export function WidgetFrame({
  label,
  isEditMode,
  onRemove,
  onConfigClick,
  controls,
  children,
  className,
}: WidgetFrameProps) {
  const { t } = useTranslation("reports");
  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-lg border bg-surface shadow-sm transition-colors",
        isEditMode ? "border-dashed border-accent" : "border-border",
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5">
        {isEditMode ? (
          <button
            type="button"
            aria-label={t("widgetFrame.moveWidget")}
            className="widget-drag-handle inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded text-text-tertiary hover:bg-surface-overlay active:cursor-grabbing"
          >
            <GripVertical size={14} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
        <h3 className="flex-1 truncate text-sm font-semibold text-text-primary">{label}</h3>
        {controls}
        {onConfigClick ? (
          <button
            type="button"
            onClick={onConfigClick}
            aria-label={t("widgetFrame.widgetSettings")}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-surface-overlay hover:text-text-primary"
          >
            <Settings2 size={14} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
        {isEditMode && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("widgetFrame.removeWidget")}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-danger-subtle hover:text-danger"
          >
            <X size={14} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 px-4 py-3">{children}</div>
    </article>
  );
}

/** Loading skeleton used by every widget while its query resolves. */
export function WidgetSkeleton() {
  const { t } = useTranslation("reports");
  return (
    <div
      role="status"
      aria-label={t("widgetFrame.loading")}
      className="flex h-full flex-col justify-center gap-3"
    >
      <div className="h-3 w-24 animate-pulse rounded bg-surface-overlay" />
      <div className="h-8 w-32 animate-pulse rounded bg-surface-overlay" />
      <div className="h-3 w-40 animate-pulse rounded bg-surface-overlay" />
    </div>
  );
}

/** Inline error card. Per spec: never a toast — widget errors must not stack. */
export function WidgetError({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation("reports");
  return (
    <div className="flex h-full flex-col items-start justify-center gap-2 text-sm">
      <p className="text-text-primary">{t("widgetFrame.loadError")}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-medium text-accent hover:underline"
        >
          {t("widgetFrame.retry")}
        </button>
      ) : null}
    </div>
  );
}

/** Empty body — used when a widget computes successfully but has no rows. */
export function WidgetEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-center text-xs text-text-tertiary">
      {message}
    </div>
  );
}
