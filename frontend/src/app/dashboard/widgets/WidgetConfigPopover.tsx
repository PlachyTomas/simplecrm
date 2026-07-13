import { useTranslation } from "react-i18next";

import { PRESET_LABEL_KEY, VISIBLE_PRESETS, type RangePreset } from "@/app/reports/dashboard/dateRange";
import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";
import { cn } from "@/lib/utils";

/** The presets a home widget may pick — the shared set minus `custom`. */
const HOME_PRESETS = VISIBLE_PRESETS.filter((p): p is Exclude<RangePreset, "custom"> => p !== "custom");

export type HomeDatePreset = (typeof HOME_PRESETS)[number];

interface WidgetConfigPopoverProps {
  open: boolean;
  onClose: () => void;
  /** Current preset; `null`/undefined is treated as the last-30-days default. */
  value: HomeDatePreset | null | undefined;
  onChange: (preset: HomeDatePreset) => void;
}

/**
 * Per-widget date-range picker, opened from the widget config gear. House
 * modal pattern (bottom sheet on mobile). Picking a preset writes it into
 * the draft and closes.
 */
export function WidgetConfigPopover({ open, onClose, value, onChange }: WidgetConfigPopoverProps) {
  const { t } = useTranslation("dashboard");
  const { t: tr } = useTranslation("reports");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);
  if (!open) return null;

  const current: HomeDatePreset = value ?? "last_30_days";

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="widget-config-title"
      data-testid={testIds.dashboard.widgetConfig.popover}
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-0 backdrop-blur-sm md:items-center md:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-t-lg border border-border bg-surface shadow-lg md:rounded-lg">
        <header className="border-b border-border-subtle px-6 py-4">
          <h1 id="widget-config-title" className="text-base font-semibold text-text-primary">
            {t("widgetConfig.title")}
          </h1>
          <p className="mt-1 text-xs text-text-tertiary">{t("widgetConfig.dateRangeLabel")}</p>
        </header>
        <ul className="p-2">
          {HOME_PRESETS.map((preset) => {
            const selected = preset === current;
            return (
              <li key={preset}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(preset);
                    onClose();
                  }}
                  aria-pressed={selected}
                  data-testid={testIds.dashboard.widgetConfig.preset(preset)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors duration-fast",
                    selected
                      ? "bg-accent-subtle font-medium text-accent"
                      : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
                  )}
                >
                  {tr(PRESET_LABEL_KEY[preset])}
                  {selected ? <span aria-hidden>✓</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
