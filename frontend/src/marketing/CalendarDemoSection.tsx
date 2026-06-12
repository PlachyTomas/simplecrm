/**
 * Landing-page demo of the deal calendar + Google Calendar sync.
 *
 * Fully fake data, no API calls. The grid reuses the production month-math
 * (`app/calendar/calendarMath`) so it renders the *current* month and never
 * looks stale. Two small interactions, mirroring the real app:
 *   - click a day with a chip → its events show in the detail panel
 *   - tick "Přidat do Google kalendáře" → the first event gains the
 *     Google badge, exactly like the real event form does
 */

import { CalendarDays, CalendarPlus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { monthGrid, type CalendarDay } from "@/app/calendar/calendarMath";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

interface DemoEvent {
  id: string;
  title: string;
  deal: string;
  time: string;
  /** Offset in grid cells from today — keeps the demo inside the visible grid. */
  offset: number;
  synced: boolean;
}

const DEMO_EVENTS: DemoEvent[] = [
  // The first event's `synced` is driven by the checkbox, not this flag.
  {
    id: "e1",
    title: "Schůzka — Roční licence",
    deal: "Brno IT",
    time: "10:00",
    offset: 1,
    synced: false,
  },
  {
    id: "e2",
    title: "Demo produktu",
    deal: "Praha Studios",
    time: "13:30",
    offset: 3,
    synced: true,
  },
  {
    id: "e3",
    title: "Telefonát — nabídka",
    deal: "Ostrava Steel",
    time: "9:00",
    offset: 7,
    synced: false,
  },
];

function GoogleBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent">
      Google
    </span>
  );
}

export function CalendarDemoSection() {
  const [addToGoogle, setAddToGoogle] = useState(true);

  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => monthGrid(today.getFullYear(), today.getMonth(), today), [today]);

  // Pin demo events to grid cells relative to today so every chip is
  // always visible regardless of where in the month we are.
  const eventsByDay = useMemo(() => {
    const todayIndex = days.findIndex((d) => d.isToday);
    const map = new Map<string, DemoEvent[]>();
    for (const event of DEMO_EVENTS) {
      const cell = days[Math.min(todayIndex + event.offset, days.length - 1)]!;
      const bucket = map.get(cell.key);
      if (bucket) bucket.push(event);
      else map.set(cell.key, [event]);
    }
    return map;
  }, [days]);

  const firstEventDay = useMemo(() => {
    const todayIndex = days.findIndex((d) => d.isToday);
    return days[Math.min(todayIndex + DEMO_EVENTS[0]!.offset, days.length - 1)]!.key;
  }, [days]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const activeKey = selectedKey ?? firstEventDay;
  const selectedEvents = eventsByDay.get(activeKey) ?? [];

  const monthLabel = new Intl.DateTimeFormat("cs-CZ", {
    month: "long",
    year: "numeric",
  }).format(today);
  const dayLabel = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "full" }).format(
    new Date(`${activeKey}T12:00`),
  );

  const isSynced = (event: DemoEvent) => (event.id === "e1" ? addToGoogle : event.synced);

  function dayCell(day: CalendarDay) {
    const events = eventsByDay.get(day.key) ?? [];
    const selected = day.key === activeKey;
    return (
      <button
        key={day.key}
        type="button"
        onClick={() => setSelectedKey(day.key)}
        aria-pressed={selected}
        className={cn(
          "flex min-h-12 flex-col items-stretch gap-0.5 rounded-md border p-1 text-left transition-colors md:min-h-14",
          day.inMonth ? "bg-surface" : "bg-bg opacity-40",
          selected ? "border-accent" : "border-border-subtle hover:border-text-tertiary",
        )}
      >
        <span
          className={cn(
            "self-end rounded-full px-1 text-[11px] tabular-nums",
            day.isToday ? "bg-accent font-semibold text-text-on-accent" : "text-text-tertiary",
          )}
        >
          {day.date.getDate()}
        </span>
        {events.map((event) => (
          <span
            key={event.id}
            className={cn(
              "truncate rounded px-1 py-px text-[10px] leading-4",
              "bg-accent-subtle text-accent",
            )}
          >
            {event.title}
          </span>
        ))}
      </button>
    );
  }

  return (
    <section id="kalendar-demo" className="mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
          Kalendář + Google Calendar
        </p>
        <h2 className="mt-2 text-3xl font-bold md:text-4xl">
          Schůzky k obchodům. Na jednom místě.
        </h2>
        <p className="mt-4 text-base text-text-secondary">
          Naplánujte schůzku přímo z obchodu a sledujte ji v zabudovaném kalendáři. Když chcete,
          jedním zaškrtnutím se zapíše i do vašeho Google kalendáře.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-5">
        {/* Mock event form — the checkbox drives the Google badge */}
        <div className="rounded-lg border border-border bg-surface-overlay p-6 md:col-span-2">
          <div
            aria-hidden
            className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent-subtle text-accent"
          >
            <CalendarPlus size={20} strokeWidth={1.75} />
          </div>
          <p className="text-sm font-semibold text-text-primary">Naplánovat událost</p>
          <p className="mt-0.5 text-xs text-text-tertiary">
            Obchod: <span className="font-medium text-text-secondary">Roční licence — Brno IT</span>
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs font-medium text-text-secondary">Název</p>
              <p className="mt-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary">
                Schůzka — Roční licence
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-text-secondary">Od</p>
                <p className="mt-1 rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text-primary">
                  10:00
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary">Do</p>
                <p className="mt-1 rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text-primary">
                  11:00
                </p>
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-surface px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={addToGoogle}
                onChange={(e) => setAddToGoogle(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-text-secondary">Přidat do Google kalendáře</span>
            </label>
          </div>

          <p
            className="mt-4 inline-flex items-center gap-2 text-xs text-text-tertiary"
            aria-live="polite"
          >
            <RefreshCw size={12} strokeWidth={1.75} aria-hidden />
            {addToGoogle
              ? "Událost se zapíše i do vašeho Google kalendáře."
              : "Událost zůstane jen v SimpleCRM."}
          </p>
        </div>

        {/* Mini month calendar + day detail */}
        <div className="rounded-lg border border-border bg-surface p-4 md:col-span-3 md:p-6">
          <p className="flex items-center gap-2 text-sm font-semibold capitalize text-text-primary">
            <CalendarDays size={16} strokeWidth={1.75} aria-hidden className="text-accent" />
            {monthLabel}
          </p>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((label) => (
              <div
                key={label}
                className="px-1 py-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-text-tertiary"
              >
                {label}
              </div>
            ))}
            {days.map(dayCell)}
          </div>

          <div className="mt-4 border-t border-border-subtle pt-3">
            <p className="text-xs font-medium text-text-secondary">{dayLabel}</p>
            {selectedEvents.length === 0 ? (
              <p className="mt-2 text-sm text-text-tertiary">
                Žádné události — klikněte na den s naplánovanou schůzkou.
              </p>
            ) : (
              <ul className="mt-1 divide-y divide-border-subtle">
                {selectedEvents.map((event) => (
                  <li key={event.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-mono text-sm tabular-nums text-text-tertiary">
                      {event.time}
                    </span>
                    <span className="text-sm font-medium text-text-primary">{event.title}</span>
                    <span className="text-sm text-text-tertiary">· {event.deal}</span>
                    {isSynced(event) ? <GoogleBadge /> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
