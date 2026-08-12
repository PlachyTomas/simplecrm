/**
 * The naive-local ↔ tz-aware boundary the timeline sits on.
 *
 * A `datetime-local` input speaks wall-clock time with no offset; the API
 * stores instants. Both the draft row and the entry row cross that line, and
 * getting it wrong shifts every logged action by the user's UTC offset —
 * silently, and in a way no test of a single component would catch. So the
 * conversion lives here, once, in a module of its own.
 */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * A `Date` as the `YYYY-MM-DDTHH:mm` a `datetime-local` input expects, in
 * **local** time — the only thing that control understands. `toISOString()`
 * here would show the user a clock shifted by their offset.
 */
export function toLocalInputValue(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * The inverse: a naive `YYYY-MM-DDTHH:mm` back into the instant the user
 * meant — that wall clock in their timezone. Built through the
 * multi-argument `Date` constructor, which is always local, rather than
 * `new Date(string)`, so no engine's parsing rules can quietly read it as
 * UTC. Returns `null` for a half-typed or cleared input.
 */
export function fromLocalInputValue(value: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!parts) return null;
  const [, year, month, day, hour, minute] = parts;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}
