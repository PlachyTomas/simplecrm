import { AlertTriangle, CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { EventFormModal } from "@/app/events/EventFormModal";
import { type CalendarEventOut, useDeleteEvent, useEvents } from "@/app/events/useEvents";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ChevronDown } from "lucide-react";
import { testIds } from "@/lib/testids";
import { useToast } from "@/lib/toast";

interface DealEventsSectionProps {
  dealId: string;
  dealName: string;
  /** The deal's company — its contacts lead the event form's attendee picker. */
  companyId?: string | null;
  locale: string;
}

function EventRow({
  event,
  locale,
  onEdit,
  onDelete,
  deleting,
  past,
}: {
  event: CalendarEventOut;
  locale: string;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
  past: boolean;
}) {
  const { t } = useTranslation("deals");
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const timeFmt = new Intl.DateTimeFormat(locale, { timeStyle: "short" });
  // All-day events are stored at UTC midnight — a local-time read would show
  // the previous day west of Greenwich, so the date-only line reads UTC.
  const allDayDateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const starts = new Date(event.starts_at);
  const ends = new Date(event.ends_at);
  const attendeeCount = event.attendees?.length ?? 0;

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className={past ? "opacity-60" : undefined}>
        <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
          {event.title}
          {event.google_sync_status === "synced" ? (
            <span className="inline-flex items-center rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent">
              Google
            </span>
          ) : null}
          {event.google_sync_status === "error" ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning"
              title={t("eventsSection.googleSyncErrorTooltip")}
            >
              <AlertTriangle size={12} strokeWidth={2} aria-hidden />{" "}
              {t("eventsSection.googleSyncFailed")}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-sm text-text-tertiary">
          {event.all_day
            ? `${allDayDateFmt.format(starts)} · ${t("eventsSection.allDayLabel")}`
            : `${dateFmt.format(starts)} – ${timeFmt.format(ends)}`}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        {attendeeCount > 0 || event.meet_url ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-text-tertiary">
            {attendeeCount > 0 ? (
              <span>{t("eventsSection.attendeeCount", { count: attendeeCount })}</span>
            ) : null}
            {event.meet_url ? (
              <a
                href={event.meet_url}
                target="_blank"
                rel="noreferrer"
                data-testid={testIds.events.dealSectionMeetLink(event.id)}
                className="text-accent hover:text-accent-hover"
              >
                {t("eventsSection.meetLink")}
              </a>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          aria-label={t("eventsSection.editAriaLabel", { title: event.title })}
          className="rounded p-1.5 text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
        >
          <Pencil size={15} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={t("eventsSection.deleteAriaLabel", { title: event.title })}
          className="rounded p-1.5 text-text-secondary hover:bg-danger-subtle hover:text-danger disabled:opacity-60"
        >
          <Trash2 size={15} strokeWidth={1.75} />
        </button>
      </div>
    </li>
  );
}

export function DealEventsSection({ dealId, dealName, companyId, locale }: DealEventsSectionProps) {
  const { t } = useTranslation("deals");
  const toast = useToast();
  const { data, isPending } = useEvents({ dealId });
  const [expanded, setExpanded] = useState(false);
  const deleteEvent = useDeleteEvent();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEventOut | null>(null);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const items = data?.items ?? [];
    return {
      upcoming: items.filter((e) => new Date(e.ends_at).getTime() >= now),
      // Most recent past event first — mirror reading order of a timeline.
      past: items.filter((e) => new Date(e.ends_at).getTime() < now).reverse(),
    };
  }, [data]);

  function handleDelete(event: CalendarEventOut) {
    setDeleteTarget(event);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteEvent.mutate(deleteTarget.id, {
      onSuccess: () => toast.success(t("eventsSection.toastDeleted")),
      onError: () => toast.error(t("eventsSection.toastDeleteError")),
      onSettled: () => setDeleteTarget(null),
    });
  }

  const count = data?.items.length ?? 0;

  return (
    <section className="mt-4 rounded-lg border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
        {/* Collapsed by default so a typical deal fits the viewport —
            the count keeps the section glanceable without expanding. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="min-w-0 text-left"
        >
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              aria-hidden
              className={expanded ? "" : "-rotate-90"}
            />
            {t("eventsSection.title")}
            {!isPending ? <span className="font-normal text-text-tertiary">({count})</span> : null}
          </h2>
          {expanded ? (
            <p className="mt-0.5 text-sm text-text-tertiary">{t("eventsSection.subtitle")}</p>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditingEvent(null);
            setModalOpen(true);
          }}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90"
        >
          <CalendarPlus size={15} strokeWidth={1.75} /> {t("eventsSection.scheduleButton")}
        </button>
      </header>

      {!expanded ? null : isPending ? (
        <p className="px-4 py-3 text-sm text-text-tertiary" role="status">
          {t("eventsSection.loading")}
        </p>
      ) : upcoming.length === 0 && past.length === 0 ? (
        <p className="px-4 py-3 text-sm text-text-tertiary">{t("eventsSection.empty")}</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {upcoming.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              locale={locale}
              past={false}
              deleting={deleteEvent.isPending}
              onEdit={() => {
                setEditingEvent(event);
                setModalOpen(true);
              }}
              onDelete={() => handleDelete(event)}
            />
          ))}
          {past.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              locale={locale}
              past
              deleting={deleteEvent.isPending}
              onEdit={() => {
                setEditingEvent(event);
                setModalOpen(true);
              }}
              onDelete={() => handleDelete(event)}
            />
          ))}
        </ul>
      )}

      <EventFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        dealId={dealId}
        dealName={dealName}
        companyId={companyId}
        event={editingEvent}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("eventsSection.confirmDeleteTitle")}
        body={deleteTarget ? t("eventsSection.confirmDelete", { title: deleteTarget.title }) : ""}
        confirmLabel={t("eventsSection.confirmDeleteAction")}
        danger
        pending={deleteEvent.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
