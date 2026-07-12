import { AlertTriangle, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  dayKey,
  gridRange,
  monthGrid,
  shiftMonth,
  type CalendarDay,
} from "@/app/calendar/calendarMath";
import { EventFormModal } from "@/app/events/EventFormModal";
import { type CalendarEventOut, useDeleteEvent, useEvents } from "@/app/events/useEvents";
import { useLocale } from "@/lib/i18n/useLocale";
import { useToast } from "@/lib/toast";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";

const MAX_CHIPS = 3;

/**
 * Short weekday labels for the grid header, via `Intl` off a known Monday —
 * localized automatically with the app language, no literals in catalogs.
 */
function weekdayLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const monday = new Date(Date.UTC(2024, 0, 1)); // 2024-01-01 was a Monday (UTC)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return fmt.format(d);
  });
}

function SyncBadge({ status }: { status: CalendarEventOut["google_sync_status"] }) {
  const { t } = useTranslation("calendar");
  if (status === "synced") {
    return (
      <span className="inline-flex items-center rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent">
        {t("syncBadge.synced")}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning"
        title={t("syncBadge.errorTitle")}
      >
        <AlertTriangle size={12} strokeWidth={2} aria-hidden /> {t("syncBadge.errorLabel")}
      </span>
    );
  }
  return null;
}

function DayEventsList({
  events,
  locale,
  onEdit,
  onDelete,
  deleting,
}: {
  events: CalendarEventOut[];
  locale: string;
  onEdit: (event: CalendarEventOut) => void;
  onDelete: (event: CalendarEventOut) => void;
  deleting: boolean;
}) {
  const { t } = useTranslation("calendar");
  const timeFmt = new Intl.DateTimeFormat(locale, { timeStyle: "short" });
  return (
    <ul className="divide-y divide-border-subtle">
      {events.map((event) => (
        <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
              {timeFmt.format(new Date(event.starts_at))}–{timeFmt.format(new Date(event.ends_at))}
              <span>{event.title}</span>
              <SyncBadge status={event.google_sync_status} />
            </p>
            <p className="mt-0.5 text-sm text-text-tertiary">
              <Link
                to={`/app/deals/${event.deal_id}`}
                className="text-accent hover:text-accent-hover"
              >
                {event.deal_name}
              </Link>
              {event.location ? ` · ${event.location}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(event)}
              aria-label={t("dayEventsList.editAria", { title: event.title })}
              className="rounded p-1.5 text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
            >
              <Pencil size={15} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(event)}
              disabled={deleting}
              aria-label={t("dayEventsList.deleteAria", { title: event.title })}
              className="rounded p-1.5 text-text-secondary hover:bg-danger-subtle hover:text-danger disabled:opacity-60"
            >
              <Trash2 size={15} strokeWidth={1.75} />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CalendarPage() {
  const { t } = useTranslation("calendar");
  usePageTitle(t("calendarPage.title"));
  const toast = useToast();
  const locale = useLocale();

  const today = new Date();
  const [[year, month], setYearMonth] = useState<[number, number]>([
    today.getFullYear(),
    today.getMonth(),
  ]);
  const [selectedKey, setSelectedKey] = useState<string>(dayKey(today));
  const [editingEvent, setEditingEvent] = useState<CalendarEventOut | null>(null);

  const days = useMemo(() => monthGrid(year, month), [year, month]);
  const range = useMemo(() => gridRange(days), [days]);
  const { data, isPending, isError } = useEvents({ from: range.from, to: range.to });
  const deleteEvent = useDeleteEvent();

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEventOut[]>();
    for (const event of data?.items ?? []) {
      const key = dayKey(event.starts_at);
      const bucket = map.get(key);
      if (bucket) bucket.push(event);
      else map.set(key, [event]);
    }
    return map;
  }, [data]);

  const monthFmt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const dayFmt = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const monthLabel = monthFmt.format(new Date(year, month, 1));
  const weekdays = useMemo(() => weekdayLabels(locale), [locale]);

  const selectedEvents = eventsByDay.get(selectedKey) ?? [];
  // Agenda for mobile: in-month days that actually have events.
  const agendaDays = days.filter((d) => d.inMonth && (eventsByDay.get(d.key)?.length ?? 0) > 0);

  function goToday() {
    const now = new Date();
    setYearMonth([now.getFullYear(), now.getMonth()]);
    setSelectedKey(dayKey(now));
  }

  function handleDelete(event: CalendarEventOut) {
    if (!window.confirm(t("calendarPage.deleteConfirm", { title: event.title }))) return;
    deleteEvent.mutate(event.id, {
      onSuccess: () => toast.success(t("calendarPage.deleteSuccess")),
      onError: () => toast.error(t("calendarPage.deleteError")),
    });
  }

  function dayCell(day: CalendarDay) {
    const events = eventsByDay.get(day.key) ?? [];
    const overflow = events.length - MAX_CHIPS;
    const selected = day.key === selectedKey;
    return (
      <button
        key={day.key}
        type="button"
        onClick={() => setSelectedKey(day.key)}
        aria-label={dayFmt.format(day.date)}
        aria-pressed={selected}
        className={cn(
          "flex min-h-24 flex-col items-stretch gap-1 rounded-md border p-1.5 text-left transition-colors",
          day.inMonth ? "bg-surface" : "bg-bg opacity-50",
          selected ? "border-accent" : "border-border-subtle hover:border-text-tertiary",
        )}
      >
        <span
          className={cn(
            "self-end rounded-full px-1.5 text-xs tabular-nums",
            day.isToday ? "bg-accent font-semibold text-text-on-accent" : "text-text-tertiary",
          )}
        >
          {day.date.getDate()}
        </span>
        {events.slice(0, MAX_CHIPS).map((event) => (
          <span
            key={event.id}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setEditingEvent(event);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                setEditingEvent(event);
              }
            }}
            title={`${event.title} — ${event.deal_name}`}
            className={cn(
              "truncate rounded px-1.5 py-0.5 text-xs",
              event.google_sync_status === "error"
                ? "bg-warning-subtle text-warning"
                : "bg-accent-subtle text-accent hover:opacity-80",
            )}
          >
            {event.title}
          </span>
        ))}
        {overflow > 0 ? (
          <span className="px-1.5 text-xs text-text-tertiary">
            {t("calendarPage.moreEvents", { count: overflow })}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold capitalize">{monthLabel}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setYearMonth(([y, m]) => shiftMonth(y, m, -1))}
            aria-label={t("calendarPage.prevMonth")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-overlay text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
          >
            <ChevronLeft size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="inline-flex h-9 items-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("calendarPage.today")}
          </button>
          <button
            type="button"
            onClick={() => setYearMonth(([y, m]) => shiftMonth(y, m, 1))}
            aria-label={t("calendarPage.nextMonth")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-overlay text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
          >
            <ChevronRight size={16} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {isPending ? (
        <p className="text-sm text-text-tertiary" role="status">
          {t("calendarPage.loading")}
        </p>
      ) : null}

      {isError ? (
        <p
          className="rounded-md border border-danger-subtle bg-danger-subtle px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {t("calendarPage.loadError")}
        </p>
      ) : null}

      {/* Desktop: month grid + selected-day detail */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-1">
          {weekdays.map((label, i) => (
            <div
              key={i}
              className="px-1.5 py-1 text-center text-xs font-medium uppercase tracking-wide text-text-tertiary"
            >
              {label}
            </div>
          ))}
          {days.map(dayCell)}
        </div>

        <section className="mt-6 rounded-lg border border-border bg-surface px-6 py-4">
          <h2 className="text-base font-semibold">
            {dayFmt.format(new Date(`${selectedKey}T12:00`))}
          </h2>
          {selectedEvents.length === 0 ? (
            <p className="mt-2 text-sm text-text-tertiary">{t("calendarPage.noEventsDay")}</p>
          ) : (
            <DayEventsList
              events={selectedEvents}
              locale={locale}
              onEdit={setEditingEvent}
              onDelete={handleDelete}
              deleting={deleteEvent.isPending}
            />
          )}
        </section>
      </div>

      {/* Mobile: agenda list for the visible month */}
      <div className="space-y-4 md:hidden">
        {agendaDays.length === 0 && !isPending ? (
          <p className="text-sm text-text-tertiary">{t("calendarPage.noEventsMonth")}</p>
        ) : (
          agendaDays.map((day) => (
            <section key={day.key} className="rounded-lg border border-border bg-surface px-4 py-3">
              <h2
                className={cn(
                  "text-sm font-semibold",
                  day.isToday ? "text-accent" : "text-text-primary",
                )}
              >
                {dayFmt.format(day.date)}
              </h2>
              <DayEventsList
                events={eventsByDay.get(day.key) ?? []}
                locale={locale}
                onEdit={setEditingEvent}
                onDelete={handleDelete}
                deleting={deleteEvent.isPending}
              />
            </section>
          ))
        )}
      </div>

      <EventFormModal
        open={editingEvent !== null}
        onClose={() => setEditingEvent(null)}
        event={editingEvent}
      />
    </div>
  );
}
