import { AlertTriangle, CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { EventFormModal } from "@/app/events/EventFormModal";
import { type CalendarEventOut, useDeleteEvent, useEvents } from "@/app/events/useEvents";
import { useToast } from "@/lib/toast";

interface DealEventsSectionProps {
  dealId: string;
  dealName: string;
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
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const timeFmt = new Intl.DateTimeFormat(locale, { timeStyle: "short" });
  const starts = new Date(event.starts_at);
  const ends = new Date(event.ends_at);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
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
              title="Zápis do Google kalendáře selhal — uložením události se o něj pokusíme znovu."
            >
              <AlertTriangle size={12} strokeWidth={2} aria-hidden /> Google sync selhal
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-sm text-text-tertiary">
          {dateFmt.format(starts)} – {timeFmt.format(ends)}
          {event.location ? ` · ${event.location}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Upravit událost ${event.title}`}
          className="rounded p-1.5 text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
        >
          <Pencil size={15} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Smazat událost ${event.title}`}
          className="rounded p-1.5 text-text-secondary hover:bg-danger-subtle hover:text-danger disabled:opacity-60"
        >
          <Trash2 size={15} strokeWidth={1.75} />
        </button>
      </div>
    </li>
  );
}

export function DealEventsSection({ dealId, dealName, locale }: DealEventsSectionProps) {
  const toast = useToast();
  const { data, isPending } = useEvents({ dealId });
  const deleteEvent = useDeleteEvent();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventOut | null>(null);

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
    if (!window.confirm(`Smazat událost "${event.title}"?`)) return;
    deleteEvent.mutate(event.id, {
      onSuccess: () => toast.success("Událost smazána."),
      onError: () => toast.error("Událost se nepodařilo smazat."),
    });
  }

  return (
    <section className="mt-6 rounded-lg border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-6 py-4">
        <div>
          <h2 className="text-base font-semibold">Události</h2>
          <p className="mt-0.5 text-sm text-text-tertiary">
            Schůzky a termíny k tomuto obchodu — volitelně i ve vašem Google kalendáři.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingEvent(null);
            setModalOpen(true);
          }}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90"
        >
          <CalendarPlus size={15} strokeWidth={1.75} /> Naplánovat událost
        </button>
      </header>

      {isPending ? (
        <p className="px-6 py-4 text-sm text-text-tertiary" role="status">
          Načítání…
        </p>
      ) : upcoming.length === 0 && past.length === 0 ? (
        <p className="px-6 py-4 text-sm text-text-tertiary">Zatím žádné události.</p>
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
        event={editingEvent}
      />
    </section>
  );
}
