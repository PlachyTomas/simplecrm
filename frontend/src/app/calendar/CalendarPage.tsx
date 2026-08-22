import { AlertTriangle, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  dayKey,
  gridRange,
  monthGrid,
  shiftMonth,
  shiftWeek,
  weekGrid,
  type CalendarDay,
} from "@/app/calendar/calendarMath";
import { EventFormModal } from "@/app/events/EventFormModal";
import { type CalendarEventOut, useDeleteEvent, useEvents } from "@/app/events/useEvents";
import { labelTint } from "@/app/events/useEventLabels";
import {
  useGoogleCalendarConnect,
  useGoogleCalendarStatus,
} from "@/app/settings/useGoogleCalendar";
import { useLocale } from "@/lib/i18n/useLocale";
import { testIds } from "@/lib/testids";
import { useToast } from "@/lib/toast";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";

type Zoom = "week" | "month";

/** Event chips per cell — the taller week cells fit more than the month grid. */
const MAX_CHIPS: Record<Zoom, number> = { month: 3, week: 6 };

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

/** Czech `Intl` full dates start lowercase ("středa 22. července") — as a
 * heading we want just the first letter raised, not Tailwind's per-word
 * `capitalize` ("Středa 22. Července" is wrong Czech). */
function sentenceCase(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

/** Grid chip color: tinted by the event's first label (array order = name
 * order) via inline style — a data-driven color from the API, the one
 * exception to the "no inline colors" rule. A broken Google sync still wins
 * over any label tint so failures stay visually loud. No labels → the
 * original indigo treatment. */
function chipTint(event: CalendarEventOut): { className: string; style?: CSSProperties } {
  if (event.google_sync_status === "error") {
    return { className: "bg-warning-subtle text-warning" };
  }
  const label = event.labels?.[0];
  if (label) {
    return {
      className: "hover:opacity-80",
      style: { backgroundColor: labelTint(label.color), color: label.color },
    };
  }
  return { className: "bg-accent-subtle text-accent hover:opacity-80" };
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
      {events.map((event) => {
        const attendeeCount = event.attendees?.length ?? 0;
        return (
          <li
            key={event.id}
            data-testid={testIds.calendar.dayEventRow(event.id)}
            onClick={() => onEdit(event)}
            className="-mx-2 flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md px-2 py-3 transition-colors duration-fast hover:bg-surface-overlay"
          >
            <div className="min-w-0">
              {/* The row itself opens the event; a real button underneath
                  keeps that reachable by keyboard, not just by mouse. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(event);
                }}
                className="flex flex-wrap items-center gap-2 text-left text-sm font-medium text-text-primary hover:text-accent"
              >
                <span>
                  {event.all_day
                    ? t("dayEventsList.allDay")
                    : `${timeFmt.format(new Date(event.starts_at))}–${timeFmt.format(new Date(event.ends_at))}`}
                </span>
                <span>{event.title}</span>
                {(event.labels ?? []).map((label) => (
                  <span
                    key={label.id}
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: labelTint(label.color), color: label.color }}
                  >
                    {label.name}
                  </span>
                ))}
                <SyncBadge status={event.google_sync_status} />
              </button>
              <p className="mt-0.5 text-sm text-text-tertiary">
                {/* Deal-less events are legitimate now — say so rather than
                    rendering a link to nowhere. Company is always derived via
                    the deal, so it only ever appears alongside a deal link. */}
                {event.deal_id ? (
                  <>
                    <Link
                      to={`/app/deals/${event.deal_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-accent hover:text-accent-hover"
                    >
                      {event.deal_name}
                    </Link>
                    {event.company_id ? (
                      <>
                        {" · "}
                        <Link
                          to={`/app/companies/${event.company_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-accent hover:text-accent-hover"
                        >
                          {event.company_name}
                        </Link>
                      </>
                    ) : null}
                  </>
                ) : (
                  <span>{t("calendarPage.noDeal")}</span>
                )}
                {event.location ? ` · ${event.location}` : ""}
              </p>
              {attendeeCount > 0 || event.meet_url ? (
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-text-tertiary">
                  {attendeeCount > 0 ? (
                    <span>{t("dayEventsList.attendeeCount", { count: attendeeCount })}</span>
                  ) : null}
                  {event.meet_url ? (
                    <a
                      href={event.meet_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      data-testid={testIds.calendar.dayEventMeetLink(event.id)}
                      className="text-accent hover:text-accent-hover"
                    >
                      {t("dayEventsList.meetLink")}
                    </a>
                  ) : null}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(event);
                }}
                disabled={deleting}
                aria-label={t("dayEventsList.deleteAria", { title: event.title })}
                className="rounded p-1.5 text-text-secondary hover:bg-danger-subtle hover:text-danger disabled:opacity-60"
              >
                <Trash2 size={15} strokeWidth={1.75} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CalendarPage() {
  const { t } = useTranslation("calendar");
  usePageTitle(t("calendarPage.title"));
  const toast = useToast();
  const locale = useLocale();
  const { data: gcal } = useGoogleCalendarStatus();
  const connectGoogle = useGoogleCalendarConnect();

  const today = new Date();
  const [zoom, setZoom] = useState<Zoom>("month");
  // A date inside the visible period; month arithmetic pins it to the 1st.
  const [anchor, setAnchor] = useState<Date>(today);
  const [selectedKey, setSelectedKey] = useState<string>(dayKey(today));
  const [editingEvent, setEditingEvent] = useState<CalendarEventOut | null>(null);
  const [creating, setCreating] = useState(false);

  const days = useMemo(
    () => (zoom === "week" ? weekGrid(anchor) : monthGrid(anchor.getFullYear(), anchor.getMonth())),
    [zoom, anchor],
  );
  const range = useMemo(() => gridRange(days), [days]);

  // Paging or zooming can move the visible period away from the selected
  // day; events are only fetched for the visible range, so a stale
  // selection would show a false "no events" panel. Clamp it: today when
  // visible, otherwise the period's first in-month day.
  useEffect(() => {
    if (days.some((d) => d.key === selectedKey)) return;
    const fallback = days.find((d) => d.isToday) ?? days.find((d) => d.inMonth) ?? days[0];
    if (fallback) setSelectedKey(fallback.key);
  }, [days, selectedKey]);
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
    // All-day events surface first within their day — there's no hourly
    // timeline to lay them into, so this is the whole story for "before
    // timed events". Array#sort is stable, so timed events keep their order.
    for (const bucket of map.values()) bucket.sort((a, b) => Number(b.all_day) - Number(a.all_day));
    return map;
  }, [data]);

  const monthFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
    [locale],
  );
  const rangeFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric", year: "numeric" }),
    [locale],
  );
  const dayFmt = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const periodLabel =
    zoom === "month"
      ? monthFmt.format(anchor)
      : rangeFmt.formatRange(days[0]!.date, days[days.length - 1]!.date);
  const weekdays = useMemo(() => weekdayLabels(locale), [locale]);

  const selectedEvents = eventsByDay.get(selectedKey) ?? [];
  // Agenda for mobile: in-month days that actually have events.
  const agendaDays = days.filter((d) => d.inMonth && (eventsByDay.get(d.key)?.length ?? 0) > 0);

  const googleConnected = gcal?.connected ?? false;
  const googleSyncBroken = gcal?.sync_broken ?? false;

  const modalOpen = creating || editingEvent !== null;

  function openCreate() {
    setEditingEvent(null);
    setCreating(true);
  }

  function closeModal() {
    setCreating(false);
    setEditingEvent(null);
  }

  function goPrev() {
    setAnchor((a) => {
      if (zoom === "week") return shiftWeek(a, -1);
      const [y, m] = shiftMonth(a.getFullYear(), a.getMonth(), -1);
      return new Date(y, m, 1);
    });
  }

  function goNext() {
    setAnchor((a) => {
      if (zoom === "week") return shiftWeek(a, 1);
      const [y, m] = shiftMonth(a.getFullYear(), a.getMonth(), 1);
      return new Date(y, m, 1);
    });
  }

  function goToday() {
    const now = new Date();
    setAnchor(now);
    setSelectedKey(dayKey(now));
  }

  function handleDelete(event: CalendarEventOut) {
    if (!window.confirm(t("calendarPage.deleteConfirm", { title: event.title }))) return;
    deleteEvent.mutate(event.id, {
      onSuccess: () => toast.success(t("calendarPage.deleteSuccess")),
      onError: () => toast.error(t("calendarPage.deleteError")),
    });
  }

  function dayCell(day: CalendarDay, maxChips: number, minHeight: string) {
    const events = eventsByDay.get(day.key) ?? [];
    const overflow = events.length - maxChips;
    const selected = day.key === selectedKey;
    return (
      <button
        key={day.key}
        type="button"
        onClick={() => setSelectedKey(day.key)}
        aria-label={dayFmt.format(day.date)}
        aria-pressed={selected}
        className={cn(
          "flex flex-col items-stretch gap-1 overflow-hidden rounded-md border p-1.5 text-left transition-colors",
          minHeight,
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
        {events.slice(0, maxChips).map((event) => {
          const tint = chipTint(event);
          return (
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
              title={event.deal_name ? `${event.title} — ${event.deal_name}` : event.title}
              style={tint.style}
              className={cn("truncate rounded px-1.5 py-0.5 text-xs", tint.className)}
            >
              {event.title}
            </span>
          );
        })}
        {overflow > 0 ? (
          <span className="px-1.5 text-xs text-text-tertiary">
            {t("calendarPage.moreEvents", { count: overflow })}
          </span>
        ) : null}
      </button>
    );
  }

  const weekdayHeader = (
    <div className="grid grid-cols-7 gap-1">
      {weekdays.map((label, i) => (
        <div
          key={i}
          className="px-1.5 py-1 text-center text-xs font-medium uppercase tracking-wide text-text-tertiary"
        >
          {label}
        </div>
      ))}
    </div>
  );

  const dayPanel = (
    <aside
      aria-label={t("calendarPage.dayPanelAria")}
      className={cn(
        "flex min-h-0 flex-col",
        zoom === "month"
          ? "w-80 border-l border-border lg:w-96"
          : "min-h-0 flex-1 border-t border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <h2 className="truncate text-base font-semibold">
          {sentenceCase(dayFmt.format(new Date(`${selectedKey}T12:00`)))}
        </h2>
        <button
          type="button"
          onClick={openCreate}
          data-testid={testIds.calendar.scheduleDay}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border bg-surface-overlay px-2.5 text-xs font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
        >
          <Plus size={14} strokeWidth={1.75} aria-hidden /> {t("calendarPage.scheduleDay")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {selectedEvents.length === 0 ? (
          <div className="flex flex-col items-start gap-3 py-6">
            <p className="text-sm text-text-tertiary">{t("calendarPage.noEventsDay")}</p>
            <button
              type="button"
              onClick={openCreate}
              data-testid={testIds.calendar.emptySchedule}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-text-on-accent hover:bg-accent-hover"
            >
              <Plus size={14} strokeWidth={1.75} aria-hidden /> {t("calendarPage.emptyDayCta")}
            </button>
          </div>
        ) : (
          <DayEventsList
            events={selectedEvents}
            locale={locale}
            onEdit={setEditingEvent}
            onDelete={handleDelete}
            deleting={deleteEvent.isPending}
          />
        )}
      </div>
    </aside>
  );

  return (
    // The calendar runs under AppShell's fluid layout (h-screen shell,
    // overflow-hidden main with no bottom padding), so filling the flex
    // parent — not a viewport calc — is what guarantees a scroll-free page
    // even with the trial banner mounted above.
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-6 md:overflow-hidden md:px-8 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("calendarPage.title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              aria-label={t("calendarPage.prevPeriod")}
              data-testid={testIds.calendar.prevPeriod}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-overlay text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
            >
              <ChevronLeft size={16} strokeWidth={1.75} />
            </button>
            <span className="min-w-[9.5rem] text-center text-sm font-semibold capitalize tabular-nums text-text-primary">
              {periodLabel}
            </span>
            <button
              type="button"
              onClick={goNext}
              aria-label={t("calendarPage.nextPeriod")}
              data-testid={testIds.calendar.nextPeriod}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-overlay text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
            >
              <ChevronRight size={16} strokeWidth={1.75} />
            </button>
          </div>
          <button
            type="button"
            onClick={goToday}
            data-testid={testIds.calendar.today}
            className="ml-1 inline-flex h-9 items-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("calendarPage.today")}
          </button>
          <div
            role="radiogroup"
            aria-label={t("calendarPage.zoomGroupLabel")}
            className="hidden gap-1 rounded-md border border-border bg-surface-overlay p-1 md:inline-flex"
          >
            <button
              type="button"
              role="radio"
              aria-checked={zoom === "week"}
              data-testid={testIds.calendar.zoomWeek}
              onClick={() => setZoom("week")}
              className={cn(
                "inline-flex items-center rounded px-3 py-1.5 text-xs font-medium transition-colors duration-fast",
                zoom === "week"
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {t("calendarPage.zoomWeek")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={zoom === "month"}
              data-testid={testIds.calendar.zoomMonth}
              onClick={() => setZoom("month")}
              className={cn(
                "inline-flex items-center rounded px-3 py-1.5 text-xs font-medium transition-colors duration-fast",
                zoom === "month"
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {t("calendarPage.zoomMonth")}
            </button>
          </div>
          <button
            type="button"
            onClick={openCreate}
            data-testid={testIds.calendar.newEvent}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden /> {t("calendarPage.newEvent")}
          </button>
        </div>
      </header>

      {googleConnected && googleSyncBroken ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning"
        >
          <span>{t("calendarPage.googleBroken")}</span>
          <button
            type="button"
            onClick={() => connectGoogle.mutate()}
            disabled={connectGoogle.isPending}
            data-testid={testIds.calendar.reconnect}
            className="inline-flex h-8 shrink-0 items-center rounded-md bg-accent px-3 text-xs font-medium text-text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("calendarPage.reconnect")}
          </button>
        </div>
      ) : null}

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

      {/* Desktop: master-detail. Month zoom splits horizontally (grid left,
          day panel right); week zoom stacks the single week row over a
          full-width day panel that takes the rest of the height. */}
      <div
        className={cn("hidden min-h-0 flex-1 md:flex", zoom === "week" ? "flex-col" : "flex-row")}
      >
        {zoom === "week" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {weekdayHeader}
            <div className="mt-1 min-h-0 flex-1 overflow-y-auto">
              <div className="grid grid-cols-7 gap-1">
                {days.map((day) => dayCell(day, MAX_CHIPS.week, "min-h-28"))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {weekdayHeader}
            {/* The cells carry a min-height, so on a short window six week
                rows don't fit and `auto-rows-fr` can't shrink past it. Scroll
                the grid rather than clipping the last week off the bottom of
                a page that has no scroll of its own; the weekday header and
                the toolbar above stay put. */}
            <div className="mt-1 min-h-0 flex-1 overflow-y-auto">
              <div className="grid min-h-full auto-rows-fr grid-cols-7 gap-1">
                {days.map((day) => dayCell(day, MAX_CHIPS.month, "min-h-20"))}
              </div>
            </div>
          </div>
        )}
        {dayPanel}
      </div>

      {/* Mobile: agenda list for the visible month */}
      {/* Fluid shell clamps the page height on mobile too — the agenda
          scrolls in its own region instead of the page. */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto md:hidden">
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
        open={modalOpen}
        onClose={closeModal}
        event={editingEvent}
        initialDate={creating ? selectedKey : undefined}
      />
    </div>
  );
}
