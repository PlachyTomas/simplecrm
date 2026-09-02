import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ActivityKindPicker } from "@/app/activities/ActivityKindPicker";
import { ActivityRow, type ActivityItem } from "@/app/activities/ActivityRow";
import {
  type UpdateActivityPatch,
  useDeleteActivity,
  useUpdateActivity,
} from "@/app/activities/useActivityEdit";
import type { ActivitiesPage, ActivityOut } from "@/app/activities/useActivities";
import { fromLocalInputValue, toLocalInputValue } from "@/app/deals/timelineTime";
import type { EventLabelBrief } from "@/app/events/useEventLabels";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { testIds } from "@/lib/testids";
import { useToast } from "@/lib/toast";

/** Autosave delay while the user is still typing. */
const TYPING_DEBOUNCE_MS = 800;
/** How long the quiet "Uloženo" stays in the meta line. */
const SAVED_NOTICE_MS = 2000;

interface TimelineEntryRowProps {
  activity: ActivityItem;
  /** Passed through to the read-only path for rows the caller can't edit. */
  onOpenEmail?: (emailId: string) => void;
}

/**
 * One hand-logged timeline entry, editable in place.
 *
 * Rows the caller may not touch (`can_edit === false`) fall through to the
 * shared read-only `ActivityRow` — the audit trail and the user's own log
 * live in the same list and must read the same.
 */
export function TimelineEntryRow({ activity, onOpenEmail }: TimelineEntryRowProps) {
  if (!activity.can_edit) {
    return <ActivityRow activity={activity} hideDealName marker="line" onOpenEmail={onOpenEmail} />;
  }
  return <EditableEntry activity={activity} />;
}

/**
 * The editable half. Every field saves itself — text on blur and on a pause
 * in typing, kind and time the moment they change — so there is no Save
 * button anywhere. Writes land in the `["activities"]` caches immediately
 * and are rolled back with a toast if the server disagrees.
 */
function EditableEntry({ activity }: { activity: ActivityItem }) {
  const { t } = useTranslation("deals");
  const locale = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const update = useUpdateActivity();
  const remove = useDeleteActivity();

  const payload = (activity.payload ?? {}) as Record<string, unknown>;
  const serverBody = typeof payload.note === "string" ? payload.note : "";

  const [text, setText] = useState(serverBody);
  const [editingTime, setEditingTime] = useState(false);
  const [when, setWhen] = useState(() => toLocalInputValue(new Date(activity.occurred_at)));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const savedBody = useRef(serverBody.trim());
  const debounce = useRef<number | undefined>(undefined);
  const savedNotice = useRef<number | undefined>(undefined);

  // Both timers outlive a fast unmount (row deleted, page swapped) and would
  // set state on a gone component.
  useEffect(
    () => () => {
      window.clearTimeout(debounce.current);
      window.clearTimeout(savedNotice.current);
    },
    [],
  );

  // The textarea is one line until the text needs more; grow it to content
  // on mount and on every change so it reads as text, not as a box.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  /**
   * Write `next` into every cached activities page, run the PATCH, and put
   * the snapshot back if it fails. `revert` undoes the local field state the
   * cache doesn't own.
   */
  async function applyPatch(
    patch: UpdateActivityPatch,
    next: (item: ActivityOut) => ActivityOut,
    revert: () => void,
  ) {
    const snapshots = qc.getQueriesData<ActivitiesPage>({ queryKey: ["activities"] });
    for (const [key, page] of snapshots) {
      if (!page) continue;
      qc.setQueryData<ActivitiesPage>(key, {
        ...page,
        items: page.items.map((item) => (item.id === activity.id ? next(item) : item)),
      });
    }
    window.clearTimeout(savedNotice.current);
    setStatus("saving");
    try {
      await update.mutateAsync({ id: activity.id, patch });
      setStatus("saved");
      savedNotice.current = window.setTimeout(() => setStatus("idle"), SAVED_NOTICE_MS);
    } catch {
      for (const [key, page] of snapshots) {
        if (page) qc.setQueryData(key, page);
      }
      revert();
      setStatus("idle");
      toast.error(t("dealDetail.timeline.entry.saveError"));
    }
  }

  function saveBody(value: string) {
    const trimmed = value.trim();
    if (trimmed === savedBody.current) return;
    const previous = savedBody.current;
    savedBody.current = trimmed;
    void applyPatch(
      { body: trimmed || null },
      (item) => {
        const nextPayload = { ...((item.payload ?? {}) as Record<string, unknown>) };
        if (trimmed) nextPayload.note = trimmed;
        else delete nextPayload.note;
        return { ...item, payload: nextPayload };
      },
      () => {
        savedBody.current = previous;
        setText(previous);
      },
    );
  }

  function saveKind(label: EventLabelBrief | null) {
    if ((label?.id ?? null) === (activity.label?.id ?? null)) return;
    void applyPatch(
      { label_id: label?.id ?? null },
      (item) => ({ ...item, label }),
      () => {},
    );
  }

  function saveTime() {
    const parsed = fromLocalInputValue(when);
    if (!parsed) return;
    const iso = parsed.toISOString();
    if (iso === new Date(activity.occurred_at).toISOString()) return;
    void applyPatch(
      { occurred_at: iso },
      (item) => ({ ...item, occurred_at: iso }),
      () => {},
    );
  }

  const label = activity.label ?? null;
  const actor = activity.user_name?.trim() ? activity.user_name.trim() : null;

  return (
    // No row-level Escape handler on purpose: blurring the textarea would
    // *save* it, and the two controls that can be cancelled (the time input
    // and the kind picker) each revert on their own Escape.
    <li className="group relative" data-testid={testIds.deals.detail.timelineEntry(activity.id)}>
      {/* Connector from the timeline rail toward the kind chip, centered on
          the chip's 24px height. */}
      <span aria-hidden className="absolute -left-5 top-3 inline-block h-px w-3 bg-border-strong" />
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* Out-dent by the chip's own padding so the text edge lines up
              with the read-only rows' titles — only for the filled chip; the
              empty state is a visible dashed box that must not overhang. */}
          <div className={label ? "-ml-2 inline-block" : "inline-block"}>
            <ActivityKindPicker
              value={label}
              onChange={saveKind}
              testId={testIds.deals.detail.timelineEntryKind(activity.id)}
            />
          </div>
          <textarea
            ref={bodyRef}
            rows={1}
            value={text}
            maxLength={2000}
            aria-label={t("dealDetail.timeline.entry.editBody")}
            data-testid={testIds.deals.detail.timelineEntryBody(activity.id)}
            onChange={(e) => {
              const value = e.target.value;
              setText(value);
              window.clearTimeout(debounce.current);
              debounce.current = window.setTimeout(() => saveBody(value), TYPING_DEBOUNCE_MS);
            }}
            onBlur={() => {
              window.clearTimeout(debounce.current);
              saveBody(text);
            }}
            className="-ml-1.5 mt-0.5 w-full resize-none rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm text-text-primary transition-colors duration-fast hover:border-border focus:border-accent focus:outline-none"
          />
          <p className="-ml-1.5 mt-0.5 flex flex-wrap items-center gap-x-1 px-1.5 text-xs text-text-tertiary">
            {actor ? <span>{actor} ·</span> : null}
            {editingTime ? (
              <input
                type="datetime-local"
                autoFocus
                value={when}
                aria-label={t("dealDetail.timeline.entry.editTime")}
                data-testid={testIds.deals.detail.timelineEntryTime(activity.id)}
                onChange={(e) => setWhen(e.target.value)}
                onBlur={() => {
                  setEditingTime(false);
                  saveTime();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setWhen(toLocalInputValue(new Date(activity.occurred_at)));
                    setEditingTime(false);
                  }
                }}
                className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs tabular-nums text-text-primary transition-colors duration-fast focus:border-accent focus:outline-none"
              />
            ) : (
              <button
                type="button"
                aria-label={t("dealDetail.timeline.entry.editTime")}
                data-testid={testIds.deals.detail.timelineEntryTime(activity.id)}
                onClick={() => {
                  setWhen(toLocalInputValue(new Date(activity.occurred_at)));
                  setEditingTime(true);
                }}
                className="rounded-sm tabular-nums transition-colors duration-fast hover:text-text-secondary"
              >
                {formatDate(activity.occurred_at, locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </button>
            )}
            {status === "idle" ? null : <span aria-hidden>·</span>}
            {/* Live region, so the separator stays outside it — a reader
                should hear "Ukládám…", not "· Ukládám…". */}
            <span role="status">
              {status === "saving"
                ? t("dealDetail.timeline.entry.saving")
                : status === "saved"
                  ? t("dealDetail.timeline.entry.saved")
                  : ""}
            </span>
          </p>
        </div>
        <button
          type="button"
          aria-label={t("dealDetail.timeline.entry.delete")}
          data-testid={testIds.deals.detail.timelineEntryDelete(activity.id)}
          onClick={() => setConfirmOpen(true)}
          className="shrink-0 rounded-md p-1 text-text-tertiary opacity-0 transition-opacity duration-fast hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
        >
          <X size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title={t("dealDetail.timeline.entry.deleteConfirmTitle")}
        body={t("dealDetail.timeline.entry.deleteConfirmBody")}
        confirmLabel={t("dealDetail.timeline.entry.deleteConfirm")}
        cancelLabel={t("dealDetail.timeline.entry.deleteCancel")}
        danger
        pending={remove.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() =>
          remove.mutate(activity.id, {
            onError: () => toast.error(t("dealDetail.timeline.entry.deleteError")),
            onSettled: () => setConfirmOpen(false),
          })
        }
      />
    </li>
  );
}
