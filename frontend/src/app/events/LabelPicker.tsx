import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";

import {
  type EventLabelBrief,
  labelTint,
  nextEventLabelColor,
  useCreateEventLabel,
  useEventLabels,
} from "@/app/events/useEventLabels";
import { testIds } from "@/lib/testids";
import { useToast } from "@/lib/toast";
import { matches as matchesFolded } from "@/lib/fold";

interface LabelPickerProps {
  selected: EventLabelBrief[];
  onChange: (labels: EventLabelBrief[]) => void;
  /** The modal's shared input classes. */
  inputCls: string;
}

/**
 * Org-shared label picker: chips for what's on the event, a filtering input
 * over the org's vocabulary, and — when nothing matches exactly — a row that
 * creates the label inline (POST, then select it) so naming a new kind of
 * meeting never means a detour into Settings.
 *
 * Label colors come from the API, so the chips are the data-driven inline
 * style exception: background = the color at 16% alpha, text = the color.
 */
export function LabelPicker({ selected, onChange, inputCls }: LabelPickerProps) {
  const { t } = useTranslation("deals");
  const toast = useToast();
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const labels = useEventLabels();
  const createLabel = useCreateEventLabel();

  const all = labels.data ?? [];
  const trimmed = query.trim();
  const selectedIds = new Set(selected.map((label) => label.id));
  const matches = all
    .filter((label) => !selectedIds.has(label.id))
    .filter((label) => matchesFolded(label.name, trimmed))
    .slice(0, 25);
  // Duplicate detection, not search — so it stays diacritic-*sensitive*. "Brána"
  // and "Brana" are two distinct labels; folding here would refuse to create the
  // second one.
  const exists = all.some((label) => label.name.trim().toLowerCase() === trimmed.toLowerCase());
  // Never offer "create" over a half-loaded vocabulary — the duplicate would
  // just come back as a 409.
  const canCreate = trimmed.length > 0 && !exists && !labels.isPending && !labels.isError;

  function pick(label: EventLabelBrief) {
    onChange([...selected, { id: label.id, name: label.name, color: label.color }]);
    setQuery("");
  }

  function remove(labelId: string) {
    onChange(selected.filter((label) => label.id !== labelId));
  }

  function create() {
    if (!canCreate || createLabel.isPending) return;
    createLabel.mutate(
      { name: trimmed, color: nextEventLabelColor(all.length) },
      {
        onSuccess: (created) => pick(created),
        onError: () => toast.error(t("eventFormModal.labelPicker.createError")),
      },
    );
  }

  const showList = open && (matches.length > 0 || canCreate || (!!trimmed && !labels.isError));

  return (
    <div className="text-sm">
      <label htmlFor={inputId} className="mb-1 block text-text-secondary">
        {t("eventFormModal.labelsLabel")}
      </label>
      {selected.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((label) => (
            <li key={label.id}>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: labelTint(label.color), color: label.color }}
              >
                {label.name}
                <button
                  type="button"
                  onClick={() => remove(label.id)}
                  data-testid={testIds.events.labelPicker.remove(label.id)}
                  aria-label={t("eventFormModal.labelPicker.remove", { name: label.name })}
                  className="opacity-70 transition-opacity duration-fast hover:opacity-100"
                >
                  <X size={12} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative">
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          data-testid={testIds.events.labelPicker.input}
          value={query}
          maxLength={50}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // The picker's Enter belongs to the picker, not the form.
              e.preventDefault();
              const first = trimmed ? matches[0] : undefined;
              if (first) pick(first);
              else create();
            } else if (e.key === "Escape" && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          placeholder={t("eventFormModal.labelPicker.placeholder")}
          className={inputCls}
        />
        {showList ? (
          <div
            id={listId}
            role="listbox"
            aria-label={t("eventFormModal.labelsLabel")}
            className="absolute left-0 right-0 z-10 mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-surface-elevated py-1 shadow-md"
          >
            {matches.map((label) => (
              <button
                key={label.id}
                type="button"
                role="option"
                aria-selected={false}
                data-testid={testIds.events.labelPicker.option(label.id)}
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
              <button
                type="button"
                data-testid={testIds.events.labelPicker.create}
                onMouseDown={(e) => e.preventDefault()}
                onClick={create}
                disabled={createLabel.isPending}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-accent transition-colors duration-fast hover:bg-surface-overlay disabled:opacity-60"
              >
                <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                <span className="truncate">
                  {createLabel.isPending
                    ? t("eventFormModal.labelPicker.creating")
                    : t("eventFormModal.labelPicker.create", { name: trimmed })}
                </span>
              </button>
            ) : null}
            {!canCreate && matches.length === 0 ? (
              <p className="px-3 py-1.5 text-xs text-text-tertiary" role="status">
                {labels.isPending
                  ? t("eventFormModal.labelPicker.loading")
                  : exists
                    ? t("eventFormModal.labelPicker.alreadyAdded")
                    : t("eventFormModal.labelPicker.noMatch")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {labels.isError ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {t("eventFormModal.labelPicker.loadError")}
        </p>
      ) : null}
      {!labels.isError && !labels.isPending && all.length === 0 && !trimmed ? (
        <p className="mt-1 text-xs text-text-tertiary">{t("eventFormModal.labelPicker.empty")}</p>
      ) : null}
    </div>
  );
}
