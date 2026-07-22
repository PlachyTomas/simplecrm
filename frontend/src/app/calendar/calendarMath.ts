/**
 * Date math for the calendar grids. Pure functions over local dates —
 * the backend stores UTC, the grid works in the browser's timezone, so all
 * bucketing here goes through local `dayKey`s.
 */

export interface CalendarDay {
  date: Date;
  /** `YYYY-MM-DD` in local time — bucket key for events. */
  key: string;
  inMonth: boolean;
  isToday: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local-timezone `YYYY-MM-DD` key for a date or ISO string. */
export function dayKey(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday-first weekday index (Mon=0 … Sun=6). */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * Adaptive Monday-first month grid: only the weeks that contain at least one
 * current-month day — 4, 5, or 6 rows (28, 35, or 42 cells) instead of a
 * fixed 42. Leading/trailing days from the neighbouring months pad the first
 * and last rows and carry `inMonth: false`. `month` is 0-based like `Date`.
 *
 * The first week always contains the 1st (the grid starts on the Monday on or
 * before it), so only the tail can be an all-next-month ghost row; trimming it
 * keeps a short month from rendering a dead sixth row that would push the grid
 * past the viewport on small laptops.
 */
export function monthGrid(year: number, month: number, today: Date = new Date()): CalendarDay[] {
  const first = new Date(year, month, 1);
  const offset = mondayIndex(first);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const todayKey = dayKey(today);

  return Array.from({ length: weeks * 7 }, (_, i) => {
    const date = new Date(year, month, 1 - offset + i);
    const key = dayKey(date);
    return {
      date,
      key,
      inMonth: date.getMonth() === month,
      isToday: key === todayKey,
    };
  });
}

/**
 * The 7 days of the Monday-first week containing `anchor`. All seven carry
 * `inMonth: true` — a week view shows one contiguous strip of days and greying
 * out the part that spills into a neighbouring month would only add visual
 * noise; the period label already states which month(s) the week spans.
 */
export function weekGrid(anchor: Date, today: Date = new Date()): CalendarDay[] {
  const offset = mondayIndex(anchor);
  const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - offset);
  const todayKey = dayKey(today);

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const key = dayKey(date);
    return {
      date,
      key,
      inMonth: true,
      isToday: key === todayKey,
    };
  });
}

/** The [from, to) instant range covering the whole visible grid. */
export function gridRange(days: CalendarDay[]): { from: string; to: string } {
  const first = days[0]!.date;
  const afterLast = new Date(days[days.length - 1]!.date);
  afterLast.setDate(afterLast.getDate() + 1);
  return { from: first.toISOString(), to: afterLast.toISOString() };
}

/** Previous/next month arithmetic that survives year boundaries. */
export function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const d = new Date(year, month + delta, 1);
  return [d.getFullYear(), d.getMonth()];
}

/** Shift a week anchor by whole weeks; survives month and year boundaries. */
export function shiftWeek(anchor: Date, delta: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + delta * 7);
}
