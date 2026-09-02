import { Plus } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ActivityKindPicker } from "@/app/activities/ActivityKindPicker";
import { useCreateDealAction } from "@/app/activities/useActivityEdit";
import { fromLocalInputValue, toLocalInputValue } from "@/app/deals/timelineTime";
import type { EventLabelBrief } from "@/app/events/useEventLabels";
import { testIds } from "@/lib/testids";
import { useToast } from "@/lib/toast";

/**
 * The composer that opens the deal's timeline.
 *
 * The draft commits ONLY on an explicit action — the plus button, Enter, or
 * ⌘/Ctrl+Enter. Nothing saves on blur: half-written notes must survive a
 * detour into the kind picker. Escape throws the draft away.
 */
export function TimelineDraftRow({ dealId }: { dealId: string }) {
  const { t } = useTranslation("deals");
  const toast = useToast();
  const create = useCreateDealAction(dealId);
  const bodyId = useId();
  const timeId = useId();

  const [kind, setKind] = useState<EventLabelBrief | null>(null);
  const [body, setBody] = useState("");
  const [when, setWhen] = useState(() => toLocalInputValue(new Date()));
  const bodyRef = useRef<HTMLInputElement | null>(null);
  // Enter fires the commit; a second Enter before the POST returns would
  // fire another one against state that has not been cleared yet.
  const inFlight = useRef(false);

  const empty = !body.trim() && !kind;

  function reset() {
    setKind(null);
    setBody("");
    setWhen(toLocalInputValue(new Date()));
  }

  async function commit() {
    const trimmed = body.trim();
    if (!trimmed && !kind) return;
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await create.mutateAsync({
        label_id: kind?.id ?? null,
        body: trimmed || null,
        occurred_at: (fromLocalInputValue(when) ?? new Date()).toISOString(),
      });
      // Fresh "now" for the next entry — not the stale value the page loaded with.
      reset();
      // The emptied draft disables the + button; without a new focus target
      // the browser drops focus to <body> and keyboard users start over.
      bodyRef.current?.focus();
    } catch {
      // Never eat the user's typing: the draft stays exactly as it is.
      toast.error(t("dealDetail.timeline.draft.saveError"));
    } finally {
      inFlight.current = false;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLFieldSetElement>) {
    // The kind picker handles its own Enter/Escape and marks them handled.
    if (e.defaultPrevented) return;
    // Buttons keep their native Enter (opening the kind picker, the + itself);
    // an IME's candidate-confirming Enter must never commit mid-composition.
    if (
      e.key === "Enter" &&
      !(e.target instanceof HTMLButtonElement) &&
      !e.nativeEvent.isComposing
    ) {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      reset();
    }
  }

  return (
    <fieldset
      data-testid={testIds.deals.detail.timelineDraft}
      aria-label={t("dealDetail.timeline.draft.legend")}
      onKeyDown={handleKeyDown}
      className="rounded-lg border border-border-subtle bg-surface-overlay p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <ActivityKindPicker
          value={kind}
          onChange={setKind}
          testId={testIds.deals.detail.timelineDraftKind}
        />
        <label htmlFor={bodyId} className="sr-only">
          {t("dealDetail.timeline.draft.bodyLabel")}
        </label>
        <input
          id={bodyId}
          ref={bodyRef}
          type="text"
          value={body}
          maxLength={2000}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("dealDetail.timeline.draft.bodyPlaceholder")}
          data-testid={testIds.deals.detail.timelineDraftBody}
          className="h-9 min-w-48 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text-primary transition-colors duration-fast focus:border-accent focus:outline-none"
        />
        <label htmlFor={timeId} className="sr-only">
          {t("dealDetail.timeline.draft.timeLabel")}
        </label>
        <input
          id={timeId}
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          data-testid={testIds.deals.detail.timelineDraftTime}
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm tabular-nums text-text-primary transition-colors duration-fast focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void commit()}
          disabled={empty}
          aria-label={t("dealDetail.timeline.draft.legend")}
          title={t("dealDetail.timeline.draft.legend")}
          data-testid={testIds.deals.detail.timelineDraftSubmit}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <p className="mt-2 text-xs text-text-tertiary">{t("dealDetail.timeline.draft.hint")}</p>
    </fieldset>
  );
}
