/**
 * Pure logic behind the event form's Google-style time comboboxes.
 *
 * The form composes both times with ONE date field, so everything here is
 * minutes-since-local-midnight — no `Date` arithmetic, no timezone. Values
 * cross the boundary as local-naive `HH:MM` strings, exactly what the form
 * state and `new Date(`${date}T${time}`)` already speak.
 *
 * Kept free of React so the picker's behaviour (loose parsing, the end
 * window, duration hints, the shift that preserves a slot's length) is unit
 * testable without rendering the modal.
 */

import { formatDate } from "@/lib/format";

/** Suggestion granularity — Google Calendar's quarter hour. */
export const STEP_MINUTES = 15;
/** Last suggestion offered in a day; later times stay typeable. */
export const LAST_OPTION_MINUTES = 23 * 60 + 45;
/** Hard end of the local day — a shifted end clamps here, never past midnight. */
export const DAY_END_MINUTES = 23 * 60 + 59;

export interface TimeOption {
  /** Local-naive `HH:MM` — the form's state format. */
  value: string;
  /** Minutes since local midnight. */
  minutes: number;
  /** End options only: distance from the current start. */
  durationMinutes?: number;
}

/** `"09:30"` → `570`; anything malformed or out of range → `null`. */
export function minutesFromHHMM(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** `570` → `"09:30"`, clamped into the day. */
export function hhmmFromMinutes(minutes: number): string {
  const clamped = Math.max(0, Math.min(DAY_END_MINUTES, Math.round(minutes)));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

/**
 * Loose parse of whatever the user typed, Google-style: `9` → `09:00`,
 * `9:30` / `9.30` / `9,30` / `9 30` / `9h30` → `09:30`, `930` → `09:30`,
 * `1415` → `14:15`. Returns `null` when it isn't a time at all, which the
 * combobox treats as "revert to the previous value".
 */
export function parseTimeInput(raw: string): string | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  const separated = /^(\d{1,2})\s*[:.,h]\s*(\d{1,2})$/.exec(text);
  if (separated) {
    const [, hours = "", minutes = ""] = separated;
    return build(Number(hours), Number(minutes));
  }

  const hourOnly = /^(\d{1,2})\s*h?$/.exec(text);
  if (hourOnly) {
    const [, hours = ""] = hourOnly;
    return build(Number(hours), 0);
  }

  const compact = /^(\d{3,4})$/.exec(text);
  if (compact) {
    const [, digits = ""] = compact;
    return build(Number(digits.slice(0, digits.length - 2)), Number(digits.slice(-2)));
  }
  return null;

  function build(hours: number, minutes: number): string | null {
    if (hours > 23 || minutes > 59) return null;
    return hhmmFromMinutes(hours * 60 + minutes);
  }
}

/** `"09:05"` → `"09:05"` (cs) — locale-shaped clock text for display. */
export function formatTimeLabel(value: string, locale: string): string {
  const minutes = minutesFromHHMM(value);
  if (minutes === null) return value;
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return formatDate(date, locale, { hour: "2-digit", minute: "2-digit" });
}

const durationFormats = new Map<string, Intl.NumberFormat>();

function durationFormat(locale: string, unit: "minute" | "hour"): Intl.NumberFormat {
  const key = `${locale}|${unit}`;
  let fmt = durationFormats.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: "unit",
      unit,
      unitDisplay: "short",
      maximumFractionDigits: 2,
    });
    durationFormats.set(key, fmt);
  }
  return fmt;
}

/** `30` → `"30 min"`, `60` → `"1 h"`, `90` → `"1,5 h"` (cs) — via `Intl`, no catalog strings. */
export function formatDuration(minutes: number, locale: string): string {
  if (minutes < 60) return durationFormat(locale, "minute").format(minutes);
  return durationFormat(locale, "hour").format(minutes / 60);
}

/**
 * Inserts `current` into an ascending option list when the stored time sits
 * off the quarter-hour grid (an imported 09:37 meeting must still render and
 * stay selected instead of silently snapping).
 */
function withCurrent(options: TimeOption[], current: string, startMinutes?: number): TimeOption[] {
  const minutes = minutesFromHHMM(current);
  if (minutes === null) return options;
  if (options.some((o) => o.minutes === minutes)) return options;
  if (startMinutes !== undefined && minutes <= startMinutes) return options;
  const extra: TimeOption =
    startMinutes === undefined
      ? { value: hhmmFromMinutes(minutes), minutes }
      : { value: hhmmFromMinutes(minutes), minutes, durationMinutes: minutes - startMinutes };
  const at = options.findIndex((o) => o.minutes > minutes);
  if (at === -1) return [...options, extra];
  return [...options.slice(0, at), extra, ...options.slice(at)];
}

/** Every quarter hour of the day, plus an off-grid current value. */
export function buildStartOptions(current: string): TimeOption[] {
  const options: TimeOption[] = [];
  for (let m = 0; m <= LAST_OPTION_MINUTES; m += STEP_MINUTES) {
    options.push({ value: hhmmFromMinutes(m), minutes: m });
  }
  return withCurrent(options, current);
}

/**
 * End suggestions: start + 15 min up to 23:45, each carrying the slot length
 * so the picker can print "(30 min)" / "(1 h)" next to the clock time. An
 * off-grid current end stays in the list too.
 */
export function buildEndOptions(start: string, current: string): TimeOption[] {
  const startMinutes = minutesFromHHMM(start);
  if (startMinutes === null) return buildStartOptions(current);
  const options: TimeOption[] = [];
  for (let m = startMinutes + STEP_MINUTES; m <= LAST_OPTION_MINUTES; m += STEP_MINUTES) {
    options.push({
      value: hhmmFromMinutes(m),
      minutes: m,
      durationMinutes: m - startMinutes,
    });
  }
  return withCurrent(options, current, startMinutes);
}

/**
 * Narrows a suggestion list to what the user is typing, comparing digits
 * only: `9` keeps 09:00–09:45, `93` keeps 09:30, `15` keeps 15:00–15:45.
 */
export function filterTimeOptions(options: TimeOption[], query: string): TimeOption[] {
  const digits = query.replace(/\D/g, "");
  if (!digits) return options;
  return options.filter((option) => {
    const compact = option.value.replace(":", "");
    const unpadded = compact.startsWith("0") ? compact.slice(1) : null;
    return compact.startsWith(digits) || (unpadded !== null && unpadded.startsWith(digits));
  });
}

/**
 * Moving the start drags the end along, keeping the slot exactly as long as
 * the user made it — clamped to 23:59 because the form has a single date and
 * an event may not cross midnight. Moving the END never calls this.
 */
export function shiftEndPreservingDuration(
  previousStart: string,
  previousEnd: string,
  nextStart: string,
): string {
  const from = minutesFromHHMM(previousStart);
  const to = minutesFromHHMM(previousEnd);
  const next = minutesFromHHMM(nextStart);
  if (from === null || to === null || next === null) return previousEnd;
  const duration = to > from ? to - from : STEP_MINUTES;
  return hhmmFromMinutes(Math.min(next + duration, DAY_END_MINUTES));
}
