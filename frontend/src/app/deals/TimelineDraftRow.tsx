import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ActivityKindPicker } from "@/app/activities/ActivityKindPicker";
import { useCreateDealAction } from "@/app/activities/useActivityEdit";
import { fromLocalInputValue, toLocalInputValue } from "@/app/deals/timelineTime";
import type { EventLabelBrief } from "@/app/events/useEventLabels";
import { testIds } from "@/lib/testids";
import { useToast } from "@/lib/toast";

/**
 * The "Přidat akci" composer that opens the deal's timeline.
 *
 * There is deliberately **no Save button**: the draft commits when focus
 * leaves it as a whole (or on ⌘/Ctrl+Enter), and an untouched draft — no
 * kind, no text — never writes anything. Escape throws the draft away.
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
  // ⌘/Ctrl+Enter fires the commit, then the focus change that follows would
  // fire a second one against state that has not been cleared yet.
  const inFlight = useRef(false);

  function reset() {
    setKind(null);
    setBody("");
    setWhen(toLocalInputValue(new Date()));
  }

  async function commit() {
    const trimmed = body.trim();
    // An untouched draft is not an entry. Nothing to send, nothing to say.
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
    } catch {
      // Never eat the user's typing: the draft stays exactly as it is.
      toast.error(t("dealDetail.timeline.draft.saveError"));
    } finally {
      inFlight.current = false;
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLFieldSetElement>) {
    // Blur also fires while tabbing between the draft's own controls (and
    // into the kind picker's dropdown, which lives inside this fieldset).
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    void commit();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLFieldSetElement>) {
    // The kind picker handles its own Enter/Escape and marks them handled.
    if (e.defaultPrevented) return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      reset();
    }
  }

  return (
    <fieldset
      data-testid={testIds.deals.detail.timelineDraft}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="rounded-lg border border-border-subtle bg-surface-overlay px-3 pb-3"
    >
      <legend className="px-1 text-xs font-medium text-text-secondary">
        {t("dealDetail.timeline.draft.legend")}
      </legend>
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
      </div>
      <p className="mt-2 text-xs text-text-tertiary">{t("dealDetail.timeline.draft.hint")}</p>
    </fieldset>
  );
}
