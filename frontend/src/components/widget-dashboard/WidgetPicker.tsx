import { Check, Plus, X, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";
import { cn } from "@/lib/utils";

export interface WidgetPickerItem {
  /** Widget type key passed back to `onAdd`. */
  type: string;
  /** Resolved display label. */
  label: string;
  /** Resolved one-line description. */
  description: string;
  icon: LucideIcon;
  /** Unique widgets may appear at most once; once `added` they lock. */
  unique: boolean;
  /** Whether the widget is already on the dashboard. */
  added: boolean;
  /** Hard-disable (e.g. role-gated) — non-clickable and dimmed. */
  disabled?: boolean;
}

export interface WidgetPickerGroup {
  /** Already-resolved section heading. */
  title: string;
  items: WidgetPickerItem[];
}

interface WidgetPickerProps {
  open: boolean;
  onClose: () => void;
  groups: WidgetPickerGroup[];
  onAdd: (type: string) => void;
}

/**
 * House-pattern modal (bottom sheet on mobile, centered dialog on
 * desktop) that lists addable widgets grouped by section. Generic over
 * the catalog: the caller resolves labels/descriptions/gating and hands
 * over `groups`. Adding is fire-and-forget — the picker stays open so
 * several widgets can be added in a row; the caller closes it.
 *
 * Unique widgets that are already present lock into a non-clickable
 * "added" state (aria-disabled, kept focusable so it still announces);
 * duplicable analytics widgets never lock.
 */
export function WidgetPicker({ open, onClose, groups, onAdd }: WidgetPickerProps) {
  const { t } = useTranslation("widgets");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);
  if (!open) return null;

  const isEmpty = groups.every((g) => g.items.length === 0);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="widget-picker-title"
      data-testid={testIds.widgets.picker.modal}
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-0 backdrop-blur-sm md:items-center md:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-lg border border-border bg-surface shadow-lg md:rounded-lg">
        <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-6 py-4">
          <h1 id="widget-picker-title" className="text-lg font-semibold text-text-primary">
            {t("picker.title")}
          </h1>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("picker.close")}
            data-testid={testIds.widgets.picker.close}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-overlay hover:text-text-primary"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {isEmpty ? (
            <p className="py-8 text-center text-sm text-text-tertiary">{t("picker.empty")}</p>
          ) : (
            <div className="space-y-6">
              {groups.map((group) =>
                group.items.length === 0 ? null : (
                  <section key={group.title}>
                    <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                      {group.title}
                    </h2>
                    <ul className="space-y-2">
                      {group.items.map((item) => (
                        <li key={item.type}>
                          <WidgetPickerRow
                            item={item}
                            addedLabel={t("picker.added")}
                            onAdd={onAdd}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WidgetPickerRow({
  item,
  addedLabel,
  onAdd,
}: {
  item: WidgetPickerItem;
  addedLabel: string;
  onAdd: (type: string) => void;
}) {
  const Icon = item.icon;
  const uniqueAdded = item.unique && item.added;
  const locked = Boolean(item.disabled) || uniqueAdded;

  return (
    <button
      type="button"
      onClick={() => {
        if (!locked) onAdd(item.type);
      }}
      aria-disabled={locked || undefined}
      data-testid={testIds.widgets.picker.item(item.type)}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors duration-fast",
        locked
          ? "cursor-not-allowed border-border-subtle opacity-60"
          : "border-border bg-surface hover:border-accent hover:bg-surface-overlay",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
          locked ? "bg-surface-overlay text-text-tertiary" : "bg-accent-subtle text-accent",
        )}
      >
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-primary">{item.label}</span>
        <span className="block truncate text-xs text-text-tertiary">{item.description}</span>
      </span>
      {uniqueAdded ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
          <Check size={14} strokeWidth={1.75} aria-hidden /> {addedLabel}
        </span>
      ) : !locked ? (
        <Plus size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-tertiary" />
      ) : null}
    </button>
  );
}
