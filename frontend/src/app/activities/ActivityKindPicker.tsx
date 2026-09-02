import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { LabelColorSwatches } from "@/app/events/LabelColorSwatches";
import {
  type EventLabelBrief,
  labelTint,
  nextEventLabelColor,
  useCreateEventLabel,
  useEventLabels,
} from "@/app/events/useEventLabels";
import { useToast } from "@/lib/toast";
import { matches as matchesFolded } from "@/lib/fold";

interface ActivityKindPickerProps {
  value: EventLabelBrief | null;
  onChange: (label: EventLabelBrief | null) => void;
  /** Base id for the chip trigger (closed) and the search input (open). */
  testId: string;
}

/**
 * Single-select sibling of `LabelPicker`: a chip button for an action's
 * kind that opens into the same org-shared vocabulary (`event_labels`),
 * with diacritic-folded search and inline create. Picking a kind — or
 * creating one here — also adds it to the calendar's label list, hence the
 * `sharedHint` shown while the picker is open.
 */
export function ActivityKindPicker({ value, onChange, testId }: ActivityKindPickerProps) {
  const { t } = useTranslation("deals");
  const toast = useToast();
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [newColor, setNewColor] = useState<string | null>(null);

  const labels = useEventLabels();
  const createLabel = useCreateEventLabel();

  const all = labels.data ?? [];
  const trimmed = query.trim();
  const matches = all.filter((label) => matchesFolded(label.name, trimmed)).slice(0, 25);
  // Duplicate detection, not search — so it stays diacritic-*sensitive*. "Brána"
  // and "Brana" are two distinct labels; folding here would refuse to create the
  // second one.
  const exists = all.some((label) => label.name.trim().toLowerCase() === trimmed.toLowerCase());
  // Never offer "create" over a half-loaded vocabulary — the duplicate would
  // just come back as a 409.
  const canCreate = trimmed.length > 0 && !exists && !labels.isPending && !labels.isError;

  const createColor = newColor ?? nextEventLabelColor(all.length);

  function close() {
    setOpen(false);
    setQuery("");
    setNewColor(null);
  }

  function pick(label: EventLabelBrief | null) {
    onChange(label);
    close();
  }

  function create() {
    if (!canCreate || createLabel.isPending) return;
    createLabel.mutate(
      { name: trimmed, color: createColor },
      {
        onSuccess: (created) => pick(created),
        onError: () => toast.error(t("dealDetail.timeline.kindPicker.createError")),
      },
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={testId}
        className={
          value
            ? "inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-xs font-medium transition-opacity duration-fast hover:opacity-80"
            : // The empty chip must read as clickable — dashed outline + plus.
              "inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-border-strong px-2 text-xs font-medium text-text-secondary transition-colors duration-fast hover:border-accent hover:text-accent"
        }
        style={value ? { backgroundColor: labelTint(value.color), color: value.color } : undefined}
      >
        {value ? (
          <>
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: value.color }}
            />
            {value.name}
          </>
        ) : (
          <>
            <Plus size={12} strokeWidth={1.75} aria-hidden="true" />
            {t("dealDetail.timeline.kindPicker.clear")}
          </>
        )}
      </button>
    );
  }

  return (
    // Closing lives on the container so focus may travel to the swatches
    // (Tab) without the input's blur tearing the dropdown down.
    <div
      className="relative inline-block text-sm"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
      }}
    >
      <input
        id={inputId}
        type="text"
        autoFocus
        autoComplete="off"
        role="combobox"
        aria-expanded={true}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={t("dealDetail.timeline.kindPicker.placeholder")}
        data-testid={testId}
        value={query}
        maxLength={50}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // The picker's Enter belongs to the picker, not the surrounding row.
            e.preventDefault();
            const first = trimmed ? matches[0] : undefined;
            if (first) pick(first);
            else create();
          } else if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
        }}
        placeholder={t("dealDetail.timeline.kindPicker.placeholder")}
        className="h-9 w-40 rounded-md border border-border bg-surface px-2 text-sm text-text-primary focus:border-accent focus:outline-none"
      />
      <div
        id={listId}
        role="listbox"
        onMouseDown={(e) => e.preventDefault()}
        aria-label={t("dealDetail.timeline.kindPicker.placeholder")}
        className="absolute left-0 right-0 z-10 mt-1 max-h-48 min-w-48 overflow-y-auto rounded-md border border-border bg-surface-elevated py-1 shadow-md"
      >
        <button
          type="button"
          role="option"
          aria-selected={value === null}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(null)}
          className="flex w-full items-center px-3 py-1.5 text-left text-sm text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
        >
          {t("dealDetail.timeline.kindPicker.clear")}
        </button>
        {matches.map((label) => (
          <button
            key={label.id}
            type="button"
            role="option"
            aria-selected={value?.id === label.id}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(label)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: label.color }}
            />
            <span className="truncate">{label.name}</span>
          </button>
        ))}
        {canCreate ? (
          <>
            <button
              type="button"
              data-testid={`${testId}-create`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={create}
              disabled={createLabel.isPending}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-accent transition-colors duration-fast hover:bg-surface-overlay disabled:opacity-60"
            >
              <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate">
                {createLabel.isPending
                  ? t("dealDetail.timeline.kindPicker.creating")
                  : t("dealDetail.timeline.kindPicker.create", { name: trimmed })}
              </span>
            </button>
            <div className="px-3 py-1.5" onMouseDown={(e) => e.preventDefault()}>
              <LabelColorSwatches
                value={createColor}
                onChange={setNewColor}
                ariaLabel={t("dealDetail.timeline.kindPicker.colorAria")}
                swatchLabel={(hex) =>
                  t("dealDetail.timeline.kindPicker.swatchAria", { color: hex })
                }
                size="sm"
              />
            </div>
          </>
        ) : null}
        {!canCreate && matches.length === 0 ? (
          <p className="px-3 py-1.5 text-xs text-text-tertiary" role="status">
            {labels.isPending
              ? t("dealDetail.timeline.kindPicker.loading")
              : t("dealDetail.timeline.kindPicker.noMatch")}
          </p>
        ) : null}
      </div>
      {labels.isError ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {t("dealDetail.timeline.kindPicker.loadError")}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-text-tertiary">
        {t("dealDetail.timeline.kindPicker.sharedHint")}
      </p>
    </div>
  );
}
