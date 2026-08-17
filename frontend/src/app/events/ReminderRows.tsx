import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";

import type { EventReminder } from "@/app/events/useEvents";
import { testIds } from "@/lib/testids";

/** The backend caps the list at five (`max_length=5`). */
const MAX_REMINDERS = 5;

/** Google Calendar's own bound: up to four weeks before the event. */
const MAX_MINUTES = 40320;

const MINUTE_PRESETS = [
  { minutes: 0, labelKey: "eventFormModal.reminders.minutes.atStart" },
  { minutes: 5, labelKey: "eventFormModal.reminders.minutes.m5" },
  { minutes: 10, labelKey: "eventFormModal.reminders.minutes.m10" },
  { minutes: 30, labelKey: "eventFormModal.reminders.minutes.m30" },
  { minutes: 60, labelKey: "eventFormModal.reminders.minutes.m60" },
  { minutes: 1440, labelKey: "eventFormModal.reminders.minutes.d1" },
] as const;

const CUSTOM_VALUE = "custom";

const DEFAULT_REMINDER: EventReminder = { method: "popup", minutes: 30 };

function isPreset(minutes: number): boolean {
  return MINUTE_PRESETS.some((preset) => preset.minutes === minutes);
}

interface ReminderRowsProps {
  value: EventReminder[];
  onChange: (reminders: EventReminder[]) => void;
  /** The modal's shared input classes. */
  inputCls: string;
}

/**
 * Up to five "remind me" rows — a lead time and a delivery method each,
 * mirroring what Google Calendar accepts as reminder overrides. Besides the
 * presets a row can hold any lead time in minutes.
 */
export function ReminderRows({ value, onChange, inputCls }: ReminderRowsProps) {
  const { t } = useTranslation("deals");
  const nextRowIdRef = useRef(0);
  const [rowIds, setRowIds] = useState<number[]>([]);
  // Rows the user switched to a free-form lead time. Deriving that from an
  // off-preset value alone would yank the input away mid-typing at "30".
  const [customRowIds, setCustomRowIds] = useState<number[]>([]);

  if (rowIds.length !== value.length) {
    // The form replaced the whole list (open/prefill/reset) — mint fresh keys.
    setRowIds(value.map(() => nextRowIdRef.current++));
  }

  function update(index: number, patch: Partial<EventReminder>) {
    onChange(value.map((reminder, i) => (i === index ? { ...reminder, ...patch } : reminder)));
  }

  function add() {
    setRowIds([...rowIds, nextRowIdRef.current++]);
    onChange([...value, DEFAULT_REMINDER]);
  }

  function remove(index: number) {
    setRowIds(rowIds.filter((_, i) => i !== index));
    onChange(value.filter((_, i) => i !== index));
  }

  function pickMinutes(index: number, rowId: number, selected: string) {
    if (selected === CUSTOM_VALUE) {
      setCustomRowIds([...customRowIds, rowId]);
      return;
    }
    setCustomRowIds(customRowIds.filter((id) => id !== rowId));
    update(index, { minutes: Number(selected) });
  }

  return (
    <div className="text-sm">
      <span className="mb-1 block text-text-secondary">{t("eventFormModal.reminders.title")}</span>
      {value.length > 0 ? (
        <ul className="mb-2 space-y-2">
          {value.map((reminder, index) => {
            const rowId = rowIds[index] ?? index;
            const custom = customRowIds.includes(rowId) || !isPreset(reminder.minutes);
            return (
              <li
                key={rowId}
                data-testid={testIds.events.reminders.row(index)}
                className="flex items-center gap-2"
              >
                <select
                  value={custom ? CUSTOM_VALUE : String(reminder.minutes)}
                  onChange={(e) => pickMinutes(index, rowId, e.target.value)}
                  data-testid={testIds.events.reminders.minutes(index)}
                  aria-label={t("eventFormModal.reminders.minutesLabel")}
                  className={`${inputCls} text-text-primary`}
                >
                  {MINUTE_PRESETS.map((preset) => (
                    <option key={preset.minutes} value={String(preset.minutes)}>
                      {t(preset.labelKey)}
                    </option>
                  ))}
                  <option value={CUSTOM_VALUE}>{t("eventFormModal.reminders.custom")}</option>
                </select>
                {custom ? (
                  <input
                    type="number"
                    min={0}
                    max={MAX_MINUTES}
                    step={1}
                    value={reminder.minutes}
                    onChange={(e) =>
                      update(index, { minutes: clampMinutes(e.target.value, reminder.minutes) })
                    }
                    data-testid={testIds.events.reminders.customMinutes(index)}
                    aria-label={t("eventFormModal.reminders.customLabel")}
                    className={`${inputCls} tabular-nums text-text-primary`}
                  />
                ) : null}
                <select
                  value={reminder.method}
                  onChange={(e) =>
                    update(index, { method: e.target.value as EventReminder["method"] })
                  }
                  data-testid={testIds.events.reminders.method(index)}
                  aria-label={t("eventFormModal.reminders.methodLabel")}
                  className={`${inputCls} text-text-primary`}
                >
                  <option value="popup">{t("eventFormModal.reminders.method.popup")}</option>
                  <option value="email">{t("eventFormModal.reminders.method.email")}</option>
                </select>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  data-testid={testIds.events.reminders.remove(index)}
                  aria-label={t("eventFormModal.reminders.remove")}
                  className="shrink-0 rounded-md p-1.5 text-text-tertiary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
                >
                  <X size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <button
        type="button"
        onClick={add}
        disabled={value.length >= MAX_REMINDERS}
        data-testid={testIds.events.reminders.add}
        className="inline-flex items-center gap-1.5 text-sm text-accent transition-colors duration-fast hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
        {t("eventFormModal.reminders.add")}
      </button>
      <p className="mt-1 text-xs text-text-tertiary">{t("eventFormModal.reminders.hint")}</p>
    </div>
  );
}

function clampMinutes(raw: string, fallback: number): number {
  if (raw === "") return 0;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(MAX_MINUTES, Math.max(0, Math.trunc(parsed)));
}
