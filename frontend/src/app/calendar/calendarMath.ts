/**
 * Date math for the month-grid calendar. Pure functions over local dates —
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
 * 42 cells (6 weeks × 7 days), Monday-first, padded with the previous and
 * next month's days. A fixed 6-week grid keeps the layout from jumping
 * between months. `month` is 0-based like `Date`.
 */
export function monthGrid(year: number, month: number, today: Date = new Date()): CalendarDay[] {
  const first = new Date(year, month, 1);
  const offset = mondayIndex(first);
  const todayKey = dayKey(today);

  return Array.from({ length: 42 }, (_, i) => {
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
