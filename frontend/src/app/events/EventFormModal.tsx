import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useDeals } from "@/app/deals/useDeals";
import { type CalendarEventOut, useCreateEvent, useUpdateEvent } from "@/app/events/useEvents";
import { useGoogleCalendarStatus } from "@/app/settings/useGoogleCalendar";
import { testIds } from "@/lib/testids";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useModalDialog } from "@/lib/useModalDialog";
import { useToast } from "@/lib/toast";

/** Local-naive `YYYY-MM-DD` for `<input type="date">`. */
function toLocalDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local-naive `HH:MM` for `<input type="time">`. */
function toLocalTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultStart(): { date: string; start: string; end: string } {
  // Next full hour, one-hour slot — a sane default for "schedule a meeting".
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const end = new Date(d.getTime() + 60 * 60 * 1000);
  // The form composes both times with one date — clamp a midnight-crossing
  // slot (23:00 start) to 23:59 so the default passes "end after start".
  if (end.getDate() !== d.getDate()) {
    end.setTime(d.getTime());
    end.setMinutes(59);
  }
  return {
    date: toLocalDate(d.toISOString()),
    start: toLocalTime(d.toISOString()),
    end: toLocalTime(end.toISOString()),
  };
}

interface EventFormModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Create mode: the deal the event belongs to. When omitted (e.g. the
   * dashboard's "new event" quick action) the form shows a required
   * searchable deal picker instead.
   */
  dealId?: string;
  dealName?: string;
  /** Edit mode: the event being edited (wins over dealId/dealName). */
  event?: CalendarEventOut | null;
}

interface PickedDeal {
  id: string;
  name: string;
}

export function EventFormModal({ open, onClose, dealId, dealName, event }: EventFormModalProps) {
  const { t } = useTranslation("deals");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);
  const toast = useToast();
  const { data: gcal } = useGoogleCalendarStatus();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();

  const editing = !!event;
  const googleAvailable = (gcal?.connected ?? false) && !(gcal?.sync_broken ?? false);
  // Create mode without a bound deal (dashboard quick action): the user
  // must pick the deal, since events are deal-bound (`deal_id NOT NULL`).
  const needsDealPicker = !editing && !dealId;

  const [selectedDeal, setSelectedDeal] = useState<PickedDeal | null>(null);
  // Tracks the last auto-filled default title so a fresh deal pick can
  // replace it without clobbering a user-typed title.
  const lastDefaultTitleRef = useRef<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [addToGoogle, setAddToGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (event) {
      setTitle(event.title);
      setDate(toLocalDate(event.starts_at));
      setStartTime(toLocalTime(event.starts_at));
      setEndTime(toLocalTime(event.ends_at));
      setLocation(event.location ?? "");
      setDescription(event.description ?? "");
      // `error` means the user wanted the Google copy but the push failed —
      // keep the intent checked so saving retries it.
      setAddToGoogle(event.google_sync_status !== "not_synced" && googleAvailable);
    } else {
      const slot = defaultStart();
      setTitle(dealName ? t("eventFormModal.defaultTitle", { dealName }) : "");
      setDate(slot.date);
      setStartTime(slot.start);
      setEndTime(slot.end);
      setLocation("");
      setDescription("");
      setAddToGoogle(googleAvailable);
      setSelectedDeal(null);
      lastDefaultTitleRef.current = null;
    }
    // googleAvailable intentionally re-applies when the status loads while
    // the modal is open (first paint may race the status query). `t` stays
    // OUT of the deps: its identity changes on a language switch (e.g. the
    // server sync adopting another device's choice mid-edit), and re-running
    // the reset then would wipe the user's in-progress form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event, dealName, googleAvailable]);

  if (!open) return null;

  const pending = createEvent.isPending || updateEvent.isPending;

  function handleDealPick(deal: PickedDeal | null) {
    setSelectedDeal(deal);
    if (!deal) return;
    // The picked deal supplies the default title — but only over an empty
    // field or a previous auto-fill, never over the user's own text.
    const nextDefault = t("eventFormModal.defaultTitle", { dealName: deal.name });
    setTitle((prev) => {
      if (!prev.trim() || prev === lastDefaultTitleRef.current) {
        lastDefaultTitleRef.current = nextDefault;
        return nextDefault;
      }
      return prev;
    });
  }

  function notifySaved(saved: CalendarEventOut, mode: "created" | "updated") {
    const key =
      saved.google_sync_status === "error"
        ? mode === "created"
          ? "eventFormModal.toast.createdError"
          : "eventFormModal.toast.updatedError"
        : mode === "created"
          ? "eventFormModal.toast.created"
          : "eventFormModal.toast.updated";
    if (saved.google_sync_status === "error") {
      toast.error(t(key));
    } else {
      toast.success(t(key));
    }
    onClose();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const starts = new Date(`${date}T${startTime}`);
    const ends = new Date(`${date}T${endTime}`);
    if (!title.trim() || Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
      setError(t("eventFormModal.errorRequired"));
      return;
    }
    if (ends <= starts) {
      setError(t("eventFormModal.errorEndBeforeStart"));
      return;
    }

    if (editing && event) {
      updateEvent.mutate(
        {
          eventId: event.id,
          patch: {
            title: title.trim(),
            description: description.trim() || null,
            location: location.trim() || null,
            starts_at: starts.toISOString(),
            ends_at: ends.toISOString(),
            add_to_google: addToGoogle,
          },
        },
        {
          onSuccess: (saved) => notifySaved(saved, "updated"),
          onError: () => toast.error(t("eventFormModal.toast.updateError")),
        },
      );
    } else {
      const effectiveDealId = dealId ?? selectedDeal?.id;
      if (!effectiveDealId) {
        setError(t("eventFormModal.errorDealRequired"));
        return;
      }
      createEvent.mutate(
        {
          deal_id: effectiveDealId,
          title: title.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          add_to_google: addToGoogle,
        },
        {
          onSuccess: (saved) => notifySaved(saved, "created"),
          onError: () => toast.error(t("eventFormModal.toast.createError")),
        },
      );
    }
  }

  const inputCls =
    "block h-9 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm focus:border-accent focus:outline-none";

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-form-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg"
      >
        <h2 id="event-form-title" className="text-xl font-semibold">
          {editing ? t("eventFormModal.titleEdit") : t("eventFormModal.titleCreate")}
        </h2>
        {needsDealPicker ? null : (
          <p className="mt-1 text-sm text-text-tertiary">
            {t("eventFormModal.dealLabel")}{" "}
            {event ? (
              <Link
                to={`/app/deals/${event.deal_id}`}
                className="font-medium text-accent hover:text-accent-hover"
              >
                {event.deal_name}
              </Link>
            ) : (
              <span className="font-medium text-text-secondary">{dealName ?? "—"}</span>
            )}
          </p>
        )}

        <div className="mt-4 space-y-3">
          {needsDealPicker ? (
            <DealPickerField value={selectedDeal} onPick={handleDealPick} inputCls={inputCls} />
          ) : null}
          <label className="block text-sm">
            <span className="mb-1 block text-text-secondary">{t("eventFormModal.nameLabel")}</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              className={inputCls}
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-text-secondary">
                {t("eventFormModal.dateLabel")}
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className={inputCls}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-text-secondary">
                {t("eventFormModal.fromLabel")}
              </span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className={inputCls}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-text-secondary">{t("eventFormModal.toLabel")}</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className={inputCls}
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-text-secondary">
              {t("eventFormModal.locationLabel")}
            </span>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
              className={inputCls}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-text-secondary">
              {t("eventFormModal.descriptionLabel")}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="block w-full rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={addToGoogle}
              onChange={(e) => setAddToGoogle(e.target.checked)}
              disabled={!googleAvailable}
              className="mt-0.5"
            />
            <span className={googleAvailable ? "text-text-secondary" : "text-text-tertiary"}>
              {t("eventFormModal.addToGoogle")}
              {!googleAvailable ? (
                <>
                  {" — "}
                  <Link
                    to="/app/settings?tab=integrations"
                    className="underline hover:text-text-primary"
                  >
                    {t("eventFormModal.connectCalendarLink")}
                  </Link>
                </>
              ) : null}
            </span>
          </label>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("eventFormModal.cancel")}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending
              ? t("eventFormModal.saving")
              : editing
                ? t("eventFormModal.submitEdit")
                : t("eventFormModal.submitCreate")}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Required searchable deal picker for the unbound create mode. The deals
 * endpoint has no server-side search, so one page is fetched and filtered
 * client-side by deal or company name (debounced input, list capped at 25).
 * Mirrors AddDealModal's company-search UX: typing clears the selection,
 * picking fills the input with the deal's name. Mounted only while the
 * picker mode is active, so the deals query doesn't run for deal-bound
 * callers.
 */
function DealPickerField({
  value,
  onPick,
  inputCls,
}: {
  value: PickedDeal | null;
  onPick: (deal: PickedDeal | null) => void;
  inputCls: string;
}) {
  const { t } = useTranslation("deals");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 250);
  const deals = useDeals({ limit: 100 });

  const q = debounced.toLowerCase();
  const matches = q
    ? (deals.data?.items ?? [])
        .filter(
          (d) =>
            d.name.toLowerCase().includes(q) || d.company_name.toLowerCase().includes(q),
        )
        .slice(0, 25)
    : [];

  return (
    <label className="block text-sm">
      <span className="mb-1 block text-text-secondary">
        {t("eventFormModal.dealPicker.label")} <span className="text-danger">*</span>
      </span>
      <input
        type="text"
        aria-required="true"
        autoComplete="off"
        data-testid={testIds.events.dealPicker.input}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          if (value) onPick(null);
        }}
        placeholder={t("eventFormModal.dealPicker.placeholder")}
        className={inputCls}
      />
      {q && deals.isPending ? (
        <p className="mt-2 text-xs text-text-tertiary" role="status">
          {t("eventFormModal.dealPicker.loading")}
        </p>
      ) : null}
      {q && deals.isError ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {t("eventFormModal.dealPicker.loadError")}
        </p>
      ) : null}
      {q && !deals.isPending && !deals.isError && matches.length === 0 && !value ? (
        <p className="mt-2 text-xs text-text-tertiary">{t("eventFormModal.dealPicker.noMatch")}</p>
      ) : null}
      {q && matches.length > 0 && !value ? (
        <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-border bg-surface">
          {matches.map((deal) => (
            <li key={deal.id}>
              <button
                type="button"
                data-testid={testIds.events.dealPicker.option(deal.id)}
                onClick={() => {
                  onPick({ id: deal.id, name: deal.name });
                  setSearch(deal.name);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
              >
                <span className="truncate">{deal.name}</span>
                <span className="ml-2 truncate text-xs text-text-tertiary">
                  {deal.company_name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </label>
  );
}
